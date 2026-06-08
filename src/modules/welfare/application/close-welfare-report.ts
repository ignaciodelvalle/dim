// Use-case: close a welfare report (→ closed).
//
// Migrated from app/actions/welfare-triage.ts::closeWelfareReportAction.
// Auth (requireAdminOrGovtOrRedirect + jurisdiction scope) handled by caller.
//
// Orchestrates:
//   1. Validate resolutionNotes (≥10 chars).
//   2. Load report.
//   3. Validate transition (→ closed).
//   4. ATOMIC tx:
//      a. updateStatus (status=closed, closedAt, resolutionNotes, + backfill triage actor if null)
//      b. insertAudit (welfare_report_closed)
//      c. closeCase(resolved) if caseId non-null
//   5. Collect reporter notification (non-anon).
//   6. Return UseCaseResult<void>.

import { statusTransitionAllowed } from "../domain/welfare-status-rules";
import type { WelfareRepository } from "../infrastructure/welfare-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
  profile: { role: "admin" | "govt" };
};

type Deps = {
  repo: Pick<WelfareRepository, "findById" | "updateStatus" | "insertAudit">;
  closeCase: (
    input: { caseId: string; reason: "cancelled" | "resolved"; closedByUserId: string },
    tx: unknown,
  ) => Promise<void>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  actor: Actor;
};

export type CloseWelfareReportInput = {
  welfareReportId: string;
  resolutionNotes: string;
};

const MIN_NOTES_LEN = 10;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function closeWelfareReport(
  input: CloseWelfareReportInput,
  deps: Deps,
): Promise<UseCaseResult<void>> {
  const { repo, closeCase, transaction, actor } = deps;
  const resolutionNotes = input.resolutionNotes.trim();

  // 1. Validate notes.
  if (resolutionNotes.length < MIN_NOTES_LEN) {
    return { ok: false, error: `Las notas deben tener al menos ${MIN_NOTES_LEN} caracteres.` };
  }

  // 2. Load report.
  const report = await repo.findById(input.welfareReportId);
  if (!report) return { ok: false, error: "Denuncia no encontrada." };

  // 3. Validate transition.
  if (!statusTransitionAllowed(report.status, "closed")) {
    return {
      ok: false,
      error: `La denuncia ya está en estado "${report.status}".`,
    };
  }

  const now = new Date();
  const pendingNotifications: NewNotification[] = [];

  // 4. Atomic transaction.
  try {
    await transaction(async (tx) => {
      await repo.updateStatus(
        report.id,
        {
          status: "closed",
          closedAt: now,
          resolutionNotes,
          // Backfill triage actor if close was reached without a triage step.
          ...(report.triagedAt === null ? { triagedAt: now, triagedByUserId: actor.user.id } : {}),
        },
        tx as Parameters<typeof repo.updateStatus>[2],
      );

      await repo.insertAudit(
        {
          actorUserId: actor.user.id,
          action: "welfare_report_closed",
          payload: {
            welfare_report_id: report.id,
            reference_code: report.referenceCode,
            from_status: report.status,
            resolution_notes_excerpt: resolutionNotes.slice(0, 200),
          },
        },
        tx as Parameters<typeof repo.insertAudit>[1],
      );

      if (report.caseId) {
        await closeCase(
          { caseId: report.caseId, reason: "resolved", closedByUserId: actor.user.id },
          tx,
        );
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo cerrar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // 5. Reporter notification (non-anon only).
  if (report.reporterUserId) {
    pendingNotifications.push({
      userId: report.reporterUserId,
      notificationType: "welfare_report_status_changed",
      title: "Tu denuncia fue cerrada",
      body: "La autoridad cerró tu denuncia con una resolución. Podés ver el detalle desde el panel.",
      severity: "info",
      ctaLabel: "Ver mi denuncia",
      ctaUrl: `/denuncias/codigo/${report.referenceCode}`,
    });
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
