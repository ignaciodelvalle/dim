// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 -- 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (Parquet/CSV export for govt analytics) is not yet wired
// end-to-end. Keep this page intact -- when the flow lands, wire the parent
// /gob/analytics page first (add nav entry in nav-presets.ts); this export
// page is a child of analytics and will become reachable automatically.
//
// Wire when KPI/analytics work returns to the roadmap; currently exploratory.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCallout, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { ExportFormClient } from "./ExportFormClient";

export const dynamic = "force-dynamic";

// Mirrors the ALL_PROVINCES list used in the parent analytics page.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Cordoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucuman" },
  { code: "AR-E", name: "Entre Rios" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
];

export default async function GobAnalyticsExportPage({
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

  // Capability guard: export = admin OR (govt AND has assignments).
  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a la exportación de datos. Pedile al admin que te asigne una jurisdicción."
        />
      </div>
    );
  }

  const params = await searchParams;
  const period = params.period ?? "30d";
  const from = params.from ?? "";
  const to = params.to ?? "";

  // Resolve selected province → localities list for JurisdictionSwitcher.
  const selectedProvinceIso = params.province ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;
  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-ln-op-mute">
        <Link href="/gob/analytics" className="hover:underline text-ln-op-azul">
          Analytics
        </Link>
        <span aria-hidden="true" className="mx-1">
          /
        </span>
        <span aria-current="page">Exportar datos</span>
      </nav>

      {/* Page header */}
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Exportar datos</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Genera un export anonimizado de los datos de tu cobertura."}
        </p>
      </header>

      {/* Privacy notice -- Ley 25.326 */}
      <OpCallout
        icon="i"
        title="Aviso sobre proteccion de datos personales (Ley 25.326)."
        body={
          <>
            Los datos exportados están anonimizados según los principios de minimización y
            proporcionalidad. No se incluye ningún dato personal identificable (nombre, DNI, email,
            microchip) en el archivo generado. El link de descarga vence a las 24 horas. El uso de
            este export queda registrado en el log de auditoría.
          </>
        }
      />

      <OpCard>
        <OpCardHead title="Configurar export" />
        <OpCardBody>
          <Suspense fallback={null}>
            <ExportFormClient
              allowedProvinces={allowedProvinces}
              localities={localities}
              period={period}
              from={from}
              to={to}
            />
          </Suspense>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
