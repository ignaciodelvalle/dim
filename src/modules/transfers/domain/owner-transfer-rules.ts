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
