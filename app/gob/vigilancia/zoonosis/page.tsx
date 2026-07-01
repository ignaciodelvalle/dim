import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
  fetchDiseaseSummary,
  fetchZoonosisTrend,
} from "@/lib/analytics/govt-dashboards";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { DiseaseSummaryTable } from "../_components/DiseaseSummaryTable";

export const dynamic = "force-dynamic";

export default async function GobVigilanciazoonosisPage({
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
  const actor = { role: profile.role };

  const sp = await searchParams;
  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Resolve selected province ISO code → Province object + localities list.
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  // Narrow the jurisdictions array to the selected province/locality when a
  // filter is active. Intersect with the user's actual assignments so a govt
  // user cannot widen scope via crafted params. Admin short-circuits inside
  // the fetchers so we leave jurisdictions unchanged for admins.
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  const [summary, trend] = await Promise.all([
    fetchDiseaseSummary(actor, filteredJurisdictions, { since }),
    fetchZoonosisTrend(actor, filteredJurisdictions),
  ]);

  const trendPoints = trend
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((t) => ({ x: t.x, y: t.y }));

  // Build allowedProvinces for <JurisdictionSwitcher> — admin: full list;
  // govt: unique provinces from assigned jurisdictions.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const panelTableId = "panel-zoonosis-tabla-titulo";
  const panelTrendId = "panel-zoonosis-trend-titulo";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia · Zoonosis
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Enfermedades reportables</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Resumen por enfermedad y tendencia mensual en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* TODO(future): per-disease breakdown with filter chips */}

      <OpCard aria-labelledby={panelTableId}>
        <OpCardHead title={<span id={panelTableId}>Resumen por enfermedad ({days} días)</span>} />
        <OpCardBody className="p-0">
          <div className="px-4 py-3">
            <DiseaseSummaryTable summary={summary} windowDays={days} />
          </div>
        </OpCardBody>
      </OpCard>

      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={
            <span id={panelTrendId}>Tendencia mensual de enfermedades reportables (12 meses)</span>
          }
        />
        <OpCardBody>
          <TimeSeriesChart data={trendPoints} seriesLabel="Signals" />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
