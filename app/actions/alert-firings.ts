"use server";

// alert-firings.ts — thin shim (strangler migration 16/61).
//
// Business logic moved to:
//   src/modules/alerts/application/firings/
//
// This file re-exports all writers (used by the evaluate-alerts cron and tests)
// and provides thin action wrappers (used by AlertRowActions.tsx) that add the
// auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { evaluateAndRecordFiringsForAllAdmins as _evaluateAndRecordFiringsForAllAdmins } from "@/src/modules/alerts/application/firings/record-firings";
import {
  acknowledgeFiring,
  contactAuthorityFiring,
  dismissFiring,
  openInvestigationFiring,
  registerFollowupFiring,
  resolveFiring,
} from "@/src/modules/alerts/application/firings/triage";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { FiringActionResult } from "@/src/modules/alerts/application/firings/types";
export type { RecordFiringsResult } from "@/src/modules/alerts/application/firings/types";

// ---------------------------------------------------------------------------
// Writer re-export — used by the cron route
// ---------------------------------------------------------------------------
//
// recordFiringsForUser is intentionally NOT re-exported here: it accepts a
// caller-supplied userId, so exporting it from a "use server" file would make
// it an independently-addressable action (authz triage 2026-07-04). Tests
// import it from src/modules/alerts/application/firings/record-firings.

// @no-auth-required: cron/internal writer — invoked by /api/cron/evaluate-alerts,
// which is gated by authorizeCronRequest (CRON_SECRET) before calling this
// (verified 2026-07-04). Takes no user-scoping argument.
export async function evaluateAndRecordFiringsForAllAdmins(
  ...args: Parameters<typeof _evaluateAndRecordFiringsForAllAdmins>
) {
  return _evaluateAndRecordFiringsForAllAdmins(...args);
}

// ---------------------------------------------------------------------------
// Auth helper (admin-only) — stays in the shim, never in use-cases
// ---------------------------------------------------------------------------

async function requireAdminUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: "Sesión expirada" };

  // Full-invariant admin check (aligned with requireAdminOrRedirect): role +
  // accountType==='institutional' + deactivatedAt IS NULL + deletedAt IS NULL.
  // Adding accountType + deletedAt closes the gap where a personal-type or
  // ERASED (soft-deleted, session still valid — Ley 25.326 art. 16) account
  // whose role column still read 'admin' passed the earlier role+deactivated
  // check.
  const [profile] = await db
    .select({
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (
    !profile ||
    profile.role !== "admin" ||
    profile.accountType !== "institutional" ||
    profile.deactivatedAt !== null ||
    profile.deletedAt !== null
  ) {
    return { error: "Acceso restringido a administradores" };
  }
  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// Triage action wrappers — thin controllers (auth + revalidatePath only)
// ---------------------------------------------------------------------------

/** Reconocer — disparada → reconocida. */
export async function acknowledgeFiringAction(firingId: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await acknowledgeFiring(auth.userId, firingId);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}

/**
 * Abrir investigación — reconocida → en_investigacion.
 * ONLY for active_zoonosis (decision K-D2).
 */
export async function openInvestigationFiringAction(firingId: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await openInvestigationFiring(firingId);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}

/**
 * Registrar seguimiento — append a note without opening an expediente.
 * For non-disease-mapped metrics (decision K-D2).
 */
export async function registerFollowupFiringAction(firingId: string, note: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await registerFollowupFiring(firingId, note);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}

/**
 * Contactar autoridad — resolve jurisdiction govts, notify them,
 * transition to autoridad_contactada.
 */
export async function contactAuthorityFiringAction(firingId: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await contactAuthorityFiring(firingId);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}

/** Resolver — close the firing with notes → resuelta. */
export async function resolveFiringAction(firingId: string, notes: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await resolveFiring(auth.userId, firingId, notes);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}

/** Descartar — close the firing with notes → descartada. */
export async function dismissFiringAction(firingId: string, notes: string) {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  const result = await dismissFiring(auth.userId, firingId, notes);
  if ("ok" in result) revalidatePath("/admin/alertas");
  return result;
}
