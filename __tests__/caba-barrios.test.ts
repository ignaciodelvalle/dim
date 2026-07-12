// Smoke tests for the CABA barrios import (plan
// 2026-05-19-caba-barrios-import-execution). The script
// `scripts/import-caba-barrios.ts` is idempotent — these tests just
// assert the catalog is populated and queryable.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";
import { searchLocalities } from "@/lib/infra/ar-localidades";

// Guard against DB-state pollution from import-indec-localities.test.ts.
// That test file inserts fixture indec_cppdyl rows for AR-C (INDEC IDs
// "02014010"=Palermo, "02002010"=Recoleta) and soft-deletes the real CABA
// catch-all. If its afterAll cleanup didn't complete (e.g. a prior test run
// timed out), those stale rows skew the count assertions below.
const INDEC_FIXTURE_AR_C_IDS = ["02014010", "02002010"] as const;

beforeAll(async () => {
  // Remove any fixture indec_cppdyl rows for AR-C left by import-indec tests
  // (Palermo/Recoleta) so their stale rows don't skew the barrio counts below.
  for (const id of INDEC_FIXTURE_AR_C_IDS) {
    await db.delete(arLocalities).where(eq(arLocalities.indecId, id));
  }
  // NOTE: we deliberately do NOT restore the CABA whole-city catch-all
  // ("Ciudad Autónoma de Buenos Aires", indec_id 02000010). It is a
  // whole-province aggregate the INDEC importer drops on ingest (it double-
  // counts the 48 barrios tiling the same city) and the locality-integrity gate
  // (scripts/check-locality-integrity.ts) requires it to stay soft-deleted.
  // A blanket restore here was the source of the recurring "CABA locality
  // zombie" — it resurrected the exact aggregate the whole system is built to
  // drop, re-failing lint:locality after every full-suite run (2026-07-11).
});

describe("CABA barrios — Ley 1.777 import", () => {
  it("has exactly 48 active barrios in ar_localities", async () => {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(arLocalities)
      .where(
        and(
          eq(arLocalities.provinceCode, "AR-C"),
          eq(arLocalities.source, "caba_open_data"),
          isNull(arLocalities.removedAt),
        ),
      );
    expect(row.c).toBe(48);
  });

  it("ships a non-NULL centroid (latitude+longitude) for every barrio", async () => {
    // Panorama centroid-snapping (repository.ts) drops any barrio row without
    // coordinates, so every imported barrio MUST carry its frozen centroid.
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(arLocalities)
      .where(
        and(
          eq(arLocalities.provinceCode, "AR-C"),
          eq(arLocalities.source, "caba_open_data"),
          isNull(arLocalities.removedAt),
          sql`${arLocalities.latitude} IS NOT NULL AND ${arLocalities.longitude} IS NOT NULL`,
        ),
      );
    expect(row.c).toBe(48);
  });

  it("drops the INDEC whole-city CABA aggregate (CABA is its 48 barrios)", async () => {
    // The city-wide "Ciudad Autónoma de Buenos Aires" catch-all (indec_id
    // 02000010) is a whole-province aggregate: it duplicates its own province
    // and double-counts the barrios tiling it. The importer drops it on ingest
    // and the locality-integrity gate (lib/reference/locality-integrity.ts)
    // requires it to stay soft-deleted, so NO active indec_cppdyl row may
    // remain for AR-C — CABA is represented by its 48 caba_open_data barrios.
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(arLocalities)
      .where(
        and(
          eq(arLocalities.provinceCode, "AR-C"),
          eq(arLocalities.source, "indec_cppdyl"),
          isNull(arLocalities.removedAt),
        ),
      );
    expect(row.c).toBe(0);
  });

  it("includes Palermo, Boedo, and La Boca with accents preserved", async () => {
    const rows = await db
      .select({ name: arLocalities.localityName })
      .from(arLocalities)
      .where(
        and(
          eq(arLocalities.provinceCode, "AR-C"),
          inArray(arLocalities.localityName, ["Palermo", "Boedo", "La Boca", "Núñez"]),
          isNull(arLocalities.removedAt),
        ),
      );
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["Boedo", "La Boca", "Núñez", "Palermo"]);
  });
});

describe("CABA barrios — typeahead ranking", () => {
  it("'Pal' returns Palermo as the top result when scoped to CABA", async () => {
    const results = await searchLocalities({ provinceCode: "AR-C", query: "Pal" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].localityName).toBe("Palermo");
  });

  it("'Boed' returns Boedo first", async () => {
    const results = await searchLocalities({ provinceCode: "AR-C", query: "Boed" });
    expect(results[0].localityName).toBe("Boedo");
  });

  it("'Núñ' (accented) returns Núñez first", async () => {
    const results = await searchLocalities({ provinceCode: "AR-C", query: "Núñ" });
    expect(results[0].localityName).toBe("Núñez");
  });
});
