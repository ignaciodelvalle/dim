"use server";

// libreta-share.ts — thin shim (strangler migration 32/61).
//
// Business logic moved to:
//   src/modules/pets/application/libreta-share/
//
// This file provides the action wrappers used by UI components plus
// logLibretaShareViewForToken (token-credentialed telemetry) and the public
// types. The bare ForUser writers (createLibretaShareForUser,
// revokeLibretaShareForUser) are NOT exported here (authz triage 2026-07-04):
// every export of a "use server" file is an independently-addressable server
// action, so a bare writer taking a caller-supplied userId would let any
// client mint a Tier-2 MEDICAL share as the victim. Callers import the
// writers from src/modules/pets/application/libreta-share/ directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import type { LibretaShareToken } from "@/db";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { createClient } from "@/lib/supabase/server";
import { createLibretaShareForUser as _createLibretaShareForUser } from "@/src/modules/pets/application/libreta-share/create-libreta-share";
import { getActiveLibretaShares as _getActiveLibretaShares } from "@/src/modules/pets/application/libreta-share/get-active-libreta-shares";
import { logLibretaShareViewForToken as _logLibretaShareViewForToken } from "@/src/modules/pets/application/libreta-share/log-libreta-share-view";
import {
  findPetPublicTokenForShare as _findPetPublicTokenForShare,
  revokeLibretaShareForUser as _revokeLibretaShareForUser,
} from "@/src/modules/pets/application/libreta-share/revoke-libreta-share";
import type {
  CreateShareInput,
  CreateShareResult,
  RevokeShareResult,
} from "@/src/modules/pets/application/libreta-share/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  CreateShareInput,
  CreateShareResult,
  RevokeShareResult,
} from "@/src/modules/pets/application/libreta-share/types";

// ---------------------------------------------------------------------------
// Token-credentialed telemetry writer — the share token itself is the
// credential (validated inside the module writer before any DB write).
// ---------------------------------------------------------------------------

export async function logLibretaShareViewForToken(input: {
  shareToken: string;
  userAgent: string | null;
}): Promise<void> {
  return _logLibretaShareViewForToken(input);
}

// ---------------------------------------------------------------------------
// Form-action wrappers — read auth session, delegate to inner writers.
// ---------------------------------------------------------------------------

export async function createLibretaShareAction(
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await _createLibretaShareForUser(user.id, input);
  if ("shareToken" in result) {
    revalidatePath(`/mis-mascotas/${input.petPublicToken}`);
  }
  return result;
}

export async function revokeLibretaShareAction(
  shareTokenRowId: string,
): Promise<RevokeShareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await _revokeLibretaShareForUser(user.id, shareTokenRowId);
  if ("ok" in result) {
    const petPublicToken = await _findPetPublicTokenForShare(shareTokenRowId);
    if (petPublicToken) revalidatePath(`/mis-mascotas/${petPublicToken}`);
  }
  return result;
}

// @no-auth-required: viewer telemetry from a public share link. The token
// itself is the credential; auth lives in `logLibretaShareViewForToken`,
// which validates the token before writing.
export async function logLibretaShareViewAction(input: {
  shareToken: string;
  userAgent: string | null;
}): Promise<void> {
  await _logLibretaShareViewForToken(input);
}

// ---------------------------------------------------------------------------
// getActiveLibretaSharesAction — narrow read for MergedShareSheet (ADR-14).
//
// SharesManager moved out of LibretaFace into the `?sheet=compartir` sheet
// (SheetMounter is a sibling of PetDetailTabsPanel, so it can't read the
// Libreta face's deferred client-fetched data). This action reuses the SAME
// owner-only active-shares query get-libreta-face-data.ts runs, scoped down
// to just that slice, so MergedShareSheet can self-fetch on mount instead of
// forking SharesManager's data contract.
// ---------------------------------------------------------------------------

export async function getActiveLibretaSharesAction(
  petPublicToken: string,
): Promise<{ ok: true; shares: LibretaShareToken[] } | { ok: false; error: string }> {
  const access = await requirePetAccess(petPublicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };
  if (access.accessPath !== "owner") return { ok: true, shares: [] };

  const shares = await _getActiveLibretaShares(access.pet.id);
  return { ok: true, shares };
}
