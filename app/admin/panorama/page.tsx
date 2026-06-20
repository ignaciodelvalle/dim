import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { getLayer } from "@/src/modules/panorama/domain/layers";

// Centro de Situación Nacional — admin view (universal scope).
// Slice 1: dark local basemap + perdidas layer, scoped at this auth boundary.
export const dynamic = "force-dynamic";

// Window for active-lost episodes (the seed plots them within ~90 days).
const SINCE_DAYS = 180;

export default async function AdminPanoramaPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;
  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);
  const features = await getLayerFeatures("perdidas", actor, jurisdictions, { since });

  return (
    <PanoramaShell scopeLabel="Nacional · todas las provincias" layer={layer} features={features} />
  );
}
