"use server";

// admin-institutional.ts — thin shim (strangler migration 5/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-institutional/
//
// This file re-exports the ForAuthority writers (used by integration tests
// and other server actions) and provides thin Action wrappers (used by UI
// components) that add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrRedirect } from "@/lib/auth-guards";
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
// ForAuthority re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function createInstitutionalAccountForAuthority(
  actorUserId: string,
  input: {
    role: "govt" | "admin";
    email: string;
    displayName: string;
    initialLocalities: { province: string; locality: string }[];
  },
) {
  return _createInstitutional(actorUserId, input);
}

export async function deactivateAdminForAuthority(
  actorUserId: string,
  input: { targetAdminUserId: string; motivo: string; attachmentIds: string[] },
) {
  return _deactivateAdmin(actorUserId, input);
}

export async function deactivateGovtForAuthority(
  actorUserId: string,
  input: { targetGovtUserId: string; motivo: string; attachmentIds: string[] },
) {
  return _deactivateGovt(actorUserId, input);
}

export async function resetInstitutionalCredentialsForAuthority(
  actorUserId: string,
  input: { targetUserId: string; reason: string },
) {
  return _resetCredentials(actorUserId, input);
}

export async function assignGovtLocalityForAuthority(
  actorUserId: string,
  input: { targetUserId: string; province: string; locality: string },
) {
  return _assignGovtLocality(actorUserId, input);
}

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
