import Link from "next/link";

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { fetchRegionRanking } from "@/lib/analytics-ranking";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { deathCauseLabel } from "@/lib/format";
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
import {
  TARGETS,
  buildProjectionContext,
  fetchKpiTrend,
  fetchOutbreakSignalsTrend,
  toneForTarget,
} from "@/lib/metrics";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { AcquisitionChartDynamic } from "./_components/AcquisitionChartDynamic";
import { OutbreakHistoryTable } from "./_components/OutbreakHistoryTable";
import { RegionRankingTable } from "./_components/RegionRankingTable";

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

  const period = resolveAnalyticsPeriod(sp);
  const { since } = period;
  // ProjectionContext for the D1 trend fetcher (scope-aware, period-aware).
  const trendCtx = buildProjectionContext(actor, filteredJurisdictions, period);

  const [
    metrics,
    acquisitionTrend,
    deathCauses,
    outbreakHistory,
    casesPerCapita,
    regionRanking,
    signalsTrend,
    petRegisteredTrend,
  ] = await Promise.all([
    fetchAnalyticsMetrics(actor, filteredJurisdictions, { since }),
    fetchAcquisitionTrend(actor, filteredJurisdictions, { since }),
    fetchDeathCauses(actor, filteredJurisdictions, { since }),
    fetchOutbreakHistory(actor, filteredJurisdictions),
    fetchCasesPerCapita(actor, filteredJurisdictions),
    fetchRegionRanking(actor, filteredJurisdictions),
    fetchOutbreakSignalsTrend(trendCtx),
    // Sparkline for "Pets totales" KPI — registrations trend via pet_registered events.
    fetchKpiTrend("pet_registered", trendCtx),
  ]);

  // Shape the outbreak-signals trend for TimeSeriesChart.
  const signalsTrendPoints = signalsTrend.points.map((p) => ({ x: p.x, y: p.y }));
  const signalsBucketWord = signalsTrend.granularity === "month" ? "mes" : "semana";

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Shape map data -- per-capita rate per province (casos por 10k hab., INDEC 2022).
  // Provinces with no census row (ratePer10k === null) are omitted so the map
  // renders them as COLOR_NO_DATA ("sin datos") instead of mixing a raw count
  // onto the per-capita scale (which would produce false hotspots).
  const choroplethData = casesPerCapita
    .filter((row) => row.code !== "" && row.ratePer10k !== null)
    .map((row) => ({
      code: row.code,
      value: row.ratePer10k as number,
      label: `${(row.ratePer10k as number).toFixed(1)} casos por 10k hab.`,
    }));

  // Compute bar chart max for death causes.
  const maxDeathCount = deathCauses.reduce((m, r) => Math.max(m, r.count), 0);

  const panelAcquisitionId = "panel-acquisition-titulo";
  const panelMapId = "panel-mapa-analytics-titulo";
  const panelDeathId = "panel-death-titulo";
  const panelOutbreakId = "panel-outbreak-titulo";
  const panelRankingId = "panel-ranking-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia sanitaria · Analítica
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Analítica</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Métricas analíticas de salud animal y gestión de mascotas en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="trailing12m" />
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
          sparkline={
            petRegisteredTrend.points.length > 0
              ? petRegisteredTrend.points.map((p) => p.y)
              : undefined
          }
          href="/gob/perdidas"
          info={{
            definition:
              "Total de mascotas con estado activo o perdido en la jurisdicción y período seleccionados.",
            formula: "COUNT(pets WHERE status IN ('active','lost'))",
          }}
        />
        <OpKpi
          label="Tasa de adopción (12m)"
          value={`${metrics.adoptionRate}%`}
          tone={toneForTarget(metrics.adoptionRate, TARGETS.ADOPTION_RATE_PCT)}
          bar={metrics.adoptionRate}
          sub={`meta ${TARGETS.ADOPTION_RATE_PCT}% del total de adquisiciones`}
          info={{
            definition: `Porcentaje de mascotas adquiridas por adopción sobre el total de adquisiciones en el período (A3). Meta interna: ${TARGETS.ADOPTION_RATE_PCT}%.`,
            formula: "COUNT(acquisition_method='adoption') / COUNT(all acquisitions) × 100",
          }}
        />
        <OpKpi
          label="Cobertura antirrábica"
          value={`${metrics.rabiesVaccinationRate}%`}
          tone={toneForTarget(metrics.rabiesVaccinationRate, TARGETS.RABIES_COVERAGE_PCT)}
          bar={metrics.rabiesVaccinationRate}
          sub={`meta ${TARGETS.RABIES_COVERAGE_PCT}% · pets con ≥1 vacuna antirrábica`}
          href="/gob/vigilancia"
          info={{
            definition: `Porcentaje de mascotas activas con al menos una vacunación antirrábica registrada. Meta de salud pública: ${TARGETS.RABIES_COVERAGE_PCT}%.`,
            formula:
              "COUNT(pets con vaccination_administered ~* 'antirr[áa]bica|rabies') / COUNT(pets activos) × 100",
            caveat: "Solo vacunas registradas en MiMAR. La cobertura real puede ser mayor.",
          }}
        />
        <OpKpi
          label="Disputas de custodia"
          value={String(metrics.custodyDisputes)}
          tone={metrics.custodyDisputes > 0 ? "warn" : undefined}
          sub="casos abiertos"
          href="/gob/disputas"
          info={{
            definition:
              "Cantidad de casos de tipo 'custody_dispute' con estado abierto en la jurisdicción seleccionada.",
            formula: "COUNT(cases WHERE caseKind='custody_dispute' AND status='open')",
          }}
        />
      </section>

      {/* Acquisition trend + export */}
      <OpCard aria-labelledby={panelAcquisitionId}>
        <OpCardHead
          title={<span id={panelAcquisitionId}>Adquisición por método</span>}
          actions={
            <Link
              href="/gob/analytics/export"
              className="text-sm text-ln-op-azul hover:underline no-underline"
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
            <AcquisitionChartDynamic data={acquisitionTrend} />
          )}
        </OpCardBody>
      </OpCard>

      {/* D1 — señales de brote por período (tendencia) */}
      <OpCard aria-labelledby="panel-signals-trend-titulo">
        <OpCardHead
          title={
            <span id="panel-signals-trend-titulo">Señales de brote por {signalsBucketWord}</span>
          }
          actions={
            signalsTrend.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {signalsTrend.suppressedCount}{" "}
                {signalsTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {signalsTrendPoints.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin señales en el período"
              description="No se registraron señales de brote en el rango y la cobertura seleccionados."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={signalsTrendPoints}
              seriesLabel="Señales"
              variant="area"
              fallbackTableLabel={`Señales de brote por ${signalsBucketWord}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Geographic distribution + cross-region ranking */}
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
          <MapChoroplethDynamic
            data={choroplethData}
            scaleLabel="Casos por 10k hab."
            fallbackTableLabel="Casos por 10.000 habitantes por provincia"
          />
        </OpCardBody>
      </OpCard>

      {/* Cross-region ranking table (Item 22) */}
      {(regionRanking.top.length > 0 || regionRanking.bottom.length > 0) && (
        <OpCard aria-labelledby={panelRankingId}>
          <OpCardHead
            title={
              <span id={panelRankingId}>
                Ranking por cobertura antirrábica{" "}
                <span className="text-[11px] font-normal text-ln-op-mute">por provincia</span>
              </span>
            }
          />
          <OpCardBody>
            <RegionRankingTable top={regionRanking.top} bottom={regionRanking.bottom} />
          </OpCardBody>
        </OpCard>
      )}

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
                  <span className="w-28 shrink-0 text-[13px] text-ln-op-ink">
                    {deathCauseLabel(row.cause)}
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

      <DashboardFreshnessFooter ctx={trendCtx} />
    </div>
  );
}
