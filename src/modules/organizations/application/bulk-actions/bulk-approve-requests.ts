// bulk-approve-requests use-case (strangler 35/61).
// Whole-body verbatim move from app/actions/bulk-actions.ts — auth guard,
// per-item loop, and revalidatePath calls preserved in the original order.
// Writers are imported directly from their modules (not the action shims).

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { approveRequestForAuthority } from "@/src/modules/organizations/application/admin-decisions/approve-request";

import type { BulkApproveInput, BulkResult } from "./types";

export async function bulkApproveRequests(input: BulkApproveInput): Promise<BulkResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const bulkActionId = randomUUID();
  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const token of input.requestPublicTokens) {
    try {
      const result = await approveRequestForAuthority(
        session.user.id,
        token,
        input.decisionNotes?.trim() || null,
        bulkActionId,
      );
      if ("error" in result) {
        failed.push({ id: token, reason: result.error });
      } else {
        succeeded.push(token);
      }
    } catch (err) {
      failed.push({ id: token, reason: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  revalidatePath("/admin/cola");
  revalidatePath("/gob/cola");
  return { bulkActionId, succeeded, failed };
}
