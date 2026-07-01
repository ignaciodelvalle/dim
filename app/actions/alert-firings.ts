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
import {
  evaluateAndRecordFiringsForAllAdmins as _evaluateAndRecordFiringsForAllAdmins,
  recordFiringsForUser as _recordFiringsForUser,
} from "@/src/modules/alerts/application/firings/record-firings";
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
// Writer re-exports — used by cron route + tests
// ---------------------------------------------------------------------------

export async function evaluateAndRecordFiringsForAllAdmins(
  ...args: Parameters<typeof _evaluateAndRecordFiringsForAllAdmins>
) {
  return _evaluateAndRecordFiringsForAllAdmins(...args);
}

export async function recordFiringsForUser(...args: Parameters<typeof _recordFiringsForUser>) {
  return _recordFiringsForUser(...args);
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

  const [profile] = await db
    .select({ role: profiles.role, deactivatedAt: profiles.deactivatedAt })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "admin" || profile.deactivatedAt !== null) {
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
