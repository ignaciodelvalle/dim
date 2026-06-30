"use server";

// admin-revocations.ts — thin shim (strangler migration 8/61).
//
// Business logic moved to:
//   src/modules/organizations/application/revocations/
//
// This file re-exports all ForAuthority writers (used by integration tests
// and bulk-actions.ts) and provides thin Action wrappers (used by UI
// components) that add the auth guard + revalidatePath.
//
// claimAttachmentsForAudit: authoritative source is now revocations/helpers.ts.
// admin-institutional/deactivate-admin and deactivate-govt import directly
// from the module — the back-edge is closed.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { claimAttachmentsForAudit as _claimAttachments } from "@/src/modules/organizations/application/revocations/helpers";
import { revokeGovtLocalityForAuthority as _revokeGovtLocality } from "@/src/modules/organizations/application/revocations/revoke-govt-locality";
import { revokeOrgVerificationForAuthority as _revokeOrgVerification } from "@/src/modules/organizations/application/revocations/revoke-org-verification";
import { revokeVetRoleForAuthority as _revokeVetRole } from "@/src/modules/organizations/application/revocations/revoke-vet-role";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { RevocationResult } from "@/src/modules/organizations/application/revocations/types";

// ---------------------------------------------------------------------------
// Utility re-export — preserved for any callers (bulk-actions, tests).
// Authoritative source: revocations/helpers.ts (ADR-5).
// ---------------------------------------------------------------------------

export async function claimAttachmentsForAudit(
  ...args: Parameters<typeof _claimAttachments>
): Promise<void> {
  return _claimAttachments(...args);
}

// ---------------------------------------------------------------------------
// ForAuthority re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function revokeVetRoleForAuthority(
  actorUserId: string,
  input: {
    targetUserId: string;
    motivo: string;
    attachmentIds: string[];
    bulkActionId?: string | null;
  },
) {
  return _revokeVetRole(actorUserId, input);
}

export async function revokeOrgVerificationForAuthority(
  actorUserId: string,
  input: {
    organizationId: string;
    motivo: string;
    attachmentIds: string[];
    bulkActionId?: string | null;
  },
) {
  return _revokeOrgVerification(actorUserId, input);
}

export async function revokeGovtLocalityForAuthority(
  actorUserId: string,
  input: {
    govtAssignmentId: string;
    motivo: string;
    attachmentIds: string[];
    bulkActionId?: string | null;
  },
) {
  return _revokeGovtLocality(actorUserId, input);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function revokeVetRoleAction(input: {
  targetUserId: string;
  motivo: string;
  attachmentIds: string[];
}) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _revokeVetRole(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/usuarios");
    revalidatePath("/admin");
  }
  return result;
}

export async function revokeOrgVerificationAction(input: {
  organizationId: string;
  motivo: string;
  attachmentIds: string[];
}) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _revokeOrgVerification(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}

export async function revokeGovtLocalityAction(input: {
  govtAssignmentId: string;
  motivo: string;
  attachmentIds: string[];
}) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _revokeGovtLocality(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin");
    // Revalidate the gob/usuarios page — Next.js silently ignores
    // paths for non-existent pages, so this is safe.
    revalidatePath("/gob/usuarios");
  }
  return result;
}
