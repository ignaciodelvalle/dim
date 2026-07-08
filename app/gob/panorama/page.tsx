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
import {
  emptyLayerFeatures,
  getLayerFeatures,
} from "@/src/modules/panorama/application/get-layer-features";
import {
  degradedPanoramaKpis,
  getPanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";

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

export default async function GobPanoramaPage({
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

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  // Default layer features + the headline KPIs + the jurisdiction bbox resolve
  // concurrently. The KPIs reuse the tested dashboard fetchers (parity) and are
  // scoped+period-aware.
  //
  // Seed level follows the scope (QA 2026-07-03): a govt actor (always
  // jurisdiction-scoped) or an explicit province selection opens at LOCALITY
  // granularity — the finest the data supports; only the unscoped national
  // (admin) view stays at PROVINCE. The level MUST match PanoramaShell's
  // initialLevel or the console's seeded cache is the wrong one (C2).
  const isScoped = provinceObj !== null || (profile.role !== "admin" && jurisdictions.length > 0);
  const initialLevel = isScoped ? ("locality" as const) : ("province" as const);
  // Both DB fan-outs are time-bounded AND `.catch`-guarded: withDbBudget degrades
  // on timeout, the trailing `.catch` degrades on an early fetcher rejection — so
  // a degraded DB never throws out of this Server Component (it renders the honest
  // degraded PanoramaShell instead). jurisdictionBounds is a cheap static lookup.
  const [result, kpis, initialBounds] = await Promise.all([
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
      "gob/panorama layer",
      emptyLayerFeatures(),
    ).catch(() => emptyLayerFeatures()),
    withDbBudget(
      getPanoramaKpis(actor, scoped, period, adminProvince, adminLocality),
      PAGE_BUDGET_MS,
      "gob/panorama kpis",
      degradedPanoramaKpis(),
    ).catch(() => degradedPanoramaKpis()),
    // Govt → bbox of their assigned localities; admin (jurisdictions=[]) → null.
    jurisdictionBounds(jurisdictions),
  ]);

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
      kpis={kpis}
      initialBounds={initialBounds ?? undefined}
      initialLevel={initialLevel}
      initialDivisionProvince={initialDivisionProvince}
    />
  );
}
