// Use-case: professional-close rabies observation (spec §D).
//
// Migrated from app/actions/bite.ts::professionalCloseRabiesObservationAction.
// Auth (requireAdminOrGovtOrRedirect) handled by caller (actions.ts).
//
// CRITICAL auth scope:
//   - admin = universal scope (any pet)
//   - govt  = ONLY pets where (province,locality) ∈ jurisdictions
//     → out-of-jurisdiction govt MUST be rejected (cross-org bypass lesson)
//
// authorRole column is hardcoded to 'govt' for both admin and govt actors
// (petEvents.authorRole enum doesn't include 'admin' — both log as 'govt').
// payload.closed_by_role keeps the precise distinction (admin|govt).
//
// AUDIT_LOG: NONE.

import { validateEventPayload } from "@/lib/events/event-schemas";

import { PROFESSIONAL_OUTCOMES, outcomeToStatus } from "../domain/rabies-observation";
import type { RabiesObservationOutcome } from "../domain/rabies-observation";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfessionalCloseObservationInput = {
  petPublicToken: string;
  outcome: RabiesObservationOutcome;
  closureNotes: string | null;
  actor: {
    profile: { id: string; role: "admin" | "govt" };
    jurisdictions: Array<{ province: string; locality: string }>;
  };
};

type Deps = {
  repo: Pick<
    SurveillanceRepository,
    | "findPetByToken"
    | "findLatestObservationStarted"
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

export type ProfessionalCloseObservationResult = UseCaseResult<void>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function professionalCloseObservation(
  input: ProfessionalCloseObservationInput,
  deps: Deps,
): Promise<ProfessionalCloseObservationResult> {
  const { repo, closeCase, transaction } = deps;
  const { actor } = input;

  // 1. Validate outcome.
  if (!PROFESSIONAL_OUTCOMES.includes(input.outcome)) {
    return { ok: false, error: "Outcome inválido." };
  }

  // 2. Load pet.
  const pet = await repo.findPetByToken(input.petPublicToken);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // 3. Guard: observation must be active.
  if (pet.rabiesObservationStatus !== "in_progress") {
    return { ok: false, error: "Esta mascota no tiene una observación activa." };
  }

  // 4. Govt scope check — admin is universal.
  if (actor.profile.role === "govt") {
    const inScope = actor.jurisdictions.some(
      (j) => j.province === pet.jurisdictionProvince && j.locality === pet.jurisdictionLocality,
    );
    if (!inScope) {
      return { ok: false, error: "Esta mascota no está dentro de tu cobertura asignada." };
    }
  }

  // 5. Load started event.
  const startedEvent = await repo.findLatestObservationStarted(pet.id);
  if (!startedEvent) {
    return { ok: false, error: "Inconsistencia: status in_progress sin evento started." };
  }

  const startedPayload = startedEvent.payload as Record<string, unknown>;
  const biteEventId = startedPayload.bite_event_id as string;
  const now = new Date();

  // 6. Determine close reason: lost_to_followup → cancelled; else → resolved.
  const closedReason: "resolved" | "cancelled" =
    input.outcome === "lost_to_followup" ? "cancelled" : "resolved";

  const biteCase = await repo.findOpenBiteCase(pet.id);
  const pendingNotifications: NewNotification[] = [];

  try {
    await transaction(async (tx) => {
      // 7. Insert rabies_observation_ended.
      const endedPayload = validateEventPayload("rabies_observation_ended", {
        bite_event_id: biteEventId,
        observation_started_event_id: startedEvent.id,
        outcome: input.outcome,
        closed_by_role: actor.profile.role,
        closure_notes: input.closureNotes,
        death_event_id: null,
      });
      // petEvents.authorRole enum doesn't include 'admin' — both admin and govt log as 'govt'.
      await repo.insertObservationEnded(
        {
          petId: pet.id,
          eventType: "rabies_observation_ended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: actor.profile.id,
          authorRole: "govt",
          authorOrganizationId: null,
          authorVerified: false,
          payload: endedPayload,
          caseId: biteCase?.id ?? null,
        } as Parameters<typeof repo.insertObservationEnded>[0],
        tx as Parameters<typeof repo.insertObservationEnded>[1],
      );

      // 8. Update pet status.
      await repo.setObservationStatus(
        pet.id,
        outcomeToStatus(input.outcome),
        now,
        tx as Parameters<typeof repo.setObservationStatus>[3],
      );

      // 9. Close bite case.
      if (biteCase) {
        await closeCase(
          { caseId: biteCase.id, reason: closedReason, closedByUserId: actor.profile.id },
          tx,
        );
      }

      // 10. Notify the active owner.
      const activeOwnership = await repo.findActiveOwnership(
        pet.id,
        tx as Parameters<typeof repo.findActiveOwnership>[1],
      );
      if (activeOwnership?.ownerUserId) {
        const notifSeverity =
          input.outcome === "positive_rabies" ? ("urgent" as const) : ("info" as const);
        pendingNotifications.push({
          userId: activeOwnership.ownerUserId,
          notificationType: "rabies_observation_completed_professional_owner",
          severity: notifSeverity,
          title: `Observación cerrada profesionalmente — ${pet.name}`,
          body: `La observación antirrábica de ${pet.name} fue cerrada por ${actor.profile.role === "admin" ? "un administrador" : "una autoridad sanitaria"} con outcome: ${input.outcome}.${input.closureNotes ? ` Notas: ${input.closureNotes}` : ""}`,
          relatedPetId: pet.id,
          relatedCaseId: biteCase?.id ?? null,
          ctaLabel: "Ver mascota",
          ctaUrl: `/mis-mascotas/${pet.publicToken}`,
        });
      }
    });
  } catch (err) {
    console.error("professionalCloseObservation tx failed:", err);
    return {
      ok: false,
      error: `No se pudo cerrar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
