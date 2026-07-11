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

import { asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, panoramaCube, panoramaCubeMeta } from "@/db";
import type { DashboardActor } from "@/lib/metrics";

import type { LayerId } from "../../domain/types";
import type { AggregationLevel } from "../../domain/types";
import { refreshCube } from "../../infrastructure/cube-builder";
import { getLayerFeatures } from "../get-layer-features";
import type { LayerFeaturesResult } from "../get-layer-features";
import { loadLayerFeaturesFromCube } from "../load-layer-features-cube";

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
}, 240_000);

afterAll(() => {
  // "" reads as disabled (≠ '1'), restoring the absent-flag behavior.
  process.env.CUBE_READS = prevFlag ?? "";
});

// Cube-eligible combos (byte-identical to live): national+province, and BOTH grains
// for a whole-province drill. National+department is the truncated live view (capped
// at PER_LAYER_CAP) — NOT cube-served — and is asserted to fall back below.
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

  it("national + department view is NOT cube-served (truncated live) → falls back", async () => {
    const cube = await loadLayerFeaturesFromCube("microchip", ADMIN, "locality");
    expect(cube).toBeNull();
  });
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
