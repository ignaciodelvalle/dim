import {
  Checkbox,
  EmptyState,
  JurisdictionSwitcher,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { computeConfidence, isAtLeast } from "@/lib/event-confidence";
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
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    signalId?: string;
    soloVerificados?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const allSignals = await fetchSurveillanceSignals(actor, jurisdictions, { since });

  // A.5: tier-based filter — "Solo verificados institucionalmente"
  // When the checkbox is active, filter to signals where tier >= professional_verified.
  const soloVerificados = sp.soloVerificados === "1";
  const signals = soloVerificados
    ? allSignals.filter((s) =>
        isAtLeast(
          computeConfidence({
            authorRole: s.authorRole,
            authorVerified: s.authorVerified,
            authorOrganizationId: s.authorOrganizationId,
            payload: s.payload,
          }),
          "professional_verified",
        ),
      )
    : allSignals;

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

        {/* A.5: confidence tier filter */}
        <div className="flex items-center gap-2">
          <form method="GET" className="flex items-center gap-2">
            {/* Preserve existing params */}
            {sp.period && <input type="hidden" name="period" value={sp.period} />}
            {sp.signalId && <input type="hidden" name="signalId" value={sp.signalId} />}
            <Checkbox
              name="soloVerificados"
              value="1"
              defaultChecked={soloVerificados}
              onChange={(e) => {
                // Progressive enhancement: submit form on change
                e.currentTarget.form?.submit();
              }}
            >
              Solo verificados institucionalmente
            </Checkbox>
            {soloVerificados && (
              <a
                href={`/gob/vigilancia/brotes${sp.period ? `?period=${sp.period}` : ""}`}
                className="text-xs text-gob-text-gray underline"
              >
                Quitar filtro
              </a>
            )}
          </form>
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
