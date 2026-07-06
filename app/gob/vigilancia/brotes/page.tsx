import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import {
  type DashboardJurisdiction,
  PROVINCE_ISO_MAP,
  fetchSurveillanceSignals,
} from "@/lib/analytics/govt-dashboards";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { OutbreakSignalRow } from "../_components/OutbreakSignalRow";
import { VerifiedFilterCheckbox } from "../_components/VerifiedFilterCheckbox";

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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia · Brotes
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Brotes y señales epidemiológicas
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Lista completa de señales de brote en tu cobertura."}
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
          <VerifiedFilterCheckbox defaultChecked={soloVerificados} />
          {soloVerificados && (
            <a
              href={`/gob/vigilancia/brotes${sp.period ? `?period=${sp.period}` : ""}`}
              className="text-sm text-ln-op-mute underline"
            >
              Quitar filtro
            </a>
          )}
        </form>
      </div>

      <OpCard aria-labelledby={panelId}>
        <OpCardHead
          title={
            <span id={panelId}>
              {signals.length} señal{signals.length !== 1 ? "es" : ""}
            </span>
          }
        />
        <OpCardBody className="p-0">
          {signals.length === 0 ? (
            <div className="px-4 py-3">
              <LnEmptyState
                icon="shield-check"
                title="Sin señales activas en este período"
                description="No se detectaron señales de zoonosis en el rango seleccionado."
              />
            </div>
          ) : (
            <ul className="px-3">
              {signals.map((s) => (
                <OutbreakSignalRow key={s.signalEventId} signal={s} />
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>
    </div>
  );
}
