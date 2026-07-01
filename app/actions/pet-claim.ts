"use server";

// pet-claim.ts — thin shim (strangler migration 10/61).
//
// Business logic moved to:
//   src/modules/pets/application/claim/
//
// This file re-exports all ForUser writers (used by integration tests)
// and provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { lookupForClaimForUser as _lookupForClaim } from "@/src/modules/pets/application/claim/lookup-for-claim";
import { submitClaimDisputeForUser as _submitClaimDispute } from "@/src/modules/pets/application/claim/submit-claim-dispute";
import { submitFreeClaimForUser as _submitFreeClaim } from "@/src/modules/pets/application/claim/submit-free-claim";
import type { ClaimDisputeInput } from "@/src/modules/pets/application/claim/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  ClaimLookupVariant,
  ClaimLookupResult,
  ClaimDisputeInput,
  ClaimDisputeResult,
  FreeClaimResult,
} from "@/src/modules/pets/application/claim/types";

// ---------------------------------------------------------------------------
// ForUser re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function lookupForClaimForUser(...args: Parameters<typeof _lookupForClaim>) {
  return _lookupForClaim(...args);
}

export async function submitClaimDisputeForUser(...args: Parameters<typeof _submitClaimDispute>) {
  return _submitClaimDispute(...args);
}

export async function submitFreeClaimForUser(...args: Parameters<typeof _submitFreeClaim>) {
  return _submitFreeClaim(...args);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function lookupForClaimAction(input: {
  kind: "microchip" | "tattoo";
  value: string;
}) {
  const { user } = await requireUserOrRedirect();
  return _lookupForClaim(user.id, input);
}

export async function submitClaimDisputeAction(input: ClaimDisputeInput, files: File[]) {
  const { user } = await requireUserOrRedirect();
  const result = await _submitClaimDispute(user.id, input, files);
  if (!("error" in result)) {
    revalidatePath(`/mis-mascotas/${input.petToken}`);
  }
  return result;
}

export async function submitFreeClaimAction(input: {
  petToken: string;
  identifierKind: "microchip" | "tattoo";
}) {
  const { user } = await requireUserOrRedirect();
  const result = await _submitFreeClaim(user.id, input);
  if (!("error" in result)) {
    revalidatePath("/mis-mascotas");
    revalidatePath(`/mis-mascotas/${input.petToken}`);
  }
  return result;
}
