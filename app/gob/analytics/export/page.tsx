// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (Parquet/CSV export for govt analytics) is not yet wired
// end-to-end. Keep this page intact — when the flow lands, wire the parent
// /gob/analytics page first (add nav entry in nav-presets.ts); this export
// page is a child of analytics and will become reachable automatically.
//
// Wire when KPI/analytics work returns to the roadmap; currently exploratory.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

import Link from "next/link";

import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  JurisdictionSwitcher,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { PROVINCE_ISO_MAP } from "@/lib/govt-dashboards";
import { generateExportAction } from "./actions";

// Void-returning wrapper required because HTML form action must return void | Promise<void>,
// but we define generateExportAction to return GenerateExportResult for programmatic use.
async function submitExportAction(formData: FormData): Promise<void> {
  await generateExportAction(formData);
}

// Mirrors the ALL_PROVINCES list used in the parent analytics page.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
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
      <main className="px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <EmptyState
            icon="lock"
            title="Sin acceso"
            description="Tu rol no tiene acceso a la exportación de datos. Pedile al admin que te asigne una jurisdicción."
          />
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const period = params.period ?? "30d";
  const from = params.from ?? "";
  const to = params.to ?? "";

  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-gob-text-muted">
          <Link href="/gob/analytics" className="hover:underline text-gob-primary">
            Analytics
          </Link>
          <span aria-hidden="true" className="mx-1">
            /
          </span>
          <span aria-current="page">Exportar datos</span>
        </nav>

        {/* Page header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text">Exportar datos</h1>
          <p className="text-sm text-gob-text-gray">
            Generá un export anonimizado de los datos de tu cobertura.
          </p>
        </header>

        {/* Privacy notice — Ley 25.326 */}
        <Alert variant="info">
          <strong>Aviso sobre protección de datos personales (Ley 25.326).</strong> Los datos
          exportados están anonimizados según los principios de minimización y proporcionalidad. No
          se incluye ningún dato personal identificable (nombre, DNI, email, microchip) en el
          archivo generado. El link de descarga vence a las 24 horas. El uso de este export queda
          registrado en el log de auditoría.
        </Alert>

        <Panel>
          <PanelHeader title="Configurar export" />
          <PanelBody>
            <form action={submitExportAction} className="space-y-6">
              {/* Hidden inputs carrying PeriodPicker + JurisdictionSwitcher state
                  from searchParams. The client components update the URL; these
                  hidden fields pass the values into the server action via FormData. */}
              <input type="hidden" name="period" value={period} />
              {from && <input type="hidden" name="from" value={from} />}
              {to && <input type="hidden" name="to" value={to} />}

              {/* Period selector */}
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-gob-text">Período</h2>
                <PeriodPicker defaultPreset="30d" />
              </section>

              {/* Jurisdiction selector */}
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-gob-text">Jurisdicción</h2>
                <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
              </section>

              {/* Data slices */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gob-text">Datos a incluir</legend>
                <div className="space-y-2 pt-1">
                  <Checkbox name="slice" value="pets" defaultChecked>
                    Mascotas (anonimizado)
                  </Checkbox>
                  <Checkbox name="slice" value="events">
                    Eventos
                  </Checkbox>
                  <Checkbox name="slice" value="cases">
                    Casos
                  </Checkbox>
                  <Checkbox name="slice" value="organizations">
                    Organizaciones
                  </Checkbox>
                </div>
              </fieldset>

              {/* Format */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gob-text">Formato</legend>
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="format"
                      value="csv"
                      defaultChecked
                      className="accent-gob-primary"
                    />
                    CSV
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="format" value="json" className="accent-gob-primary" />
                    JSON
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer opacity-50">
                    <input type="radio" name="format" value="parquet" disabled />
                    Parquet — próximamente
                  </label>
                </div>
              </fieldset>

              <Button type="submit">Generar export</Button>
            </form>
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
