"use server";

// admin-org-verification.ts — thin shim (strangler migration 22/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-org-verification/
//
// This file provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath. The ForAuthority writers are NOT exported
// here (authz triage 2026-07-04): every export of a "use server" file is an
// independently-addressable server action, so a bare writer taking a
// caller-supplied actorUserId would let any client act as any authority.
// Callers import the writers from
// src/modules/organizations/application/admin-org-verification/ directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { unverifyOrgForAuthority as _unverifyOrg } from "@/src/modules/organizations/application/admin-org-verification/unverify-org";
import { verifyOrgForAuthority as _verifyOrg } from "@/src/modules/organizations/application/admin-org-verification/verify-org";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { VerifyOrgResult } from "@/src/modules/organizations/application/admin-org-verification/types";

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function verifyOrgAction(input: { organizationId: string }) {
  const { user } = await requireAdminOrRedirect();
  const result = await _verifyOrg(user.id, input);
  if ("ok" in result) {
    // Organizaciones is a dual-portal surface (portal-follows-viewer,
    // 2026-07-02): /admin/organizaciones is a thin wrapper re-exporting this
    // same page, so both copies need revalidating.
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin/organizaciones");
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
    // Organizaciones is a dual-portal surface (portal-follows-viewer,
    // 2026-07-02): /admin/organizaciones is a thin wrapper re-exporting this
    // same page, so both copies need revalidating.
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin/organizaciones");
  }
  return result;
}
