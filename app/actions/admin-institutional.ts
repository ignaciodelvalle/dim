"use server";

// admin-institutional.ts — thin shim (strangler migration 5/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-institutional/
//
// This file provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath. The ForAuthority writers are NOT exported
// here (authz triage 2026-07-04): every export of a "use server" file is an
// independently-addressable server action, so a bare writer taking a
// caller-supplied actorUserId would let any client act as any admin. Callers
// that need a writer import it from its application module directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { assignGovtLocalityForAuthority as _assignGovtLocality } from "@/src/modules/organizations/application/admin-institutional/assign-govt-locality";
import { createInstitutionalAccountForAuthority as _createInstitutional } from "@/src/modules/organizations/application/admin-institutional/create-institutional-account";
import { deactivateAdminForAuthority as _deactivateAdmin } from "@/src/modules/organizations/application/admin-institutional/deactivate-admin";
import { deactivateGovtForAuthority as _deactivateGovt } from "@/src/modules/organizations/application/admin-institutional/deactivate-govt";
import { resetInstitutionalCredentialsForAuthority as _resetCredentials } from "@/src/modules/organizations/application/admin-institutional/reset-institutional-credentials";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { AssignGovtLocalityResult } from "@/src/modules/organizations/application/admin-institutional/types";
export type { CreateInstitutionalResult } from "@/src/modules/organizations/application/admin-institutional/types";
export type { DeactivateResult } from "@/src/modules/organizations/application/admin-institutional/types";
export type { ResetCredentialsResult } from "@/src/modules/organizations/application/admin-institutional/types";

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function createInstitutionalAccountAction(input: {
  role: "govt" | "admin";
  email: string;
  displayName: string;
  initialLocalities: { province: string; locality: string }[];
}) {
  const { user } = await requireAdminOrRedirect();
  const result = await _createInstitutional(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/govts");
    revalidatePath("/admin/admins");
  }
  return result;
}

export async function deactivateAdminAction(input: {
  targetAdminUserId: string;
  motivo: string;
  attachmentIds: string[];
}) {
  const { user } = await requireAdminOrRedirect();
  const result = await _deactivateAdmin(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/admin/admins");
    revalidatePath(`/admin/admins/${input.targetAdminUserId}`);
  }
  return result;
}

export async function deactivateGovtAction(input: {
  targetGovtUserId: string;
  motivo: string;
  attachmentIds: string[];
}) {
  const { user } = await requireAdminOrRedirect();
  const result = await _deactivateGovt(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/admin/govts");
    revalidatePath(`/admin/govts/${input.targetGovtUserId}`);
  }
  return result;
}

export async function resetInstitutionalCredentialsAction(input: {
  targetUserId: string;
  reason: string;
}) {
  const { user } = await requireAdminOrRedirect();
  return _resetCredentials(user.id, input);
}

export async function assignGovtLocalityAction(input: {
  targetUserId: string;
  province: string;
  locality: string;
}) {
  const { user } = await requireAdminOrRedirect();
  const result = await _assignGovtLocality(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath(`/admin/govts/${input.targetUserId}`);
  }
  return result;
}
