"use server";

// libreta-share.ts — thin shim (strangler migration 32/61).
//
// Business logic moved to:
//   src/modules/pets/application/libreta-share/
//
// This file re-exports the 3 writers (createLibretaShareForUser,
// revokeLibretaShareForUser, logLibretaShareViewForToken), the 3 action
// wrappers used by UI components, and the 3 public types — so all existing
// importers (UI components + integration test) keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type LibretaShareToken, db, libretaShareTokens, pets } from "@/db";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { createClient } from "@/lib/supabase/server";
import { createLibretaShareForUser as _createLibretaShareForUser } from "@/src/modules/pets/application/libreta-share/create-libreta-share";
import { logLibretaShareViewForToken as _logLibretaShareViewForToken } from "@/src/modules/pets/application/libreta-share/log-libreta-share-view";
import { revokeLibretaShareForUser as _revokeLibretaShareForUser } from "@/src/modules/pets/application/libreta-share/revoke-libreta-share";
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
// Writer re-exports — async wrappers (used by integration tests and route actions)
// ---------------------------------------------------------------------------

export async function createLibretaShareForUser(
  userId: string,
  input: CreateShareInput,
): Promise<CreateShareResult> {
  return _createLibretaShareForUser(userId, input);
}

export async function revokeLibretaShareForUser(
  userId: string,
  shareTokenRowId: string,
): Promise<RevokeShareResult> {
  return _revokeLibretaShareForUser(userId, shareTokenRowId);
}

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
    // Find the pet publicToken to revalidate the page.
    const [shareRow] = await db
      .select({ petId: libretaShareTokens.petId })
      .from(libretaShareTokens)
      .where(eq(libretaShareTokens.id, shareTokenRowId))
      .limit(1);
    if (shareRow) {
      const [pet] = await db
        .select({ publicToken: pets.publicToken })
        .from(pets)
        .where(eq(pets.id, shareRow.petId))
        .limit(1);
      if (pet) revalidatePath(`/mis-mascotas/${pet.publicToken}`);
    }
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

  const shares = await db
    .select()
    .from(libretaShareTokens)
    .where(and(eq(libretaShareTokens.petId, access.pet.id), isNull(libretaShareTokens.revokedAt)));

  return { ok: true, shares };
}
