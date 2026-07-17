// Cron fleet parity — projection-cron audit 2026-07-03 B2, reworked for the
// dispatcher consolidation (Vercel Hobby cron limits, 2026-07-07).
//
// The fleet used to be 22 vercel.json crons in 1:1 correspondence with 22 route
// directories. Vercel Hobby allows only 2 daily cron jobs, so the fleet now
// runs behind a SINGLE daily dispatcher (/api/cron/daily). The invariants that
// keep drift from silently recurring changed shape accordingly:
//
//   - vercel.json schedules ONLY the dispatcher route(s).
//   - CRON_REGISTRY (lib/infra/cron-registry.ts) === snake_case of the JOB
//     route directories (every job is still monitored by cron-health).
//   - DAILY_JOB_ORDER (lib/infra/cron-dispatcher.ts) === the registered jobs,
//     so the dispatcher runs exactly the monitored fleet — no job silently
//     dropped from the daily run, none run that isn't monitored.
//   - every job route declares CRON_NAME = snake(dir) and records telemetry.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DAILY_JOB_ORDER } from "@/lib/infra/cron-dispatcher";
import { CRON_REGISTRY, cronDisplayLabel } from "@/lib/infra/cron-registry";

const ROOT = join(__dirname, "..");
const CRON_DIR = join(ROOT, "app", "api", "cron");

// Dispatcher routes are the scheduled orchestrators — they appear in
// vercel.json and have a route directory, but they are NOT individual jobs
// (they run the jobs) so they are excluded from the job-registry checks.
// Routes scheduled DIRECTLY in vercel.json that are NOT fleet jobs (so they are
// excluded from the job-registry/DAILY_JOB_ORDER checks): the daily dispatcher,
// plus any standalone cron that legitimately cannot fold into it. `refresh-cube`
// is standalone because the cube build (~105s) exceeds the 60s daily-dispatcher
// budget — it needs its own Vercel Pro function (maxDuration 300, */15). On
// Hobby its schedule never fires and the cube stays inert (reader falls to live).
const DISPATCHER_DIRS = ["daily", "refresh-cube"];

function snake(dir: string): string {
  return dir.replace(/-/g, "_");
}

function vercelCronPaths(): string[] {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
    crons?: Array<{ path: string }>;
  };
  return (vercel.crons ?? []).map((c) => c.path);
}

function routeDirs(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

describe("cron fleet parity (vercel.json ⇄ dispatcher ⇄ registry ⇄ routes)", () => {
  const dirs = routeDirs();
  const jobDirs = dirs.filter((d) => !DISPATCHER_DIRS.includes(d));
  const registryNames = new Set(CRON_REGISTRY.map((e) => e.cronName));

  it("vercel.json schedules ONLY the dispatcher route(s)", () => {
    const pathDirs = vercelCronPaths().map((p) => p.replace("/api/cron/", ""));
    expect([...pathDirs].sort()).toEqual([...DISPATCHER_DIRS].sort());
  });

  it("every dispatcher has a route directory", () => {
    for (const d of DISPATCHER_DIRS) {
      expect(dirs, `dispatcher "${d}" must have app/api/cron/${d}/route.ts`).toContain(d);
    }
  });

  it("CRON_REGISTRY names are exactly snake_case of the JOB route directories", () => {
    const expected = jobDirs.map(snake).sort();
    expect([...registryNames].sort()).toEqual(expected);
  });

  it("DAILY_JOB_ORDER runs exactly the registered jobs (no drops, no extras)", () => {
    expect([...DAILY_JOB_ORDER].sort()).toEqual([...registryNames].sort());
  });

  it("DAILY_JOB_ORDER has no duplicate entries", () => {
    expect(new Set(DAILY_JOB_ORDER).size).toBe(DAILY_JOB_ORDER.length);
  });

  it("every job route declares CRON_NAME = snake_case(directory)", () => {
    for (const dir of jobDirs) {
      const src = readFileSync(join(CRON_DIR, dir, "route.ts"), "utf8");
      const match = src.match(/const CRON_NAME = "([^"]+)"/);
      expect(match, `${dir}/route.ts must declare const CRON_NAME`).not.toBeNull();
      expect(match?.[1], `${dir}/route.ts CRON_NAME must be snake_case of its directory`).toBe(
        snake(dir),
      );
    }
  });

  it("every job route records cron_runs telemetry (cronRuns / runCaseCron / withCronRun)", () => {
    for (const dir of jobDirs) {
      const src = readFileSync(join(CRON_DIR, dir, "route.ts"), "utf8");
      const hasTelemetry =
        src.includes("cronRuns") || src.includes("runCaseCron") || src.includes("withCronRun");
      expect(
        hasTelemetry,
        `${dir}/route.ts writes no cron_runs telemetry — wrap it with withCronRun (lib/infra/case-cron.ts)`,
      ).toBe(true);
    }
  });

  // Auth is the security boundary for the whole cron fleet (all 24 routes are
  // publicly reachable URLs otherwise) — this tripwire keeps a future job from
  // shipping ungated. Every job must reference one of the two known auth
  // helpers: authorizeCronRequest (lib/domain/cron-auth.ts, Bearer + legacy
  // header) or checkCronSecret (lib/infra/case-cron.ts, the older helper still
  // used by the case-cron routes).
  it("every job route is auth-gated (authorizeCronRequest or checkCronSecret)", () => {
    for (const dir of jobDirs) {
      const src = readFileSync(join(CRON_DIR, dir, "route.ts"), "utf8");
      const hasAuth = src.includes("authorizeCronRequest") || src.includes("checkCronSecret");
      expect(
        hasAuth,
        `${dir}/route.ts has no auth gate — it must call authorizeCronRequest (lib/domain/cron-auth.ts) or checkCronSecret (lib/infra/case-cron.ts)`,
      ).toBe(true);
    }
  });
});

// es-AR display labels for the operator-facing CronsDownBanner "Detalle técnico"
// list (recorrido-80 QA: raw snake_case process names read as English text).
describe("cronDisplayLabel — es-AR operator labels", () => {
  it("maps EVERY registered cron to a non-empty es-AR label (no raw key leaks)", () => {
    for (const { cronName } of CRON_REGISTRY) {
      const label = cronDisplayLabel(cronName);
      expect(label, `${cronName} has no es-AR display label`).not.toBe(cronName);
      expect(label.length).toBeGreaterThan(0);
      // No English-looking snake_case underscores in the operator label.
      expect(label).not.toMatch(/_/);
    }
  });

  it("does not change the internal key — display-only", () => {
    // The specific names the QA flagged on /admin.
    expect(cronDisplayLabel("vaccine_due")).toBe("Recordatorio de vacunas por vencer");
    expect(cronDisplayLabel("process_eno_queue")).toBe("Procesamiento de la cola ENO");
  });

  it("falls back to the raw name for an unknown cron (forward-compat)", () => {
    expect(cronDisplayLabel("some_future_cron")).toBe("some_future_cron");
  });
});
