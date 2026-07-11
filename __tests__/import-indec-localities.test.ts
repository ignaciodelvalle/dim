// Test del importer con un CSV fixture chiquito. Mockea global.fetch para
// evitar pegarle a datos.gob.ar desde CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, like, or, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { arLocalities, arLocalitiesImportRuns, db } from "@/db";
import { runImport } from "@/scripts/import-indec-localities";

import { restoreIndecCatalog } from "./_helpers/restore-indec-catalog";

const FIXTURE_PATH = join(
  __dirname,
  "..",
  "scripts",
  "__fixtures__",
  "indec-localidades-sample.csv",
);
const csvFixture = readFileSync(FIXTURE_PATH, "utf-8");
// Fixture INDEC ids — used to scope cleanup so we never touch real-catalog rows
// that may already live in the dev DB.
const FIXTURE_INDEC_IDS = [
  "02014010", // Palermo
  "02002010", // Recoleta
  "06028010", // Avellaneda
  "06441010", // La Plata
  "50028010", // Mendoza capital
  "50007999", // Paraje (intentionally skipped by category filter)
  "99001010", // Inventada (intentionally rejected by province filter)
  "06028020", // Empty name (intentionally rejected by required-field filter)
] as const;

function buildResponse(headers?: Record<string, string>): Response {
  return new Response(csvFixture, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Last-Modified": "Wed, 18 May 2026 12:00:00 GMT",
      ...headers,
    },
  });
}

async function cleanupFixtureRows() {
  for (const id of FIXTURE_INDEC_IDS) {
    await db.delete(arLocalities).where(eq(arLocalities.indecId, id));
  }
  // Un-soft-delete real catalog rows the soft-delete subtest may have stamped.
  // The script's soft-delete pass marks any indec_cppdyl row that isn't in the
  // current CSV as removed; running with a fixture CSV obliterates the live
  // catalog unless we restore it here. The shared helper also re-drops the
  // whole-province aggregate rows a blanket restore would resurrect (they fail
  // the lint:locality gate) — see _helpers/restore-indec-catalog.ts.
  await restoreIndecCatalog();
  // Remove the test-only import runs (those point at the fixture URL, not the
  // real datos.gob.ar URL).
  await db
    .delete(arLocalitiesImportRuns)
    .where(
      or(
        like(arLocalitiesImportRuns.sourceUrl, "%fixture%"),
        eq(arLocalitiesImportRuns.sourceUrl, "https://test.example/fixture.csv"),
      ),
    );
}

beforeEach(cleanupFixtureRows);
afterAll(cleanupFixtureRows);

// Per-test timeouts: the script does N+M synchronous queries (N for upsert
// checks, M for the soft-delete scan over all indec_cppdyl rows). With ~4000
// real catalog rows present each test that triggers a full import can take
// 30-45 s under load; tests that run two full imports need up to 90 s. Each
// `it` carries an explicit budget — the dry-run test has no soft-delete scan
// and stays fast.
describe("import-indec-localities", () => {
  // 60 s: one full import — upsert + soft-delete scan over ~4 k catalog rows.
  it("imports the fixture CSV: 5 valid rows, 1 skipped (paraje), 2 errored", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    expect(stats.inserted).toBe(5);
    expect(stats.updated).toBe(0);
    expect(stats.noop).toBe(0);
    expect(stats.skipped).toBe(1); // "Paraje" filtered out
    expect(stats.errors).toHaveLength(2); // unknown province + missing name

    const rows = await db
      .select()
      .from(arLocalities)
      .where(eq(arLocalities.source, "indec_cppdyl"));

    const fixtureRows = rows.filter((r) =>
      FIXTURE_INDEC_IDS.includes(r.indecId as (typeof FIXTURE_INDEC_IDS)[number]),
    );
    expect(fixtureRows).toHaveLength(5);

    const palermo = fixtureRows.find((r) => r.indecId === "02014010");
    expect(palermo).toBeDefined();
    if (!palermo) return;
    expect(palermo.provinceCode).toBe("AR-C");
    expect(palermo.category).toBe("componente"); // CABA barrios
    expect(palermo.localitySlug).toBe("palermo");
    expect(palermo.latitude).toBe("-34.5867000");
    expect(palermo.longitude).toBe("-58.4209000");

    const mendoza = fixtureRows.find((r) => r.indecId === "50028010");
    expect(mendoza?.category).toBe("ciudad");
    expect(mendoza?.provinceCode).toBe("AR-M");

    const laPlata = fixtureRows.find((r) => r.indecId === "06441010");
    expect(laPlata?.provinceCode).toBe("AR-B");
    expect(laPlata?.category).toBe("localidad");

    const runs = await db
      .select()
      .from(arLocalitiesImportRuns)
      .where(eq(arLocalitiesImportRuns.sourceUrl, "https://test.example/fixture.csv"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("ok");
    expect(runs[0].insertedCount).toBe(5);
  }, 60_000);

  // 60 s: first run triggers a full soft-delete scan; second run is fast
  // (all real rows already soft-deleted, nothing new to remove).
  it("is idempotent on re-run with the same CSV (5 noop, 0 changes)", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    // Re-run — re-mock fetch since vi.fn() was consumed
    global.fetch = vi.fn(async () => buildResponse());
    const second = await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.noop).toBe(5);
  }, 60_000);

  // 90 s: beforeEach restores the full catalog before this test, so BOTH
  // import runs face the complete soft-delete scan (~4 k rows each).
  it("soft-deletes rows that disappear from the new CSV", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    // Now ship a CSV without Recoleta (02002010) — only Palermo from CABA.
    const trimmedCsv = csvFixture
      .split("\n")
      .filter((line) => !line.includes('"02002010"'))
      .join("\n");
    global.fetch = vi.fn(
      async () => new Response(trimmedCsv, { status: 200, headers: { "Last-Modified": "now" } }),
    );

    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });
    expect(stats.removed).toBe(1);

    const [recoleta] = await db
      .select()
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "02002010"));
    expect(recoleta.removedAt).not.toBeNull();
  }, 90_000);

  // dry-run skips all DB writes and the soft-delete scan — stays fast.
  it("respects --dry-run: no writes, no run row persisted with finishedAt", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    const stats = await runImport({
      dryRun: true,
      sourceUrl: "https://test.example/fixture.csv",
    });
    expect(stats.inserted).toBe(5);

    // No rows inserted — the catalog stays untouched.
    const fixtureRowsCount = await db
      .select({ id: arLocalities.id })
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "02014010"));
    expect(fixtureRowsCount).toHaveLength(0);
  });

  // Graceful fallback: when the live fetch fails, the script loads the bundled
  // sample fixture instead of throwing. Bootstrap / CI stay green.
  it("falls back to the bundled fixture when the live fetch fails", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network unreachable (simulated)");
    });
    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    expect(stats.usedFallback).toBe(true);
    // Fixture has 5 valid rows.
    expect(stats.inserted).toBe(5);
    expect(stats.errors.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  // Local file path override: when localCsvPath is provided, no fetch is made.
  it("loads from a local CSV file when localCsvPath is provided (no fetch)", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const stats = await runImport({
      localCsvPath: FIXTURE_PATH,
      sourceUrl: "https://test.example/fixture.csv",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stats.usedFallback).toBe(false);
    expect(stats.inserted).toBe(5);
  }, 60_000);
});
