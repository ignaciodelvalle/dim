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

import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { Button, Checkbox, EmptyState } from "@/components/poncho";
import { OpCallout, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
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
        <EmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a la exportacion de datos. Pedile al admin que te asigne una jurisdiccion."
        />
      </div>
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
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-[12px] text-ln-op-mute">
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
          Genera un export anonimizado de los datos de tu cobertura.
        </p>
      </header>

      {/* Privacy notice -- Ley 25.326 */}
      <OpCallout
        icon="i"
        title="Aviso sobre proteccion de datos personales (Ley 25.326)."
        body={
          <>
            Los datos exportados estan anonimizados segun los principios de minimizacion y
            proporcionalidad. No se incluye ningun dato personal identificable (nombre, DNI, email,
            microchip) en el archivo generado. El link de descarga vence a las 24 horas. El uso de
            este export queda registrado en el log de auditoria.
          </>
        }
      />

      <OpCard>
        <OpCardHead title="Configurar export" />
        <OpCardBody>
          <form action={submitExportAction} className="space-y-6">
            {/* Hidden inputs carrying PeriodPicker + JurisdictionSwitcher state
                from searchParams. The client components update the URL; these
                hidden fields pass the values into the server action via FormData. */}
            <input type="hidden" name="period" value={period} />
            {from && <input type="hidden" name="from" value={from} />}
            {to && <input type="hidden" name="to" value={to} />}

            {/* Period selector */}
            <section className="space-y-2">
              <h2 className="text-[13px] font-medium text-ln-op-ink">Periodo</h2>
              <PeriodPicker defaultPreset="30d" />
            </section>

            {/* Jurisdiction selector */}
            <section className="space-y-2">
              <h2 className="text-[13px] font-medium text-ln-op-ink">Jurisdiccion</h2>
              <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
            </section>

            {/* Data slices */}
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-ln-op-ink">Datos a incluir</legend>
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
              <legend className="text-[13px] font-medium text-ln-op-ink">Formato</legend>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="csv"
                    defaultChecked
                    className="accent-ln-op-azul"
                  />
                  CSV
                </label>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input type="radio" name="format" value="json" className="accent-ln-op-azul" />
                  JSON
                </label>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer opacity-50">
                  <input type="radio" name="format" value="parquet" disabled />
                  {"Parquet — proximamente"}
                </label>
              </div>
            </fieldset>

            <Button type="submit">Generar export</Button>
          </form>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
