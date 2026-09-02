// Cron route — drain the notification_dead_letter table.
//
// The createNotification() service (lib/infra/notification-service.ts) writes a
// payload to `notification_dead_letter` whenever a notifications insert throws
// (pool exhaustion, deploy-time connection drop, brief outage) — turning
// "silently gone" into "delayed but recoverable" (migration 0124, consistency
// review 2026-07-04 C.1). That migration promised a follow-on retry cron to
// drain unresolved rows; it was never built until now. THIS is that drainer.
//
// GET /api/cron/drain-notification-dead-letter
// Auth: Vercel Cron `Authorization: Bearer <CRON_SECRET>` (or legacy
//   `x-cron-secret`), via authorizeCronRequest.
// Schedule: daily, dispatched via /api/cron/daily (lib/infra/cron-registry.ts's
//   `runsVia: "daily"` for drain_notification_dead_letter) — the real window is
//   24h, not the hourly this header used to claim.
//
// Behaviour (idempotent, bounded):
//   - Scan at most BATCH_SIZE unresolved rows (resolved_at IS NULL), oldest first.
//   - Replay each row's payload through createNotification(), which re-applies the
//     ON CONFLICT (dedupe_key) DO NOTHING idempotency guard. A payload whose
//     original insert failed transiently now lands (status "inserted") or is
//     already present (status "duplicate") — either way it is delivered, so we
//     stamp resolved_at.
//   - A payload that STILL fails re-dead-letters through the service (a fresh
//     row is written capturing the continued failure). We stamp resolved_at on
//     the ORIGINAL too so the successor row supersedes it — this keeps the
//     unresolved working set bounded at O(1) rows per persistently-failing key
//     instead of doubling every run. `stillFailing` in the response surfaces the
//     count so a genuinely undeliverable payload (e.g. a deleted recipient) is
//     visible in telemetry.
//
// Returns: { ok, scanned, resolved, stillFailing, invalid, runId } and HTTP 500
//   when the run failed (so Vercel's cron dashboard flags it — a cron must not
//   report success on failure).

import { type NextRequest, NextResponse } from "next/server";

import { eq, isNull } from "drizzle-orm";

import { cronRuns, db, notificationDeadLetter } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { sendCronAlert } from "@/lib/infra/cron-alert";
import { type CreateNotificationInput, createNotification } from "@/lib/infra/notification-service";

export const dynamic = "force-dynamic";

// Bounded batch per invocation — keeps worst-case work predictable and well
// inside the function's maxDuration:60 budget (vercel.json).
const BATCH_SIZE = 200;
// Canonical name: snake_case of the route directory (cron-registry SSOT rule).
const CRON_NAME = "drain_notification_dead_letter";

// Reconstruct a CreateNotificationInput from a stored dead-letter payload. The
// payload was persisted verbatim from the service's insert `values`, so its
// shape is known — but it is jsonb (untyped at rest), so we validate the fields
// the service requires before replaying. Returns null for an unreplayable row.
function toInput(payload: unknown): CreateNotificationInput | null {
  if (payload === null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const userId = p.userId;
  const notificationType = p.notificationType;
  const title = p.title;
  const dedupeKey = p.dedupeKey;
  if (
    typeof userId !== "string" ||
    typeof notificationType !== "string" ||
    typeof title !== "string" ||
    typeof dedupeKey !== "string"
  ) {
    return null;
  }
  return {
    userId,
    notificationType,
    title,
    dedupeKey,
    body: typeof p.body === "string" ? p.body : null,
    severity:
      p.severity === "warning" || p.severity === "urgent" || p.severity === "info"
        ? p.severity
        : undefined,
    category: typeof p.category === "string" ? p.category : null,
    ctaLabel: typeof p.ctaLabel === "string" ? p.ctaLabel : null,
    ctaUrl: typeof p.ctaUrl === "string" ? p.ctaUrl : null,
    relatedPetId: typeof p.relatedPetId === "string" ? p.relatedPetId : null,
    relatedEventId: typeof p.relatedEventId === "string" ? p.relatedEventId : null,
    relatedReminderId: typeof p.relatedReminderId === "string" ? p.relatedReminderId : null,
    relatedCaseId: typeof p.relatedCaseId === "string" ? p.relatedCaseId : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let scanned = 0;
  let resolved = 0;
  let stillFailing = 0;
  let invalid = 0;
  let cronStatus: "ok" | "failed" = "ok";
  const errors: { id: string; reason: string }[] = [];

  try {
    const rows = await db
      .select({
        id: notificationDeadLetter.id,
        payload: notificationDeadLetter.payload,
      })
      .from(notificationDeadLetter)
      .where(isNull(notificationDeadLetter.resolvedAt))
      .orderBy(notificationDeadLetter.createdAt)
      .limit(BATCH_SIZE);

    for (const row of rows) {
      scanned += 1;
      const now = new Date();

      const input = toInput(row.payload);
      if (!input) {
        // Unreplayable payload (malformed / missing required fields). Resolve it
        // so it stops blocking the scan; surface it as an error for triage.
        invalid += 1;
        errors.push({ id: row.id, reason: "unreplayable_payload" });
        await db
          .update(notificationDeadLetter)
          .set({ retriedAt: now, resolvedAt: now })
          .where(eq(notificationDeadLetter.id, row.id));
        continue;
      }

      // createNotification never throws — it re-dead-letters on failure — so a
      // single bad row cannot poison the batch.
      const result = await createNotification(input);

      if (result.status === "inserted" || result.status === "duplicate") {
        resolved += 1;
        await db
          .update(notificationDeadLetter)
          .set({ retriedAt: now, resolvedAt: now })
          .where(eq(notificationDeadLetter.id, row.id));
      } else {
        // Re-dead-lettered: a fresh row now tracks the continued failure. Resolve
        // the original so the working set stays bounded (see header comment).
        stillFailing += 1;
        errors.push({ id: row.id, reason: "redelivery_failed" });
        await db
          .update(notificationDeadLetter)
          .set({ retriedAt: now, resolvedAt: now })
          .where(eq(notificationDeadLetter.id, row.id));
      }
    }
  } catch (err) {
    cronStatus = "failed";
    errors.push({ id: "global", reason: err instanceof Error ? err.message : "unknown" });
  }

  if (stillFailing > 0) {
    console.error(
      `[cron/drain-notification-dead-letter] ${stillFailing} payload(s) still failing redelivery`,
    );
  }

  // A run that left payloads still failing redelivery OR could not replay
  // (invalid) is NOT healthy: any accumulated error flips the run to failed so
  // it returns HTTP 500 (Vercel retries) and pages a human — a cron must not
  // report success on failure (review 23 fleet extension).
  if (cronStatus === "ok" && errors.length > 0) {
    cronStatus = "failed";
  }

  await db
    .update(cronRuns)
    .set({
      status: cronStatus,
      finishedAt: new Date(),
      itemsProcessed: resolved,
      details:
        errors.length > 0
          ? { scanned, resolved, stillFailing, invalid, errors }
          : {
              scanned,
              resolved,
              stillFailing,
              invalid,
            },
    })
    .where(eq(cronRuns.id, run.id));

  if (cronStatus === "failed") {
    await sendCronAlert({
      job: CRON_NAME,
      severity: "critical",
      error: `${stillFailing} still failing, ${invalid} invalid — see cron_runs.details`,
      details: { scanned, resolved, stillFailing, invalid, errors: errors.slice(0, 20) },
    });
  }

  return NextResponse.json(
    { ok: cronStatus === "ok", scanned, resolved, stillFailing, invalid, runId: run.id },
    { status: cronStatus === "ok" ? 200 : 500 },
  );
}
