import { eq } from "drizzle-orm";
import Link from "next/link";

import { db, organizationCoverage } from "@/db";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { PROVINCES, type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

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
        <nav className="text-xs text-gob-text-muted">
          <Link href={`/org/${orgToken}`} className="hover:underline">
            Panel
          </Link>
          {" / "}
          <span>Cobertura</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gob-text">Zonas de cobertura</h1>
        <p className="text-sm text-gob-text-gray">
          Configurá las jurisdicciones donde <strong>{organization.displayName}</strong> recibe
          alertas de mascotas perdidas.
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
