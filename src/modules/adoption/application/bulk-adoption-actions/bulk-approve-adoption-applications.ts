// bulk-approve-adoption-applications use-case (strangler 41/61, 2026-06-30).
// Whole-body verbatim move from app/actions/bulk-adoption-actions.ts — auth guard,
// per-item loop, and revalidatePath call preserved in the original order.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import type { BulkResult } from "@/src/modules/organizations/application/bulk-actions/types";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import {
  approveAdoptionApplicationAction,
} from "@/src/modules/adoption/actions";

import type { BulkAdoptionApproveInput } from "./types";

export async function bulkApproveAdoptionApplications(
  input: BulkAdoptionApproveInput,
): Promise<BulkResult> {
  // Defense-in-depth: confirm the caller is a member of this org before looping.
  // Per-item authorization ("adoption.review" capability + org ownership of the
  // application) is still enforced inside approveAdoptionApplicationAction.
  await requireOrgAccessByToken(input.orgToken);

  const bulkActionId = randomUUID();
  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const applicationEventId of input.applicationEventIds) {
    try {
      const result = await approveAdoptionApplicationAction(input.orgToken, {
        applicationEventId,
        notes: input.notes?.trim() || null,
      });
      if ("error" in result) {
        failed.push({ id: applicationEventId, reason: result.error });
      } else {
        succeeded.push(applicationEventId);
      }
    } catch (err) {
      failed.push({
        id: applicationEventId,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  revalidatePath(`/org/${input.orgToken}/adopciones`);
  return { bulkActionId, succeeded, failed };
}
