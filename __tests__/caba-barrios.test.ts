// Smoke tests for the CABA barrios import (plan
// 2026-05-19-caba-barrios-import-execution). The script
// `scripts/import-caba-barrios.ts` is idempotent — these tests just
// assert the catalog is populated and queryable.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";
import { searchLocalities } from "@/lib/ar-localidades";

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

  it("preserves the INDEC catch-all CABA entry alongside the barrios", async () => {
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
    expect(row.c).toBe(1);
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
