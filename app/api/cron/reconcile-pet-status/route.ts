// Cron route — detect drift between pets.status (denormalized cache) and the
// canonical value derived from the pet_events log.
//
// GET /api/cron/reconcile-pet-status
//
// Authentication: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron contract)
// or legacy `x-cron-secret: <CRON_SECRET>` — see lib/cron-auth.ts.
//
// Background (finding R2 in the pre-mortem):
//   pets.status is a denormalized cache with multiple writers (status_changed,
//   death_recorded, transfer handlers, etc.). Writers dual-write the event AND
//   the cache column inside the same transaction, but there is no continuous
//   verification that the cache stays consistent with the event log. A missed
//   dual-write, a failed migration, or an upcaster gap can cause silent drift.
//
// This cron DETECTS drift; it does NOT auto-repair.
//
// WHY not auto-repair:
//   A status divergence might indicate a missing upcaster or incomplete event
//   rather than a stale cache. Auto-repairing would overwrite the stored value
//   with a potentially wrong derived value. Repair is a gated, human-reviewed
//   follow-up once the root cause of each divergence is understood.
//   For the repair path, see scripts/rebuild-projections.ts --apply.
//
// Strategy:
//   - Uses rederivePetCache (lib/rederive-pet-cache.ts), the canonical deriver
//     shared by CI (pet-cache-rederivation.test.ts) and the ops script
//     (scripts/detect-pet-cache-drift.ts). No duplicated derivation logic.
//   - Only the `status` and `deceasedAt` columns are checked here; the full
//     multi-column rederivation is available via the ops script / fitness test.
//   - Keyset pagination over pets.id — same approach as the ops script.
//   - Time-guarded: stops after MAX_DURATION_MS to stay within Vercel's
//     cron timeout budget (30 s on the Hobby plan default).
//   - The keyset cursor IS persisted across invocations (fixed 2026-07-04 —
//     without this, drift detection capped at the first MAX_PETS_PER_RUN
//     pets FOREVER on any registry larger than that). No new table/migration
//     needed: we piggy-back on the existing cron_runs telemetry row for this
//     cron name (see migration 0024_cron_runs.sql) — the finished run's
//     `details.nextCursor` is read at the start of the next run and written
//     again at the end. When a run reaches the true end of the table (no
//     more rows past the cursor) `nextCursor` resets to null so the next
//     run wraps around and starts a fresh full sweep.
//   - Drift alerting: `divergent > 0` fires a "warning"-severity sendCronAlert
//     (lib/infra/cron-alert.ts) with the sample + count, in addition to the
//     cronRuns row and cron-health's own "drift" verdict (status-family gate
//     in app/api/cron/cron-health/route.ts) — see the in-body comment for why
//     this doesn't flip the run to "failed".
//
// Returns: { ok, scanned, divergent, sample, durationMs }
// cronRuns.details includes divergence summary + sample for /admin/sistema.

import { type NextRequest, NextResponse } from "next/server";

import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";

import { cronRuns, db, pets } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { sendCronAlert } from "@/lib/infra/cron-alert";
import { type RederivePetCacheReport, rederivePetCache } from "@/lib/infra/rederive-pet-cache";

// The status projection's column family — the ONLY columns this cron's
// divergence verdict may consider (see header contract).
const STATUS_FAMILY = ["status", "deceasedAt"] as const;

/** Drifted column names, restricted to the status family. */
function statusFamilyDrift(report: RederivePetCacheReport): string[] {
  return STATUS_FAMILY.filter((c) => {
    const r = report[c];
    return r !== undefined && !r.matches;
  });
}

export const dynamic = "force-dynamic";

const CRON_NAME = "reconcile_pet_status";

// Maximum number of pets to process per run. Keeps the wall-clock cost
// predictable regardless of registry size; the next nightly run picks up
// where this one left off via the persisted keyset cursor (see header
// comment) and the sweep wraps around once it reaches the end of the table.
const MAX_PETS_PER_RUN = 2000;

// Absolute wall-clock budget per invocation (ms). Stops the batch loop before
// Vercel's function timeout so we can still write the cronRuns row.
// Vercel Hobby cron functions time out at 60 s; we use 45 s to leave margin.
const MAX_DURATION_MS = 45_000;

// Maximum divergence samples to store in cronRuns.details (keeps the JSONB
// payload small while still giving operators something actionable to inspect).
const MAX_SAMPLE = 20;

type PetRef = { id: string; publicToken: string };

type DivergenceSample = {
  petId: string;
  publicToken: string;
  /** Status stored in pets.status at scan time. */
  cached: string | null;
  /** Status derived from the event log at scan time. */
  derived: string | null;
  /** All drifted column names for this pet (may include deceasedAt etc.). */
  driftedColumns: string[];
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();

  // ---------------------------------------------------------------------------
  // Start cronRuns telemetry row
  // ---------------------------------------------------------------------------
  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let scanned = 0;
  let divergent = 0;
  const sample: DivergenceSample[] = [];
  let cronStatus: "ok" | "failed" = "ok";
  const errors: { petId: string; reason: string }[] = [];
  let earlyStop = false;
  let nextCursor: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // Resume from the last persisted cursor (see header comment). We look at
    // the most recently FINISHED run for this cron name and read its
    // `details.nextCursor` — null means "start a fresh sweep from the top".
    // -------------------------------------------------------------------------
    const [lastRun] = await db
      .select({ details: cronRuns.details })
      .from(cronRuns)
      .where(and(eq(cronRuns.cronName, CRON_NAME), isNotNull(cronRuns.finishedAt)))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);

    const resumeCursor =
      lastRun?.details && typeof lastRun.details === "object"
        ? (((lastRun.details as Record<string, unknown>).nextCursor as string | null | undefined) ??
          null)
        : null;

    // -------------------------------------------------------------------------
    // Keyset-paginated scan over pets
    // -------------------------------------------------------------------------
    let cursor: string | null = resumeCursor;
    const BATCH_SIZE = 100;

    outer: for (;;) {
      if (scanned >= MAX_PETS_PER_RUN) {
        earlyStop = true;
        break;
      }
      if (Date.now() - start >= MAX_DURATION_MS) {
        earlyStop = true;
        break;
      }

      const base = db
        .select({ id: pets.id, publicToken: pets.publicToken, status: pets.status })
        .from(pets)
        .$dynamic();
      const query = cursor ? base.where(gt(pets.id, cursor)) : base;
      const batch = (await query.orderBy(asc(pets.id)).limit(BATCH_SIZE)) as (PetRef & {
        status: string | null;
      })[];

      if (batch.length === 0) break;

      for (const pet of batch) {
        scanned += 1;

        try {
          const report = await rederivePetCache(pet.id);
          // CONTRACT (header): only status + deceasedAt count as divergence
          // here — this cron backs the "Deriva de caché · pets.status" card
          // and the health verdict. rederivePetCache reports EVERY cached
          // column, and counting the rest (e.g. legacy microchip columns vs
          // the canonical identifier rows) made the card claim status drift
          // that wasn't there (staging 2026-07-18: 463 "divergent" pets whose
          // status matched perfectly). Full multi-column drift belongs to the
          // ops script / fitness test, which own that wider report.
          const statusFamily = statusFamilyDrift(report);
          if (statusFamily.length > 0) {
            divergent += 1;

            if (sample.length < MAX_SAMPLE) {
              const statusReport = report.status;
              sample.push({
                petId: pet.id,
                publicToken: pet.publicToken,
                cached: statusReport ? String(statusReport.stored ?? "") : pet.status,
                derived: statusReport ? String(statusReport.derived ?? "") : null,
                driftedColumns: statusFamily,
              });
            }
          }
        } catch (err) {
          errors.push({
            petId: pet.id,
            reason: err instanceof Error ? err.message : String(err),
          });
        }

        // Advance the cursor to this pet even if the budget check below stops
        // the run mid-batch — the next run must resume AFTER this pet, not
        // re-scan it or fall back to the previous batch's cursor.
        cursor = pet.id;

        if (scanned >= MAX_PETS_PER_RUN || Date.now() - start >= MAX_DURATION_MS) {
          earlyStop = true;
          break outer;
        }
      }

      if (batch.length < BATCH_SIZE) break;
    }

    // Persist the resume point: if we stopped early (budget exhausted) the
    // next run must continue from `cursor`; if we reached the true end of
    // the table (no earlyStop), wrap around — next run starts a fresh sweep.
    nextCursor = earlyStop ? cursor : null;

    if (divergent > 0) {
      // Prominent log line — surfaces in Vercel function logs and any log
      // aggregator that tails the function output.
      console.warn(
        `[cron/reconcile-pet-status] DRIFT DETECTED — scanned=${scanned} divergent=${divergent} sample_ids=${sample.map((s) => s.publicToken).join(",")}`,
      );

      // Page a human directly instead of relying on cron-health's "drift"
      // verdict (app/api/cron/cron-health/route.ts, status-family gate) to
      // surface it on its own daily schedule (up to ~24h later — see
      // lib/infra/cron-registry.ts). Severity is "warning", not "critical":
      // THIS run succeeded — it detected the drift it was built to detect.
      // Drift is detect-not-repair (see header), so it's a degraded-state
      // signal, not a run failure; cronStatus below stays "ok" and the route
      // still returns 200 on drift alone.
      //
      // Dedup: sendCronAlert has no built-in dedup (lib/infra/cron-alert.ts
      // is a stateless best-effort webhook POST). This cron runs nightly, so
      // a persisting drift re-alerts once per run until repaired — acceptable
      // cadence, not spam. cron-health's own "drift" verdict remains the
      // backstop if this alert is ever missed (webhook down, env unset, etc.).
      await sendCronAlert({
        job: CRON_NAME,
        severity: "warning",
        error: `${divergent} pet(s) with status-family drift (cache vs. event log)`,
        details: { scanned, divergent, sample },
      });
    } else {
      console.info(
        `[cron/reconcile-pet-status] clean — scanned=${scanned} divergent=0 earlyStop=${earlyStop}`,
      );
    }
  } catch (err) {
    cronStatus = "failed";
    errors.push({ petId: "global", reason: err instanceof Error ? err.message : String(err) });
    console.error("[cron/reconcile-pet-status] fatal error:", err);
  }

  // Per-pet rederivation failures (not just the fatal outer catch) mean the run
  // was not fully healthy: flip it to failed so the route returns HTTP 500,
  // Vercel retries, and a human is paged — a cron must not report success on
  // failure (review 23 fleet extension). Drift detection itself is idempotent,
  // so a retry is safe.
  if (cronStatus === "ok" && errors.length > 0) {
    cronStatus = "failed";
  }

  const durationMs = Date.now() - start;

  // ---------------------------------------------------------------------------
  // Finalize cronRuns row
  // ---------------------------------------------------------------------------
  await db
    .update(cronRuns)
    .set({
      status: cronStatus,
      finishedAt: new Date(),
      itemsProcessed: scanned,
      details: {
        scanned,
        divergent,
        earlyStop,
        nextCursor,
        ...(sample.length > 0 && { sample }),
        ...(errors.length > 0 && { errors }),
      },
    })
    .where(eq(cronRuns.id, run.id));

  if (cronStatus === "failed") {
    await sendCronAlert({
      job: CRON_NAME,
      severity: "critical",
      error: `${errors.length} error(s) during reconcile — see cron_runs.details`,
      details: { scanned, divergent, errors: errors.slice(0, 20) },
    });
  }

  return NextResponse.json(
    {
      ok: cronStatus === "ok",
      scanned,
      divergent,
      sample,
      durationMs,
    },
    { status: cronStatus === "ok" ? 200 : 500 },
  );
}
