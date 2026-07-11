import { Suspense } from "react";

import { PanoramaBoardSkeleton } from "@/components/panorama/PanoramaBoardSkeleton";
import type { SeededLayer } from "@/components/panorama/PanoramaConsole";
import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { GOB_ALL_PROVINCES, PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
import { narrowGovtScope } from "@/lib/domain/jurisdiction-canonical";
import {
  listLocalitiesByProvince,
  listLocalityCentroids,
  localityByName,
} from "@/lib/infra/ar-localidades";
import {
  type AdminOrGovtJurisdiction,
  requireAdminOrGovtOrRedirect,
} from "@/lib/infra/auth-guards";
import { jurisdictionBounds } from "@/lib/infra/gov-scope";
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

// Centro de Situación Nacional — gobierno view (jurisdiction scope).
// govt sees only its assigned jurisdictions (intersection inherited from the
// scope-aware loaders); admin viewing /gob/* gets universal scope.
export const dynamic = "force-dynamic";

// Server-render budget for the concurrent fan-outs (task #74). On expiry (or a
// fetcher rejection, caught below) the page renders a degraded-but-honest state
// instead of hanging the RSC stream forever (the staging incident).
const PAGE_BUDGET_MS = 9000;

/** Concise es-AR scope label from the govt's assigned jurisdictions. */
function scopeLabel(role: string, jurisdictions: AdminOrGovtJurisdiction[]): string {
  if (role === "admin" || jurisdictions.length === 0) return "Nacional · todas las provincias";
  const provinces = [...new Set(jurisdictions.map((j) => j.province))];
  if (provinces.length === 1) {
    const localities = jurisdictions.map((j) => j.locality);
    return localities.length <= 2 ? `${provinces[0]} · ${localities.join(", ")}` : provinces[0];
  }
  return provinces.length <= 3 ? provinces.join(", ") : `${provinces.length} provincias`;
}

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
}>;

// RESILIENCE (2026-07-10, PO instrumented-review finding #1): the board's slow
// default-layer seed used to be awaited at the TOP of this page component,
// blocking the very first byte for up to PAGE_BUDGET_MS while the generic
// route-group "Cargando…" skeleton hung. It now streams behind this <Suspense>
// so the outer function returns synchronously — the operator chrome + a bounded
// panorama skeleton paint immediately, and the seeded board flushes when ready.
// A throw inside the board is caught by app/gob/panorama/error.tsx (a real
// "reintentar" state), never a perpetual skeleton.
export default function GobPanoramaPage({
  searchParams,
}: {
  searchParams: PanoramaSearchParams;
}) {
  return (
    <Suspense fallback={<PanoramaBoardSkeleton />}>
      <GobPanoramaBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function GobPanoramaBoard({
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

  const provinceObj = sp.province ? provinceByCode(sp.province) : null;
  const [localities, localityCentroids] = provinceObj
    ? await Promise.all([
        listLocalitiesByProvince(provinceObj.code as ProvinceCode),
        listLocalityCentroids(provinceObj.code as ProvinceCode),
      ])
    : [[], {}];
  const localityRow =
    provinceObj && sp.locality
      ? await localityByName(provinceObj.code as ProvinceCode, sp.locality)
      : null;

  // Intersect the selected province/locality with the user's actual assignments
  // so a govt user cannot widen scope by crafting ?province=&locality= params.
  // narrowGovtScope applies whole-province SUBSUMPTION: a whole-province
  // assignment narrows to the selected locality instead of being emptied by an
  // exact-locality mismatch (critique of PR #762, finding 4).
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

  // allowedProvinces: admin → all 24; govt → derive from assigned jurisdictions.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Single-province govt scope: the operator's assignments all fall within ONE
  // province. Their scope is IMPLICIT (inherited from the session — they never
  // pick a province in the JurisdictionSwitcher), so `selectedProvinceCode`
  // stays null and the always-visible administrative divisions (barrios for
  // CABA, departamentos elsewhere) never render (PO validation 2026-07-07).
  // Derive the effective division province from the resolved allowedProvinces
  // (deduped by province) so the console activates that province's divisions on
  // mount, exactly as an explicit ?province selection would. Multi-province or
  // admin/national scope → undefined (provinces basemap until an explicit pick).
  // PRESENTATION-ONLY: the data scope is unchanged (scoped loaders enforce it).
  const initialDivisionProvince =
    profile.role !== "admin" && allowedProvinces.length === 1
      ? allowedProvinces[0].code
      : undefined;

  // Role-aware default vista (audit-ratified 2026-07-09): the first-visit preset
  // follows the operator's urgent question. A jurisdiction (govt) operator opens
  // on local syndromic surveillance ("sintomas" — base síntomas density + señal
  // de zoonosis, locality-level, framing-less so it stays in THEIR jurisdiction),
  // the sanitary-surveillance question they act on; an admin viewing /gob keeps
  // the national overview default. Presentation-only — respects the URL ?preset
  // contract (applied only on a bare first visit; never overrides an explicit
  // board). The server-seeded default LAYER (perdidas) is unchanged; this only
  // steers the client's first-visit preset auto-activation.
  const defaultPresetId: PresetId =
    profile.role === "admin" ? DEFAULT_PANORAMA_PRESET_ID : "sintomas";

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;

  // Govt → bbox of their assigned localities; admin (jurisdictions=[]) → null.
  // Cheap static lookup, needed by both the first-visit and normal paths.
  const initialBounds = await jurisdictionBounds(jurisdictions);

  // perf plan 1.2 — first-visit detection. A TRUE first visit carries none of
  // period/preset/layers (nor a custom from/to window): the bare-URL landing the
  // client would otherwise resolve to the role-default preset AFTER discarding a
  // freshly-seeded perdidas layer. On this path the server does that resolution
  // itself — seeding the preset's layers + KPIs at the PRESET's window/level —
  // so the client paints on first render with zero layer fetches.
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
    // A govt operator (always jurisdiction-scoped) or an explicit province opens
    // at LOCALITY (scope-wins); only the unscoped national (admin viewing /gob)
    // seeds at PROVINCE — matching the console's zoomed-out hysteresis derivation
    // so the mount produces no level drift/refetch. The preset's own `level` is
    // only a preference now.
    const isScoped = provinceObj !== null || (profile.role !== "admin" && jurisdictions.length > 0);
    const seedLevel = isScoped ? ("locality" as const) : ("province" as const);
    // The preset's OWN window (90d/30d) — not the 3y default. This also scopes
    // the KPI fan-out to that window, killing the wasted 3-year compute.
    const seedPeriod = resolveAnalyticsPeriod({ period: preset.periodPreset });
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
      label: "gob/panorama kpis",
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
          `gob/panorama seed ${lid}`,
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
        scopeLabel={scopeLabel(profile.role, jurisdictions)}
        layer={layer}
        // perdidas is NOT seeded on the first-visit path — the preset owns the
        // board. Pass an empty envelope so the console has a default (unused).
        features={emptyLayerFeatures().features}
        truncated={false}
        suppressedCount={0}
        allowedProvinces={allowedProvinces}
        localities={localities}
        localityCentroids={localityCentroids}
        kpisPromise={kpisPromise}
        initialBounds={initialBounds ?? undefined}
        initialLevel={seedLevel}
        initialDivisionProvince={initialDivisionProvince}
        defaultPresetId={defaultPresetId}
        seededPresetId={defaultPresetId}
        seededLayers={seededLayers}
      />
    );
  }

  // Non-first visit — keep today's behavior (perdidas seed, now cache-warmed).
  //
  // Seed level follows the scope (QA 2026-07-03): a govt actor (always
  // jurisdiction-scoped) or an explicit province selection opens at LOCALITY
  // granularity — the finest the data supports; only the unscoped national
  // (admin) view stays at PROVINCE. The level MUST match PanoramaShell's
  // initialLevel or the console's seeded cache is the wrong one (C2).
  const isScoped = provinceObj !== null || (profile.role !== "admin" && jurisdictions.length > 0);
  const initialLevel = isScoped ? ("locality" as const) : ("province" as const);
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
    label: "gob/panorama kpis",
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
    "gob/panorama layer",
    emptyLayerFeatures(),
  ).catch(() => emptyLayerFeatures());

  return (
    <PanoramaShell
      scopeLabel={scopeLabel(profile.role, jurisdictions)}
      layer={layer}
      features={result.features}
      truncated={result.truncated}
      suppressedCount={result.suppressedCount}
      allowedProvinces={allowedProvinces}
      localities={localities}
      localityCentroids={localityCentroids}
      kpisPromise={kpisPromise}
      initialBounds={initialBounds ?? undefined}
      initialLevel={initialLevel}
      initialDivisionProvince={initialDivisionProvince}
      defaultPresetId={defaultPresetId}
    />
  );
}
