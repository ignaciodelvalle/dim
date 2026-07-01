// Use-case: createDeathRecord (multi-cascade)
//
// Migrated from app/actions/events.ts::createDeathRecordAction.
//
// AUTH: requirePetAccess (accepts deceased/lost) at the action layer.
//   This writer is auth-agnostic — exported for tests.
//
// Parity:
//   - IDEMPOTENT insert (insertEventIdempotent). On noop: ALL cascades SKIPPED.
//   - pets projection: status=deceased + deceasedAt (via updateDeceased).
//   - CASCADE A: auto-end active fosters → foster_ended events + pendingNotifications
//                + close foster_placement case (if fosterCaseId provided).
//   - CASCADE B: close custody_episode if custodyEpisodeCaseId provided.
//   - CASCADE C: wasInObservation → findLatestRabiesObservationStarted →
//                insert rabies_observation_ended (system) + close bite_incident case +
//                updateRabiesObservationStatus(completed_dead).
//   - Post-tx: flushNotifications + signalAuthorityReport (if reportable + diseaseCode) +
//              urgent authority fan-out (if rabiesObservationClosed AND jurisdiction set).
//   - Result: { ok: true, rabiesObservationClosed, diseaseCode, insertedEventId }
//   - CRITICAL: all cascades SKIP on idempotency noop.

import "server-only";

import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { signalAuthorityReport } from "@/lib/authority";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/events/event-schemas";

type CaseExecutor = Parameters<typeof closeCase>[1];

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { NewNotification } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateDeathRecordInput = {
  pet: {
    id: string;
    name: string;
    status: string;
    rabiesObservationStatus: string | null;
    jurisdictionProvince: string | null;
    jurisdictionLocality: string | null;
  };
  recordedByUserId: string;
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  cause: string;
  causeDetail: string | null;
  confirmedByVet: boolean;
  vetName: string | null;
  dispositionMethod: string | null;
  facility: string | null;
  occurredAt: Date;
  notes: string | null;
  deathAtClinic: boolean;
  clinicName: string | null;
  vetContactedOwner: string | null;
  vetDecidedAlone: boolean;
  ownerToPrivateCrematorium: boolean;
  diseaseCode: string | null;
  confirmedByLab: boolean;
  /** Pre-computed by caller: isReportable(diseaseCode). Avoids importing diseases lib here. */
  isReportable?: boolean;
  uploadedPath: string | null;
  uploadedMimeType: string | null;
  uploadedSize: number | null;
  clientIdempotencyKey: string | null;
  /** caseId from findOpenCaseForPetAndKind(pet.id, "custody_episode") — null if no intake. */
  custodyEpisodeCaseId: string | null;
  /** caseId from the open foster_placement case — caller resolves inside tx. */
  fosterCaseId?: string | null;
  /** caseId from the open bite_incident case — caller resolves inside tx for cascade C. */
  biteCaseId?: string | null;
  now?: Date;
};

export type CreateDeathRecordResult =
  | {
      ok: true;
      insertedEventId: string | null;
      rabiesObservationClosed: boolean;
      diseaseCode: string | null;
    }
  | { ok: false; error: string };

type Deps = {
  repo: Pick<
    EventsRepository,
    | "insertEventIdempotent"
    | "insertEvent"
    | "insertAttachment"
    | "updateDeceased"
    | "findActiveFosters"
    | "endFoster"
    | "findLatestRabiesObservationStarted"
    | "updateRabiesObservationStatus"
    | "updateStatusProjection"
  >;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  flushNotifications: (pendingNotifications: NewNotification[]) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

/**
 * Record the death of a pet with full multi-cascade side-effects.
 * Exported for integration tests — action layer handles auth + form parsing.
 */
export async function createDeathRecord(
  input: CreateDeathRecordInput,
  deps: Deps,
): Promise<CreateDeathRecordResult> {
  const {
    pet,
    recordedByUserId,
    eventAuthorship,
    cause,
    causeDetail,
    confirmedByVet,
    vetName,
    dispositionMethod,
    facility,
    occurredAt,
    notes,
    deathAtClinic,
    clinicName,
    vetContactedOwner,
    vetDecidedAlone,
    ownerToPrivateCrematorium,
    diseaseCode,
    confirmedByLab,
    isReportable = false,
    uploadedPath,
    uploadedMimeType,
    uploadedSize,
    clientIdempotencyKey,
    custodyEpisodeCaseId,
    fosterCaseId = null,
    biteCaseId = null,
    now = new Date(),
  } = input;

  let insertedEventId: string | null = null;
  let rabiesObservationClosed = false;
  const pendingNotifications: NewNotification[] = [];

  try {
    await deps.transaction(async (tx) => {
      const wasInObservation = pet.rabiesObservationStatus === "in_progress";

      const eventPayload = validateEventPayload("death_recorded", {
        cause,
        cause_detail: causeDetail,
        confirmed_by_vet: confirmedByVet || null,
        vet_name: vetName,
        disposition_method: dispositionMethod,
        facility,
        death_at_clinic: deathAtClinic || null,
        clinic_name: clinicName,
        vet_contacted_owner: vetContactedOwner,
        vet_decided_alone: vetDecidedAlone || null,
        owner_to_private_crematorium: ownerToPrivateCrematorium || null,
        disease_code: diseaseCode,
        confirmed_by_lab: diseaseCode ? confirmedByLab : null,
        is_reportable: isReportable,
        ...(wasInObservation ? { during_rabies_observation: true } : {}),
      });

      const { event, wasNoop: deathNoop } = await deps.repo.insertEventIdempotent(
        {
          petId: pet.id,
          eventType: "death_recorded",
          occurredAt,
          recordedAt: now,
          recordedByUserId,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
          clientIdempotencyKey,
          caseId: custodyEpisodeCaseId ?? null,
        } as Parameters<typeof deps.repo.insertEventIdempotent>[0],
        tx as Parameters<typeof deps.repo.insertEventIdempotent>[1],
      );

      // CRITICAL: all cascades skip on noop (idempotency guard).
      if (deathNoop) return;

      insertedEventId = event.id;

      // Attachment (if any).
      if (uploadedPath) {
        await deps.repo.insertAttachment(
          {
            petId: pet.id,
            eventId: event.id,
            uploadedByUserId: recordedByUserId,
            storagePath: uploadedPath,
            mimeType: uploadedMimeType ?? "image/jpeg",
            fileSize: uploadedSize ?? 0,
          },
          tx as Parameters<typeof deps.repo.insertAttachment>[1],
        );
      }

      // Status projection: deceased + deceasedAt.
      await deps.repo.updateDeceased(
        pet.id,
        occurredAt,
        now,
        tx as Parameters<typeof deps.repo.updateDeceased>[3],
      );

      // CASCADE A: auto-end active foster ownerships.
      const activeFosters = await deps.repo.findActiveFosters(
        pet.id,
        tx as Parameters<typeof deps.repo.findActiveFosters>[1],
      );

      for (const f of activeFosters) {
        if (!f.ownerUserId) continue;
        await deps.repo.endFoster(f.id, now, tx as Parameters<typeof deps.repo.endFoster>[2]);

        const endedPayload = validateEventPayload("foster_ended", {
          foster_user_id: f.ownerUserId,
          reason: "pet_died",
          death_event_id: event.id,
        });

        await deps.repo.insertEvent(
          {
            petId: pet.id,
            eventType: "foster_ended",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId,
            authorRole: eventAuthorship.authorRole,
            authorOrganizationId: eventAuthorship.authorOrganizationId,
            authorVerified: eventAuthorship.authorVerified,
            payload: endedPayload,
            caseId: fosterCaseId ?? null,
          } as Parameters<typeof deps.repo.insertEvent>[0],
          tx as Parameters<typeof deps.repo.insertEvent>[1],
        );

        pendingNotifications.push({
          userId: f.ownerUserId,
          notificationType: "foster_ended_by_death",
          severity: "info",
          title: `${pet.name} falleció`,
          body: `Lamentamos avisarte que ${pet.name} falleció. Gracias por el tiempo que le diste como tránsito.`,
          relatedPetId: pet.id,
          relatedEventId: event.id,
          relatedCaseId: fosterCaseId ?? null,
          // no-cta: terminal condolence to the ex-foster; the foster relationship
          // ended with the death, so there is no actionable destination.
        });
      }

      // Close foster_placement case only when there were active fosters.
      if (fosterCaseId && activeFosters.length > 0) {
        await closeCase(
          { caseId: fosterCaseId, reason: "resolved", closedByUserId: recordedByUserId },
          tx as CaseExecutor,
        );
      }

      // CASCADE B: close custody_episode if the pet was intaked.
      if (custodyEpisodeCaseId) {
        await closeCase(
          { caseId: custodyEpisodeCaseId, reason: "resolved", closedByUserId: recordedByUserId },
          tx as CaseExecutor,
        );
      }

      // CASCADE C: death-during-observation hook.
      if (wasInObservation) {
        const startedEvent = await deps.repo.findLatestRabiesObservationStarted(
          pet.id,
          tx as Parameters<typeof deps.repo.findLatestRabiesObservationStarted>[1],
        );
        if (startedEvent) {
          const startedPayload = startedEvent.payload as Record<string, unknown>;

          const endedPayload = validateEventPayload("rabies_observation_ended", {
            bite_event_id: startedPayload.bite_event_id as string,
            observation_started_event_id: startedEvent.id,
            outcome: "dead",
            closed_by_role: "system",
            closure_notes: "Cierre automático por fallecimiento durante observación",
            death_event_id: event.id,
          });

          await deps.repo.insertEvent(
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
              caseId: biteCaseId ?? null,
            } as Parameters<typeof deps.repo.insertEvent>[0],
            tx as Parameters<typeof deps.repo.insertEvent>[1],
          );

          await deps.repo.updateRabiesObservationStatus(
            pet.id,
            "completed_dead",
            now,
            tx as Parameters<typeof deps.repo.updateRabiesObservationStatus>[3],
          );

          if (biteCaseId) {
            await closeCase({ caseId: biteCaseId, reason: "resolved" }, tx as CaseExecutor);
          }

          rabiesObservationClosed = true;
        }
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }

  // Post-tx: flush notifications (best-effort).
  await deps.flushNotifications(pendingNotifications);

  // Post-tx: signal authority report when disease is reportable.
  if (isReportable && diseaseCode && insertedEventId) {
    await signalAuthorityReport({
      eventId: insertedEventId,
      petId: pet.id,
      diseaseCode,
      confirmedByLab,
      occurredAt,
      jurisdictionProvince: pet.jurisdictionProvince ?? null,
      jurisdictionLocality: pet.jurisdictionLocality ?? null,
    });
  }

  // Post-tx: urgent authority fan-out when rabies observation was auto-closed by this death.
  if (rabiesObservationClosed && insertedEventId) {
    try {
      if (pet.jurisdictionProvince && pet.jurisdictionLocality) {
        const authorityIds = await findAuthoritiesForJurisdiction({
          province: pet.jurisdictionProvince,
          locality: pet.jurisdictionLocality,
        });
        if (authorityIds.length > 0) {
          const { db, notifications } = await import("@/db");
          await db.insert(notifications).values(
            authorityIds.map((authorityId) => ({
              userId: authorityId,
              notificationType: "rabies_observation_completed_dead_authority",
              severity: "urgent" as const,
              title: `URGENTE — fallecimiento durante observación antirrábica (${pet.name})`,
              body: `La mascota falleció dentro del período de 10 días de observación post-mordedura. Causa declarada: ${cause}. Requiere revisión inmediata por riesgo de rabia.`,
              relatedPetId: pet.id,
              relatedEventId: insertedEventId as string,
              // Authority recipient: surveillance hub (cannot open /mis-mascotas).
              ctaLabel: "Ver vigilancia",
              ctaUrl: "/gob/vigilancia",
            })),
          );
        }
      }
    } catch (err) {
      console.error("[death] rabies-observation authority escalation failed:", err);
    }
  }

  return { ok: true, insertedEventId, rabiesObservationClosed, diseaseCode };
}
