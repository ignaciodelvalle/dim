"use server";

// admin-org-verification.ts — thin shim (strangler migration 22/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-org-verification/
//
// This file re-exports all ForAuthority writers (used by integration tests)
// and provides thin Action wrappers (used by UI components) that add the
// auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { unverifyOrgForAuthority as _unverifyOrg } from "@/src/modules/organizations/application/admin-org-verification/unverify-org";
import { verifyOrgForAuthority as _verifyOrg } from "@/src/modules/organizations/application/admin-org-verification/verify-org";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { VerifyOrgResult } from "@/src/modules/organizations/application/admin-org-verification/types";

// ---------------------------------------------------------------------------
// ForAuthority re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function verifyOrgForAuthority(
  actorUserId: string,
  input: { organizationId: string },
) {
  return _verifyOrg(actorUserId, input);
}

export async function unverifyOrgForAuthority(
  actorUserId: string,
  input: { organizationId: string; reason?: string },
) {
  return _unverifyOrg(actorUserId, input);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function verifyOrgAction(input: { organizationId: string }) {
  const { user } = await requireAdminOrRedirect();
  const result = await _verifyOrg(user.id, input);
  if ("ok" in result) {
    // The org list lives under /gob now (AC3 — the /admin duplicate was removed).
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}

export async function unverifyOrgAction(input: {
  organizationId: string;
  reason?: string;
}) {
  const { user } = await requireAdminOrRedirect();
  const result = await _unverifyOrg(user.id, input);
  if ("ok" in result) {
    // The org list lives under /gob now (AC3 — the /admin duplicate was removed).
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin");
  }
  return result;
}
