"use server";

// bulk-actions.ts — thin shim (strangler migration 35/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/organizations/application/bulk-actions/
//
// The auth guard, pre-validation order, and revalidatePath calls live INSIDE
// the use-cases (preserving the original control flow exactly — validation
// before auth for reject/revoke), so these wrappers are pure delegations.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { bulkApproveRequests } from "@/src/modules/organizations/application/bulk-actions/bulk-approve-requests";
import { bulkRejectRequests } from "@/src/modules/organizations/application/bulk-actions/bulk-reject-requests";
import { bulkRevoke } from "@/src/modules/organizations/application/bulk-actions/bulk-revoke";
import type {
  BulkApproveInput,
  BulkRejectInput,
  BulkResult,
  BulkRevokeInput,
} from "@/src/modules/organizations/application/bulk-actions/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  BulkResult,
  BulkApproveInput,
  BulkRejectInput,
  BulkRevokeKind,
  BulkRevokeInput,
} from "@/src/modules/organizations/application/bulk-actions/types";

// ---------------------------------------------------------------------------
// Action wrappers — pure delegations (control flow preserved in the use-cases)
// ---------------------------------------------------------------------------

export async function bulkApproveRequestsAction(input: BulkApproveInput): Promise<BulkResult> {
  return bulkApproveRequests(input);
}

export async function bulkRejectRequestsAction(input: BulkRejectInput): Promise<BulkResult> {
  return bulkRejectRequests(input);
}

export async function bulkRevokeAction(input: BulkRevokeInput): Promise<BulkResult> {
  return bulkRevoke(input);
}
