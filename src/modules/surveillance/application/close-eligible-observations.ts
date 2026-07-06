// Use-case: close-eligible-rabies-observations (cron — spec §E).
//
// Migrated from lib/rabies-observation-closer.ts::closeEligibleRabiesObservations.
// No user auth — cron actor (x-cron-secret header checked at route level).
//
// Parity quirks:
//   - Auto-expired close: direct cases UPDATE with closed_reason='auto_expired'
//     via repo.autoExpireBiteCase — NOT closeCase('resolved').
//   - Owner notification INSIDE the tx (not post-tx).
//   - Escalating symptom → block auto-close, notify authorities urgent.
//   - Per-pet try/catch isolates failures (one failure doesn't stop the batch).
//   - AUDIT_LOG: NONE.

import { validateEventPayload } from "@/lib/events/event-schemas";

import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import type { NewNotification } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloseRabiesObservationsStats = {
  scanned: number;
  closedNegative: number;
  flaggedForReview: number;
  skippedNotYetDue: number;
  errors: { petId: string; reason: string }[];
  /**
   * Keyset resume point (review 23 fleet extension): the last pet id on this
   * page when a FULL page was returned (more may remain), else null when the
   * in_progress set was drained. The cron route persists this in
   * cron_runs.details and passes it back as `afterId` next run, so a registry
   * with more concurrent observations than one page is swept fairly across runs.
   */
  nextCursor: string | null;
};

export type CloseEligibleObservationsOptions = {
  now?: Date;
  /** Keyset cursor: process in_progress pets whose id sorts after this value. */
  afterId?: string | null;
  /** Max pets to scan this run. Defaults to the repo's page size (500). */
  limit?: number;
};

type Deps = {
  repo: Pick<
    SurveillanceRepository,
    | "findPetsInProgress"
    | "findLatestObservationStarted"
    | "findEscalatingSymptom"
    | "findOpenBiteCase"
    | "insertObservationEnded"
    | "setObservationStatus"
    | "autoExpireBiteCase"
    | "findActiveOwnership"
    | "insertNotifications"
  >;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  findAuthoritiesForJurisdiction: (jurisdiction: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function closeEligibleObservations(
  options: CloseEligibleObservationsOptions,
  deps: Deps,
): Promise<CloseRabiesObservationsStats> {
  const { repo, transaction, findAuthoritiesForJurisdiction } = deps;
  const now = options.now ?? new Date();

  const stats: CloseRabiesObservationsStats = {
    scanned: 0,
    closedNegative: 0,
    flaggedForReview: 0,
    skippedNotYetDue: 0,
    errors: [],
    nextCursor: null,
  };

  const PAGE_LIMIT = options.limit ?? 500;
  const eligible = await repo.findPetsInProgress({
    afterId: options.afterId ?? null,
    limit: PAGE_LIMIT,
  });
  stats.scanned = eligible.length;
  // A full page means more in_progress pets may remain past this cursor — the
  // route resumes AFTER the last id next run. A partial page means drained →
  // null wraps the sweep back to the top.
  stats.nextCursor =
    eligible.length >= PAGE_LIMIT ? (eligible[eligible.length - 1]?.id ?? null) : null;

  for (const pet of eligible) {
    try {
      // 1. Find started event.
      const startedEvent = await repo.findLatestObservationStarted(pet.id);
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

      // 2. Not yet due — skip.
      if (observationUntil > now) {
        stats.skippedNotYetDue += 1;
        continue;
      }

      // 3. Check for escalating symptom during observation period.
      const escalating = await repo.findEscalatingSymptom(pet.id, startedEvent.occurredAt);
      if (escalating) {
        // Block auto-close — escalation requires human professional.
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
            const authNotifications: NewNotification[] = authorityIds.map((authorityId) => ({
              userId: authorityId,
              notificationType: "rabies_observation_pending_review",
              severity: "urgent" as const,
              title: `Observación vencida pendiente de revisión — ${pet.name}`,
              body: "El período de 10 días terminó pero hubo síntomas compatibles con rabia durante la observación. Cierre profesional requerido (negativo o positivo).",
              relatedPetId: pet.id,
              relatedEventId: startedEvent.id,
              // Authority recipient: surveillance hub (cannot open /mis-mascotas).
              ctaLabel: "Ver vigilancia",
              ctaUrl: "/gob/vigilancia",
            }));
            await repo.insertNotifications(
              authNotifications as Parameters<typeof repo.insertNotifications>[0],
            );
          }
        } catch (notifyErr) {
          console.error(
            `[close-eligible-observations] authority notification failed for pet ${pet.publicToken}:`,
            notifyErr,
          );
        }
        continue;
      }

      // 4. Happy path: auto-close as negative.
      const biteEventId = startedPayload.bite_event_id as string;
      const biteCase = await repo.findOpenBiteCase(pet.id);

      await transaction(async (tx) => {
        const endedPayload = validateEventPayload("rabies_observation_ended", {
          bite_event_id: biteEventId,
          observation_started_event_id: startedEvent.id,
          outcome: "negative",
          closed_by_role: "system",
          closure_notes: "Auto-cerrado tras 10 días sin síntomas escalables",
          death_event_id: null,
        });
        await repo.insertObservationEnded(
          {
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
          } as Parameters<typeof repo.insertObservationEnded>[0],
          tx as Parameters<typeof repo.insertObservationEnded>[1],
        );

        await repo.setObservationStatus(
          pet.id,
          "completed_negative",
          now,
          tx as Parameters<typeof repo.setObservationStatus>[3],
        );

        // 5. Auto-expire case via direct UPDATE (NOT closeCase('resolved')).
        //    closed_reason='auto_expired' is load-bearing parity (spec §E).
        if (biteCase) {
          await repo.autoExpireBiteCase(
            biteCase.id,
            now,
            tx as Parameters<typeof repo.autoExpireBiteCase>[2],
          );
        }

        // 6. Owner notification INSIDE tx (cron path — parity with original).
        const activeOwnership = await repo.findActiveOwnership(
          pet.id,
          tx as Parameters<typeof repo.findActiveOwnership>[1],
        );
        if (activeOwnership?.ownerUserId) {
          const ownerNotifications: NewNotification[] = [
            {
              userId: activeOwnership.ownerUserId,
              notificationType: "rabies_observation_completed_negative_owner",
              severity: "info",
              title: `Observación completada — ${pet.name}`,
              body: `La observación antirrábica de 10 días terminó automáticamente sin incidentes. ${pet.name} sigue normal.`,
              relatedPetId: pet.id,
              ctaLabel: "Ver mascota",
              ctaUrl: `/mis-mascotas/${pet.publicToken}`,
            },
          ];
          await repo.insertNotifications(
            ownerNotifications as Parameters<typeof repo.insertNotifications>[0],
          );
        }
      });

      stats.closedNegative += 1;
    } catch (err) {
      console.error(`[close-eligible-observations] pet ${pet.publicToken} auto-close failed:`, err);
      stats.errors.push({
        petId: pet.id,
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return stats;
}
