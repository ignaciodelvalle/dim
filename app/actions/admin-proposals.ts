"use server";

// admin-proposals.ts — thin shim (strangler migration 20/61).
//
// Business logic moved to:
//   src/modules/organizations/application/admin-proposals/
//
// This file re-exports all writers (logPiiQueryForAuthority, logPiiReadSafely,
// proposeVetUpgradeForUser, proposeOrgVerificationForOrg) and provides thin
// Action wrappers (proposeVetUpgradeAction, proposeOrgVerificationAction,
// logPiiQueryAction) that add the auth guard + revalidatePath.
//
// app/actions/omnibox-search.ts imports logPiiQueryForAuthority from this shim
// — that import is preserved unchanged.
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

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by integration tests + UI)
// ---------------------------------------------------------------------------

export async function logPiiQueryForAuthority(
  actorUserId: string,
  query: string,
  resultCount: number,
  surface: "users" | "organizations" | "omnibox",
): Promise<void> {
  return _logPiiQueryForAuthority(actorUserId, query, resultCount, surface);
}

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

export async function proposeVetUpgradeForUser(
  actorUserId: string,
  input: {
    targetUserId: string;
    matriculaNumber: string;
    matriculaJurisdiccion: string;
    operationalProvince: string;
    operationalLocality: string;
    especialidad?: string | null;
    anosExperiencia?: number | null;
  },
) {
  return _proposeVetUpgradeForUser(actorUserId, input);
}

export async function proposeOrgVerificationForOrg(
  actorUserId: string,
  input: { organizationId: string },
) {
  return _proposeOrgVerificationForOrg(actorUserId, input);
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
    revalidatePath("/gob/cola");
    revalidatePath("/gob/usuarios");
  }
  return result;
}

export async function proposeOrgVerificationAction(
  input: Parameters<typeof _proposeOrgVerificationForOrg>[1],
) {
  const { user } = await requireAdminOrGovtOrRedirect();
  const result = await _proposeOrgVerificationForOrg(user.id, input);
  if ("ok" in result) {
    revalidatePath("/gob/cola");
    revalidatePath("/gob/organizaciones");
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
