import { Suspense } from "react";

import { PanoramaBoardSkeleton } from "@/components/panorama/PanoramaBoardSkeleton";
import type { SeededLayer } from "@/components/panorama/PanoramaConsole";
import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { GOB_ALL_PROVINCES } from "@/lib/analytics/govt-dashboards";
import { shouldShowDemoBanner } from "@/lib/domain/demo-mode";
import { narrowGovtScope } from "@/lib/domain/jurisdiction-canonical";
import {
  listLocalitiesByProvince,
  listLocalityCentroids,
  localityByName,
} from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import type { DashboardJurisdiction } from "@/lib/metrics";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";
import { emptyLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { degradedPanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { loadLayerFeaturesCubeOrCached } from "@/src/modules/panorama/application/load-layer-features-cube";
import { loadCachedPanoramaKpis } from "@/src/modules/panorama/application/load-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import {
  DEFAULT_PANORAMA_PRESET_ID,
  type PresetId,
  getPreset,
  presetLayerIds,
} from "@/src/modules/panorama/domain/presets";

// Centro de Situación Nacional — admin view (universal scope).
// Slice 2: dark local basemap + multi-layer console + unified filters.
export const dynamic = "force-dynamic";

// Server-render budget for the two concurrent fan-outs (task #74). On expiry (or
// a fetcher rejection, caught below) the page renders a degraded-but-honest state
// — empty map + "no pudimos cargar los indicadores" — instead of hanging the RSC
// stream forever (the staging incident: skeletons that never resolve).
const PAGE_BUDGET_MS = 9000;

type PanoramaSearchParams = Promise<{
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
}>;

// RESILIENCE (2026-07-10, PO instrumented-review finding #1): the board's slow
// default-layer seed used to be awaited at the TOP of this page component,
// blocking the very first byte for up to PAGE_BUDGET_MS while the generic
// route-group "Cargando…" skeleton hung. It now streams behind this <Suspense>
// so the outer function returns synchronously — the operator chrome + a bounded
// panorama skeleton paint immediately, and the seeded board flushes when ready.
// A throw inside the board is caught by app/admin/panorama/error.tsx (a real
// "reintentar" state), never a perpetual skeleton.
export default function AdminPanoramaPage({
  searchParams,
}: {
  searchParams: PanoramaSearchParams;
}) {
  return (
    <Suspense fallback={<PanoramaBoardSkeleton />}>
      <AdminPanoramaBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminPanoramaBoard({
  searchParams,
}: {
  searchParams: PanoramaSearchParams;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const sp = await searchParams;
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

  // Selected province/locality from the filters.
  const provinceObj = sp.province ? provinceByCode(sp.province) : null;
  const [localities, localityCentroids] = provinceObj
    ? await Promise.all([
        listLocalitiesByProvince(provinceObj.code as ProvinceCode),
        listLocalityCentroids(provinceObj.code as ProvinceCode),
      ])
    : [[], {} as Record<string, [number, number]>];
  const localityRow =
    provinceObj && sp.locality
      ? await localityByName(provinceObj.code as ProvinceCode, sp.locality)
      : null;

  // Map autozoom (B3): the SituationalMap fits `initialBounds` on mount. Without
  // it, the map only fits to the active layer's feature bbox — so a selected
  // province whose default ("perdidas") layer is sparse never zooms in and reads
  // as a blank national frame. Derive the province bounding box from its locality
  // centroids ([lng,lat]); when a single locality is picked, tighten to a small
  // box around its centroid. Undefined at the national level (fit to features).
  const initialBounds: [[number, number], [number, number]] | undefined = (() => {
    if (!provinceObj) return undefined;
    const centroidValues = Object.values(localityCentroids);
    if (localityRow) {
      const c = localityCentroids[localityRow.localitySlug];
      if (c) {
        const [lng, lat] = c;
        const d = 0.2; // ~22km halo so the locality isn't a hairline point
        return [
          [lng - d, lat - d],
          [lng + d, lat + d],
        ];
      }
    }
    if (centroidValues.length === 0) return undefined;
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const [lng, lat] of centroidValues) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  })();

  // Admin: [] means universal scope; the scope clauses short-circuit on admin.
  // A selected province/locality narrows the rollups (admin can drill anywhere).
  // A govt user reaching this route (requireAdminOrGovtOrRedirect admits both)
  // is narrowed via narrowGovtScope, which applies whole-province SUBSUMPTION so
  // a whole-province assignment narrows to the selected locality instead of being
  // emptied by an exact-locality mismatch (critique of PR #762, finding 4).
  const scoped: DashboardJurisdiction[] =
    provinceObj && profile.role !== "admin"
      ? narrowGovtScope(jurisdictions, provinceObj.name, localityRow?.localityName ?? null)
      : jurisdictions;

  // Admin province drill-down: canonical stored names derived server-side from
  // provinceByCode() and localityByName(). Only passed for admin role — govt
  // actors must NOT receive these; their scope is enforced by filteredJurisdictions.
  const adminProvince = profile.role === "admin" ? (provinceObj?.name ?? undefined) : undefined;
  const adminLocality =
    profile.role === "admin" ? (localityRow?.localityName ?? undefined) : undefined;

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;

  // Admin's role-default vista (see src/modules/panorama/domain/presets.ts):
  // the national welfare overview. Seeded server-side on a first visit below.
  const defaultPresetId = DEFAULT_PANORAMA_PRESET_ID;

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
    // PO-ratified 2026-07-09: the seed level follows the SCOPE, not the preset.
    // A national first visit seeds at PROVINCE (matching the console's zoomed-out
    // hysteresis derivation, so no drift/refetch on mount); a scoped drill seeds
    // at LOCALITY (scope-wins). The preset's own `level` is only a preference.
    const seedLevel = provinceObj ? ("locality" as const) : ("province" as const);
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
      label: "admin/panorama kpis",
    })
      .then((r) => r.value)
      .catch(() => degradedPanoramaKpis());
    // perf plan 1.3: only the LAYER seed is awaited (fast at the preset's 90d
    // window) — it must paint on first render. The KPI fan-out is streamed
    // UN-awaited (kpisPromise above) so a cold ~12-query load never blocks the
    // SSR shell; the console resolves it client-side behind a pending strip.
    const seedResults = await Promise.all(
      seedIds.map((lid) =>
        withDbBudget(
          loadLayerFeaturesCubeOrCached(
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
          `admin/panorama seed ${lid}`,
          emptyLayerFeatures(),
        ).catch(() => emptyLayerFeatures()),
      ),
    );
    const seededLayers: SeededLayer[] = seedIds.map((lid, i) => ({
      id: lid,
      features: seedResults[i].features,
      truncated: seedResults[i].truncated,
      suppressedCount: seedResults[i].suppressedCount,
      noLocalityCount: seedResults[i].noLocalityCount,
    }));
    return (
      <PanoramaShell
        scopeLabel="Nacional · todas las provincias"
        layer={layer}
        // perdidas is NOT seeded on the first-visit path — the preset owns the
        // board. Pass an empty envelope so the console has a default (unused).
        features={emptyLayerFeatures().features}
        truncated={false}
        suppressedCount={0}
        allowedProvinces={GOB_ALL_PROVINCES}
        localities={localities}
        localityCentroids={localityCentroids}
        initialBounds={initialBounds}
        kpisPromise={kpisPromise}
        suppressDemoDisclosure={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)}
        initialLevel={seedLevel}
        defaultPresetId={defaultPresetId}
        seededPresetId={preset.id}
        seededLayers={seededLayers}
      />
    );
  }

  // Non-first visit — keep today's behavior (perdidas seed, now cache-warmed).
  //
  // Seed level follows the scope (QA 2026-07-03): a selected province/locality
  // opens at LOCALITY granularity (finest the data supports — shows the data's
  // real resolution); the national view stays at PROVINCE (fast rollup,
  // readable overview). The level MUST match PanoramaShell's initialLevel or
  // the console's seeded cache is the wrong one and the map starts blank (C2).
  const initialLevel = provinceObj ? ("locality" as const) : ("province" as const);
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
    label: "admin/panorama kpis",
  })
    .then((r) => r.value)
    .catch(() => degradedPanoramaKpis());
  // perf plan 1.3: only the LAYER is awaited (fast at the active window) so the
  // map paints on first render. withDbBudget degrades on timeout and the
  // trailing `.catch` degrades on an early fetcher rejection — a degraded DB
  // never throws out of this Server Component.
  const result = await withDbBudget(
    loadLayerFeaturesCubeOrCached(
      "perdidas",
      actor,
      scoped,
      // Include the window's UPPER bound so a custom `?from=&to=` window honors
      // its chosen `to`, and the SSR cache key unifies with the layer API's
      // (both key on `asOf=bucket(until)` for the same logical window).
      { since, asOf: period.until },
      initialLevel,
      adminProvince,
      adminLocality,
    ),
    PAGE_BUDGET_MS,
    "admin/panorama layer",
    emptyLayerFeatures(),
  ).catch(() => emptyLayerFeatures());

  return (
    <PanoramaShell
      scopeLabel="Nacional · todas las provincias"
      layer={layer}
      features={result.features}
      truncated={result.truncated}
      suppressedCount={result.suppressedCount}
      allowedProvinces={GOB_ALL_PROVINCES}
      localities={localities}
      localityCentroids={localityCentroids}
      initialBounds={initialBounds}
      kpisPromise={kpisPromise}
      // /admin shows the global DemoModeBanner (admin layout); suppress
      // Panorama's own notice so the page never stacks two disclosures (D3).
      suppressDemoDisclosure={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)}
      initialLevel={initialLevel}
      defaultPresetId={defaultPresetId}
    />
  );
}
