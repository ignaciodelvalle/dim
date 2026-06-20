import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { type AdminOrGovtJurisdiction, requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { getLayer } from "@/src/modules/panorama/domain/layers";

// Centro de Situación Nacional — gobierno view (jurisdiction scope).
// govt sees only its assigned jurisdictions (intersection inherited from the
// scope-aware fetchers); admin viewing /gob/* gets universal scope.
export const dynamic = "force-dynamic";

const SINCE_DAYS = 180;

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

export default async function GobPanoramaPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);
  const features = await getLayerFeatures("perdidas", actor, jurisdictions, { since });

  return (
    <PanoramaShell
      scopeLabel={scopeLabel(profile.role, jurisdictions)}
      layer={layer}
      features={features}
    />
  );
}
