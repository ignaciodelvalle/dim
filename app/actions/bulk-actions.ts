"use server";

// Bulk operations for admin/govt queues — wrap the existing single-action
// writers and tag every audit_log entry with a shared `bulk_action_id` (a
// uuid generated here) so the audit timeline can reconstruct which rows
// were touched by the same operation.
//
// Per-item capability is enforced by the inner writers (they already check
// scope via canDecideRequest / canRevoke). Out-of-scope items fail at the
// writer level with the same error message they'd produce in single mode;
// we capture that in the per-item failed[] without aborting the rest of
// the batch.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  approveRequestForAuthority,
  rejectRequestForAuthority,
} from "@/app/actions/admin-decisions";
import {
  revokeGovtLocalityForAuthority,
  revokeOrgVerificationForAuthority,
  revokeVetRoleForAuthority,
} from "@/app/actions/admin-revocations";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

export type BulkResult = {
  bulkActionId: string;
  succeeded: string[];
  failed: { id: string; reason: string }[];
};

export type BulkApproveInput = {
  requestPublicTokens: string[];
  decisionNotes?: string | null;
};

export async function bulkApproveRequestsAction(input: BulkApproveInput): Promise<BulkResult> {
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

export type BulkRejectInput = {
  requestPublicTokens: string[];
  reason: string;
};

export async function bulkRejectRequestsAction(input: BulkRejectInput): Promise<BulkResult> {
  const bulkActionId = randomUUID();
  const reason = input.reason.trim();
  if (reason.length < 5) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.requestPublicTokens.map((id) => ({
        id,
        reason: "El motivo del rechazo debe tener al menos 5 caracteres.",
      })),
    };
  }

  const session = await requireAdminOrGovtOrRedirect();
  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const token of input.requestPublicTokens) {
    try {
      const result = await rejectRequestForAuthority(session.user.id, token, reason, bulkActionId);
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

export type BulkRevokeKind = "vet" | "org" | "govt_assignment";

export type BulkRevokeInput = {
  targetIds: string[];
  targetKind: BulkRevokeKind;
  motivo: string;
  attachmentIds: string[];
};

export async function bulkRevokeAction(input: BulkRevokeInput): Promise<BulkResult> {
  const bulkActionId = randomUUID();
  const motivo = input.motivo.trim();
  // The single-writer validates len ≥ 30 and at least 1 attachment; we
  // pre-check here so the entire batch fails fast with one clean error
  // instead of N copies.
  if (motivo.length < 30) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.targetIds.map((id) => ({
        id,
        reason: "El motivo de la revocación debe tener al menos 30 caracteres.",
      })),
    };
  }
  if (input.attachmentIds.length === 0) {
    return {
      bulkActionId,
      succeeded: [],
      failed: input.targetIds.map((id) => ({
        id,
        reason: "La revocación requiere al menos un adjunto de evidencia.",
      })),
    };
  }

  const session = await requireAdminOrGovtOrRedirect();
  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of input.targetIds) {
    try {
      let result: { ok: true; noOp?: boolean } | { error: string };
      if (input.targetKind === "vet") {
        result = await revokeVetRoleForAuthority(session.user.id, {
          targetUserId: id,
          motivo,
          attachmentIds: input.attachmentIds,
          bulkActionId,
        });
      } else if (input.targetKind === "org") {
        result = await revokeOrgVerificationForAuthority(session.user.id, {
          organizationId: id,
          motivo,
          attachmentIds: input.attachmentIds,
          bulkActionId,
        });
      } else {
        result = await revokeGovtLocalityForAuthority(session.user.id, {
          govtAssignmentId: id,
          motivo,
          attachmentIds: input.attachmentIds,
          bulkActionId,
        });
      }
      if ("error" in result) {
        failed.push({ id, reason: result.error });
      } else {
        succeeded.push(id);
      }
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/gob/usuarios");
  revalidatePath("/admin/organizaciones");
  revalidatePath("/gob/organizaciones");
  revalidatePath("/admin/govts");
  return { bulkActionId, succeeded, failed };
}
