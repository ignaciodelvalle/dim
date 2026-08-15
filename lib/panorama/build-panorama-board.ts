// Shared board assembly for the two panorama Server Components —
// app/admin/panorama/page.tsx and app/gob/panorama/page.tsx (WP3 of the
// decrowding program: the two pages were ~74% the same ~450-line file).
//
// Lives in lib/panorama next to scope-label.ts, the established home for
// page-shared panorama code. Returns a spreadable PROPS object (no JSX) so the
// pages keep ownership of <PanoramaShell> and of everything genuinely
// role-specific: admin keeps its centroid-derived initialBounds + demo
// disclosure; gob keeps the widest-jurisdiction derivation, the out-of-scope
// bounce, the division seeding and its jurisdictionBounds. Both pass their own
// `seedLevel` and `defaultPresetId` — the two real parameterization axes.
//
// Server-only: runs inside the pages' Suspense boundary; every DB touch is
// bounded (withDbBudget / loadCachedPanoramaKpis) — this module is a registered
// scan target of scripts/check-db-budget.ts (the fan-out relocated here from
// the two pages; the scan target moves with it).

import type { SeededLayer } from "@/components/panorama/panorama-console-helpers";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { panoramaScopeLabel } from "@/lib/panorama/scope-label";
import type { ViewScopeAuthority } from "@/lib/ui/view-scope-descriptor";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";
import { emptyLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import {
  type PanoramaKpis,
  degradedPanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import {
  type LayerFeaturesSourced,
  loadLayerFeaturesCubeOrCached,
  loadLayerFeaturesCubeOrCachedWithMeta,
} from "@/src/modules/panorama/application/load-layer-features-cube";
import { loadCachedPanoramaKpis } from "@/src/modules/panorama/application/load-panorama-kpis";
import type { PanoramaRequestScope } from "@/src/modules/panorama/application/resolve-request-scope";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import { type PresetId, getPreset, presetLayerIds } from "@/src/modules/panorama/domain/presets";
import type {
  AggregationLevel,
  FeatureCollection,
  PanoramaLayer,
} from "@/src/modules/panorama/domain/types";

// Server-render budget for the two concurrent fan-outs (task #74). On expiry (or
// a fetcher rejection, caught below) the page renders a degraded-but-honest state
// — empty map + "no pudimos cargar los indicadores" — instead of hanging the RSC
// stream forever (the staging incident: skeletons that never resolve).
export const PAGE_BUDGET_MS = 9000;

/** The RESOLVED search params both panorama pages accept (pages wrap this in
 * the framework's Promise: `type PanoramaSearchParams = Promise<...>`). */
export type PanoramaBoardSearchParams = {
  period?: string;
  from?: string;
  to?: string;
  province?: string;
  locality?: string;
  // perf plan 1.2: a first visit carries NONE of period/preset/layers (nor a
  // custom from/to window) — the signal to seed the role-default preset.
  preset?: string;
  layers?: string;
  // Round-2 review #5: the temporal-scrub cutoff from a "Copiar vista" deep link.
  asOf?: string;
};

/** The PanoramaShell props the shared assembly resolves — pages spread this and
 * add their role-specific props (bounds, provinces list, divisions, demo). */
export type PanoramaBoardProps = {
  scopeLabel: string;
  boundedJurisdiction: boolean;
  scopeAuthority: ViewScopeAuthority;
  layer: PanoramaLayer;
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  kpisPromise: Promise<PanoramaKpis>;
  initialLevel: AggregationLevel;
  defaultPresetId: PresetId;
  cubeBuiltAt: Date | null;
  seededPresetId?: PresetId;
  seededLayers?: SeededLayer[];
};

/**
 * Assemble the panorama board's data props for one request: period + asOf
 * parsing, first-visit/deep-link preset seeding (layers + streamed KPIs), and
 * the non-first-visit perdidas fallback. Behavior is identical for both routes;
 * the callers parameterize only:
 *   - `seedLevel`: the C2-invariant aggregation axis (admin derives it from the
 *     ?province drill; gob from the console's own division predicate — A1);
 *   - `defaultPresetId`: the role-default vista;
 *   - `routeLabel`: budget/KPI log labels ("admin/panorama" | "gob/panorama").
 */
export async function buildPanoramaBoard(args: {
  role: "admin" | "govt";
  jurisdictions: DashboardJurisdiction[];
  sp: PanoramaBoardSearchParams;
  scope: PanoramaRequestScope;
  seedLevel: AggregationLevel;
  defaultPresetId: PresetId;
  routeLabel: "admin/panorama" | "gob/panorama";
}): Promise<PanoramaBoardProps> {
  const { role, jurisdictions, sp, seedLevel, defaultPresetId, routeLabel } = args;
  const { scoped, adminProvince, adminLocality } = args.scope;
  const actor = { role };

  // Q12: only a bounded-jurisdiction govt operator returns to "mi jurisdicción";
  // admin/universal (even when drilled into a province) returns to "Vista
  // nacional". A govt operator reaching the admin route counts as bounded too
  // (requireAdminOrGovtOrRedirect admits both roles on both routes).
  const boundedJurisdiction = role !== "admin" && jurisdictions.length > 0;

  const scopeLabel = panoramaScopeLabel(role, jurisdictions);

  // Panorama defaults to a multi-year window (system "started" ~3 years ago) so
  // the map + scrubber span the seeded history. Detail dashboards are unchanged.
  const period = resolveAnalyticsPeriod({ ...sp, period: sp.period ?? PANORAMA_DEFAULT_PRESET });
  const { since } = period;

  // Round-2 review #5: seed the KPI strip AS-OF a deep-linked ?asOf so SSR never
  // paints live temporal KPIs over a scrubbed map (a flash of contradiction on a
  // shared "Copiar vista" link). An unparseable value is ignored (treated as live).
  const asOfSeed = (() => {
    if (!sp.asOf) return null;
    const d = new Date(sp.asOf);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  // V2 (a serializable scope on every export) — the asker's jurisdictional
  // standing, assembled HERE because this is the only layer that holds all of
  // it: the session's raw assignments, the narrowing the request applied, and
  // the admin drill. The console cannot reconstruct any of it from props.
  //
  // `mandate` and `effective` are BOTH carried, and NOT because one is derivable
  // from the other. A whole-province govt mandate drilled to one locality
  // (`narrowGovtScope` → a single SPECIFIC pair) has the SAME LENGTH as the
  // mandate at a strictly finer grain; a descriptor that stored a count, or only
  // `effective`, would serialize two genuinely different views identically.
  const scopeAuthority: ViewScopeAuthority = {
    role: role === "admin" ? "admin" : "govt",
    // Admin holds no assignments — its universal standing is carried by `role`,
    // and its narrowing is a DRILL, never a mandate list.
    mandate: role === "admin" ? [] : jurisdictions,
    effective: role === "admin" ? [] : scoped,
    adminDrill: adminProvince ? { province: adminProvince, locality: adminLocality ?? null } : null,
  };

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;

  // perf plan 1.2 — first-visit detection. A TRUE first visit carries none of
  // period/preset/layers (nor a custom from/to window). On this path the server
  // resolves the role-default preset itself — seeding its layers + KPIs at the
  // PRESET's window/level — so the client paints on first render with zero layer
  // fetches, instead of discarding a freshly-seeded perdidas layer.
  const isFirstVisit =
    sp.period === undefined &&
    sp.preset === undefined &&
    sp.layers === undefined &&
    sp.from === undefined &&
    sp.to === undefined;

  // The preset to seed server-side (its layers + window), or null to fall through
  // to the perdidas seed. Two paths land here:
  //  (1) a first visit → the role-default vista (perf plan 1.2);
  //  (2) an explicit `?preset=<id>` deep-link with NO `?layers=` override → THAT
  //      preset. Without this, a shared/embedded `?preset=brotes-activos` link
  //      disqualified itself from the first-visit gate (sp.preset !== undefined)
  //      and fell through to the orphan perdidas seed — the deep-link never
  //      painted its own board (pre-existing bug, not a P2 regression). An
  //      explicit `?layers=` still wins: a hand-built board is not a preset seed.
  const urlPreset =
    sp.layers === undefined && sp.preset !== undefined
      ? (getPreset(sp.preset as PresetId) ?? null)
      : null;
  // biome-ignore lint/style/noNonNullAssertion: defaultPresetId is a static registry id.
  const roleDefaultPreset = isFirstVisit ? getPreset(defaultPresetId)! : null;
  const seedPreset = urlPreset ?? roleDefaultPreset;

  if (seedPreset) {
    const preset = seedPreset;
    // CRITICAL C2 INVARIANT: seed AND initialLevel are BOTH `seedLevel`. The
    // console initializes `level` from initialLevel and reads each seeded layer
    // from the cache keyed by that level — a mismatch blanks the map.
    //
    // PO-ratified 2026-07-09: the seed level follows the SCOPE, not the preset
    // (the preset's own `level` is only a preference). The caller derives it —
    // admin from the ?province drill; gob from the SAME predicate the console
    // derives its own axis from (A1) — so the mount produces no level
    // drift/refetch.
    //
    // The preset's OWN window (90d/30d) — not the 3y default. This also scopes
    // the KPI fan-out to that window, killing the wasted 3-year compute. A
    // `?preset=X&period=Y` deep-link honors its explicit window (`period`, already
    // resolved above from sp.period); a bare `?preset=X` uses the preset's window.
    const seedPeriod =
      urlPreset && sp.period !== undefined
        ? period
        : resolveAnalyticsPeriod({ period: preset.periodPreset });
    const seedIds = presetLayerIds(preset);
    // Streamed KPIs — NOT awaited here. `.catch` degrades an early rejection so
    // the promise always resolves to an honest strip (the loader carries its own
    // 20s budget; the console shows "Cargando indicadores…" until it lands).
    // RESILIENCE (2026-07-10): created BEFORE the seed await so the KPI fan-out
    // runs CONCURRENTLY with the seed instead of serializing after it — the two
    // slow paths overlap rather than summing.
    const kpisPromise = loadCachedPanoramaKpis({
      actor,
      jurisdictions: scoped,
      period: seedPeriod,
      adminProvince,
      adminLocality,
      asOf: asOfSeed,
      label: `${routeLabel} kpis`,
    })
      .then((r) => r.value)
      .catch(() => degradedPanoramaKpis());
    // perf plan 1.3: only the LAYER seed is awaited (fast at the preset's 90d
    // window) — it must paint on first render. The KPI fan-out is streamed
    // UN-awaited (kpisPromise above) so a cold ~12-query load never blocks the
    // SSR shell; the console resolves it client-side behind a pending strip.
    //
    // WithMeta variant (WP3): each seed reports which path served it (cube |
    // live) and, for a cube hit, the cube's build timestamp — the freshness the
    // loader already read internally. The pages used to re-read the cube meta in
    // a separate resolveCubeFreshness loop right after this Promise.all; that
    // second round-trip is gone.
    const seedResults = await Promise.all(
      seedIds.map((lid) =>
        withDbBudget<LayerFeaturesSourced>(
          loadLayerFeaturesCubeOrCachedWithMeta(
            lid,
            actor,
            scoped,
            // Pass the window's UPPER bound (`asOf`) too, exactly like the layer
            // API route does (`windowUntil = asOf ?? until`). Omitting it (a) let
            // a custom `?from=&to=` window leak past its chosen `to`, and (b)
            // minted a DIFFERENT cache key than the API for the same logical
            // window (SSR asOf="" vs API asOf=bucketed) — halving cache reuse.
            { since: seedPeriod.since, asOf: seedPeriod.until },
            seedLevel,
            adminProvince,
            adminLocality,
          ),
          PAGE_BUDGET_MS,
          `${routeLabel} seed ${lid}`,
          { result: emptyLayerFeatures(), source: "live" },
        ).catch((): LayerFeaturesSourced => ({ result: emptyLayerFeatures(), source: "live" })),
      ),
    );
    const seededLayers: SeededLayer[] = seedIds.map((lid, i) => ({
      id: lid,
      features: seedResults[i].result.features,
      truncated: seedResults[i].result.truncated,
      suppressedCount: seedResults[i].result.suppressedCount,
      noLocalityCount: seedResults[i].result.noLocalityCount,
    }));
    // Cube-freshness annotation (Cursor I2): when the seeded preset is served
    // from the aggregate cube (admin actor only in v1 — gated inside the cube
    // loader's eligibility), surface the cube's build time so an operator can
    // tell data lagging a day from no data at all. First cube-served seed in
    // seedIds order wins (`builtAt` is ONE stamp for the whole board). Null
    // (stamp omitted) for a live-served or points-only preset — including a
    // seed whose cube read failed or timed out and degraded to live: the stamp
    // now comes from the load that ACTUALLY served, never from a separate
    // eligibility probe that could claim a freshness the data doesn't have.
    const cubeBuiltAt = seedResults.find((r) => r.source === "cube")?.builtAt ?? null;
    return {
      scopeLabel,
      boundedJurisdiction,
      scopeAuthority,
      layer,
      // perdidas is NOT seeded on the first-visit path — the preset owns the
      // board. Pass an empty envelope so the console has a default (unused).
      features: emptyLayerFeatures().features,
      truncated: false,
      suppressedCount: 0,
      kpisPromise,
      initialLevel: seedLevel,
      defaultPresetId,
      cubeBuiltAt,
      seededPresetId: preset.id,
      seededLayers,
    };
  }

  // Non-first visit — keep today's behavior (perdidas seed, now cache-warmed).
  //
  // Seed level follows the scope (QA 2026-07-03): a scoped drill opens at
  // LOCALITY granularity (finest the data supports — shows the data's real
  // resolution); the national view stays at PROVINCE (fast rollup, readable
  // overview). The level MUST match PanoramaShell's initialLevel or the
  // console's seeded cache is the wrong one and the map starts blank (C2) —
  // both paths read the SAME caller-derived `seedLevel`.
  //
  // KPIs go through the SHARED cached loader (staging QA 2026-07-08 #1): a
  // browser reload hits the warm 60s per-lambda cache instead of re-running the
  // ~12-query fan-out. perf plan 1.3: the promise is streamed UN-awaited so a
  // COLD fan-out (cache miss) never blocks the SSR shell — the console resolves
  // it client-side behind a "Cargando indicadores…" pending strip. The loader
  // carries its own 20s budget; the trailing `.catch` degrades an early rejection.
  // RESILIENCE (2026-07-10): created BEFORE the seed await so the KPI fan-out
  // runs CONCURRENTLY with the layer seed instead of serializing after it.
  const kpisPromise = loadCachedPanoramaKpis({
    actor,
    jurisdictions: scoped,
    period,
    adminProvince,
    adminLocality,
    asOf: asOfSeed,
    label: `${routeLabel} kpis`,
  })
    .then((r) => r.value)
    .catch(() => degradedPanoramaKpis());
  // perf plan 1.3: only the LAYER is awaited (fast at the active window) so the
  // map paints on first render. withDbBudget degrades on timeout and the
  // trailing `.catch` degrades on an early fetcher rejection — a degraded DB
  // never throws out of the Server Component.
  const result = await withDbBudget(
    loadLayerFeaturesCubeOrCached(
      "perdidas",
      actor,
      scoped,
      // Include the window's UPPER bound so a custom `?from=&to=` window honors
      // its chosen `to`, and the SSR cache key unifies with the layer API's
      // (both key on `asOf=bucket(until)` for the same logical window).
      { since, asOf: period.until },
      seedLevel,
      adminProvince,
      adminLocality,
    ),
    PAGE_BUDGET_MS,
    `${routeLabel} layer`,
    emptyLayerFeatures(),
  ).catch(() => emptyLayerFeatures());

  return {
    scopeLabel,
    boundedJurisdiction,
    scopeAuthority,
    layer,
    features: result.features,
    truncated: result.truncated,
    suppressedCount: result.suppressedCount,
    kpisPromise,
    initialLevel: seedLevel,
    defaultPresetId,
    cubeBuiltAt: null,
  };
}
