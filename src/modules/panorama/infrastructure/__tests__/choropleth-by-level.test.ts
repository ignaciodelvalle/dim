// DB-backed integration tests for the U5 aggregation-axis rollup.
//
// These run against the local Postgres seeded by `seed:panorama`
// (vitest.config.ts → setup.ts forces 127.0.0.1:54322). They verify the CORE
// U5 invariant the spec asserts: a PROVINCE rollup equals the SUM of its
// LOCALITY rollups, because both share the same metric predicate + scope and
// differ only in the GROUP BY. They also check province coverage (≤24 valid
// jurisdictions), k-anon asymmetry (locality suppresses small cells; province
// never does), and the level-overload routing.
//
// PERFORMANCE NOTE: at panorama-seed scale (~45k pets) the rabies-coverage
// LOCALITY rollup is pathologically slow (~50s) because its centroid join uses
// a functional `unaccent(regexp_replace(...))` predicate with no functional
// index AND an EXISTS rabies subquery over the full table — a PRE-EXISTING
// characteristic of loadRabiesCoverage, not U5. The MORTALITY rollups are fast
// (status='deceased' filters to ~150 rows before the join), and the rabies
// PROVINCE rollup is fast (no centroid join). So we exercise:
//   - the locality-level invariant via MORTALITY (fast + real), and
//   - the province path via both metrics (both fast).
// The rabies locality path is covered structurally (the metric predicate is
// shared verbatim by both levels) + by the mocked use-case unit tests.
//
// Admin scope (universal) is used so the rollups see the whole seeded dataset.

import { describe, expect, it } from "vitest";

import type { DashboardActor } from "@/lib/metrics";
import { PROVINCES } from "@/lib/reference/ar-provincias";

import {
  loadChoroplethByLevel,
  loadMortality,
  loadMortalityByProvince,
  loadRabiesCoverageByProvince,
} from "../repository";

const ADMIN: DashboardActor = { role: "admin" };
const VALID_CODES = new Set<string>(PROVINCES.map((p) => p.code));

// Province display name → ISO code (the repository maps this internally; we
// mirror it here to bucket locality cells back to their province for the sum).
const NAME_TO_CODE = new Map<string, string>(PROVINCES.map((p) => [p.name, p.code]));

describe("U5 rollup — province total equals the sum of its localities (mortality)", () => {
  it("province cells reconcile with their constituent locality cells", async () => {
    const [prov, loc] = await Promise.all([
      loadMortalityByProvince(ADMIN, []),
      loadMortality(ADMIN, []),
    ]);

    const provTotalByCode = new Map<string, number>();
    for (const c of prov.cells) provTotalByCode.set(c.provinceCode, c.value);

    // The locality cells are k-anon'd: a SUPPRESSED cell carries value=null, its
    // true count hidden in [1, 4] (k=5). So the EXACT province total is
    //   sum(visible locality values) + sum(hidden suppressed counts).
    // We can't read the hidden counts, but each is in [1,4], so the province
    // total MUST fall within a tight, privacy-respecting bound:
    //   visibleSum + suppressedCount*1 <= provTotal <= visibleSum + suppressedCount*4
    // This proves consistency (province == sum of localities) WITHOUT leaking the
    // suppressed counts. Where a province has NO suppressed localities, it is exact.
    const visibleSumByCode = new Map<string, number>();
    const suppressedCountByCode = new Map<string, number>();
    for (const cell of loc.cells) {
      const code = NAME_TO_CODE.get(cell.province);
      if (!code) continue;
      if (cell.suppressed) {
        suppressedCountByCode.set(code, (suppressedCountByCode.get(code) ?? 0) + 1);
      } else {
        visibleSumByCode.set(code, (visibleSumByCode.get(code) ?? 0) + (cell.value ?? 0));
      }
    }

    let provincesChecked = 0;
    for (const [code, provTotal] of provTotalByCode) {
      const visibleSum = visibleSumByCode.get(code) ?? 0;
      const suppressed = suppressedCountByCode.get(code) ?? 0;
      expect(provTotal).toBeGreaterThanOrEqual(visibleSum + suppressed);
      expect(provTotal).toBeLessThanOrEqual(visibleSum + suppressed * 4);
      // Exact equality where there is nothing suppressed to hide.
      if (suppressed === 0) expect(provTotal).toBe(visibleSum);
      provincesChecked += 1;
    }

    // Every province cell must reconcile against the locality partition.
    expect(provincesChecked).toBeGreaterThan(0);
    expect(provincesChecked).toBe(provTotalByCode.size);
  }, 30_000);
});

describe("U5 province choropleth coverage", () => {
  it("returns at most 24 cells, each a valid AR jurisdiction code with a positive value", async () => {
    const prov = await loadMortalityByProvince(ADMIN, []);
    expect(prov.cells.length).toBeGreaterThan(0);
    expect(prov.cells.length).toBeLessThanOrEqual(24);
    const seen = new Set<string>();
    for (const c of prov.cells) {
      expect(VALID_CODES.has(c.provinceCode)).toBe(true);
      expect(c.value).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      // No duplicate province cells (one row per province).
      expect(seen.has(c.provinceCode)).toBe(false);
      seen.add(c.provinceCode);
    }
  }, 30_000);
});

describe("U5 k-anon asymmetry", () => {
  it("province cells are NEVER suppressed (large cells, no k-anon)", async () => {
    // Rabies PROVINCE rollup (fast: no centroid join). Even values below the
    // locality k=5 threshold are shown at province level — no suppression.
    const prov = await loadRabiesCoverageByProvince(ADMIN, []);
    expect(prov).not.toHaveProperty("suppressedCount");
    expect(prov.cells.length).toBeGreaterThan(0);
    for (const c of prov.cells) {
      expect(typeof c.value).toBe("number");
    }
  }, 30_000);

  it("locality cells keep k=5 suppression (suppressed cells carry no value)", async () => {
    const loc = await loadMortality(ADMIN, []);
    // Contract: any suppressed cell carries value=null and is counted in
    // suppressedCount; any visible cell carries a value >= 5 (k-anon, k=5).
    let suppressedSeen = 0;
    for (const cell of loc.cells) {
      if (cell.suppressed) {
        expect(cell.value).toBeNull();
        suppressedSeen += 1;
      } else {
        expect(cell.value ?? 0).toBeGreaterThanOrEqual(5);
      }
    }
    expect(loc.suppressedCount).toBe(suppressedSeen);
  }, 30_000);
});

describe("U5 loadChoroplethByLevel overload routing", () => {
  it("level='province' yields ProvinceChoroplethRows (no suppressedCount, code cells)", async () => {
    const rows = await loadChoroplethByLevel("mortality", "province", ADMIN, []);
    expect(rows).not.toHaveProperty("suppressedCount");
    expect(rows.cells.every((c) => "provinceCode" in c)).toBe(true);
  }, 30_000);

  it("level='locality' yields ChoroplethRows (suppressedCount, centroid cells)", async () => {
    const rows = await loadChoroplethByLevel("mortality", "locality", ADMIN, []);
    expect(rows).toHaveProperty("suppressedCount");
    expect(rows.cells.every((c) => "centroidLat" in c)).toBe(true);
  }, 30_000);

  it("province routing agrees with the direct loader for the same metric", async () => {
    const [viaLevel, direct] = await Promise.all([
      loadChoroplethByLevel("mortality", "province", ADMIN, []),
      loadMortalityByProvince(ADMIN, []),
    ]);
    // Same metric + level + scope → identical province totals.
    const a = new Map(viaLevel.cells.map((c) => [c.provinceCode, c.value]));
    const b = new Map(direct.cells.map((c) => [c.provinceCode, c.value]));
    expect(a).toEqual(b);
  }, 30_000);
});
