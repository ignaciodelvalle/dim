"use server";

// Welfare-officer triage actions. Govt/admin moves a `welfare_reports` row
// through its state machine and (optionally) notifies the reporter.
//
// State machine (enforced server-side):
//   open                 → triaged | in_progress | invalid | duplicate | closed
//   triaged              → in_progress | invalid | duplicate | closed
//   in_progress          → closed
//   closed | invalid | duplicate  → terminal (no re-open in v1)
//
// Scope:
//   - admin (institutional, not deactivated) → all reports
//   - govt (institutional, not deactivated)  → only reports whose
//     jurisdiction_province / jurisdiction_locality match an active
//     row in govt_assignments
//
// Notes are mandatory on every transition (≥10 chars). They land in
// resolution_notes on close, and in the audit_log payload for every
// status change.
//
// Reporter notification: only when the welfare report has a non-null
// reporter_user_id (anonymous reporters get nothing). Copy stays neutral
// — we don't reveal triage outcomes that could expose the alleged
// perpetrator's identity or the case theory.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auditLog, db, govtAssignments, notifications, profiles, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import type { WelfareReportStatus } from "@/lib/welfare";

const MIN_NOTES_LEN = 10;

export type TriageResult = { ok: true } | { error: string };

export type TriageDecision = "triaged" | "invalid" | "duplicate";

async function loadInScopeReport(
  reportId: string,
  actor: { id: string; role: "admin" | "govt" },
  jurisdictions: { province: string; locality: string }[],
): Promise<{ row: typeof welfareReports.$inferSelect } | { error: string }> {
  const [row] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, reportId))
    .limit(1);
  if (!row) return { error: "Denuncia no encontrada." };

  if (actor.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === row.jurisdictionProvince && j.locality === row.jurisdictionLocality,
    );
    if (!inScope) return { error: "La denuncia está fuera de tu jurisdicción." };
  }
  return { row };
}

function validateNotes(notes: string): { ok: true } | { error: string } {
  const trimmed = notes.trim();
  if (trimmed.length < MIN_NOTES_LEN) {
    return { error: `Las notas deben tener al menos ${MIN_NOTES_LEN} caracteres.` };
  }
  return { ok: true };
}

function statusTransitionAllowed(from: WelfareReportStatus, to: WelfareReportStatus): boolean {
  switch (from) {
    case "open":
      return ["triaged", "in_progress", "invalid", "duplicate", "closed"].includes(to);
    case "triaged":
      return ["in_progress", "invalid", "duplicate", "closed"].includes(to);
    case "in_progress":
      return to === "closed";
    default:
      return false;
  }
}

async function notifyReporter(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  reporterUserId: string | null,
  referenceCode: string,
  title: string,
  body: string,
): Promise<void> {
  if (!reporterUserId) return;
  await tx.insert(notifications).values({
    userId: reporterUserId,
    notificationType: "welfare_report_status_changed",
    title,
    body,
    severity: "info",
    ctaLabel: "Ver mi denuncia",
    ctaUrl: `/denuncias/codigo/${referenceCode}`,
  });
}

// triageWelfareReportAction ----------------------------------------------

export async function triageWelfareReportAction(input: {
  welfareReportId: string;
  decision: TriageDecision;
  notes: string;
}): Promise<TriageResult> {
  const notesCheck = validateNotes(input.notes);
  if ("error" in notesCheck) return notesCheck;

  const session = await requireAdminOrGovtOrRedirect();
  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;
  const report = loaded.row;

  if (!statusTransitionAllowed(report.status, input.decision)) {
    return {
      error: `La denuncia está en estado "${report.status}"; no se puede pasar a "${input.decision}".`,
    };
  }

  const isTerminal = input.decision === "invalid" || input.decision === "duplicate";
  const now = new Date();
  const notes = input.notes.trim();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welfareReports)
        .set({
          status: input.decision,
          triagedAt: now,
          triagedByUserId: session.user.id,
          ...(isTerminal ? { closedAt: now, resolutionNotes: notes } : {}),
        })
        .where(eq(welfareReports.id, report.id));

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "welfare_report_triaged",
        payload: {
          welfare_report_id: report.id,
          reference_code: report.referenceCode,
          from_status: report.status,
          to_status: input.decision,
          notes,
        },
      });

      if (input.decision === "triaged") {
        await notifyReporter(
          tx,
          report.reporterUserId,
          report.referenceCode,
          "Tu denuncia fue revisada",
          "Una autoridad revisó tu denuncia y la marcó para seguimiento. Vas a recibir un aviso cuando avance.",
        );
      } else {
        await notifyReporter(
          tx,
          report.reporterUserId,
          report.referenceCode,
          "Tu denuncia fue cerrada",
          input.decision === "duplicate"
            ? "Tu denuncia se marcó como duplicada de otra ya en seguimiento."
            : "Tu denuncia se cerró por falta de elementos para avanzar.",
        );
      }
    });
  } catch (err) {
    return {
      error: `No se pudo actualizar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${report.id}`);
  return { ok: true };
}

// startWelfareReportAction -----------------------------------------------

export async function startWelfareReportAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<TriageResult> {
  const notesCheck = validateNotes(input.notes);
  if ("error" in notesCheck) return notesCheck;

  const session = await requireAdminOrGovtOrRedirect();
  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;
  const report = loaded.row;

  if (!statusTransitionAllowed(report.status, "in_progress")) {
    return { error: `No se puede pasar a "in_progress" desde "${report.status}".` };
  }

  const now = new Date();
  const notes = input.notes.trim();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welfareReports)
        .set({
          status: "in_progress",
          // If we skip the triaged step (open → in_progress directly), record
          // both timestamps so the audit trail still has the triage actor.
          ...(report.triagedAt === null
            ? { triagedAt: now, triagedByUserId: session.user.id }
            : {}),
        })
        .where(eq(welfareReports.id, report.id));

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "welfare_report_started",
        payload: {
          welfare_report_id: report.id,
          reference_code: report.referenceCode,
          from_status: report.status,
          notes,
        },
      });

      await notifyReporter(
        tx,
        report.reporterUserId,
        report.referenceCode,
        "Tu denuncia avanzó",
        "Tu denuncia pasó a seguimiento activo. Vas a recibir un aviso cuando se cierre.",
      );
    });
  } catch (err) {
    return {
      error: `No se pudo iniciar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${report.id}`);
  return { ok: true };
}

// closeWelfareReportAction -----------------------------------------------

export async function closeWelfareReportAction(input: {
  welfareReportId: string;
  resolutionNotes: string;
}): Promise<TriageResult> {
  const notesCheck = validateNotes(input.resolutionNotes);
  if ("error" in notesCheck) return notesCheck;

  const session = await requireAdminOrGovtOrRedirect();
  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;
  const report = loaded.row;

  if (!statusTransitionAllowed(report.status, "closed")) {
    return { error: `La denuncia ya está en estado "${report.status}".` };
  }

  const now = new Date();
  const resolutionNotes = input.resolutionNotes.trim();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welfareReports)
        .set({
          status: "closed",
          closedAt: now,
          resolutionNotes,
          ...(report.triagedAt === null
            ? { triagedAt: now, triagedByUserId: session.user.id }
            : {}),
        })
        .where(eq(welfareReports.id, report.id));

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "welfare_report_closed",
        payload: {
          welfare_report_id: report.id,
          reference_code: report.referenceCode,
          from_status: report.status,
          resolution_notes_excerpt: resolutionNotes.slice(0, 200),
        },
      });

      await notifyReporter(
        tx,
        report.reporterUserId,
        report.referenceCode,
        "Tu denuncia fue cerrada",
        "La autoridad cerró tu denuncia con una resolución. Podés ver el detalle desde el panel.",
      );
    });
  } catch (err) {
    return {
      error: `No se pudo cerrar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${report.id}`);
  return { ok: true };
}

// Helper export — used by the listing to compute counts per scope.
// Intentionally not exported as a server action; this is a server-side
// data accessor consumed by the page directly.
export async function getActiveGovtScopeForUser(
  userId: string,
): Promise<{ province: string; locality: string }[]> {
  const rows = await db
    .select({
      province: govtAssignments.jurisdictionProvince,
      locality: govtAssignments.jurisdictionLocality,
    })
    .from(govtAssignments)
    .innerJoin(profiles, eq(profiles.id, govtAssignments.userId))
    .where(and(eq(govtAssignments.userId, userId), isNull(govtAssignments.revokedAt)));
  return rows;
}
