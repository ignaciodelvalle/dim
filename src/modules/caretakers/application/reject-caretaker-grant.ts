// Use-case: the invitee declines a pending invitation.
//
// No spine event, no ownership row. A pending invitation is workflow state —
// emitting `caretaker_ended` here would record, permanently, an arrangement
// that never began.

import { canApply } from "../domain/grant-state";
import type { CaretakersRepositoryPort } from "./ports";
import type { NewNotification, UseCaseResult } from "./types";

type Deps = { repo: CaretakersRepositoryPort; now: () => Date };

export type RejectCaretakerGrantInput = {
  grantPublicToken: string;
  callerUserId: string;
  callerEmail: string;
};

export async function rejectCaretakerGrant(
  input: RejectCaretakerGrantInput,
  deps: Deps,
): Promise<UseCaseResult<{ petId: string }>> {
  const { repo } = deps;
  const now = deps.now();

  const grant = await repo.findGrantByToken(input.grantPublicToken);
  if (!grant) return { ok: false, error: "Invitación no encontrada." };

  const matchesId = grant.caretakerUserId !== null && grant.caretakerUserId === input.callerUserId;
  const matchesEmail =
    grant.caretakerEmail.toLowerCase() === (input.callerEmail ?? "").trim().toLowerCase();
  if (!matchesId && !matchesEmail) {
    return { ok: false, error: "Esta invitación no es para tu cuenta." };
  }

  if (!canApply(grant.status, "reject")) {
    return { ok: false, error: "Esta invitación ya no está disponible." };
  }

  const updated = await repo.updateGrantStatus({
    grantId: grant.id,
    status: "rejected",
    expectedStatus: "pending",
    respondedAt: now,
    now,
  });
  if (updated === 0) {
    // Somebody resolved it under us — the titular cancelled, or the cron
    // expired it. The pre-read status check above is a stale read by
    // construction; this predicate is what actually serialises the two writers.
    return { ok: false, error: "Esta invitación ya no está disponible." };
  }

  const pet = await repo.findPetSummaryById(grant.petId);
  const caretakerName = (await repo.findDisplayName(input.callerUserId)) ?? grant.caretakerEmail;

  const notifications: NewNotification[] = [
    {
      userId: grant.grantedByUserId,
      notificationType: "caretaker_invitation_rejected",
      // Stable across: a retry of this reject (the `expectedStatus: "pending"`
      // guard already makes a second pass a no-op). Distinct across: other
      // grants — if the titular re-invites and is declined again, that is a
      // different grant id and the titular hears about it.
      dedupeKey: `caretaker:invitation_rejected:${grant.id}:${grant.grantedByUserId}`,
      severity: "info",
      title: `${caretakerName} no puede cuidar a ${pet?.name ?? "tu mascota"}`,
      body: "Podés invitar a otra persona cuando quieras.",
      ctaLabel: "Ver mascota",
      ctaUrl: pet ? `/mis-mascotas/${pet.publicToken}` : "/mis-mascotas",
      relatedPetId: grant.petId,
      category: "custody",
    },
  ];

  return { ok: true, value: { petId: grant.petId }, notifications };
}
