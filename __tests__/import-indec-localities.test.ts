// Test del importer con un CSV fixture chiquito. Mockea global.fetch para
// evitar pegarle a datos.gob.ar desde CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
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

// ---------------------------------------------------------------------------
// FIXTURE IDS THAT CANNOT EXIST UPSTREAM (rewritten 2026-08-21)
// ---------------------------------------------------------------------------
//
// This cleanup HARD-DELETES by indec_id, and three of the ids it deleted were
// real: `06028010` is "Almirante Brown" and `50028010` is "Colonia Segovia" in
// the live feed, and both had already been erased from the dev catalog by
// earlier runs of this very file. (`06441010`, the "La Plata" fixture, turned
// out never to have existed upstream — which is luck, not design, and is
// exactly the kind of luck this rewrite stops depending on.)
//
// The failure shape is the one caba-barrios.test.ts already survived once: a
// test that deletes "its own" rows by a real identifier is a test that quietly
// edits production-shaped data every time it runs, and the damage is invisible
// because the row simply is not there any more.
//
// So every synthetic id now carries department code `999` — INDEC assigns no
// such department in any province, so no id below can ever collide with a live
// row, whatever upstream ships next. The check at the bottom of this block is
// what keeps that true when someone adds a fixture row in a hurry.
const FIXTURE_INDEC_IDS = [
  "02014010", // CABA - Comuna 2   (REAL upstream; superseded, never imported)
  "02098010", // CABA - Comuna 14  (REAL upstream; superseded, never imported)
  "06999010", // Avellaneda        (dept 06999 — impossible)
  "06999020", // La Plata          (dept 06999 — impossible)
  "50999010", // Mendoza capital   (dept 50999 — impossible)
  "50999020", // Paraje (intentionally skipped by category filter)
  "99999010", // Inventada (intentionally rejected by province filter)
  "06999030", // Empty name (intentionally rejected by required-field filter)
] as const;

/**
 * The two AR-C rows, which are transcribed VERBATIM from the live feed (fetched
 * 2026-08-19) and MUST stay real.
 *
 * They used to be inventions — "02014010" was labelled "Palermo", and upstream
 * that id is now "CABA - Comuna 2" — which is how the 2026-08-19 CI break got
 * its second half: caba-barrios.test.ts hard-deleted those ids as stale fixture
 * residue and took a live row with it, turning 15 rows into 14.
 *
 * They cannot be made synthetic like the rest: the test below proves the
 * importer refuses to persist a REAL upstream AR-C id at any granularity, and
 * an invented id would prove only that it refuses to persist an invented one.
 * So they are cleaned up by MARKER instead of by id — see below.
 */
const FIXTURE_CABA_IDS = ["02014010", "02098010"] as const;

/** Ids this file may delete outright, because upstream cannot mint them. */
const SYNTHETIC_FIXTURE_IDS = FIXTURE_INDEC_IDS.filter(
  (id) => !FIXTURE_CABA_IDS.includes(id as (typeof FIXTURE_CABA_IDS)[number]),
);

/**
 * The `source_version` a fixture import stamps.
 *
 * `runImport` takes it from the response's `Last-Modified` header, so the
 * harness sets a marker there rather than a plausible date. It is the second
 * lock on the cleanup: a row is fixture residue only if it carries one of these
 * versions, so the two REAL CABA ids can be cleaned without any possibility of
 * deleting a row a live import wrote.
 */
const FIXTURE_SOURCE_VERSION = "fixture-test";

/** Every source_version a row written by this file can carry. */
const FIXTURE_SOURCE_VERSIONS = [
  FIXTURE_SOURCE_VERSION,
  // The fallback path stamps its own, and one test exercises it.
  "fallback-fixture",
  // The pre-fix AR-C row the self-healing test plants by hand.
  "pre-fix",
];

function buildResponse(headers?: Record<string, string>): Response {
  return new Response(csvFixture, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Last-Modified": FIXTURE_SOURCE_VERSION,
      ...headers,
    },
  });
}

async function cleanupFixtureRows() {
  // Synthetic ids: safe to delete outright — upstream cannot mint a `999`
  // department, so there is no live row wearing one of these ids to destroy.
  await db.delete(arLocalities).where(inArray(arLocalities.indecId, [...SYNTHETIC_FIXTURE_IDS]));
  // REAL ids: only rows this file wrote, identified by the marker version. A
  // live AR-C row (if a future import ever wrote one) carries a real date here
  // and survives — which is the whole point, since deleting one is precisely
  // the accident that broke CI for three pushes.
  await db
    .delete(arLocalities)
    .where(
      and(
        inArray(arLocalities.indecId, [...FIXTURE_CABA_IDS]),
        inArray(arLocalities.sourceVersion, FIXTURE_SOURCE_VERSIONS),
      ),
    );
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
  // THE FENCE THAT KEEPS THE CLEANUP SAFE. Everything else in this file assumes
  // `cleanupFixtureRows` cannot destroy a live row; that assumption is only as
  // good as the ids, and the ids are a hand-maintained list in a CSV. It held
  // for months and then did not: `06028010` (Almirante Brown) and `50028010`
  // (Colonia Segovia) were real, and this suite had already deleted both from
  // the dev catalog before anyone noticed.
  it("uses only INDEC ids upstream cannot mint, and stamps every fixture row", () => {
    // Positions 3-5 of an INDEC id are the department; `999` is assigned in no
    // province, so a synthetic id can never name a real locality.
    for (const id of SYNTHETIC_FIXTURE_IDS) {
      expect(id.slice(2, 5), `${id} must use the impossible department 999`).toBe("999");
    }
    // NON-VACUITY: an empty list would pass the loop above in silence.
    expect(SYNTHETIC_FIXTURE_IDS.length).toBeGreaterThanOrEqual(5);

    // Every id in the CSV is accounted for here. A row added to the fixture and
    // not listed would never be cleaned up, and would leak into the catalog.
    const csvIds = csvFixture
      .split("\n")
      .slice(1)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(",")[9].replaceAll('"', ""));
    expect([...csvIds].sort()).toEqual([...FIXTURE_INDEC_IDS].sort());

    // The two REAL ids are the ONLY ones exempt from the rule above, and they
    // are exempt because the AR-C test needs them real. Anything else claiming
    // that exemption is a mistake.
    expect(FIXTURE_CABA_IDS.every((id) => id.startsWith("02"))).toBe(true);
  });

  // 60 s: one full import — upsert + soft-delete scan over ~4 k catalog rows.
  it("imports the fixture CSV: 3 valid rows, 3 skipped (paraje + 2 CABA), 2 errored", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    expect(stats.inserted).toBe(3);
    expect(stats.updated).toBe(0);
    expect(stats.noop).toBe(0);
    // "Paraje" (category filter) + the two AR-C comunas (superseded by
    // caba_open_data — CABA is its 48 barrios, never INDEC's tiling of it).
    expect(stats.skipped).toBe(3);
    expect(stats.supersededSkipped).toBe(2);
    expect(stats.errors).toHaveLength(2); // unknown province + missing name

    const rows = await db
      .select()
      .from(arLocalities)
      .where(eq(arLocalities.source, "indec_cppdyl"));

    const fixtureRows = rows.filter((r) =>
      FIXTURE_INDEC_IDS.includes(r.indecId as (typeof FIXTURE_INDEC_IDS)[number]),
    );
    expect(fixtureRows).toHaveLength(3);

    const mendoza = fixtureRows.find((r) => r.indecId === "50999010");
    expect(mendoza?.category).toBe("ciudad");
    expect(mendoza?.provinceCode).toBe("AR-M");

    const laPlata = fixtureRows.find((r) => r.indecId === "06999020");
    expect(laPlata?.provinceCode).toBe("AR-B");
    expect(laPlata?.category).toBe("localidad");
    expect(laPlata?.localitySlug).toBe("la-plata");
    expect(laPlata?.latitude).toBe("-34.9214000");
    expect(laPlata?.longitude).toBe("-57.9544000");

    const runs = await db
      .select()
      .from(arLocalitiesImportRuns)
      .where(eq(arLocalitiesImportRuns.sourceUrl, "https://test.example/fixture.csv"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("ok");
    expect(runs[0].insertedCount).toBe(3);
  }, 60_000);

  // THE CI BREAK, AS A TEST (2026-08-19 upstream change).
  //
  // INDEC replaced CABA's single department-less city-wide row with 15
  // per-Comuna rows. Every one carries a departamento_id, so
  // isWholeProvinceAggregate — which required department_code to be null — saw
  // none of them, and all 15 imported as active indec_cppdyl AR-C rows on every
  // CI bootstrap (`inserted=4023 … skipped=0`). Nothing noticed until
  // caba-barrios.test.ts counted 15 rows that should not exist.
  //
  // The rule was never about the shape. CABA IS its 48 caba_open_data barrios,
  // so NO indec_cppdyl row for AR-C belongs in the catalog at any granularity.
  it("drops EVERY indec_cppdyl row for AR-C, whatever granularity INDEC ships", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    const cabaIndec = await db
      .select({ id: arLocalities.id, indecId: arLocalities.indecId })
      .from(arLocalities)
      .where(
        and(
          eq(arLocalities.provinceCode, "AR-C"),
          eq(arLocalities.source, "indec_cppdyl"),
          isNull(arLocalities.removedAt),
        ),
      );
    expect(cabaIndec).toEqual([]);

    // Not merely inactive — never written at all, so a later blanket
    // "un-soft-delete" cannot resurrect them.
    const anyRow = await db
      .select({ id: arLocalities.id })
      .from(arLocalities)
      .where(inArray(arLocalities.indecId, [...FIXTURE_CABA_IDS]));
    expect(anyRow).toEqual([]);
  }, 60_000);

  // SELF-HEALING for the DBs that already ingested them. Staging and prod
  // bootstrapped after 2026-08-19 carry the 15 live comuna rows; the fix has to
  // clear them on the next import rather than needing a data migration.
  it("soft-deletes an AR-C indec row an EARLIER import already ingested", async () => {
    // Stand in for a pre-fix catalog: an active AR-C indec_cppdyl row.
    await db.insert(arLocalities).values({
      provinceCode: "AR-C",
      departmentCode: "02014",
      departmentName: "Comuna 2",
      localityName: "CABA - Comuna 2",
      localitySlug: "caba-comuna-2",
      indecId: "02014010",
      category: "componente",
      source: "indec_cppdyl",
      sourceVersion: "pre-fix",
    });

    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    const [row] = await db
      .select({ removedAt: arLocalities.removedAt })
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "02014010"));
    expect(row).toBeDefined();
    expect(row.removedAt).not.toBeNull();
  }, 60_000);

  // 60 s: first run triggers a full soft-delete scan; second run is fast
  // (all real rows already soft-deleted, nothing new to remove).
  it("is idempotent on re-run with the same CSV (3 noop, 0 changes)", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    // Re-run — re-mock fetch since vi.fn() was consumed
    global.fetch = vi.fn(async () => buildResponse());
    const second = await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.noop).toBe(3);
    // A skipped row stays skipped on every run — it must never oscillate
    // between "dropped" and "restored" across imports.
    expect(second.supersededSkipped).toBe(2);
  }, 60_000);

  // 90 s: beforeEach restores the full catalog before this test, so BOTH
  // import runs face the complete soft-delete scan (~4 k rows each).
  it("soft-deletes rows that disappear from the new CSV", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    await runImport({ sourceUrl: "https://test.example/fixture.csv" });

    // Now ship a CSV without La Plata (06999020). A CABA row would prove
    // nothing here: the importer never persisted it in the first place.
    const trimmedCsv = csvFixture
      .split("\n")
      .filter((line) => !line.includes('"06999020"'))
      .join("\n");
    global.fetch = vi.fn(
      async () =>
        new Response(trimmedCsv, {
          status: 200,
          // The marker again, not a plausible date — every row this file writes
          // must be identifiable as fixture residue by its source_version.
          headers: { "Last-Modified": FIXTURE_SOURCE_VERSION },
        }),
    );

    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });
    expect(stats.removed).toBe(1);

    const [laPlata] = await db
      .select()
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "06999020"));
    expect(laPlata.removedAt).not.toBeNull();
  }, 90_000);

  // The upstream header rename (2026-08-19): municipio_id / municipio_nombre
  // became gobierno_local_id / gobierno_local_nombre, and the column ORDER
  // moved `id` to the far side of them. The importer reads columns BY NAME
  // (csv-parse `columns: true`) and reads neither of the renamed ones, so this
  // is a no-op for us — but "we think it's a no-op" is not the same claim as
  // "the parse still produces the right rows", and only one of them is testable.
  it("parses the post-rename header shape (gobierno_local_*, reordered id)", async () => {
    const header = csvFixture.split("\n")[0];
    expect(header).toContain('"gobierno_local_id"');
    expect(header).toContain('"gobierno_local_nombre"');
    expect(header).not.toContain('"municipio_id"');

    global.fetch = vi.fn(async () => buildResponse());
    const stats = await runImport({ sourceUrl: "https://test.example/fixture.csv" });
    expect(stats.inserted).toBe(3);

    // The id column still lands on the right row despite moving position.
    const [laPlata] = await db
      .select({ name: arLocalities.localityName })
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "06999020"));
    expect(laPlata.name).toBe("La Plata");
  }, 60_000);

  // dry-run skips all DB writes and the soft-delete scan — stays fast.
  it("respects --dry-run: no writes, no run row persisted with finishedAt", async () => {
    global.fetch = vi.fn(async () => buildResponse());
    const stats = await runImport({
      dryRun: true,
      sourceUrl: "https://test.example/fixture.csv",
    });
    expect(stats.inserted).toBe(3);

    // No rows inserted — the catalog stays untouched.
    const fixtureRowsCount = await db
      .select({ id: arLocalities.id })
      .from(arLocalities)
      .where(eq(arLocalities.indecId, "06999020"));
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
    // Fixture has 3 importable rows (2 more are CABA, superseded).
    expect(stats.inserted).toBe(3);
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
    expect(stats.inserted).toBe(3);
  }, 60_000);
});
