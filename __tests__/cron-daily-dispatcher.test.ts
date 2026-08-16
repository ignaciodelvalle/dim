// Unit tests for the daily cron dispatcher's core fan-out (dispatchJobs).
//
// The dispatcher (app/api/cron/daily/route.ts) folds the whole cron fleet into
// one daily Vercel invocation. The contract that matters:
//   1. It calls EVERY registered job.
//   2. A failing job (throws OR returns HTTP >= 400) does NOT abort the rest.
//   3. Jobs are run in the declared order.
//   4. A wall-clock budget skips the tail (they run next invocation) without
//      counting as failures.
//
// dispatchJobs is pure (no DB / no Next.js), so these tests run without mocks.

import { describe, expect, it } from "vitest";

import { DAILY_JOB_ORDER, type DispatchJob, dispatchJobs } from "@/lib/infra/cron-dispatcher";

function okJob(name: string, calls: string[]): DispatchJob {
  return {
    name,
    run: async () => {
      calls.push(name);
      return { status: 200 };
    },
  };
}

describe("dispatchJobs", () => {
  it("calls every job and reports all ok", async () => {
    const calls: string[] = [];
    const jobs = ["a", "b", "c"].map((n) => okJob(n, calls));

    const result = await dispatchJobs(jobs);

    expect(calls).toEqual(["a", "b", "c"]);
    expect(result.ran).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.outcomes.map((o) => o.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("a THROWING job does not abort the rest", async () => {
    const calls: string[] = [];
    const jobs: DispatchJob[] = [
      okJob("first", calls),
      {
        name: "boom",
        run: async () => {
          calls.push("boom");
          throw new Error("kaboom");
        },
      },
      okJob("third", calls),
    ];

    const result = await dispatchJobs(jobs);

    // The job after the failure still ran.
    expect(calls).toEqual(["first", "boom", "third"]);
    expect(result.ran).toBe(3);
    expect(result.failed).toBe(1);
    const boom = result.outcomes.find((o) => o.name === "boom");
    expect(boom?.status).toBe("threw");
    expect(boom?.error).toBe("kaboom");
    // Neighbours unaffected.
    expect(result.outcomes.find((o) => o.name === "third")?.status).toBe("ok");
  });

  it("a job returning HTTP >= 400 is counted failed but does not abort the rest", async () => {
    const calls: string[] = [];
    const jobs: DispatchJob[] = [
      {
        name: "server_error",
        run: async () => {
          calls.push("server_error");
          return { status: 500 };
        },
      },
      okJob("after", calls),
    ];

    const result = await dispatchJobs(jobs);

    expect(calls).toEqual(["server_error", "after"]);
    expect(result.failed).toBe(1);
    expect(result.outcomes.find((o) => o.name === "server_error")?.status).toBe("failed");
    expect(result.outcomes.find((o) => o.name === "after")?.status).toBe("ok");
  });

  it("skips the tail once the wall-clock budget is exhausted", async () => {
    const calls: string[] = [];
    // Injectable clock: each now() reading advances 40ms so the 2nd job trips
    // the 50ms budget before it runs.
    let t = 0;
    const now = () => {
      const v = t;
      t += 40;
      return v;
    };
    const jobs = ["one", "two", "three"].map((n) => okJob(n, calls));

    const result = await dispatchJobs(jobs, { budgetMs: 50, now });

    // "one" ran; "two"/"three" were skipped by the budget (not failures).
    expect(calls).toEqual(["one"]);
    expect(result.ran).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.outcomes.filter((o) => o.status === "skipped_budget").map((o) => o.name)).toEqual(
      ["two", "three"],
    );
  });

  it("DAILY_JOB_ORDER covers the whole fleet without duplicates", () => {
    // Guards the SSOT list itself: 22 jobs, all unique.
    expect(DAILY_JOB_ORDER.length).toBe(22);
    expect(new Set(DAILY_JOB_ORDER).size).toBe(22);
  });

  it("C-b: cron_health runs FIRST — the deliberate reversal", () => {
    // The one job whose purpose is detecting a dead fleet must be immune to
    // anything that happens later in the run. See the header's rationale.
    expect(DAILY_JOB_ORDER[0]).toBe("cron_health");
  });

  it("C-b: onOutcome fires once per job, in order, before the next job starts", async () => {
    const seen: Array<{ name: string; soFarLen: number; callsAtReport: number }> = [];
    const calls: string[] = [];
    const jobs = ["one", "two"].map((n) => okJob(n, calls));

    await dispatchJobs(jobs, {
      onOutcome: (outcome, soFar) => {
        seen.push({ name: outcome.name, soFarLen: soFar.length, callsAtReport: calls.length });
      },
    });

    expect(seen.map((s) => s.name)).toEqual(["one", "two"]);
    // "one"'s report fired while only "one" had run — before "two" started.
    expect(seen[0]).toEqual({ name: "one", soFarLen: 1, callsAtReport: 1 });
    expect(seen[1]).toEqual({ name: "two", soFarLen: 2, callsAtReport: 2 });
  });

  it("C-b: onOutcome fires for budget-skipped jobs too, and a throwing callback never aborts the fleet", async () => {
    const reported: string[] = [];
    const calls: string[] = [];
    let t = 0;
    const now = () => {
      const v = t;
      t += 40;
      return v;
    };
    const jobs = ["one", "two"].map((n) => okJob(n, calls));

    const result = await dispatchJobs(jobs, {
      budgetMs: 50,
      now,
      onOutcome: (outcome) => {
        reported.push(`${outcome.name}:${outcome.status}`);
        throw new Error("persistence exploded");
      },
    });

    // The skip was reported AND the throwing callback was contained.
    expect(reported).toEqual(["one:ok", "two:skipped_budget"]);
    expect(result.ran).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
