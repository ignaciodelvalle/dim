"use server";

// approval-requests.ts — thin shim (strangler migration 49/61).
//
// Business logic moved to:
//   src/modules/organizations/application/approval-requests/
//
// This file re-exports withdrawApprovalRequestForUser (used by integration tests)
// and provides withdrawApprovalRequestAction (outer auth-guarded server action
// used by UI components).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { withdrawApprovalRequestForUser as _withdrawApprovalRequestForUser } from "@/src/modules/organizations/application/approval-requests/withdraw-approval-request";
import type { WithdrawApprovalRequestResult } from "@/src/modules/organizations/application/approval-requests/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { WithdrawApprovalRequestResult } from "@/src/modules/organizations/application/approval-requests/types";

// ---------------------------------------------------------------------------
// Writer re-export — async wrapper (used by integration tests)
// ---------------------------------------------------------------------------

export async function withdrawApprovalRequestForUser(
  userId: string,
  requestId: string,
): Promise<WithdrawApprovalRequestResult> {
  return _withdrawApprovalRequestForUser(userId, requestId);
}

// ---------------------------------------------------------------------------
// Public wrapper: withdrawApprovalRequestAction
// ---------------------------------------------------------------------------

export async function withdrawApprovalRequestAction(
  requestId: string,
): Promise<WithdrawApprovalRequestResult> {
  const { user } = await requireUserOrRedirect();
  const result = await withdrawApprovalRequestForUser(user.id, requestId);
  if ("ok" in result) {
    revalidatePath("/cuenta/solicitudes");
  }
  return result;
}
