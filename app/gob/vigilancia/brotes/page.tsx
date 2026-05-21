import {
  EmptyState,
  JurisdictionSwitcher,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { PROVINCE_ISO_MAP, fetchSurveillanceSignals } from "@/lib/govt-dashboards";
import { OutbreakSignalRow } from "../_components/OutbreakSignalRow";

// All provinces in the GeoJSON placeholder (same list as the parent page).
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

export default async function GobVigilanciaBrotesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; signalId?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const signals = await fetchSurveillanceSignals(actor, jurisdictions, { since });

  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const panelId = "panel-brotes-titulo";

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Brotes y signals epidemiológicos
          </h1>
          <p className="text-sm text-gob-text-gray">
            Lista completa de outbreak signals en tu cobertura.
          </p>
        </header>

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          {/* TODO(future): filter by disease_code + confirmation_strength chips */}
          {/* localities empty v1 — TODO(E2-followup): fetch localities for selected province */}
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        <Panel aria-labelledby={panelId}>
          <PanelHeader
            title={
              <span id={panelId}>
                {signals.length} signal{signals.length !== 1 ? "s" : ""}
              </span>
            }
          />
          <PanelBody>
            {signals.length === 0 ? (
              <EmptyState
                icon="shield-check"
                title="Sin signals activos en este período"
                description="No se detectaron señales de zoonosis en el rango seleccionado."
              />
            ) : (
              <ul>
                {signals.map((s) => (
                  <OutbreakSignalRow key={s.signalEventId} signal={s} />
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
