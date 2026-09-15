// Cron route — ask Expo what actually happened to the pushes it accepted.
//
// GET /api/cron/reconcile-push-receipts
//
// Authentication: header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
// contract) or legacy `x-cron-secret: <CRON_SECRET>` — see lib/domain/cron-auth.
//
// WHY A NIGHTLY JOB AND NOT PART OF THE SEND
// ---------------------------------------------------------------------------
// Expo answers a send twice. The TICKET is synchronous and says only whether
// Expo accepted the message; the RECEIPT, fetched afterwards by the id that
// ticket carried, says what FCM and APNs did with it — and that is where
// `DeviceNotRegistered` arrives in the ordinary case, because Expo has not
// spoken to either store when it writes the ticket.
//
// The send path cannot wait for it: it runs inside `createNotification`, on a
// request somebody is waiting on, and the receipt is not ready for minutes.
// Without a second pass the one signal that says a delivery address is dead was
// mostly never read, so `push_targets` accumulated rows for uninstalled apps
// forever and every notification for that person paid to address a phone that no
// longer exists.
//
// WHY IT LIVES IN THE DAILY FAN-IN. Nothing a person sees depends on when a dead
// token is noticed — only the cost of addressing it does — so this is the
// definition of work that belongs on the existing nightly schedule. It is also
// the only option: Vercel's plan allows two scheduled cron entries in total and
// both are spent (the dispatcher and refresh-cube), which is why every job in
// this directory is a child of /api/cron/daily rather than a schedule of its own.
//
// WHERE IT SITS IN THE ORDER. With the delivery drains, before the retention
// purges — it is the second half of a SEND, and what it produces (a revoked dead
// target) is what `data_lifecycle`'s purge collects thirty days later. Running
// it after the purge would still work; running it with its own kind is what a
// reader expects.
//
// NO CEILING DECLARED, and therefore none claimed. `CRON_JOB_CEILINGS` is a
// census of jobs that bound their own wall clock, and the parity fence
// (__tests__/cron-budget-ceiling.test.ts) refuses a claim the code does not
// back. This job does not loop over a keyset: it reads at most
// RECEIPT_BATCH_SIZE rows once, batches them into a handful of HTTP requests,
// and returns. A backlog beyond one batch is drained by the next night, which is
// the same posture every purge in `data-lifecycle.ts` takes.
//
// Returns: { ok, checked, revoked, expired, durationMs, runId }

import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { sendCronAlert } from "@/lib/infra/cron-alert";
import { reconcileExpoPushReceipts } from "@/lib/infra/expo-push";

export const dynamic = "force-dynamic";

const CRON_NAME = "reconcile_push_receipts";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let status: "ok" | "failed" = "ok";
  let outcome = { checked: 0, revoked: 0, expired: 0 };
  const errors: { section: string; reason: string }[] = [];

  try {
    // `reconcileExpoPushReceipts` swallows its own per-chunk failures and
    // no-ops when this deployment has no `EXPO_ACCESS_TOKEN` — which is most of
    // them. So this catch is for something structural (the database is gone),
    // not for a bad night at Expo, and a run that reports zeros is the ordinary
    // result on any environment without the credential.
    outcome = await reconcileExpoPushReceipts();
  } catch (err) {
    status = "failed";
    errors.push({
      section: "reconcileExpoPushReceipts",
      reason: err instanceof Error ? err.message : String(err),
    });
    console.error("[cron/reconcile-push-receipts] Error:", err);
  }

  const durationMs = Date.now() - start;

  await db
    .update(cronRuns)
    .set({
      status,
      finishedAt: new Date(),
      // The receipts actually answered for. Revocations are the outcome worth
      // reading, but the count of rows LOOKED AT is what says whether this job
      // is doing anything at all — a fleet with push enabled and a permanent
      // zero here means tickets are not recording their ids.
      itemsProcessed: outcome.checked,
      details: errors.length > 0 ? { ...outcome, errors } : outcome,
    })
    .where(eq(cronRuns.id, run.id));

  // A failed run returns 500 so Vercel's cron dashboard flags it, the same rule
  // every sibling in this directory follows: a 200 with `ok: false` reads as a
  // successful run to Vercel.
  if (status === "failed") {
    await sendCronAlert({
      job: CRON_NAME,
      // Not `critical`. Nothing a person can see degrades when this job misses a
      // night: the dead rows are still dead, the live ones still receive, and
      // the next run reads the same pending ids — as long as it happens inside
      // Expo's ~24h retention, which a nightly schedule leaves no room to miss
      // twice. That is a real deadline and the reason this is not `info`.
      severity: "warning",
      error: errors[0]?.reason ?? "push receipt reconciliation failed",
      details: { ...outcome, errors },
    });
  }

  return NextResponse.json(
    {
      ok: status === "ok",
      checked: outcome.checked,
      revoked: outcome.revoked,
      expired: outcome.expired,
      durationMs,
      runId: run.id,
    },
    { status: status === "ok" ? 200 : 500 },
  );
}
