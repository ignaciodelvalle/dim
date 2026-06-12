import Link from "next/link";

import { MapChoropleth } from "@/components/charts/MapChoropleth";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
  fetchAcquisitionTrend,
  fetchAnalyticsMetrics,
  fetchCasesPerCapita,
  fetchDeathCauses,
  fetchOutbreakHistory,
} from "@/lib/govt-dashboards";
import { AcquisitionChart } from "./_components/AcquisitionChart";
import { OutbreakHistoryTable } from "./_components/OutbreakHistoryTable";

export const dynamic = "force-dynamic";

export default async function GobAnalyticsPage({
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

  // Capability guard: analytics.read = admin OR (govt AND has assignments).
  // v1 derives capability from role + jurisdictions; no dedicated capability column.
  const hasAnalyticsRead =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAnalyticsRead) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a analytics. Pedile al admin que te asigne capabilities."
        />
      </div>
    );
  }

  const sp = await searchParams;

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

  // Narrow the jurisdictions array to the selected province/locality when a filter
  // is active. Admin short-circuits inside the fetchers so we leave jurisdictions
  // unchanged for admins.
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

  const { since } = resolveAnalyticsPeriod(sp);

  const [metrics, acquisitionTrend, deathCauses, outbreakHistory, casesPerCapita] =
    await Promise.all([
      fetchAnalyticsMetrics(actor, filteredJurisdictions, { since }),
      fetchAcquisitionTrend(actor, filteredJurisdictions, { since }),
      fetchDeathCauses(actor, filteredJurisdictions, { since }),
      fetchOutbreakHistory(actor, filteredJurisdictions),
      fetchCasesPerCapita(actor, filteredJurisdictions),
    ]);

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Shape map data -- per-capita rate per province (casos por 10k hab., INDEC 2022).
  // Falls back to raw count label when census row is absent for a province.
  const choroplethData = casesPerCapita
    .filter((row) => row.code !== "")
    .map((row) => ({
      code: row.code,
      value: row.ratePer10k ?? row.count,
      label:
        row.ratePer10k !== null
          ? `${row.ratePer10k.toFixed(1)} casos por 10k hab.`
          : `${row.count} caso${row.count !== 1 ? "s" : ""} abierto${row.count !== 1 ? "s" : ""}`,
    }));

  // Compute bar chart max for death causes.
  const maxDeathCount = deathCauses.reduce((m, r) => Math.max(m, r.count), 0);

  const panelAcquisitionId = "panel-acquisition-titulo";
  const panelMapId = "panel-mapa-analytics-titulo";
  const panelDeathId = "panel-death-titulo";
  const panelOutbreakId = "panel-outbreak-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Analytics
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Analytics</h1>
        <p className="text-[13px] text-ln-op-mute">
          Métricas analíticas de salud animal y gestión de mascotas en tu cobertura.
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* 4 KPI tiles */}
      <section
        aria-label="Indicadores de analytics"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Pets totales"
          value={String(metrics.totalPets)}
          sub="activos + perdidos"
          href="/gob/perdidas"
        />
        <OpKpi
          label="Tasa de adopción (12m)"
          value={`${metrics.adoptionRate}%`}
          tone={metrics.adoptionRate >= 20 ? "ok" : undefined}
          sub="del total de adquisiciones"
        />
        <OpKpi
          label="Cobertura antirrábica"
          value={`${metrics.rabiesVaccinationRate}%`}
          tone={
            metrics.rabiesVaccinationRate >= 70
              ? "ok"
              : metrics.rabiesVaccinationRate >= 40
                ? "warn"
                : "danger"
          }
          sub="pets con >= 1 vacuna antirrábica"
          href="/gob/vigilancia"
        />
        <OpKpi
          label="Disputas de custodia"
          value={String(metrics.custodyDisputes)}
          tone={metrics.custodyDisputes > 0 ? "warn" : undefined}
          sub="casos abiertos"
          href="/gob/disputas"
        />
      </section>

      {/* Acquisition trend + export */}
      <OpCard aria-labelledby={panelAcquisitionId}>
        <OpCardHead
          title={<span id={panelAcquisitionId}>Adquisición por método</span>}
          actions={
            <Link
              href="/gob/analytics/export"
              className="text-[12px] text-ln-op-azul hover:underline no-underline"
            >
              {"Exportar CSV →"}
            </Link>
          }
        />
        <OpCardBody>
          {acquisitionTrend.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos de adquisición"
              description="No hay registros de mascotas con método de adquisición en los últimos 12 meses."
            />
          ) : (
            <AcquisitionChart data={acquisitionTrend} />
          )}
        </OpCardBody>
      </OpCard>

      {/* Geographic distribution -- cases as proxy for population. */}
      <OpCard aria-labelledby={panelMapId}>
        <OpCardHead
          title={
            <span id={panelMapId}>
              Distribución geográfica{" "}
              <span className="text-[11px] font-normal text-ln-op-mute">
                por 10.000 hab. (INDEC 2022)
              </span>
            </span>
          }
        />
        <OpCardBody>
          <MapChoropleth data={choroplethData} />
        </OpCardBody>
      </OpCard>

      {/* Top 10 death causes -- v1: simple HTML/CSS bars (spec B.6 doesn't mandate recharts here) */}
      <OpCard aria-labelledby={panelDeathId}>
        <OpCardHead title={<span id={panelDeathId}>Top 10 causas de muerte (12m)</span>} />
        <OpCardBody>
          {deathCauses.length === 0 ? (
            <LnEmptyState
              icon="heart"
              title="Sin datos de fallecimiento"
              description="No hay eventos de fallecimiento en los últimos 12 meses en tu cobertura."
            />
          ) : (
            <ul className="space-y-2">
              {deathCauses.map((row) => (
                <li key={row.cause} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[13px] text-ln-op-ink capitalize">
                    {row.cause}
                  </span>
                  <div className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden">
                    <div
                      className="h-full rounded bg-ln-op-azul"
                      style={{
                        width: maxDeathCount > 0 ? `${(row.count / maxDeathCount) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* v1 uses HTML bars; full recharts BarChart can replace this in a follow-up */}
        </OpCardBody>
      </OpCard>

      {/* Outbreak history table */}
      <OpCard aria-labelledby={panelOutbreakId}>
        <OpCardHead title={<span id={panelOutbreakId}>Brotes historicos</span>} />
        <OpCardBody>
          <OutbreakHistoryTable rows={outbreakHistory} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
