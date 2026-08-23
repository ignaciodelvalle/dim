// Owner→owner transfer domain rules — pure functions, no DB, no Next.js.
// Extracted from app/actions/pet-transfer.ts validation blocks.

import {
  type DomainResult,
  OWNER_TRANSFER_REASONS,
  type OwnerTransferReason,
  type PetStatusSnapshot,
  TRANSFER_EXPIRY_DAYS,
} from "./types";

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

export function isValidTransferEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Transfer reason validation
// ---------------------------------------------------------------------------

export function validateOwnerTransferReason(reason: string): DomainResult<OwnerTransferReason> {
  if (!(OWNER_TRANSFER_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: "Motivo inválido." };
  }
  return { ok: true, value: reason as OwnerTransferReason };
}

// ---------------------------------------------------------------------------
// Pet status guard
// ---------------------------------------------------------------------------

export function validatePetStatusForTransfer(pet: PetStatusSnapshot): DomainResult {
  if (pet.status === "deceased") {
    return { ok: false, error: "No podés transferir una mascota fallecida." };
  }
  if (pet.status === "lost") {
    return {
      ok: false,
      error: "Esta mascota está reportada como perdida. Resolvé el episodio primero.",
    };
  }
  if (pet.inCustodyDispute) {
    return {
      ok: false,
      error: "Hay una disputa de propiedad abierta. La transferencia se bloquea.",
    };
  }
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Sponsored pet guard (rehome-by-titular, REQ-15)
// ---------------------------------------------------------------------------

/**
 * The refusal a titular sees when the pet is still on a shelter's adoption
 * listing.
 *
 * The cross-org twin's `SPONSORED_CUSTODY_TRANSFER_ERROR` says the same thing
 * to the ORG holding the row ("only the titular may end it — no se puede
 * transferir a otra organización"). Read BY the titular that sentence names
 * the wrong actor and the wrong destination (this hand-off goes to a person),
 * so the P2P side gets its own wording, whose job is to name the one action
 * that unblocks it: withdraw the sponsorship first.
 */
export const SPONSORED_PET_TRANSFER_ERROR =
  "Un refugio está acompañando la adopción de esta mascota. Antes de transferir la titularidad tenés que dar de baja el acompañamiento.";

/**
 * An owner→owner transfer closes the titular's `owner` row and touches nothing
 * else (`closeOwnerOwnerships` filters on `role='owner'` by design). If a
 * shelter's `shelter_custody` row is still open under a rehome sponsorship,
 * the hand-off leaves it standing over a stranger: the public catalogue keeps
 * saying "vive con su familia" about someone else's animal, and the shelter
 * keeps the power to finalise an adoption to a third party — which closes the
 * NEW owner's ownership row. Neither side is told the title changed.
 *
 * Spec REQ-15 already decided this shape for the cross-org twin: a sponsored
 * custody is **refused**, never ended inside another hand-off, because ending
 * it here would leave no `rehome_sponsorship_started` naming a live row and
 * REQ-10's unconditional route back would be gone. The titular's own withdraw
 * is the door.
 *
 * Unlike `validateSourceNotSponsored`, this predicate does NOT compare ids:
 * the cross-org rule blocks an org from handing off THAT row, while here ANY
 * open sponsorship on the pet is the thing left dangling by the title change.
 */
export function validatePetNotSponsored(input: {
  openSponsorship: { ownershipId: string } | null;
}): DomainResult {
  if (input.openSponsorship) {
    return { ok: false, error: SPONSORED_PET_TRANSFER_ERROR };
  }
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Self-transfer guard
// ---------------------------------------------------------------------------

/**
 * Validates that the caller (sender) is not the same user as the recipient.
 * Only applicable when toOwnerId is already resolved.
 */
export function validateSelfTransfer(callerId: string, toOwnerId: string): DomainResult {
  if (callerId === toOwnerId) {
    return { ok: false, error: "No podés transferirte la mascota a vos mismo/a." };
  }
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Recipient match (id-or-email)
// ---------------------------------------------------------------------------

/**
 * Returns true when the caller is the intended recipient.
 * Semantics: if toOwnerId is set, match by id only.
 * If toOwnerId is null (open invitation by email), match by email (lowercased).
 */
export function validateRecipientMatch(args: {
  toOwnerId: string | null;
  toOwnerEmail: string;
  callerId: string;
  callerEmail: string;
}): boolean {
  if (args.toOwnerId !== null) {
    return args.toOwnerId === args.callerId;
  }
  return args.toOwnerEmail.toLowerCase() === args.callerEmail.toLowerCase();
}

// ---------------------------------------------------------------------------
// Expiry computation
// ---------------------------------------------------------------------------

export function computeTransferExpiresAt(now: Date): Date {
  return new Date(now.getTime() + TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
