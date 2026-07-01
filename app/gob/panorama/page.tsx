import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { GOB_ALL_PROVINCES, PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
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
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { getPanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";

// Centro de Situación Nacional — gobierno view (jurisdiction scope).
// govt sees only its assigned jurisdictions (intersection inherited from the
// scope-aware loaders); admin viewing /gob/* gets universal scope.
export const dynamic = "force-dynamic";

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
  let scoped: DashboardJurisdiction[] = jurisdictions;
  if (provinceObj && profile.role !== "admin") {
    scoped = localityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceObj.name && j.locality === localityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceObj.name);
  }

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

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  // Default layer features + the headline KPIs + the jurisdiction bbox resolve
  // concurrently. The KPIs reuse the tested dashboard fetchers (parity) and are
  // scoped+period-aware. Seed the default layer at PROVINCE level (matching the
  // PanoramaConsole default aggregation axis of "province"). Seeding at locality
  // level would leave the provinceDataRef cache empty on first render and produce
  // a blank map (C2).
  const [result, kpis, initialBounds] = await Promise.all([
    getLayerFeatures(
      "perdidas",
      actor,
      scoped,
      { since },
      "province",
      adminProvince,
      adminLocality,
    ),
    getPanoramaKpis(actor, scoped, period, adminProvince, adminLocality),
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
    />
  );
}
