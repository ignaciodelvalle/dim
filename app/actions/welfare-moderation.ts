"use server";

// Admin-only resolution actions for the auto-flagged welfare reports.
// Govt does NOT call into this — moderation is a meta-decision about
// systemic abuse patterns, which only universal admin has visibility over.
//
// Two outcomes:
//   passToTriage   — unflag the row; it appears in /gob/maltrato as `open`
//   confirmAsSpam  — mark status='invalid' with a moderator note; the row
//                    stays in the table for audit but never enters triage
//
// Both write an audit_log entry. The `flag_reasons` snapshot stays on the
// row so a later analyst can reconstruct what the auto-flagger saw.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auditLog, db, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

export type ModerationResult = { ok: true } | { error: string };

const MIN_NOTES_LEN = 10;

export async function passWelfareToTriageAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const notes = input.notes.trim();
  if (notes.length < MIN_NOTES_LEN) {
    return { error: `Las notas deben tener al menos ${MIN_NOTES_LEN} caracteres.` };
  }
  const { user } = await requireAdminOrRedirect();

  const [report] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, input.welfareReportId))
    .limit(1);
  if (!report) return { error: "Denuncia no encontrada." };
  if (!report.flaggedAt) return { error: "La denuncia no está flagged." };
  if (report.moderationResolvedAt) return { error: "Ya se resolvió la moderación." };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welfareReports)
        .set({
          moderationResolvedAt: now,
          moderationResolvedByUserId: user.id,
        })
        .where(eq(welfareReports.id, report.id));

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "welfare_report_unflagged",
        payload: {
          welfare_report_id: report.id,
          reference_code: report.referenceCode,
          flag_reasons_snapshot: report.flagReasons,
          notes,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo desflagear: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/admin/moderacion");
  revalidatePath("/gob/maltrato");
  return { ok: true };
}

export async function confirmWelfareAsSpamAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const notes = input.notes.trim();
  if (notes.length < MIN_NOTES_LEN) {
    return { error: `Las notas deben tener al menos ${MIN_NOTES_LEN} caracteres.` };
  }
  const { user } = await requireAdminOrRedirect();

  const [report] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, input.welfareReportId))
    .limit(1);
  if (!report) return { error: "Denuncia no encontrada." };
  if (!report.flaggedAt) return { error: "La denuncia no está flagged." };
  if (report.moderationResolvedAt) return { error: "Ya se resolvió la moderación." };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welfareReports)
        .set({
          status: "invalid",
          triagedAt: now,
          triagedByUserId: user.id,
          closedAt: now,
          resolutionNotes: notes,
          moderationResolvedAt: now,
          moderationResolvedByUserId: user.id,
        })
        .where(eq(welfareReports.id, report.id));

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "welfare_report_confirmed_spam",
        payload: {
          welfare_report_id: report.id,
          reference_code: report.referenceCode,
          flag_reasons_snapshot: report.flagReasons,
          notes,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo cerrar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/admin/moderacion");
  return { ok: true };
}
