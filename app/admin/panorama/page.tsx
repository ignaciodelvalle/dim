import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import type { ProvinceCode } from "@/lib/ar-provincias";
import { provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { GOB_ALL_PROVINCES } from "@/lib/govt-dashboards";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
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
  const { since } = resolveAnalyticsPeriod(sp);

  // Selected province/locality from the filters.
  const provinceObj = sp.province ? provinceByCode(sp.province) : null;
  const localities = provinceObj
    ? await listLocalitiesByProvince(provinceObj.code as ProvinceCode)
    : [];
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
  const result = await getLayerFeatures("perdidas", actor, scoped, { since });

  return (
    <PanoramaShell
      scopeLabel="Nacional · todas las provincias"
      layer={layer}
      features={result.features}
      truncated={result.truncated}
      suppressedCount={result.suppressedCount}
      allowedProvinces={GOB_ALL_PROVINCES}
      localities={localities}
    />
  );
}
