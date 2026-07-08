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
import {
  emptyLayerFeatures,
  getLayerFeatures,
} from "@/src/modules/panorama/application/get-layer-features";
import {
  degradedPanoramaKpis,
  getPanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";

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
  // Default layer features + the headline KPIs resolve concurrently. The KPIs
  // reuse the tested dashboard fetchers (parity) and are scoped+period-aware.
  //
  // Seed level follows the scope (QA 2026-07-03): a selected province/locality
  // opens at LOCALITY granularity (finest the data supports — shows the data's
  // real resolution); the national view stays at PROVINCE (fast rollup,
  // readable overview). The level MUST match PanoramaShell's initialLevel or
  // the console's seeded cache is the wrong one and the map starts blank (C2).
  const initialLevel = provinceObj ? ("locality" as const) : ("province" as const);
  // Both fan-outs are time-bounded AND `.catch`-guarded: withDbBudget degrades on
  // timeout, and the trailing `.catch` degrades on an early fetcher rejection —
  // so a degraded DB never throws out of this Server Component (it renders the
  // honest degraded PanoramaShell instead).
  const [result, kpis] = await Promise.all([
    withDbBudget(
      getLayerFeatures(
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
    ).catch(() => emptyLayerFeatures()),
    withDbBudget(
      getPanoramaKpis(actor, scoped, period, adminProvince, adminLocality),
      PAGE_BUDGET_MS,
      "admin/panorama kpis",
      degradedPanoramaKpis(),
    ).catch(() => degradedPanoramaKpis()),
  ]);

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
      kpis={kpis}
      // /admin shows the global DemoModeBanner (admin layout); suppress
      // Panorama's own notice so the page never stacks two disclosures (D3).
      suppressDemoDisclosure={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)}
      initialLevel={initialLevel}
    />
  );
}
