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
import { loadLayerFeaturesCached } from "@/src/modules/panorama/application/load-layer-features-cached";
import { loadCachedPanoramaKpis } from "@/src/modules/panorama/application/load-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import {
  DEFAULT_PANORAMA_PRESET_ID,
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

export default async function AdminPanoramaPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
    // perf plan 1.2: a first visit carries NONE of period/preset/layers (nor a
    // custom from/to window) — the signal to seed the role-default preset.
    preset?: string;
    layers?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const sp = await searchParams;
  // Panorama defaults to a multi-year window (system "started" ~3 years ago) so
  // the map + scrubber span the seeded history. Detail dashboards are unchanged.
  const period = resolveAnalyticsPeriod({ ...sp, period: sp.period ?? PANORAMA_DEFAULT_PRESET });
  const { since } = period;

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

  if (isFirstVisit) {
    // biome-ignore lint/style/noNonNullAssertion: defaultPresetId is a static registry id.
    const preset = getPreset(defaultPresetId)!;
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
    // the KPI fan-out to that window, killing the wasted 3-year compute.
    const seedPeriod = resolveAnalyticsPeriod({ period: preset.periodPreset });
    const seedIds = presetLayerIds(preset);
    // perf plan 1.3: only the LAYER seed is awaited (fast at the preset's 90d
    // window) — it must paint on first render. The KPI fan-out is streamed
    // UN-awaited (kpisPromise below) so a cold ~12-query load never blocks the
    // SSR shell; the console resolves it client-side behind a pending strip.
    const seedResults = await Promise.all(
      seedIds.map((lid) =>
        withDbBudget(
          loadLayerFeaturesCached(
            lid,
            actor,
            scoped,
            { since: seedPeriod.since },
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
    // Streamed KPIs — NOT awaited here. `.catch` degrades an early rejection so
    // the promise always resolves to an honest strip (the loader carries its own
    // 20s budget; the console shows "Cargando indicadores…" until it lands).
    const kpisPromise = loadCachedPanoramaKpis({
      actor,
      jurisdictions: scoped,
      period: seedPeriod,
      adminProvince,
      adminLocality,
      label: "admin/panorama kpis",
    })
      .then((r) => r.value)
      .catch(() => degradedPanoramaKpis());
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
        seededPresetId={defaultPresetId}
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
  // perf plan 1.3: only the LAYER is awaited (fast at the active window) so the
  // map paints on first render. withDbBudget degrades on timeout and the
  // trailing `.catch` degrades on an early fetcher rejection — a degraded DB
  // never throws out of this Server Component.
  const result = await withDbBudget(
    loadLayerFeaturesCached(
      "perdidas",
      actor,
      scoped,
      { since },
      initialLevel,
      adminProvince,
      adminLocality,
    ),
    PAGE_BUDGET_MS,
    "admin/panorama layer",
    emptyLayerFeatures(),
  ).catch(() => emptyLayerFeatures());
  // KPIs go through the SHARED cached loader (staging QA 2026-07-08 #1): a
  // browser reload hits the warm 60s per-lambda cache instead of re-running the
  // ~12-query fan-out. perf plan 1.3: the promise is streamed UN-awaited so a
  // COLD fan-out (cache miss) never blocks the SSR shell — the console resolves
  // it client-side behind a "Cargando indicadores…" pending strip. The loader
  // carries its own 20s budget; the trailing `.catch` degrades an early rejection.
  const kpisPromise = loadCachedPanoramaKpis({
    actor,
    jurisdictions: scoped,
    period,
    adminProvince,
    adminLocality,
    label: "admin/panorama kpis",
  })
    .then((r) => r.value)
    .catch(() => degradedPanoramaKpis());

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
