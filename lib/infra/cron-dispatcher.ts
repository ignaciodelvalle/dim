// Cron dispatcher — the ordered fan-out that lets a SINGLE Vercel cron run the
// whole fleet in one invocation.
//
// WHY this exists (Vercel Hobby cron limits, 2026-07-07): vercel.json used to
// declare 22 separate cron jobs. Vercel Hobby allows only 2 cron jobs AND only
// daily schedules, so the deploy failed with "Hobby accounts are limited to
// daily cron jobs." We consolidate the fleet behind one daily dispatcher
// (/api/cron/daily) that invokes every job's existing route handler in order.
//
// This module holds the two pieces that must stay framework-free and unit
// testable:
//   1. DAILY_JOB_ORDER — the SSOT ordered list of job names the dispatcher runs.
//      Kept in lock-step with CRON_REGISTRY + the route directories by
//      __tests__/cron-registry-parity.test.ts.
//   2. dispatchJobs() — runs each job in sequence, isolates failures (one bad
//      job never aborts the rest), and enforces a wall-clock budget so the
//      dispatcher stays inside the function's maxDuration.
//
// The concrete name→handler wiring lives in app/api/cron/daily/route.ts (it
// needs to import the route GETs, which pull in the DB layer); this module
// stays import-light so tests can use it without mocking the whole app.

/**
 * What the dispatcher knows about the run when it starts a job, handed to the
 * job so it can size its own work (RN-3 F17 / RN re-run HIGH, 2026-08-22).
 *
 * Before this, a job drained under ITS OWN constant deadline — data_lifecycle's
 * was 45 s inside a 55 s dispatcher — with no idea how much of the run was
 * already spent. On a backlogged night that ran the purge past the dispatcher's
 * budget and into the function's 60 s hard kill, taking the cron_daily row's
 * finalisation with it.
 */
export interface DispatchContext {
  /**
   * Budget still unspent when the job starts, from the SAME clock reading the
   * dispatcher used to decide the job may run. `Infinity` when no budget was
   * set (tests; manual fan-outs).
   */
  budgetLeftMs: number;
  /** Jobs still to run, INCLUDING this one. Never below 1. */
  jobsLeft: number;
}

/** A single job the dispatcher runs. `run` returns anything with an HTTP-ish
 *  `status` (a Response / NextResponse) so a job is "ok" when status < 400. */
export interface DispatchJob {
  /** snake_case job name — matches the route's CRON_NAME + its cron_runs rows. */
  name: string;
  /** Invokes the job (the route handler, pre-bound to an authorized request). */
  run: (ctx: DispatchContext) => Promise<{ status: number }>;
}

/**
 * THE FAIR-SHARE ARITHMETIC, in one place, used at BOTH levels:
 *
 *     share = min(capMs, floor(budgetLeftMs / jobsLeft))
 *
 * The dispatcher applies it per JOB (what is left of the 55 s, split across the
 * jobs still to run), and data_lifecycle applies it again per TARGET inside its
 * own share. A job that finishes early hands its leftover to the rest by
 * construction — the next share is computed from what is actually left, not
 * from a fixed slice. The last job (data_lifecycle, today) gets everything that
 * remains, capped by its own ceiling. Edges: nothing left is 0, never negative;
 * `jobsLeft` below 1 is treated as 1 rather than divided by.
 */
export function fairShareMs(budgetLeftMs: number, jobsLeft: number, capMs: number): number {
  const divisor = Math.max(1, jobsLeft);
  const share = Math.floor(Math.max(0, budgetLeftMs) / divisor);
  return Math.min(capMs, share);
}

/**
 * The request header the daily dispatcher uses to hand a child handler its
 * fair share. A child that reads it derives its deadline from the run; one
 * that does not (every other job today) keeps its own ceiling. Not a security
 * input — every cron route is secret-gated before it reads anything — and
 * not a middleware-stamped header, so check-api-guard-headers is unaffected.
 */
export const CRON_BUDGET_HEADER = "x-cron-budget-ms";

/**
 * The budget a parent handed down, or null when called standalone (Vercel
 * invoking the route directly, a manual curl) or when the value is not a
 * positive integer. Anything else is treated as "no budget given" so a
 * malformed header can never produce a zero-second deadline.
 */
export function cronBudgetFromHeaders(headers: { get(name: string): string | null }):
  | number
  | null {
  const raw = headers.get(CRON_BUDGET_HEADER);
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export type DispatchJobStatus = "ok" | "failed" | "threw" | "skipped_budget";

export interface DispatchOutcome {
  name: string;
  status: DispatchJobStatus;
  /** HTTP status the job's handler returned (null when it threw / was skipped). */
  httpStatus: number | null;
  /** Error message when the handler threw (null otherwise). */
  error: string | null;
  durationMs: number;
}

export interface DispatchResult {
  outcomes: DispatchOutcome[];
  /** Jobs whose handler was actually invoked this run. */
  ran: number;
  /** Jobs that returned HTTP >= 400 OR threw. */
  failed: number;
  /** Jobs skipped because the wall-clock budget was exhausted. */
  skipped: number;
}

export interface DispatchOptions {
  /**
   * Wall-clock budget for the whole run (ms). Before each job the dispatcher
   * checks the elapsed time; once the budget is hit the remaining jobs are
   * recorded as `skipped_budget` (they run on the next daily invocation — every
   * job is idempotent / resumable). Default: no budget (run all).
   */
  budgetMs?: number;
  /** Injectable clock for tests. Default: Date.now. */
  now?: () => number;
  /**
   * C-b: called after EACH job's outcome is recorded (including
   * `skipped_budget`), before the next job starts. The daily route uses it to
   * persist partial progress onto its cron_runs row so a hard kill
   * (SIGKILL at maxDuration) no longer loses every outcome computed so far.
   * A throwing callback is contained (logged, never aborts the fleet).
   */
  onOutcome?: (outcome: DispatchOutcome, soFar: readonly DispatchOutcome[]) => Promise<void> | void;
}

/**
 * Runs `jobs` in order, each isolated in its own try/catch so a single failing
 * job never aborts the fleet. Returns a per-job outcome report.
 *
 * Failure semantics: a job is `failed` when its handler returns HTTP >= 400,
 * `threw` when the handler throws, `ok` when it returns < 400. `failed` in the
 * result counts both `failed` and `threw`. Budget-skipped jobs are counted
 * separately (they are not failures — they simply did not run this invocation).
 */
export async function dispatchJobs(
  jobs: DispatchJob[],
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const now = options.now ?? (() => Date.now());
  const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
  const start = now();

  const outcomes: DispatchOutcome[] = [];
  let ran = 0;
  let failed = 0;
  let skipped = 0;

  // C-b: report each outcome as soon as it exists — contained so a broken
  // persistence callback can never take the fleet down with it.
  const report = async (outcome: DispatchOutcome) => {
    if (!options.onOutcome) return;
    try {
      await options.onOutcome(outcome, outcomes);
    } catch (err) {
      console.error(`[cron-dispatcher] onOutcome failed after ${outcome.name}:`, err);
    }
  };

  for (const [index, job] of jobs.entries()) {
    // ONE clock reading decides both "may this job run" and "how much is left
    // for it": a second reading between the two could disagree with the first.
    const elapsed = now() - start;
    if (elapsed >= budgetMs) {
      const outcome: DispatchOutcome = {
        name: job.name,
        status: "skipped_budget",
        httpStatus: null,
        error: null,
        durationMs: 0,
      };
      outcomes.push(outcome);
      skipped += 1;
      await report(outcome);
      continue;
    }
    const ctx: DispatchContext = {
      budgetLeftMs: budgetMs - elapsed,
      jobsLeft: jobs.length - index,
    };

    const jobStart = now();
    try {
      const res = await job.run(ctx);
      const durationMs = now() - jobStart;
      const ok = res.status < 400;
      const outcome: DispatchOutcome = {
        name: job.name,
        status: ok ? "ok" : "failed",
        httpStatus: res.status,
        error: null,
        durationMs,
      };
      outcomes.push(outcome);
      ran += 1;
      if (!ok) failed += 1;
      await report(outcome);
    } catch (err) {
      const durationMs = now() - jobStart;
      const outcome: DispatchOutcome = {
        name: job.name,
        status: "threw",
        httpStatus: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      };
      outcomes.push(outcome);
      ran += 1;
      failed += 1;
      await report(outcome);
    }
  }

  return { outcomes, ran, failed, skipped };
}

/**
 * Ordered SSOT of the job names the daily dispatcher runs — every cron that was
 * previously its own vercel.json entry.
 *
 * Order rationale (S8, revised; C-b 2026-08-16): the delivery drains
 * (process_eno_queue, drain_outbox, drain_notification_dead_letter) run right
 * after the first, cheap producer batch (materialize_slots..evaluate_alerts)
 * — BEFORE the heavier expiry/escalation/retention block. Previously the
 * drains sat near the END of the list (after that whole heavy block), so a
 * tight BUDGET_MS cutoff could skip them entirely, starving delivery
 * indefinitely rather than by a bounded one-day delay. Running them early
 * means a budget cutoff now only defers a LATER job's own outbox rows to the
 * next daily invocation — every job is idempotent/resumable, so that's an
 * acceptable trade for "delivery never starved".
 *
 * cron_health runs FIRST — a DELIBERATE REVERSAL (C-b, governance review
 * 2026-08-15) of the earlier "last, so it sees this run's fresh telemetry"
 * decision. The old position had a structurally worse failure mode: any
 * earlier job hard-killing the function meant the one job whose purpose is
 * detecting a dead fleet never ran AT ALL — and nothing noticed, because the
 * thing that would notice was the thing that didn't run. First guarantees it
 * executes every day; the cost is that it examines YESTERDAY's runs, so a
 * same-day cascade surfaces one day later. That lag is bounded; the silence
 * was not.
 *
 * Sub-daily jobs are folded to daily here (drain_outbox, process_eno_queue,
 * drain_notification_dead_letter, expire_decomiso_handoffs). Vercel Hobby only
 * supports daily schedules, so sub-daily cadence is impossible on Hobby
 * regardless of cron count — the minimum plan for sub-daily draining is Pro.
 */
export const DAILY_JOB_ORDER: readonly string[] = [
  // --- fleet health (FIRST — deliberate reversal, see header) ---
  "cron_health",
  // --- producers / scans / materializers (cheap) ---
  "materialize_slots",
  "business_rules_reeval",
  "reconcile_pet_status",
  "vaccine_due",
  "post_adoption_checkin",
  "evaluate_alerts",
  // --- delivery drains (moved earlier, S8: never starved by the budget) ---
  "process_eno_queue",
  "drain_outbox",
  "drain_notification_dead_letter",
  // --- expiries / escalations / case closers ---
  "auto_expire_approvals",
  "expire_caretaker_grants",
  "expire_foster_proposals",
  "expire_pet_transfers",
  "expire_cross_org_transfers",
  "expire_decomiso_handoffs",
  "close_rabies_observations",
  "close_stale_lost_episodes",
  "close_followup_expired_adoptions",
  "escalate_stale_welfare_cases",
  "escalate_stale_disputes",
  // --- retention purges ---
  "purge_scan_events",
  "data_lifecycle",
] as const;
