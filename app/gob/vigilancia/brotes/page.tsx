import {
  Checkbox,
  EmptyState,
  JurisdictionSwitcher,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
} from "@/components/poncho";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { computeConfidence, isAtLeast } from "@/lib/event-confidence";
import {
  type DashboardJurisdiction,
  PROVINCE_ISO_MAP,
  fetchSurveillanceSignals,
} from "@/lib/govt-dashboards";
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
    province?: string;
    locality?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Resolve selected province ISO code → ProvinceCode + canonical name.
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  // Fetch localities for the selected province to populate <JurisdictionSwitcher>.
  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  // Resolve locality slug → canonical name for data-fetcher narrowing.
  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  // Narrow jurisdictions when a province/locality filter is active.
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      // Province + locality: intersect with the user's actual assignments so a
      // govt user cannot widen scope by crafting arbitrary ?province=&locality= params.
      // govtAssignments.jurisdictionLocality is NOT NULL (schema-enforced), so exact
      // match is correct — no null-locality province-level rows exist.
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  const allSignals = await fetchSurveillanceSignals(actor, filteredJurisdictions, { since });

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
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
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
