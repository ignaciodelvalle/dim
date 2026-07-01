import { eq } from "drizzle-orm";

import { OpCrumbs } from "@/components/ui/dashboard";
import { db, organizationCoverage } from "@/db";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { PROVINCES, type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";

import { CoverageEditor } from "./CoverageEditor";

export default async function CoberturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ province?: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const canManage = membership.role === "admin" || membership.role === "coordinator";

  // Load existing coverage zones for this org.
  const zones = await db
    .select()
    .from(organizationCoverage)
    .where(eq(organizationCoverage.organizationId, organization.id));

  // Load localities for the currently selected province (from URL searchParam).
  const { province: provinceCode } = await searchParams;
  const selectedProvinceObj = provinceCode ? provinceByCode(provinceCode) : null;
  const localities = selectedProvinceObj
    ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <OpCrumbs items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Cobertura" }]} />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Zonas de cobertura</h1>
        <p className="text-[13px] text-ln-op-mute">
          Configurá las jurisdicciones donde{" "}
          <strong className="text-ln-op-ink-2">{organization.displayName}</strong> recibe alertas de
          mascotas perdidas.
        </p>
      </div>

      <CoverageEditor
        orgToken={orgToken}
        provinces={PROVINCES}
        localities={localities}
        zones={zones}
        canManage={canManage}
      />
    </div>
  );
}
