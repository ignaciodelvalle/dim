// Aggregate cube (migration 0139) — the correctness contract for the TS builder.
//
// Integration test — local Supabase + Postgres. Runs the REAL builder against the
// seed, then asserts:
//   (a) PARITY — for every choropleth metric × {province, department} level, for
//       admin-national AND an admin province drill (La Pampa flagship), the cube
//       reader's LayerFeaturesResult is field-for-field identical to the live
//       getLayerFeatures (features + truncated + suppressedCount + noLocalityCount
//       + level). This is the guard against builder/loader drift.
//   (b) SUB-K INVARIANT — no readable department row carries an unsuppressed
//       0 < value < 5, and no province group has exactly ONE suppressed cell with
//       a visible sibling (the differencing-defense property complementarySuppress
//       must have enforced at build).
//   (c) STALENESS GATE — a non-ok / too-old cube makes the reader return null
//       (caller falls back to live).
//   (d) IDEMPOTENCY — running the builder twice yields the same rows and advances
//       the meta build timestamp.

import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, panoramaCube, panoramaCubeMeta, panoramaKpiCube, panoramaKpiCubeMeta } from "@/db";
import type { AnalyticsPeriod, DashboardActor } from "@/lib/metrics";
import { buildProjectionContext } from "@/lib/metrics";
import { fetchNetGrowth } from "@/lib/metrics/population-control";

import type { LayerId } from "../../domain/types";
import type { AggregationLevel } from "../../domain/types";
import { refreshCube } from "../../infrastructure/cube-builder";
import { getLayerFeatures } from "../get-layer-features";
import type { LayerFeaturesResult } from "../get-layer-features";
import { getPanoramaKpis } from "../get-panorama-kpis";
import { loadLayerFeaturesFromCube } from "../load-layer-features-cube";
import {
  KPI_CUBE_BIRTHS_KPI,
  KPI_CUBE_SCOPE_NATIONAL,
  loadPanoramaKpisFromCube,
} from "../load-panorama-kpis-cube";

const ADMIN: DashboardActor = { role: "admin" };
// Choropleth layers ignore the period entirely (current-state) — any `since` works.
const PERIOD = { since: new Date(0) };
const DRILL_PROVINCE = "La Pampa"; // Pampa flagship province (DIM-PAMP-0001).
// CB2 — cover the two cube-SERVED shapes La Pampa alone never exercises:
//   - CABA: the barrio-fold branch (build-features BARRIO_ONLY_PROVINCE) — CABA has
//     no departamentos, so its detail grain folds to barrios, a distinct code path.
//   - Buenos Aires: a large multi-department province whose LOCALITY-grain drill
//     folds hundreds of localities into partidos — the high-cardinality fold + the
//     `truncated` flag that La Pampa (small) never stresses.
const DRILL_CABA = "CABA";
const DRILL_BA = "Buenos Aires";

const CHOROPLETH_LAYERS: LayerId[] = [
  "cobertura",
  "esterilizacion",
  "microchip",
  "ppp",
  "mortalidad",
];

/** Order-independent normalized view of a FeatureCollection (geometry + props). */
function normFeatures(result: LayerFeaturesResult): string[] {
  return result.features.features
    .map((f) => JSON.stringify({ g: f.geometry, p: f.properties }))
    .sort();
}

const prevFlag = process.env.CUBE_READS;

beforeAll(async () => {
  process.env.CUBE_READS = "1";
  const r = await refreshCube();
  expect(r.status).toBe("ok");
  expect(r.rowCount).toBeGreaterThan(0);
  // The KPI-strip phase (migration 0151) rides the same refresh run.
  expect(r.kpi.status).toBe("ok");
  expect(r.kpi.rowCount).toBeGreaterThan(0);
}, 240_000);

afterAll(() => {
  // "" reads as disabled (≠ '1'), restoring the absent-flag behavior.
  process.env.CUBE_READS = prevFlag ?? "";
});

// Cube-eligible combos (set-equal, order-independent, to live): national+province, and
// BOTH grains for a whole-province drill. National+department is ALSO cube-served now,
// but as a deliberate SUPERSET over the truncated live view (capped at PER_LAYER_CAP) —
// asserted separately below (superset containment, not set-equality).
const ELIGIBLE: { level: AggregationLevel; drill?: string }[] = [
  { level: "province", drill: undefined },
  { level: "province", drill: DRILL_PROVINCE },
  { level: "locality", drill: DRILL_PROVINCE },
  // CB2 — CABA (barrio-fold branch) at both grains.
  { level: "province", drill: DRILL_CABA },
  { level: "locality", drill: DRILL_CABA },
  // CB2 — Buenos Aires (large multi-department province) at both grains.
  { level: "province", drill: DRILL_BA },
  { level: "locality", drill: DRILL_BA },
];

describe("cube == live parity (5 metrics; national+province + whole-province drill)", () => {
  for (const layer of CHOROPLETH_LAYERS) {
    for (const { level, drill } of ELIGIBLE) {
      const scopeLabel = drill ? `drill ${drill}` : "national";
      it(`${layer} @ ${level} — ${scopeLabel}`, async () => {
        const [live, cube] = await Promise.all([
          getLayerFeatures(layer, ADMIN, [], PERIOD, level, drill),
          loadLayerFeaturesFromCube(layer, ADMIN, level, drill),
        ]);
        expect(cube, "cube must serve this eligible request").not.toBeNull();
        const cubeResult = cube as NonNullable<typeof cube>;

        // Envelope parity.
        expect(cubeResult.result.level).toBe(live.level);
        expect(cubeResult.result.suppressedCount).toBe(live.suppressedCount);
        expect(cubeResult.result.noLocalityCount).toBe(live.noLocalityCount);
        expect(cubeResult.result.truncated).toBe(live.truncated);

        // Feature parity (order-independent, geometry + properties).
        expect(normFeatures(cubeResult.result)).toEqual(normFeatures(live));
        // CB2: 180s per case. The LIVE side of a large-province LOCALITY drill is far
        // slower than the 5s default — the cobertura rabies trailing-12m EXISTS over
        // every Buenos Aires locality measures ~96s live (exactly the query the cube
        // exists to replace; the cube read itself is instant). This bounds only the
        // live comparison the parity assertion needs, never the cube path.
      }, 180_000);
    }
  }

  it("national + department view IS cube-served as a SUPERSET over the truncated live set", async () => {
    const [live, cube] = await Promise.all([
      getLayerFeatures("microchip", ADMIN, [], PERIOD, "locality"),
      loadLayerFeaturesFromCube("microchip", ADMIN, "locality"),
    ]);
    expect(cube, "cube must serve national+department").not.toBeNull();
    const cubeResult = (cube as NonNullable<typeof cube>).result;

    // The cube national+department envelope is a SUPERSET over the live global
    // cap (built per province, so it ADDS the departments the live path dropped).
    // Its `truncated` is DERIVED from the per-province build flags (den=1), NOT
    // hardcoded — on this seed no province's own rollup hit PER_LAYER_CAP, so it
    // is honestly false; a real BA-scale build that capped a province would flip
    // it true (the honest signal an operator needs). The live path IS truncated
    // here — that global-cap truncation is exactly the defect the cube supersedes.
    expect(cubeResult.level).toBe("locality");
    expect(cubeResult.truncated).toBe(false); // seed: no province build was capped
    expect(live.truncated).toBe(true);

    // Key each department cell (CABA barrios carry no departmentCode → key by name).
    type CellProps = {
      departmentCode?: string | null;
      province?: string;
      locality?: string;
      value?: number | null;
      suppressed?: boolean;
    };
    const keyOf = (p: CellProps) =>
      p.departmentCode ? `d:${p.departmentCode}` : `b:${p.province ?? ""}:${p.locality ?? ""}`;
    const index = (r: LayerFeaturesResult) => {
      const m = new Map<string, CellProps>();
      for (const f of r.features.features) {
        const p = (f.properties ?? {}) as CellProps;
        m.set(keyOf(p), p);
      }
      return m;
    };
    const liveByKey = index(live);
    const cubeByKey = index(cubeResult);

    // (1) COVERAGE SUPERSET: every department visible live is present in the cube
    // (the cube only ever ADDS the departments the live PER_LAYER_CAP truncation
    // dropped — it never loses one).
    for (const key of liveByKey.keys()) {
      expect(cubeByKey.has(key), `live department ${key} must exist in the cube superset`).toBe(
        true,
      );
    }
    // The cube covers at least as many departments as the truncated live set.
    expect(cubeByKey.size).toBeGreaterThanOrEqual(liveByKey.size);

    // (2) VALUES COMPLETE THE PARTIAL SUM: live truncates localities BEFORE folding
    // to departments, so a partially-truncated department's live value is an
    // undercount. The cube (complete per-province) is therefore ≥ the live value on
    // every overlapping VISIBLE department — the cube never undercounts the live set.
    for (const [key, lp] of liveByKey) {
      const cp = cubeByKey.get(key);
      if (!cp) continue;
      if (typeof lp.value === "number" && typeof cp.value === "number") {
        expect(
          cp.value,
          `cube must not undercount live for ${key} (cube ${cp.value} < live ${lp.value})`,
        ).toBeGreaterThanOrEqual(lp.value);
      }
    }
  }, 180_000);
});

describe("sub-k invariant (privacy floor baked into the readable surface)", () => {
  it("no unsuppressed department row has 0 < value < 5", async () => {
    const rows = await db.select().from(panoramaCube);
    const leaks = rows.filter(
      (r) =>
        r.unitLevel === "department" &&
        !r.suppressed &&
        r.value != null &&
        Number(r.value) > 0 &&
        Number(r.value) < 5,
    );
    expect(leaks).toEqual([]);
  });

  it("no province group has exactly one suppressed department with a visible sibling", async () => {
    const rows = await db.select().from(panoramaCube);
    // group department rows by (metric, province)
    const groups = new Map<string, { suppressed: number; visible: number }>();
    for (const r of rows) {
      if (r.unitLevel !== "department") continue;
      const key = `${r.metric}|${r.province}`;
      const g = groups.get(key) ?? { suppressed: 0, visible: 0 };
      if (r.suppressed) g.suppressed += 1;
      else g.visible += 1;
      groups.set(key, g);
    }
    const differenceable = [...groups.entries()].filter(
      ([, g]) => g.suppressed === 1 && g.visible >= 1,
    );
    expect(differenceable).toEqual([]);
  });
});

describe("staleness gate falls back to live", () => {
  it("status != 'ok' → reader returns null", async () => {
    await db.update(panoramaCubeMeta).set({ status: "error" });
    const r = await loadLayerFeaturesFromCube("cobertura", ADMIN, "province");
    expect(r).toBeNull();
    // restore
    await db.update(panoramaCubeMeta).set({ status: "ok" });
  });

  it("built_at older than STALE_MAX → reader returns null", async () => {
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7h > 6h STALE_MAX
    await db.update(panoramaCubeMeta).set({ builtAt: old, status: "ok" });
    const r = await loadLayerFeaturesFromCube("cobertura", ADMIN, "province");
    expect(r).toBeNull();
    // restore a fresh build for any later reads
    await db.update(panoramaCubeMeta).set({ builtAt: new Date() });
  });
});

// ---------------------------------------------------------------------------
// KPI-strip cube (migration 0151) — the honesty fence for the whole feature:
// for the seeded dataset, a cube-read strip must equal the live-read strip.
// ---------------------------------------------------------------------------

/** The period the KPI cube was built for (stored on its meta row). Passing it
 * VERBATIM to the live fan-out makes the comparison window-identical — the only
 * residual nondeterminism is the handful of now-anchored fixed windows inside
 * the fetchers (e.g. perdidas "recuperadas 30d"), whose boundary would have to
 * cross a seeded event within the seconds between build and assertion. */
async function storedKpiPeriod(): Promise<AnalyticsPeriod> {
  const [meta] = await db.select().from(panoramaKpiCubeMeta);
  expect(meta?.periodSince).toBeTruthy();
  expect(meta?.periodUntil).toBeTruthy();
  return {
    since: meta.periodSince as Date,
    until: meta.periodUntil as Date,
  };
}

describe("KPI strip cube == live parity (admin national, panorama default period)", () => {
  it("cube-served strip equals the live fan-out field-for-field", async () => {
    const period = await storedKpiPeriod();
    const [cube, live] = await Promise.all([
      loadPanoramaKpisFromCube({ actor: ADMIN, jurisdictions: [], period }),
      getPanoramaKpis(ADMIN, [], period),
    ]);
    expect(cube, "cube must serve the eligible admin-national request").not.toBeNull();
    const served = (cube as NonNullable<typeof cube>).value;

    // Envelope parity: tiles (order included — display order is contract),
    // caption, freshness, and the footer denominator. `toEqual` treats an
    // undefined property and an absent one as equal, which is exactly the
    // jsonb round-trip's behavior (undefined fields are dropped at store).
    expect(served.kpis).toEqual(live.kpis);
    expect(served.recalculatedFor).toBe(live.recalculatedFor);
    expect(served.dataAsOf).toBe(live.dataAsOf);
    expect(served.coverageDenominator).toEqual(live.coverageDenominator ?? null);
    // A cube strip is never the degraded payload (builder honesty fence).
    expect(served.degraded).toBeUndefined();
    expect(served.kpis.some((k) => k.unavailable)).toBe(false);
  }, 180_000);

  it("births row (the cubed pregnancy/litter gap) equals live fetchNetGrowth", async () => {
    const period = await storedKpiPeriod();
    const [row] = await db
      .select()
      .from(panoramaKpiCube)
      .where(
        and(
          eq(panoramaKpiCube.scope, KPI_CUBE_SCOPE_NATIONAL),
          eq(panoramaKpiCube.kpi, KPI_CUBE_BIRTHS_KPI),
        ),
      );
    expect(row, "the builder must store a births row").toBeTruthy();
    // position NULL = not a strip tile — never assembled into the served strip.
    expect(row.position).toBeNull();
    const live = await fetchNetGrowth(buildProjectionContext(ADMIN, [], period));
    expect(row.payload).toEqual(live);
    // And indeed the served strip carries no births tile (no such tile exists).
    const cube = await loadPanoramaKpisFromCube({ actor: ADMIN, jurisdictions: [], period });
    expect(
      (cube as NonNullable<typeof cube>).value.kpis.some(
        (k) => (k.id as string) === KPI_CUBE_BIRTHS_KPI,
      ),
    ).toBe(false);
  }, 60_000);
});

describe("KPI cube eligibility + staleness gates fall back to live (null)", () => {
  it("ineligible requests: flag off / non-admin / drill / scrub / scoped / period mismatch", async () => {
    const period = await storedKpiPeriod();
    const eligible = { actor: ADMIN, jurisdictions: [], period };

    process.env.CUBE_READS = "";
    expect(await loadPanoramaKpisFromCube(eligible)).toBeNull();
    process.env.CUBE_READS = "1";

    expect(await loadPanoramaKpisFromCube({ ...eligible, actor: { role: "govt" } })).toBeNull();
    expect(
      await loadPanoramaKpisFromCube({ ...eligible, adminProvince: DRILL_PROVINCE }),
    ).toBeNull();
    expect(await loadPanoramaKpisFromCube({ ...eligible, asOf: new Date() })).toBeNull();
    expect(
      await loadPanoramaKpisFromCube({
        ...eligible,
        jurisdictions: [{ province: "La Pampa", locality: "Santa Rosa" }],
      }),
    ).toBeNull();
    // A different preset (12m vs the stored 3y) misses the period gate.
    const twelveMonths: AnalyticsPeriod = {
      since: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      until: new Date(),
    };
    expect(await loadPanoramaKpisFromCube({ ...eligible, period: twelveMonths })).toBeNull();
  }, 60_000);

  it("meta status != 'ok' → null; built_at older than STALE_MAX → null", async () => {
    const period = await storedKpiPeriod();
    const eligible = { actor: ADMIN, jurisdictions: [], period };

    await db.update(panoramaKpiCubeMeta).set({ status: "error" });
    expect(await loadPanoramaKpisFromCube(eligible)).toBeNull();
    await db.update(panoramaKpiCubeMeta).set({ status: "ok" });

    const old = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7h > 6h STALE_MAX
    await db.update(panoramaKpiCubeMeta).set({ builtAt: old });
    expect(await loadPanoramaKpisFromCube(eligible)).toBeNull();
    // restore a fresh stamp for any later reads
    await db.update(panoramaKpiCubeMeta).set({ builtAt: new Date() });
  }, 60_000);
});

describe("builder idempotency", () => {
  it("running the builder twice yields the same rows and advances built_at", async () => {
    const before = await db.select().from(panoramaCube).orderBy(asc(panoramaCube.unitCode));
    const [metaBefore] = await db.select().from(panoramaCubeMeta);

    const r = await refreshCube();
    expect(r.status).toBe("ok");

    const after = await db.select().from(panoramaCube).orderBy(asc(panoramaCube.unitCode));
    const [metaAfter] = await db.select().from(panoramaCubeMeta);

    // Same row set (content-identical, ignoring row order via the shared ordering).
    const norm = (rows: typeof before) =>
      rows
        .map((x) => JSON.stringify(x))
        .sort()
        .join("\n");
    expect(norm(after)).toBe(norm(before));
    expect(metaAfter.rowCount).toBe(metaBefore.rowCount);
    // built_at advanced (or stayed equal only if the two runs landed in the same ms).
    expect(metaAfter.builtAt?.getTime() ?? 0).toBeGreaterThanOrEqual(
      metaBefore.builtAt?.getTime() ?? 0,
    );
  }, 240_000);
});
