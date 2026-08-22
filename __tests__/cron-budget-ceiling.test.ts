// The cron budget stops being advisory — declared ceilings + honoured header.
//
// WHY (RN #9 / fix queue row 10, 2026-08-22): the daily dispatcher computes a
// fair share and hands it down in `x-cron-budget-ms`, but only data_lifecycle
// ever read it. The other 22 jobs kept their OWN 20-45 s ceilings, and the
// dispatcher's budget check only fires BETWEEN jobs — never interrupts one in
// flight. Measured with a harness against the real module:
//
//   - normal night: 34.5 s, 23 run, 0 skipped.
//   - ONE backlogged ceiling-hitter: 55.5 s, 8 run, 15 skipped — the skipped
//     tail is drain_outbox, drain_notification_dead_letter, the rabies-window
//     closer and the Ley 25.326 retention purge.
//   - the same job starting late: the function crosses its 60 s hard kill and
//     is SIGKILLed, leaving the cron_daily row at 'running' forever.
//   - counterfactual: if every child honoured the header, the same load
//     finishes all 23 in 36.7 s with no hard kill.
//
// Two halves, both pinned here:
//   (a) the ceiling is DECLARED — the dispatcher refuses to START a job when
//       less is left than that job will burn regardless of what it is handed,
//       so an uncooperative child can never start late enough to cross 60 s.
//       A starve becomes a clean, reported `skipped_budget` instead of a kill.
//   (b) every job with a ceiling derives its deadline from
//       min(own ceiling, budget handed down) — the parity fence below goes RED
//       for any route that declares a ceiling without reading the header.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CRON_BUDGET_HEADER,
  CRON_JOB_CEILINGS,
  DAILY_JOB_ORDER,
  type DispatchJob,
  dispatchJobs,
  effectiveDeadlineMs,
  reservedCeilingMs,
} from "@/lib/infra/cron-dispatcher";

const ROOT = join(__dirname, "..");
const CRON_DIR = join(ROOT, "app", "api", "cron");

// The dispatcher itself is not a job; refresh-cube is standalone-scheduled with
// its own 300 s function pin, outside the daily budget entirely.
const NOT_A_BUDGETED_JOB = new Set(["daily", "refresh-cube"]);

// app/api/cron/daily/route.ts — the real numbers the fleet runs under.
const BUDGET_MS = 55_000;
// vercel.json maxDuration for the function the whole fleet shares.
const HARD_KILL_MS = 60_000;

/** snake_case job name -> kebab-case route directory. */
function routeDirOf(jobName: string): string {
  return jobName.replace(/_/g, "-");
}

function headers(map: Record<string, string>): { get(name: string): string | null } {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

/** Reads a source file the ceiling table points at. */
function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

// A self-imposed wall-clock ceiling constant: `const FOO_MAX_DURATION_MS = 45_000`.
const CEILING_CONSTANT = /(?:^|\n)\s*(?:export\s+)?const\s+[A-Z0-9_]*MAX_DURATION_MS\s*=\s*[\d_]+/;

// Proof that a module derives its deadline from the run instead of a constant.
const READS_THE_BUDGET = /effectiveDeadlineMs|cronBudgetFromHeaders|budgetHeaders/;

describe("cron budget — (a) the ceiling is declared, so a starve is a skip and not a kill", () => {
  it("ONE uncooperative ceiling-hitter at position 5 no longer pushes the fleet past the 60s hard kill", async () => {
    // The measured scenario, on a fake clock: four cheap jobs, then a job that
    // burns its whole 45 s ceiling, then eighteen more that would each do the
    // same if the dispatcher let them start.
    const CHEAP_MS = 100;
    const CEILING_MS = 45_000;
    const CHEAP_HEAD = 4;

    let clock = 0;
    const now = () => clock;
    const started: string[] = [];

    const jobs: DispatchJob[] = DAILY_JOB_ORDER.map((name, index) => {
      const uncooperative = index >= CHEAP_HEAD;
      return {
        name,
        // What this job burns no matter what the dispatcher hands it.
        ceilingMs: uncooperative ? CEILING_MS : 0,
        run: async () => {
          started.push(name);
          clock += uncooperative ? CEILING_MS : CHEAP_MS;
          return { status: 200 };
        },
      };
    });

    const result = await dispatchJobs(jobs, { budgetMs: BUDGET_MS, now });

    // THE POINT: the function is never SIGKILLed, so cron_daily always gets to
    // finalise its row instead of staying at 'running' forever.
    expect(clock).toBeLessThanOrEqual(HARD_KILL_MS);

    // Only the cheap head plus the single ceiling-hitter it could afford.
    expect(started).toEqual([...DAILY_JOB_ORDER.slice(0, CHEAP_HEAD + 1)]);

    // Everything after is DECLARED skipped — reported, alerted on, and run by
    // tomorrow's invocation. Not silently lost.
    const tail = result.outcomes.slice(CHEAP_HEAD + 1);
    expect(tail.length).toBe(DAILY_JOB_ORDER.length - CHEAP_HEAD - 1);
    expect(tail.every((o) => o.status === "skipped_budget")).toBe(true);
    expect(result.skipped).toBe(tail.length);
  });

  it("a job that honours the header (no reserved ceiling) still runs on whatever is left", async () => {
    let clock = 0;
    const now = () => clock;
    const started: string[] = [];

    const jobs: DispatchJob[] = [
      {
        name: "hog",
        ceilingMs: 45_000,
        run: async () => {
          started.push("hog");
          clock += 45_000;
          return { status: 200 };
        },
      },
      // No ceilingMs: it derives its deadline from the header, so what it is
      // handed can never exceed what is left.
      {
        name: "cooperative",
        run: async (ctx) => {
          started.push("cooperative");
          clock += Math.min(45_000, ctx.budgetLeftMs);
          return { status: 200 };
        },
      },
    ];

    const result = await dispatchJobs(jobs, { budgetMs: BUDGET_MS, now });

    expect(started).toEqual(["hog", "cooperative"]);
    expect(result.skipped).toBe(0);
    expect(clock).toBeLessThanOrEqual(HARD_KILL_MS);
  });

  it("an unbudgeted run (no budgetMs) never reserves anything", async () => {
    const started: string[] = [];
    const jobs: DispatchJob[] = ["a", "b"].map((name) => ({
      name,
      ceilingMs: 45_000,
      run: async () => {
        started.push(name);
        return { status: 200 };
      },
    }));

    const result = await dispatchJobs(jobs);

    expect(started).toEqual(["a", "b"]);
    expect(result.skipped).toBe(0);
  });
});

describe("cron budget — (b) min(own ceiling, budget handed down)", () => {
  it("effectiveDeadlineMs takes the smaller of the two, and the constant when standalone", () => {
    // Inside the dispatcher: the share wins when it is tighter.
    expect(effectiveDeadlineMs(45_000, headers({ [CRON_BUDGET_HEADER]: "2391" }))).toBe(2391);
    // The job's own ceiling wins when the share is generous.
    expect(effectiveDeadlineMs(20_000, headers({ [CRON_BUDGET_HEADER]: "50000" }))).toBe(20_000);
    // Standalone (a manual curl, Vercel hitting the route directly): the
    // constant is all there is.
    expect(effectiveDeadlineMs(45_000, headers({}))).toBe(45_000);
    // A malformed header can never produce a zero-second deadline.
    expect(effectiveDeadlineMs(45_000, headers({ [CRON_BUDGET_HEADER]: "-1" }))).toBe(45_000);
    expect(effectiveDeadlineMs(45_000, headers({ [CRON_BUDGET_HEADER]: "abc" }))).toBe(45_000);
  });

  it("reservedCeilingMs is 0 for a job that honours the header and its ceiling for one that does not", () => {
    for (const [name, declared] of Object.entries(CRON_JOB_CEILINGS)) {
      expect(reservedCeilingMs(name)).toBe(declared.honoursBudget ? 0 : declared.ceilingMs);
    }
    // Unknown job: nothing reserved (never starve a job we know nothing about).
    expect(reservedCeilingMs("not_a_job")).toBe(0);
  });

  it("PARITY: every declared ceiling is honoured by the code that owns it", () => {
    const offenders: string[] = [];

    for (const [name, declared] of Object.entries(CRON_JOB_CEILINGS)) {
      const routeFile = join(CRON_DIR, routeDirOf(name), "route.ts");
      expect(existsSync(routeFile), `${name}: no route at ${routeFile}`).toBe(true);

      // The route is what receives the header, so the route is what must read
      // it — even when the ceiling constant lives in a helper it calls.
      const routeSrc = readFileSync(routeFile, "utf8");
      const reads = READS_THE_BUDGET.test(routeSrc);
      if (reads !== declared.honoursBudget) {
        offenders.push(
          `${name}: CRON_JOB_CEILINGS says honoursBudget=${declared.honoursBudget} but ${routeDirOf(name)}/route.ts ${reads ? "reads" : "ignores"} the budget`,
        );
      }

      // The declared number must actually exist where the table says it does —
      // otherwise the table drifts into fiction.
      const declaringSrc = readSource(declared.declaredIn);
      if (!CEILING_CONSTANT.test(declaringSrc)) {
        offenders.push(`${name}: no ceiling constant found in ${declared.declaredIn}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("PARITY: a cron route that declares its own ceiling constant must appear in CRON_JOB_CEILINGS", () => {
    const undeclared: string[] = [];
    let scanned = 0;

    for (const entry of readdirSync(CRON_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || NOT_A_BUDGETED_JOB.has(entry.name)) continue;
      const routeFile = join(CRON_DIR, entry.name, "route.ts");
      if (!existsSync(routeFile)) continue;
      scanned += 1;

      const src = readFileSync(routeFile, "utf8");
      if (!CEILING_CONSTANT.test(src)) continue;

      const jobName = entry.name.replace(/-/g, "_");
      if (!CRON_JOB_CEILINGS[jobName]) {
        undeclared.push(
          `${entry.name}/route.ts declares a ceiling but is missing from CRON_JOB_CEILINGS`,
        );
      }
    }

    expect(undeclared).toEqual([]);
    // Non-vacuity floor: the sweep must actually have seen the fleet.
    expect(scanned).toBeGreaterThanOrEqual(20);
  });

  it("the ceiling table covers the whole ceiling-bearing fleet and only real jobs", () => {
    // Non-vacuity floor: 14 jobs carry a self-imposed ceiling today. If this
    // drops, someone deleted a row instead of fixing a job.
    expect(Object.keys(CRON_JOB_CEILINGS).length).toBeGreaterThanOrEqual(14);
    for (const name of Object.keys(CRON_JOB_CEILINGS)) {
      expect(DAILY_JOB_ORDER).toContain(name);
    }
  });
});
