import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import type { ProvinceCode } from "@/lib/ar-provincias";
import { provinceByCode } from "@/lib/ar-provincias";
import { type AdminOrGovtJurisdiction, requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { GOB_ALL_PROVINCES, PROVINCE_ISO_MAP } from "@/lib/govt-dashboards";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
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
  const { since } = resolveAnalyticsPeriod(sp);

  const provinceObj = sp.province ? provinceByCode(sp.province) : null;
  const localities = provinceObj
    ? await listLocalitiesByProvince(provinceObj.code as ProvinceCode)
    : [];
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

  // allowedProvinces: admin → all 24; govt → derive from assigned jurisdictions.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  const result = await getLayerFeatures("perdidas", actor, scoped, { since });

  return (
    <PanoramaShell
      scopeLabel={scopeLabel(profile.role, jurisdictions)}
      layer={layer}
      features={result.features}
      truncated={result.truncated}
      suppressedCount={result.suppressedCount}
      allowedProvinces={allowedProvinces}
      localities={localities}
    />
  );
}
