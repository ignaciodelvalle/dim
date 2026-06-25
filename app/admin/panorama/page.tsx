import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import {
  listLocalitiesByProvince,
  listLocalityCentroids,
  localityByName,
} from "@/lib/ar-localidades";
import type { ProvinceCode } from "@/lib/ar-provincias";
import { provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { shouldShowDemoBanner } from "@/lib/demo-mode";
import { GOB_ALL_PROVINCES } from "@/lib/govt-dashboards";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { getPanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";

// Centro de Situación Nacional — admin view (universal scope).
// Slice 2: dark local basemap + multi-layer console + unified filters.
export const dynamic = "force-dynamic";

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
  const period = resolveAnalyticsPeriod(sp);
  const { since } = period;

  // Selected province/locality from the filters.
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

  // Admin: [] means universal scope; the scope clauses short-circuit on admin.
  // A selected province/locality narrows the rollups (admin can drill anywhere).
  let scoped: DashboardJurisdiction[] = jurisdictions;
  if (provinceObj && profile.role !== "admin") {
    scoped = localityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceObj.name && j.locality === localityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceObj.name);
  }

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  // Default layer features + the headline KPIs resolve concurrently. The KPIs
  // reuse the tested dashboard fetchers (parity) and are scoped+period-aware.
  // Seed the default layer at PROVINCE level (matching the PanoramaConsole default
  // aggregation axis of "province"). Seeding at locality level would leave the
  // provinceDataRef cache empty on first render and produce a blank map (C2).
  const [result, kpis] = await Promise.all([
    getLayerFeatures("perdidas", actor, scoped, { since }, "province"),
    getPanoramaKpis(actor, scoped, period),
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
      kpis={kpis}
      // /admin shows the global DemoModeBanner (admin layout); suppress
      // Panorama's own notice so the page never stacks two disclosures (D3).
      suppressDemoDisclosure={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)}
    />
  );
}
