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
// AUDIT_LOG: YES since 2026-08-17 — `rabies_observation_closed_professional`,
// written INSIDE the transaction. The whole Ley 22.953 surface wrote no audit
// rows, and for the reporting paths that is defensible: the pet_events spine
// already carries the author of every assertion. This close is different now.
// After removing the cron and owner paths it is the ONLY way a clinical outcome
// enters the record, it is performed by an identified operator exercising
// jurisdiction power, and it terminates a legal obligation and flips a
// public-facing banner. The event row records the ASSERTION; the audit row
// records the ADMINISTRATIVE ACT with its before/after state, which is what an
// accountability query over audit_log is expected to find. Note that
// scripts/check-audit-log-coverage.ts could never have caught the absence: the
// mutation sits two hops down (action → use-case → repo) and the fence
// documents ONE HOP as a known blind spot.

import { jurisdictionScopeContains } from "@/lib/domain/jurisdiction-canonical";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { rabiesObservationOutcomeLabel } from "@/lib/utils/format";

import {
  PROFESSIONAL_OUTCOMES,
  isObservationOpen,
  outcomeToStatus,
} from "../domain/rabies-observation";
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
    | "insertObservationCloseAuditLog"
  >;
  closeCase: (
    input: { caseId: string; reason: "resolved" | "cancelled"; closedByUserId: string },
    tx: unknown,
  ) => Promise<void>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  /**
   * Authority fan-out for a POSITIVE rabies close — the public-health escalation
   * hook. Optional so unit tests that don't exercise escalation can omit it; the
   * action layer always supplies it. Returns authority user ids for the pet's
   * jurisdiction.
   */
  findAuthoritiesForJurisdiction?: (jurisdiction: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
};

export type ProfessionalCloseObservationResult = UseCaseResult<void>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function professionalCloseObservation(
  input: ProfessionalCloseObservationInput,
  deps: Deps,
): Promise<ProfessionalCloseObservationResult> {
  const { repo, closeCase, transaction, findAuthoritiesForJurisdiction } = deps;
  const { actor } = input;

  // 1. Validate outcome.
  if (!PROFESSIONAL_OUTCOMES.includes(input.outcome)) {
    return { ok: false, error: "Outcome inválido." };
  }

  // 2. Load pet.
  const pet = await repo.findPetByToken(input.petPublicToken);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // 3. Guard: observation must still be OPEN — either running (`in_progress`)
  // or past its window with nobody having closed it (`window_expired_unclosed`).
  // The expired state is precisely the queue this close exists to drain, so
  // refusing it would strand every observation the sweep hands over.
  if (!isObservationOpen(pet.rabiesObservationStatus)) {
    return { ok: false, error: "Esta mascota no tiene una observación abierta." };
  }

  // 4. Govt scope check — admin is universal. Subsumption-aware: a whole-province
  // assignment (e.g. whole-CABA) governs every barrio in it, so a pet geocoded to
  // a barrio is within cover. See jurisdictionScopeContains.
  if (actor.profile.role === "govt") {
    const inScope = jurisdictionScopeContains(
      actor.jurisdictions,
      pet.jurisdictionProvince,
      pet.jurisdictionLocality,
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
  // Coalesce to null: an observation may legitimately lack a linked bite event
  // (older/seed rows). The rabies_observation_ended schema now accepts null, so
  // the close no longer throws a raw zod "bite_event_id invalid_type" error.
  const biteEventId = (startedPayload.bite_event_id as string | undefined) ?? null;
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

      // 8b. Accountability row for the administrative act, in the SAME tx as
      // the mutation it describes — a rollback takes it with the close.
      await repo.insertObservationCloseAuditLog(
        {
          action: "rabies_observation_closed_professional",
          actorUserId: actor.profile.id,
          payload: {
            pet_id: pet.id,
            pet_public_token: pet.publicToken,
            case_id: biteCase?.id ?? null,
            observation_started_event_id: startedEvent.id,
            outcome: input.outcome,
            closed_by_role: actor.profile.role,
            closure_notes: input.closureNotes,
          },
          before: { rabies_observation_status: pet.rabiesObservationStatus },
          after: { rabies_observation_status: outcomeToStatus(input.outcome) },
        },
        tx as Parameters<typeof repo.insertObservationCloseAuditLog>[1],
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
          body: `La observación antirrábica de ${pet.name} fue cerrada por ${actor.profile.role === "admin" ? "un administrador" : "una autoridad sanitaria"} con ${rabiesObservationOutcomeLabel(input.outcome)}.${input.closureNotes ? ` Notas: ${input.closureNotes}` : ""}`,
          relatedPetId: pet.id,
          relatedCaseId: biteCase?.id ?? null,
          ctaLabel: "Ver mascota",
          ctaUrl: `/mis-mascotas/${pet.publicToken}`,
        });
      }
    });
  } catch (err) {
    // NEVER surface a raw zod / internal error to the operator (spec: friendly
    // es-AR message only). Log the real detail for diagnostics.
    console.error("professionalCloseObservation tx failed:", err);
    return {
      ok: false,
      error: "No se pudo cerrar la observación. Reintentá; si persiste, avisá al equipo técnico.",
    };
  }

  // POSITIVE rabies escalation hook (public-health critical): fan out an urgent
  // alert to the jurisdiction's sanitary authorities. Best-effort and post-tx —
  // like the bite-report fan-out — a routing miss NEVER undoes a recorded close.
  // A null jurisdiction does NOT skip the resolver (2026-08-17): a CONFIRMED
  // RABIES case reaching nobody because the animal's home was never geocoded is
  // the worst instance of the null-jurisdiction short-circuit in the codebase.
  // Coerced to "" so the resolver's admin fallback runs.
  if (input.outcome === "positive_rabies" && findAuthoritiesForJurisdiction) {
    try {
      const authorityIds = await findAuthoritiesForJurisdiction({
        province: pet.jurisdictionProvince ?? "",
        locality: pet.jurisdictionLocality ?? "",
      });
      for (const authorityId of authorityIds) {
        pendingNotifications.push({
          userId: authorityId,
          notificationType: "rabies_observation_positive_authority",
          severity: "urgent",
          title: `RABIA CONFIRMADA — ${pet.name}`,
          body: `Se cerró una observación antirrábica con resultado POSITIVO para ${pet.name}. Activá el protocolo de salud pública para la jurisdicción.${input.closureNotes ? ` Notas: ${input.closureNotes}` : ""}`,
          relatedPetId: pet.id,
          relatedCaseId: biteCase?.id ?? null,
          ctaLabel: "Ver vigilancia",
          ctaUrl: "/gob/vigilancia",
        });
      }
    } catch (notifyErr) {
      console.error(
        "[professionalCloseObservation] authority escalation notification failed:",
        notifyErr,
      );
    }
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
