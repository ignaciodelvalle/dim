// The cron schedule a human reads must be the schedule the system runs.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// `/admin/sistema/crons` is where an operator goes to answer one question: did
// this job run when it was supposed to? Until 2026-08-18 that screen read its
// schedules from CRON_SCHEDULE_MAP — a second, hand-maintained table inside
// lib/analytics/admin-metrics.ts — while the real monitoring
// (/api/cron/cron-health) read CRON_REGISTRY. The two had already drifted:
// the console said drain_outbox runs at 06:00; the registry says 04:00.
//
// A health console that misstates the schedule is worse than no console: a job
// that ran on time looks late, and a job that is genuinely late looks fine,
// and the operator cannot tell which. The screen was consolidated onto the
// registry; this keeps it there.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CRON_REGISTRY } from "@/lib/infra/cron-registry";

const ROOT = join(__dirname, "..");
const CANONICAL = "lib/infra/cron-registry.ts";

function sourceFiles(): string[] {
  const found: string[] = [];
  for (const root of ["app", "lib", "src"]) {
    for (const entry of readdirSync(join(ROOT, root), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      if (entry.name.includes(".test.")) continue;
      found.push(
        join(entry.parentPath, entry.name)
          .slice(ROOT.length + 1)
          .replaceAll("\\", "/"),
      );
    }
  }
  return found;
}

describe("cron schedules have one source", () => {
  it("the registry actually carries schedules", () => {
    // NON-VACUITY. Everything below is meaningless if the registry is empty or
    // its entries stopped declaring a schedule.
    expect(CRON_REGISTRY.length).toBeGreaterThan(10);
    for (const entry of CRON_REGISTRY) {
      expect(entry.schedule, entry.cronName).toMatch(/^[\d*,/ -]+$/);
    }
  });

  it("no second table of cron schedules exists outside the registry", () => {
    // A cron expression is five space-separated fields. Any file other than the
    // registry holding a MAP of them is, by construction, a copy that can drift
    // — which is exactly what happened. Matching on the literal shape rather
    // than on a variable name keeps a rename from slipping past.
    const CRON_EXPR = /["'`]\s*[\d*]+[\d*,/-]*\s+[\d*][\d*,/-]*\s+\*\s+\*\s+\*\s*["'`]/;
    const copias: string[] = [];
    for (const file of sourceFiles()) {
      if (file === CANONICAL) continue;
      const src = readFileSync(join(ROOT, file), "utf8");
      const lineas = src.split("\n");
      // Two or more cron literals in one file is a table, not an incidental
      // mention (vercel.json lives outside this tree and is the platform's own
      // declaration, not a display source).
      const hits = lineas.filter((l) => CRON_EXPR.test(l) && !l.trim().startsWith("//"));
      if (hits.length >= 2) {
        copias.push(`${file} (${hits.length} horarios)`);
      }
    }
    expect(
      copias,
      `Tablas de horarios fuera de ${CANONICAL}:\n${copias.map((c) => `  • ${c}`).join("\n")}\n\nUn operador lee estos horarios para decidir si un cron llegó tarde. Dos tablas = una miente.`,
    ).toEqual([]);
  });
});
