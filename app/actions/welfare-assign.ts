"use server";

// Welfare-report assignment actions — Chunk E E4.
//
// Two actions:
//   assignWelfareToMeAction  — claim a report (sets assigned_to_user_id = current user).
//   unassignWelfareAction    — release a report (sets assigned_to_user_id = NULL).
//
// Auth: admin (universal) or govt scoped to the report's jurisdiction.
// The assignee or an admin can unassign; a different govt user cannot.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

type AssignResult = { ok: true } | { ok: false; error: string };

/** Load the report and verify the current user has scope over it. */
async function loadAndVerifyScope(
  reportId: string,
  actor: { id: string; role: "admin" | "govt" },
  jurisdictions: { province: string; locality: string }[],
): Promise<{ row: typeof welfareReports.$inferSelect } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, reportId))
    .limit(1);

  if (!row) return { ok: false, error: "Denuncia no encontrada." };

  if (actor.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === row.jurisdictionProvince && j.locality === row.jurisdictionLocality,
    );
    if (!inScope) return { ok: false, error: "La denuncia está fuera de tu jurisdicción." };
  }

  return { row };
}

/**
 * Assign the current welfare report to the logged-in user.
 * Only one officer can hold a report at a time — if it's already assigned to
 * another user, returns an error so the UI can surface a conflict.
 */
export async function assignWelfareToMeAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const loaded = await loadAndVerifyScope(reportId, session.profile, session.jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const report = loaded.row;

  if (report.assignedToUserId && report.assignedToUserId !== session.user.id) {
    return { ok: false, error: "Esta denuncia ya está asignada a otro agente." };
  }

  try {
    await db
      .update(welfareReports)
      .set({ assignedToUserId: session.user.id })
      .where(eq(welfareReports.id, reportId));
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo asignar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}

/**
 * Unassign the current welfare report.
 * Only the current assignee or an admin can unassign.
 */
export async function unassignWelfareAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const loaded = await loadAndVerifyScope(reportId, session.profile, session.jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const report = loaded.row;

  if (!report.assignedToUserId) {
    return { ok: false, error: "La denuncia no está asignada." };
  }

  // Only the assignee or an admin can unassign.
  if (session.profile.role !== "admin" && report.assignedToUserId !== session.user.id) {
    return { ok: false, error: "Solo el agente asignado o un administrador puede desasignar." };
  }

  try {
    await db
      .update(welfareReports)
      .set({ assignedToUserId: null })
      .where(eq(welfareReports.id, reportId));
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo desasignar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}
