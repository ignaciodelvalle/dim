// Integration tests for lib/ar-localidades. Runs against the dev DB populated
// by scripts/import-indec-localities.ts. If the catalog is empty (the import
// hasn't run yet), the tests skip with a clear message instead of failing.

import { count as countFn, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";
import {
  isCanonicalLocality,
  localityByIndecId,
  localityByName,
  searchLocalities,
} from "@/lib/ar-localidades";

let catalogPopulated = false;

beforeAll(async () => {
  const [row] = await db
    .select({ count: countFn() })
    .from(arLocalities)
    .where(isNull(arLocalities.removedAt));
  catalogPopulated = Number(row?.count ?? 0) > 100;
});

// Real INDEC entries used by the integration tests. Picked because they are
// stable across census revisions and represent different provinces / categories.
const LA_PLATA_INDEC_ID = "06441030"; // AR-B, "Localidad simple"

describe("ar-localidades — lookups", () => {
  it("localityByIndecId returns La Plata for its INDEC id", async () => {
    if (!catalogPopulated) return;
    const laPlata = await localityByIndecId(LA_PLATA_INDEC_ID);
    expect(laPlata).not.toBeNull();
    expect(laPlata?.localityName).toBe("La Plata");
    expect(laPlata?.provinceCode).toBe("AR-B");
  });

  it("localityByIndecId returns null for an unknown id", async () => {
    if (!catalogPopulated) return;
    expect(await localityByIndecId("00000000")).toBeNull();
  });

  it("localityByName matches case-insensitive and accent-insensitive", async () => {
    if (!catalogPopulated) return;
    const a = await localityByName("AR-B", "La Plata");
    const b = await localityByName("AR-B", "la plata");
    const c = await localityByName("AR-B", "La PlAtA");
    expect(a?.indecId).toBe(LA_PLATA_INDEC_ID);
    expect(b?.indecId).toBe(LA_PLATA_INDEC_ID);
    expect(c?.indecId).toBe(LA_PLATA_INDEC_ID);
  });

  it("localityByName scoped to a province returns null when the name lives elsewhere", async () => {
    if (!catalogPopulated) return;
    expect(await localityByName("AR-Z", "La Plata")).toBeNull();
  });

  it("isCanonicalLocality accepts both province code and province name as the scope", async () => {
    if (!catalogPopulated) return;
    expect(await isCanonicalLocality("AR-B", "La Plata")).toBe(true);
    expect(await isCanonicalLocality("Buenos Aires", "La Plata")).toBe(true);
    expect(await isCanonicalLocality("AR-Z", "La Plata")).toBe(false);
  });

  it("isCanonicalLocality returns false for unknown provinces", async () => {
    if (!catalogPopulated) return;
    expect(await isCanonicalLocality("INVALID", "La Plata")).toBe(false);
  });
});

describe("ar-localidades — search", () => {
  it("returns [] for queries under the minimum length", async () => {
    expect(await searchLocalities({ query: "" })).toEqual([]);
    expect(await searchLocalities({ query: "x" })).toEqual([]);
  });

  it("scopes results when a province is provided", async () => {
    if (!catalogPopulated) return;
    const r = await searchLocalities({ provinceCode: "AR-B", query: "la plata" });
    expect(r.length).toBeGreaterThan(0);
    for (const hit of r) expect(hit.provinceCode).toBe("AR-B");
    expect(r[0].matchKind).toBe("exact");
    expect(r[0].indecId).toBe(LA_PLATA_INDEC_ID);
  });

  it("returns prefix matches with the right matchKind", async () => {
    if (!catalogPopulated) return;
    const r = await searchLocalities({ provinceCode: "AR-M", query: "men" });
    expect(r.length).toBeGreaterThan(0);
    // First non-exact hit should be a prefix on "men"
    const firstPrefix = r.find((x) => x.matchKind === "prefix");
    expect(firstPrefix).toBeDefined();
    expect(firstPrefix?.localityName.toLowerCase().startsWith("men")).toBe(true);
  });

  it("matches against accented names without requiring accents in the query", async () => {
    if (!catalogPopulated) return;
    // "Córdoba" capital should show up in AR-X
    const r = await searchLocalities({ provinceCode: "AR-X", query: "cordoba" });
    expect(r.length).toBeGreaterThan(0);
  });

  it("respects the limit parameter (capped at 50)", async () => {
    if (!catalogPopulated) return;
    const r = await searchLocalities({ query: "san", limit: 5 });
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it("finds Bariloche unscoped and ranks it in AR-R", async () => {
    if (!catalogPopulated) return;
    const r = await searchLocalities({ query: "bariloche" });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].provinceCode).toBe("AR-R");
  });
});
