// Cron route — drain pending event_notification_outbox rows.
//
// Each pending row where next_retry_at <= now() is processed by calling
// deliverOutboxRow(). On success the row moves to 'delivered'. On failure,
// attempts is incremented and next_retry_at is advanced per the exponential
// backoff schedule. After MAX_ATTEMPTS failures the row is marked 'failed'.
//
// GET /api/cron/drain-outbox
// Auth: `x-cron-secret` header must match process.env.CRON_SECRET.
// Schedule: every 5 minutes (vercel.json crons).
//
// Returns: { ok: true, processed, delivered, failed, retried }
//
// Spec: docs/superpowers/plans/2026-05-22-event-trust-tier-1.md §4 C.1/C.4

import { type NextRequest, NextResponse } from "next/server";

import { and, eq, lte } from "drizzle-orm";

import { cronRuns, db, eventNotificationOutbox } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { MAX_ATTEMPTS, computeNextRetryAt, deliverOutboxRow } from "@/lib/infra/outbox-drainer";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
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

  const now = new Date();
  let processed = 0;
  let delivered = 0;
  let failed = 0;
  let retried = 0;
  let cronStatus: "ok" | "failed" = "ok";
  const errors: { id: string; reason: string }[] = [];

  try {
    // -------------------------------------------------------------------------
    // Fetch pending rows that are due
    //
    // FOR UPDATE SKIP LOCKED (P1-5 cron-overlap fix): two overlapping drain
    // runs never grab the same outbox rows — the second run skips rows already
    // locked by the first. Wrapped in a short transaction so the lock is held
    // through the select; it releases on commit before per-row delivery runs.
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // Process each row
    // -------------------------------------------------------------------------
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

  return NextResponse.json({ ok: true, processed, delivered, failed, retried });
}
