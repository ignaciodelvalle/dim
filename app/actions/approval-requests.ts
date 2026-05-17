"use server";

// Server actions for applicant self-service management of approval_requests.
//
// Writer/wrapper pattern (matches profile.ts):
//   - Inner writer (withdrawApprovalRequestForUser) exported for tests.
//   - Public wrapper (withdrawApprovalRequestAction) gates via
//     requireUserOrRedirect and calls revalidatePath.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { approvalRequests, auditLog, db } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

// ---------------------------------------------------------------------------
// Exported result type
// ---------------------------------------------------------------------------

export type WithdrawApprovalRequestResult = { error: string } | { ok: true };

// ---------------------------------------------------------------------------
// Inner writer: withdrawApprovalRequestForUser
// ---------------------------------------------------------------------------

export async function withdrawApprovalRequestForUser(
  userId: string,
  requestId: string,
): Promise<WithdrawApprovalRequestResult> {
  // 1. Load the request
  const [request] = await db
    .select({
      id: approvalRequests.id,
      applicantUserId: approvalRequests.applicantUserId,
      status: approvalRequests.status,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId))
    .limit(1);

  if (!request) return { error: "NOT_FOUND" };

  // 2. Capability check — only the applicant can withdraw their own request
  if (request.applicantUserId !== userId) return { error: "FORBIDDEN" };

  // 3. Validation — only pending requests can be withdrawn
  if (request.status !== "pending") {
    return { error: `NOT_PENDING: current status is '${request.status}'` };
  }

  // 4. Transition to withdrawn.
  // DB constraint approval_decision_consistent requires:
  //   withdrawn → decided_at IS NULL AND decided_by_user_id IS NULL
  // The self-withdrawal timestamp lives in withdrawn_at instead.
  await db
    .update(approvalRequests)
    .set({
      status: "withdrawn",
      withdrawnAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(approvalRequests.id, requestId), eq(approvalRequests.status, "pending")));

  // 5. Audit log
  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "approval_request_withdrawn_by_applicant",
    approvalRequestId: requestId,
    targetUserId: userId,
    payload: { request_id: requestId },
  });

  return { ok: true };
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
