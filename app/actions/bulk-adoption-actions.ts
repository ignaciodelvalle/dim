"use server";

// Bulk approve / reject for adoption applications.
//
// Mirrors the admin bulk-actions.ts pattern: one bulkActionId per batch,
// per-item capability re-check via the canonical single-item actions,
// partial-failure semantics (failures do NOT abort remaining items).
//
// Authorization is enforced per-item because each approveAdoptionApplicationAction
// / rejectAdoptionApplicationAction call internally runs requireCapability("adoption.review")
// and validates that the application belongs to the caller's org. Passing orgToken
// through to those helpers gives an extra org-token cross-check identical to the
// single-item flow.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import type { BulkResult } from "@/app/actions/bulk-actions";
import {
  approveAdoptionApplicationAction,
  rejectAdoptionApplicationAction,
} from "@/src/modules/adoption/actions";

export type BulkAdoptionApproveInput = {
  orgToken: string;
  applicationEventIds: string[];
  notes?: string | null;
};

export async function bulkApproveAdoptionApplicationsAction(
  input: BulkAdoptionApproveInput,
): Promise<BulkResult> {
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

export type BulkAdoptionRejectInput = {
  orgToken: string;
  applicationEventIds: string[];
  reason: string;
};

export async function bulkRejectAdoptionApplicationsAction(
  input: BulkAdoptionRejectInput,
): Promise<BulkResult> {
  const bulkActionId = randomUUID();
  const reason = input.reason.trim();

  // Validate reason before touching any item — fail-fast so the org reviewer
  // sees one clear error rather than N copies of the same validation message.
  if (reason.length < 5) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.applicationEventIds.map((id) => ({
        id,
        reason: "El motivo del rechazo debe tener al menos 5 caracteres.",
      })),
    };
  }

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const applicationEventId of input.applicationEventIds) {
    try {
      const result = await rejectAdoptionApplicationAction(input.orgToken, {
        applicationEventId,
        notes: reason,
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
