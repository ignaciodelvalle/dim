// Cron fleet parity — projection-cron audit 2026-07-03 B2.
//
// The fleet had drifted three ways: 9 routes wrote no telemetry, 3 routes
// wrote under names the health registry didn't look up, and the registry
// itself lived inline in the cron-health route. This fitness test pins the
// canonical rule so the drift cannot silently recur:
//
//   cron_name === snake_case(route directory)   for every /api/cron/* route
//   CRON_REGISTRY (lib/infra/cron-registry.ts) === vercel.json's cron set
//   every route declares CRON_NAME and records cron_runs telemetry
//     (directly, via runCaseCron, or via withCronRun)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CRON_REGISTRY } from "@/lib/infra/cron-registry";

const ROOT = join(__dirname, "..");
const CRON_DIR = join(ROOT, "app", "api", "cron");

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

describe("cron fleet parity (vercel.json ⇄ registry ⇄ routes)", () => {
  const dirs = routeDirs();
  const registryNames = new Set(CRON_REGISTRY.map((e) => e.cronName));

  it("every vercel.json cron has a route directory, and vice versa", () => {
    const pathDirs = vercelCronPaths().map((p) => p.replace("/api/cron/", ""));
    expect([...pathDirs].sort()).toEqual([...dirs].sort());
  });

  it("CRON_REGISTRY names are exactly snake_case of the route directories", () => {
    const expected = dirs.map(snake).sort();
    expect([...registryNames].sort()).toEqual(expected);
  });

  it("every route declares CRON_NAME = snake_case(directory)", () => {
    for (const dir of dirs) {
      const src = readFileSync(join(CRON_DIR, dir, "route.ts"), "utf8");
      const match = src.match(/const CRON_NAME = "([^"]+)"/);
      expect(match, `${dir}/route.ts must declare const CRON_NAME`).not.toBeNull();
      expect(match?.[1], `${dir}/route.ts CRON_NAME must be snake_case of its directory`).toBe(
        snake(dir),
      );
    }
  });

  it("every route records cron_runs telemetry (cronRuns / runCaseCron / withCronRun)", () => {
    for (const dir of dirs) {
      const src = readFileSync(join(CRON_DIR, dir, "route.ts"), "utf8");
      const hasTelemetry =
        src.includes("cronRuns") || src.includes("runCaseCron") || src.includes("withCronRun");
      expect(
        hasTelemetry,
        `${dir}/route.ts writes no cron_runs telemetry — wrap it with withCronRun (lib/infra/case-cron.ts)`,
      ).toBe(true);
    }
  });
});
