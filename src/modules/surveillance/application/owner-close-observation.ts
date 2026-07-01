// Use-case: owner-close rabies observation (spec §C).
//
// Migrated from app/actions/bite.ts::ownerCloseRabiesObservationAction.
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Restricts to outcome='negative', no escalating symptoms, ≥10 days elapsed.
// AUDIT_LOG: NONE (bite/rabies actions never wrote audit_log — preserve absence).

import { validateEventPayload } from "@/lib/events/event-schemas";

import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnerCloseObservationInput = {
  pet: {
    id: string;
    publicToken: string;
    name: string;
    rabiesObservationStatus: string | null;
  };
  user: { id: string };
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
};

type Deps = {
  repo: Pick<
    SurveillanceRepository,
    | "findLatestObservationStarted"
    | "findEscalatingSymptom"
    | "findOpenBiteCase"
    | "insertObservationEnded"
    | "setObservationStatus"
    | "findActiveOwnership"
  >;
  closeCase: (
    input: { caseId: string; reason: "resolved" | "cancelled"; closedByUserId: string },
    tx: unknown,
  ) => Promise<void>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type OwnerCloseObservationResult = UseCaseResult<void>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function ownerCloseObservation(
  input: OwnerCloseObservationInput,
  deps: Deps,
): Promise<OwnerCloseObservationResult> {
  const { repo, closeCase, transaction } = deps;
  const { pet, user, eventAuthorship } = input;

  // 1. Guard: observation must be active.
  if (pet.rabiesObservationStatus !== "in_progress") {
    return { ok: false, error: "No hay observación activa que cerrar." };
  }

  // 2. Load the started event to get observation_until + bite_event_id.
  const startedEvent = await repo.findLatestObservationStarted(pet.id);
  if (!startedEvent) {
    return {
      ok: false,
      error: "Inconsistencia interna: status in_progress sin evento started.",
    };
  }

  const startedPayload = startedEvent.payload as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;
  if (!observationUntil || !Number.isFinite(observationUntil.getTime())) {
    return { ok: false, error: "Inconsistencia interna: observation_until inválido." };
  }

  // 3. Check 10-day elapsed.
  const now = new Date();
  if (now < observationUntil) {
    return {
      ok: false,
      error: `Aún no se cumplieron los 10 días. Esperá hasta el ${observationUntil.toLocaleDateString("es-AR")}.`,
    };
  }

  // 4. Block if escalating symptom exists during observation period.
  const escalating = await repo.findEscalatingSymptom(pet.id, startedEvent.occurredAt);
  if (escalating) {
    return {
      ok: false,
      error:
        "Hubo síntomas compatibles con rabia durante la observación. Este cierre requiere intervención profesional (veterinario o autoridad sanitaria). Contactá a tu vet.",
    };
  }

  const biteEventId = startedPayload.bite_event_id as string;
  const biteCase = await repo.findOpenBiteCase(pet.id);

  const pendingNotifications: NewNotification[] = [];

  try {
    await transaction(async (tx) => {
      // 5. Insert rabies_observation_ended (outcome=negative, closed_by_role=owner).
      const endedPayload = validateEventPayload("rabies_observation_ended", {
        bite_event_id: biteEventId,
        observation_started_event_id: startedEvent.id,
        outcome: "negative",
        closed_by_role: "owner",
        closure_notes: "Cerrado por dueño tras 10 días sin síntomas escalables",
        death_event_id: null,
      });
      await repo.insertObservationEnded(
        {
          petId: pet.id,
          eventType: "rabies_observation_ended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: endedPayload,
          caseId: biteCase?.id ?? null,
        } as Parameters<typeof repo.insertObservationEnded>[0],
        tx as Parameters<typeof repo.insertObservationEnded>[1],
      );

      // 6. Update pet status to completed_negative.
      await repo.setObservationStatus(
        pet.id,
        "completed_negative",
        now,
        tx as Parameters<typeof repo.setObservationStatus>[3],
      );

      // 7. Close bite case (reason=resolved) if open case exists.
      if (biteCase) {
        await closeCase({ caseId: biteCase.id, reason: "resolved", closedByUserId: user.id }, tx);
      }

      // 8. Queue owner notification.
      pendingNotifications.push({
        userId: user.id,
        notificationType: "rabies_observation_completed_negative_owner",
        severity: "info",
        title: `Observación completada — ${pet.name}`,
        body: `La observación antirrábica de 10 días terminó sin incidentes. ${pet.name} sigue normal.`,
        relatedPetId: pet.id,
        relatedCaseId: biteCase?.id ?? null,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${pet.publicToken}`,
      });
    });
  } catch (err) {
    console.error("ownerCloseObservation tx failed:", err);
    return {
      ok: false,
      error: `No se pudo cerrar la observación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
