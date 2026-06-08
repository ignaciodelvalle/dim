// Use-case: get a transfer for the sender or recipient to view.
//
// Migrated from app/actions/pet-transfer.ts::getTransferForViewer.
// Auth (requireUserOrRedirect) is handled by the caller.
// callerEmail is resolved from the Supabase session by the thin action.
//
// READ ONLY — no mutations.
// Returns a view DTO with isSender/isRecipient flags.

import { validateRecipientMatch } from "../domain/owner-transfer-rules";
import type { TransfersRepository } from "../infrastructure/transfers-repository";
import type { UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
};

type Deps = {
  repo: typeof TransfersRepository;
  actor: Actor;
};

export type TransferViewDTO = {
  publicToken: string;
  status: string;
  petId: string;
  fromOwnerId: string;
  toOwnerId: string | null;
  toOwnerEmail: string;
  reason: string | null;
  note: string | null;
  expiresAt: string;
  isRecipient: boolean;
  isSender: boolean;
};

export type GetTransferForViewerInput = {
  transferToken: string;
  /** Caller's authenticated email — resolved by action. */
  callerEmail: string;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function getTransferForViewer(
  input: GetTransferForViewerInput,
  deps: Deps,
): Promise<UseCaseResult<TransferViewDTO>> {
  const { repo, actor } = deps;
  const { user } = actor;

  const transfer = await repo.findTransferByToken(input.transferToken);
  if (!transfer) return { ok: false, error: "Transferencia no encontrada." };

  const isSender = transfer.fromOwnerId === user.id;
  const isRecipient = validateRecipientMatch({
    toOwnerId: transfer.toOwnerId,
    toOwnerEmail: transfer.toOwnerEmail,
    callerId: user.id,
    callerEmail: input.callerEmail,
  });

  if (!isSender && !isRecipient) {
    return { ok: false, error: "Esta propuesta no es accesible desde tu cuenta." };
  }

  return {
    ok: true,
    value: {
      publicToken: transfer.publicToken,
      status: transfer.status,
      petId: transfer.petId,
      fromOwnerId: transfer.fromOwnerId,
      toOwnerId: transfer.toOwnerId,
      toOwnerEmail: transfer.toOwnerEmail,
      reason: transfer.reason,
      note: transfer.note,
      expiresAt: transfer.expiresAt.toISOString(),
      isRecipient,
      isSender,
    },
    notifications: [],
  };
}
