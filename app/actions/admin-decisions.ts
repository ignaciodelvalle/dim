"use server";

// admin-decisions.ts — thin shim (strangler migration 17/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-decisions/
//
// This file re-exports all ForAuthority writers (used by integration tests
// and bulk-actions.ts) and provides thin Action wrappers (used by UI
// components) that add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { approveRequestForAuthority as _approveRequest } from "@/src/modules/organizations/application/admin-decisions/approve-request";
import { logRequestViewedForAuthority as _logRequestViewed } from "@/src/modules/organizations/application/admin-decisions/log-request-viewed";
import { rejectRequestForAuthority as _rejectRequest } from "@/src/modules/organizations/application/admin-decisions/reject-request";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { DecisionResult } from "@/src/modules/organizations/application/admin-decisions/types";

// ---------------------------------------------------------------------------
// ForAuthority re-exports — async wrappers (used by integration tests and
// bulk-actions.ts)
// ---------------------------------------------------------------------------

export async function approveRequestForAuthority(
  actorUserId: string,
  publicToken: string,
  notes: string | null,
  bulkActionId: string | null = null,
) {
  return _approveRequest(actorUserId, publicToken, notes, bulkActionId);
}

export async function rejectRequestForAuthority(
  actorUserId: string,
  publicToken: string,
  reason: string,
  bulkActionId: string | null = null,
) {
  return _rejectRequest(actorUserId, publicToken, reason, bulkActionId);
}

export async function logRequestViewedForAuthority(
  actorUserId: string,
  publicToken: string,
): Promise<void> {
  return _logRequestViewed(actorUserId, publicToken);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function approveRequestAction(publicToken: string, notes: string | null) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _approveRequest(user.id, publicToken, notes);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath(`/gob/cola/${publicToken}`);
    revalidatePath("/admin/cola");
    revalidatePath(`/admin/cola/${publicToken}`);
  }
  return result;
}

export async function rejectRequestAction(publicToken: string, reason: string) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _rejectRequest(user.id, publicToken, reason);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath(`/gob/cola/${publicToken}`);
    revalidatePath("/admin/cola");
    revalidatePath(`/admin/cola/${publicToken}`);
  }
  return result;
}
