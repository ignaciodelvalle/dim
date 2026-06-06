// Use-case: accept an owner→owner pet transfer.
//
// Migrated from app/actions/pet-transfer.ts::acceptPetTransferAction.
// Auth (requireUserOrRedirect) is handled by the caller.
// callerEmail is resolved from the Supabase session by the thin action.
//
// Orchestrates:
//   1. Load transfer + status check + expiry check + recipient auth (id-or-email)
//   2. Sender-accepting-own guard
//   3. ATOMIC tx:
//      a. closeOwnerOwnerships (BEFORE insert — unique-active-owner partial index parity)
//      b. insertOwnerOwnership
//      c. insertPetEvent (custody_transferred, authorRole=owner)
//      d. updateTransferStatus(accepted)
//   4. Collect post-tx notifications (sender)
//   5. Return UseCaseResult<{ petId }>
//      The thin action maps petId → publicToken for revalidatePath (or pre-loads it).
//
// PARITY QUIRK: close BEFORE insert (unique-active-owner partial index validates at commit).

import { validateRecipientMatch } from "../domain/owner-transfer-rules";
import type { TransfersRepository } from "../infrastructure/transfers-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
};

type Deps = {
  repo: typeof TransfersRepository;
  actor: Actor;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type AcceptPetTransferInput = {
  transferToken: string;
  /** Caller's authenticated email — resolved by the action via Supabase session. */
  callerEmail: string;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function acceptPetTransfer(
  input: AcceptPetTransferInput,
  deps: Deps,
): Promise<UseCaseResult<{ petId: string; fromOwnerId: string; petPublicToken: string | null }>> {
  const { repo, actor, transaction } = deps;
  const { user } = actor;

  // 1. Load transfer.
  const transfer = await repo.findTransferByToken(input.transferToken);
  if (!transfer) return { ok: false, error: "Transferencia no encontrada." };
  if (transfer.status !== "pending") {
    return { ok: false, error: `La transferencia ya está ${transfer.status}.` };
  }
  if (transfer.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "La transferencia expiró. Pedile al dueño que la inicie de nuevo." };
  }

  // 2. Recipient auth (id-or-email).
  const isRecipient = validateRecipientMatch({
    toOwnerId: transfer.toOwnerId,
    toOwnerEmail: transfer.toOwnerEmail,
    callerId: user.id,
    callerEmail: input.callerEmail,
  });
  if (!isRecipient) {
    return { ok: false, error: "Esta propuesta no es para tu cuenta." };
  }
  if (transfer.fromOwnerId === user.id) {
    return { ok: false, error: "No podés aceptar tu propia transferencia." };
  }

  const pendingNotifications: NewNotification[] = [];

  // 3. Atomic transaction.
  try {
    await transaction(async (tx) => {
      const now = new Date();

      // PARITY QUIRK: close BEFORE insert.
      await repo.closeOwnerOwnerships(
        transfer.petId,
        tx as Parameters<typeof repo.closeOwnerOwnerships>[1],
      );

      await repo.insertOwnerOwnership(
        { petId: transfer.petId, ownerUserId: user.id, startedAt: now },
        tx as Parameters<typeof repo.insertOwnerOwnership>[1],
      );

      await repo.insertPetEvent(
        {
          petId: transfer.petId,
          eventType: "custody_transferred",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            payload_version: 1,
            from_user_id: transfer.fromOwnerId,
            to_user_id: user.id,
            reason: transfer.reason,
            transfer_token: input.transferToken,
          },
        },
        tx as Parameters<typeof repo.insertPetEvent>[1],
      );

      await repo.updateTransferStatus(
        {
          id: transfer.id,
          status: "accepted",
          respondedAt: now,
          toOwnerId: user.id,
        },
        tx as Parameters<typeof repo.updateTransferStatus>[1],
      );

      pendingNotifications.push({
        userId: transfer.fromOwnerId,
        notificationType: "pet_transfer_accepted",
        severity: "success",
        title: "Transferencia aceptada",
        body: "El receptor aceptó la propuesta. La mascota ya no figura a tu nombre.",
        ctaUrl: "/mis-mascotas",
        ctaLabel: "Ver mis mascotas",
        relatedPetId: transfer.petId,
        category: "custody",
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido." };
  }

  // Fetch pet publicToken for cache revalidation in the thin action.
  const petPublicToken = await repo.findPetPublicTokenById(transfer.petId);

  return {
    ok: true,
    value: { petId: transfer.petId, fromOwnerId: transfer.fromOwnerId, petPublicToken },
    notifications: pendingNotifications,
  };
}
