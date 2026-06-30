"use server";

// bulk-adoption-actions.ts — thin shim (strangler migration 41/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/adoption/application/bulk-adoption-actions/
//
// The auth guard, validation order, and revalidatePath calls live INSIDE
// the use-cases (auth BEFORE validation for both actions — preserving the
// original control flow exactly), so these wrappers are pure delegations.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { bulkApproveAdoptionApplications } from "@/src/modules/adoption/application/bulk-adoption-actions/bulk-approve-adoption-applications";
import { bulkRejectAdoptionApplications } from "@/src/modules/adoption/application/bulk-adoption-actions/bulk-reject-adoption-applications";
import type {
  BulkAdoptionApproveInput,
  BulkAdoptionRejectInput,
} from "@/src/modules/adoption/application/bulk-adoption-actions/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { BulkAdoptionApproveInput, BulkAdoptionRejectInput } from "@/src/modules/adoption/application/bulk-adoption-actions/types";

// ---------------------------------------------------------------------------
// Action wrappers — pure delegations (control flow preserved in the use-cases)
// ---------------------------------------------------------------------------

export async function bulkApproveAdoptionApplicationsAction(
  input: BulkAdoptionApproveInput,
) {
  return bulkApproveAdoptionApplications(input);
}

export async function bulkRejectAdoptionApplicationsAction(
  input: BulkAdoptionRejectInput,
) {
  return bulkRejectAdoptionApplications(input);
}
