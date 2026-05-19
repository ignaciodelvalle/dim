// Reusable closer for the rabies observation auto-close cron. Exported so
// scripts/close-rabies-observations.ts (CLI) and the cron route share the
// same implementation.
//
// For each pet with rabies_observation_status='in_progress':
//   1. Find the latest rabies_observation_started event.
//   2. Skip if observation_until > now (period not yet over).
//   3. Check for any symptom_observed during the period whose
//      payload.alerted_disease_codes contains 'rabies_suspected'.
//   4. If escalating symptoms exist → block auto-close, notify authorities
//      with severity='urgent' for human review.
//   5. Otherwise → emit rabies_observation_ended (closed_by_role='system',
//      outcome='negative'), flip status to 'completed_negative', notify
//      owner with severity='info' that the observation closed cleanly.
//
// Idempotent: a second run on the same day re-reads in_progress rows, finds
// them already flipped to terminal states, and does nothing.

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { cases, db, notifications, ownerships, petEvents, pets } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { validateEventPayload } from "@/lib/event-schemas";

export type CloseRabiesObservationsStats = {
  scanned: number;
  closedNegative: number;
  flaggedForReview: number;
  skippedNotYetDue: number;
  errors: { petId: string; reason: string }[];
};

export async function closeEligibleRabiesObservations(options?: {
  now?: Date;
}): Promise<CloseRabiesObservationsStats> {
  const now = options?.now ?? new Date();
  const stats: CloseRabiesObservationsStats = {
    scanned: 0,
    closedNegative: 0,
    flaggedForReview: 0,
    skippedNotYetDue: 0,
    errors: [],
  };

  const eligible = await db
    .select()
    .from(pets)
    .where(eq(pets.rabiesObservationStatus, "in_progress"));
  stats.scanned = eligible.length;

  for (const pet of eligible) {
    try {
      const [startedEvent] = await db
        .select()
        .from(petEvents)
        .where(
          and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "rabies_observation_started")),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(1);
      if (!startedEvent) {
        stats.errors.push({
          petId: pet.id,
          reason: "in_progress but no rabies_observation_started event found",
        });
        continue;
      }

      const startedPayload = startedEvent.payload as Record<string, unknown>;
      const observationUntilRaw = startedPayload.observation_until as string | undefined;
      const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;
      if (!observationUntil || !Number.isFinite(observationUntil.getTime())) {
        stats.errors.push({
          petId: pet.id,
          reason: "observation_until missing or invalid in started payload",
        });
        continue;
      }

      if (observationUntil > now) {
        stats.skippedNotYetDue += 1;
        continue;
      }

      const escalating = await db
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "symptom_observed"),
            gte(petEvents.occurredAt, startedEvent.occurredAt),
            sql`(${petEvents.payload}->'alerted_disease_codes') @> '"rabies_suspected"'::jsonb`,
          ),
        )
        .limit(1);

      if (escalating.length > 0) {
        // Block auto-close — escalation requires a human professional.
        stats.flaggedForReview += 1;
        try {
          const authorityIds =
            pet.jurisdictionProvince && pet.jurisdictionLocality
              ? await findAuthoritiesForJurisdiction({
                  province: pet.jurisdictionProvince,
                  locality: pet.jurisdictionLocality,
                })
              : [];
          if (authorityIds.length > 0) {
            await db.insert(notifications).values(
              authorityIds.map((authorityId) => ({
                userId: authorityId,
                notificationType: "rabies_observation_pending_review",
                severity: "urgent" as const,
                title: `Observación vencida pendiente de revisión — ${pet.name}`,
                body: "El período de 10 días terminó pero hubo síntomas compatibles con rabia durante la observación. Cierre profesional requerido (negativo o positivo).",
                relatedPetId: pet.id,
                relatedEventId: startedEvent.id,
              })),
            );
          }
        } catch (notifyErr) {
          console.error(
            `[close-rabies] authority notification failed for pet ${pet.publicToken}:`,
            notifyErr,
          );
        }
        continue;
      }

      // Happy path: auto-close as negative.
      const biteEventId = startedPayload.bite_event_id as string;
      // Find the open bite_incident case for this pet (cases system —
      // Fase A schema + Fase D wires the auto-open at bite-report time).
      // Pre-Fase-D rows have no case, so `caseId` is null on the event
      // and the case-close step is skipped.
      const [biteCase] = await db
        .select({ id: cases.id })
        .from(cases)
        .where(
          and(
            eq(cases.primaryPetId, pet.id),
            eq(cases.caseKind, "bite_incident"),
            inArray(cases.status, ["open", "escalated"]),
          ),
        )
        .limit(1);

      await db.transaction(async (tx) => {
        const endedPayload = validateEventPayload("rabies_observation_ended", {
          bite_event_id: biteEventId,
          observation_started_event_id: startedEvent.id,
          outcome: "negative",
          closed_by_role: "system",
          closure_notes: "Auto-cerrado tras 10 días sin síntomas escalables",
          death_event_id: null,
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "rabies_observation_ended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: null,
          authorRole: "system",
          authorOrganizationId: null,
          authorVerified: false,
          payload: endedPayload,
          caseId: biteCase?.id ?? null,
        });
        await tx
          .update(pets)
          .set({ rabiesObservationStatus: "completed_negative", updatedAt: now })
          .where(eq(pets.id, pet.id));

        // Close the bite_incident case with closed_reason='auto_expired'
        // (per lifecycles spec §5.10 — the 10-day legal period elapsed
        // cleanly without escalation, which the system rules treat as
        // an auto-close, not a human-driven resolution).
        if (biteCase) {
          await tx
            .update(cases)
            .set({
              status: "closed",
              closedReason: "auto_expired",
              closedAt: now,
              updatedAt: now,
            })
            .where(and(eq(cases.id, biteCase.id), eq(cases.status, "open")));
        }

        // Best-effort owner notification — find the active owner row.
        const [activeOwnership] = await tx
          .select({ ownerUserId: ownerships.ownerUserId })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.role, "owner"),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);
        if (activeOwnership?.ownerUserId) {
          await tx.insert(notifications).values({
            userId: activeOwnership.ownerUserId,
            notificationType: "rabies_observation_completed_negative_owner",
            severity: "info",
            title: `Observación completada — ${pet.name}`,
            body: `La observación antirrábica de 10 días terminó automáticamente sin incidentes. ${pet.name} sigue normal.`,
            relatedPetId: pet.id,
          });
        }
      });

      stats.closedNegative += 1;
    } catch (err) {
      console.error(`[close-rabies] pet ${pet.publicToken} auto-close failed:`, err);
      stats.errors.push({
        petId: pet.id,
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return stats;
}
