"use server";

// admin-proposals.ts — thin shim (strangler migration 20/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-proposals/
//
// This file provides thin Action wrappers (proposeVetUpgradeAction,
// proposeOrgVerificationAction, logPiiQueryAction) plus logPiiReadSafely.
// The bare writers (logPiiQueryForAuthority, proposeVetUpgradeForUser,
// proposeOrgVerificationForOrg) are NOT exported here (authz triage
// 2026-07-04): every export of a "use server" file is an independently-
// addressable server action, so a bare writer taking a caller-supplied
// actorUserId would allow PII-audit forgery / proposal spam as any user.
// Callers import the writers from
// src/modules/organizations/application/admin-proposals/ directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  logPiiQueryForAuthority as _logPiiQueryForAuthority,
  logPiiReadSafely as _logPiiReadSafely,
} from "@/src/modules/organizations/application/admin-proposals/log-pii-query";
import { proposeOrgVerificationForOrg as _proposeOrgVerificationForOrg } from "@/src/modules/organizations/application/admin-proposals/propose-org-verification";
import { proposeVetUpgradeForUser as _proposeVetUpgradeForUser } from "@/src/modules/organizations/application/admin-proposals/propose-vet-upgrade";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { ProposalResult } from "@/src/modules/organizations/application/admin-proposals/types";

// @no-auth-required: thin wrapper over logPiiQueryForAuthority (an inner writer).
// Only callers are /gob list pages already gated by the /gob layout guard, which
// supplies the authenticated actorUserId; this function adds no new capability
// beyond that inner writer.
export async function logPiiReadSafely(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: "users" | "organizations",
): Promise<boolean> {
  return _logPiiReadSafely(actorUserId, query, resultCount, surface);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function proposeVetUpgradeAction(
  input: Parameters<typeof _proposeVetUpgradeForUser>[1],
) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _proposeVetUpgradeForUser(user.id, input);
  if ("ok" in result) {
    // Cola/Usuarios are dual-portal surfaces (portal-follows-viewer,
    // 2026-07-02): /admin/cola and /admin/usuarios are thin wrappers
    // re-exporting these same pages, so both copies need revalidating.
    revalidatePath("/gob/cola");
    revalidatePath("/gob/usuarios");
    revalidatePath("/admin/cola");
    revalidatePath("/admin/usuarios");
  }
  return result;
}

export async function proposeOrgVerificationAction(
  input: Parameters<typeof _proposeOrgVerificationForOrg>[1],
) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _proposeOrgVerificationForOrg(user.id, input);
  if ("ok" in result) {
    // Cola/Organizaciones are dual-portal surfaces (portal-follows-viewer,
    // 2026-07-02): /admin/cola and /admin/organizaciones are thin wrappers
    // re-exporting these same pages, so both copies need revalidating.
    revalidatePath("/gob/cola");
    revalidatePath("/gob/organizaciones");
    revalidatePath("/admin/cola");
    revalidatePath("/admin/organizaciones");
  }
  return result;
}

export async function logPiiQueryAction(input: {
  query: string;
  resultCount: number;
  surface: "users" | "organizations";
}): Promise<void> {
  const { user } = await requireAdminOrGovtOrRedirect();
  await _logPiiQueryForAuthority(user.id, input.query, input.resultCount, input.surface);
}
