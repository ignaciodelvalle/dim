// Cron route — drain pending event_notification_outbox rows.
//
// Each pending row where next_retry_at <= now() is processed by calling
// deliverOutboxRow(). On success the row moves to 'delivered'. On failure,
// attempts is incremented and next_retry_at is advanced per the exponential
// backoff schedule. After MAX_ATTEMPTS failures the row is marked 'failed'.
//
// GET /api/cron/drain-outbox
// Auth: authorizeCronRequest() — Bearer <CRON_SECRET> or legacy x-cron-secret.
// Schedule: runs DAILY, invoked in order by the single dispatcher
// (/api/cron/daily, vercel.json "0 4 * * *") — see lib/infra/cron-dispatcher.ts.
//
// Returns: { ok: true, processed, delivered, failed, retried }
//
// Spec: docs/superpowers/plans/2026-05-22-event-trust-tier-1.md §4 C.1/C.4

import { type NextRequest, NextResponse } from "next/server";

import { and, eq, lte } from "drizzle-orm";

import { cronRuns, db, eventNotificationOutbox } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { effectiveDeadlineMs } from "@/lib/infra/cron-dispatcher";
import { MAX_ATTEMPTS, computeNextRetryAt, deliverOutboxRow } from "@/lib/infra/outbox-drainer";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
// Drain loop bounds (review 23 item 7): the route runs once daily (via the
// dispatcher) AND drains repeatedly within that run until the queue is empty
// or the budget is exhausted, so a backlog doesn't linger a batch-per-run.
const MAX_DURATION_MS = 45_000;
// Canonical name: snake_case of the route directory (cron-registry SSOT rule,
// projection-cron audit 2026-07-03 B2) — was mismatched with the registry, so
// cron-health reported this cron never_ran while telemetry accrued elsewhere.
const CRON_NAME = "drain_outbox";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  // ---------------------------------------------------------------------------
  // Start cron_runs telemetry row
  // ---------------------------------------------------------------------------
  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  const start = Date.now();
  // RN #9 (2026-08-22): min(our own ceiling, the share the dispatcher handed
  // down). The constant alone is blind to how much of the fleet's 55 s is
  // already spent; the header is not. Standalone it is the constant, unchanged.
  const budgetMs = effectiveDeadlineMs(MAX_DURATION_MS, req.headers);
  let processed = 0;
  let delivered = 0;
  let failed = 0;
  let retried = 0;
  let cronStatus: "ok" | "failed" = "ok";
  const errors: { id: string; reason: string }[] = [];

  try {
    // Drain loop: keep pulling due batches until the queue is empty or the
    // budget is exhausted. Retried rows get a future nextRetryAt so they are
    // not re-fetched within the run — no spin.
    drain: for (;;) {
      if (Date.now() - start >= budgetMs) break;
      const now = new Date();

      // -----------------------------------------------------------------------
      // Fetch pending rows that are due
      //
      // FOR UPDATE SKIP LOCKED (P1-5 cron-overlap fix): two overlapping drain
      // runs never grab the same outbox rows — the second run skips rows already
      // locked by the first. Wrapped in a short transaction so the lock is held
      // through the select; it releases on commit before per-row delivery runs.
      // -----------------------------------------------------------------------
      const pending = await db.transaction(async (tx) =>
        tx
          .select()
          .from(eventNotificationOutbox)
          .where(
            and(
              eq(eventNotificationOutbox.status, "pending"),
              lte(eventNotificationOutbox.nextRetryAt, now),
            ),
          )
          .orderBy(eventNotificationOutbox.nextRetryAt)
          .limit(BATCH_SIZE)
          .for("update", { skipLocked: true }),
      );

      if (pending.length === 0) break;

      // -----------------------------------------------------------------------
      // Process each row
      // -----------------------------------------------------------------------
      for (const row of pending) {
        processed += 1;

        const result = await deliverOutboxRow(row);

        if (result.ok) {
          await db
            .update(eventNotificationOutbox)
            .set({
              status: "delivered",
              deliveredAt: new Date(),
              lastAttemptAt: new Date(),
              attempts: row.attempts + 1,
            })
            .where(eq(eventNotificationOutbox.id, row.id));
          delivered += 1;
        } else {
          const newAttempts = row.attempts + 1;
          const isExhausted = newAttempts >= MAX_ATTEMPTS;
          const nextRetryAt = computeNextRetryAt(newAttempts, new Date());

          await db
            .update(eventNotificationOutbox)
            .set({
              status: isExhausted ? "failed" : "pending",
              attempts: newAttempts,
              lastAttemptAt: new Date(),
              lastError: result.error,
              nextRetryAt: isExhausted ? nextRetryAt : nextRetryAt,
            })
            .where(eq(eventNotificationOutbox.id, row.id));

          if (isExhausted) {
            failed += 1;
            errors.push({ id: row.id, reason: `max_attempts: ${result.error}` });
          } else {
            retried += 1;
            errors.push({ id: row.id, reason: result.error });
          }
        }

        if (Date.now() - start >= budgetMs) break drain;
      }

      if (pending.length < BATCH_SIZE) break; // queue drained this pass
    }
  } catch (err) {
    cronStatus = "failed";
    errors.push({ id: "global", reason: err instanceof Error ? err.message : "unknown" });
  }

  // ---------------------------------------------------------------------------
  // Finalize cron_runs row
  // ---------------------------------------------------------------------------
  await db
    .update(cronRuns)
    .set({
      status: cronStatus,
      finishedAt: new Date(),
      itemsProcessed: processed,
      details: errors.length > 0 ? { errors } : {},
    })
    .where(eq(cronRuns.id, run.id));

  // Report the RUN's health, not a hardcoded success: a global failure (the
  // transaction/select threw) must surface as ok:false + HTTP 500 so Vercel's
  // cron dashboard flags it. Per-row `failed` (exhausted retries) is a terminal
  // row state, not a cron failure, so it does not flip cronStatus.
  return NextResponse.json(
    { ok: cronStatus === "ok", processed, delivered, failed, retried },
    { status: cronStatus === "ok" ? 200 : 500 },
  );
}
