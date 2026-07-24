// ---------------------------------------------------------------------------
// Reachable via the "Exportar datos" CTA in /gob/analytics' filter-bar
// `actions` slot (rewired 2026-07-21 -- orphan flagged by
// docs/reviews/results/2026-07-21-audit-4-decision-ciclos.md). No dedicated
// nav-presets.ts entry: this route is a child of /gob/analytics, which
// already has its own GOB_NAV_SECTIONS entry (same pattern as
// censo/poblacion/adopciones/campanas' export routes, dec0f58f).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCallout, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { ExportFormClient } from "./ExportFormClient";

export const dynamic = "force-dynamic";

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
  const province = params.province ?? "";
  const locality = params.locality ?? "";

  // Resolve selected province → localities list + switcher options.
  const { localities, allowedProvinces } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: params.province, locality: params.locality },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-ln-op-mute">
        <Link href="/gob/analytics" className="hover:underline text-ln-op-azul">
          Analítica
        </Link>
        <span aria-hidden="true" className="mx-1">
          /
        </span>
        <span aria-current="page">Exportar datos</span>
      </nav>

      {/* Page header */}
      <header className="space-y-1">
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Exportar datos</h1>
        <p className="text-[var(--text-md)] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Genera una exportación anonimizada de los datos de tu cobertura."}
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
            esta exportación queda registrada en el log de auditoría.
          </>
        }
      />

      <OpCard>
        <OpCardHead title="Configurar exportación" />
        <OpCardBody>
          <Suspense fallback={null}>
            <ExportFormClient
              allowedProvinces={allowedProvinces}
              localities={localities}
              period={period}
              from={from}
              to={to}
              province={province}
              locality={locality}
            />
          </Suspense>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
