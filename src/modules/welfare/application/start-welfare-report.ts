// Use-case: start a welfare report (open|triaged → in_progress).
//
// Migrated from app/actions/welfare-triage.ts::startWelfareReportAction.
// Auth (requireAdminOrGovtOrRedirect + jurisdiction scope) handled by caller.
//
// Orchestrates:
//   1. Validate notes (≥10 chars).
//   2. Load report.
//   3. Validate transition to in_progress.
//   4. ATOMIC tx:
//      a. updateStatus (+ backfill triagedAt/By if null — triage-skip parity)
//      b. insertAudit (welfare_report_started)
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
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  actor: Actor;
};

export type StartWelfareReportInput = {
  welfareReportId: string;
  notes: string;
};

const MIN_NOTES_LEN = 10;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function startWelfareReport(
  input: StartWelfareReportInput,
  deps: Deps,
): Promise<UseCaseResult<void>> {
  const { repo, transaction, actor } = deps;
  const notes = input.notes.trim();

  // 1. Validate notes.
  if (notes.length < MIN_NOTES_LEN) {
    return { ok: false, error: `Las notas deben tener al menos ${MIN_NOTES_LEN} caracteres.` };
  }

  // 2. Load report.
  const report = await repo.findById(input.welfareReportId);
  if (!report) return { ok: false, error: "Denuncia no encontrada." };

  // 3. Validate transition.
  if (!statusTransitionAllowed(report.status, "in_progress")) {
    return {
      ok: false,
      error: `No se puede pasar a "in_progress" desde "${report.status}".`,
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
          status: "in_progress",
          // Backfill triage actor if caller skipped the triaged step (open → in_progress).
          ...(report.triagedAt === null ? { triagedAt: now, triagedByUserId: actor.user.id } : {}),
        },
        tx as Parameters<typeof repo.updateStatus>[2],
      );

      await repo.insertAudit(
        {
          actorUserId: actor.user.id,
          action: "welfare_report_started",
          payload: {
            welfare_report_id: report.id,
            reference_code: report.referenceCode,
            from_status: report.status,
            notes,
          },
        },
        tx as Parameters<typeof repo.insertAudit>[1],
      );
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo iniciar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // 5. Reporter notification (non-anon only).
  if (report.reporterUserId) {
    pendingNotifications.push({
      userId: report.reporterUserId,
      notificationType: "welfare_report_status_changed",
      title: "Tu denuncia avanzó",
      body: "Tu denuncia pasó a seguimiento activo. Vas a recibir un aviso cuando se cierre.",
      severity: "info",
      ctaLabel: "Ver mi denuncia",
      ctaUrl: `/denuncias/codigo/${report.referenceCode}`,
    });
  }

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
