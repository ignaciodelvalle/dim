import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { fetchRegionRanking } from "@/lib/analytics/analytics-ranking";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
  RABIES_VACCINATION_RATE_LABEL_ES,
  fetchAcquisitionTrend,
  fetchAnalyticsMetrics,
  fetchDeathCauses,
  fetchOutbreakHistory,
} from "@/lib/analytics/govt-dashboards";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchKpiTrend,
  fetchOutbreakSignalsTrend,
  fetchVetAccessByLocality,
  toneForTarget,
} from "@/lib/metrics";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { deathCauseLabel, formatPercent } from "@/lib/utils/format";
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
          description="Tu rol no tiene acceso a analytics. Un administrador debe asignarte las capacidades correspondientes."
          action={
            <a
              className="text-sm text-[var(--color-ln-azul)] underline underline-offset-4"
              href="mailto:hola@mimar.ar?subject=MiMAR%20%E2%80%94%20Acceso%20a%20analytics"
            >
              Solicitar acceso
            </a>
          }
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
    regionRanking,
    signalsTrend,
    petRegisteredTrend,
    vetAccess,
  ] = await Promise.all([
    fetchAnalyticsMetrics(actor, filteredJurisdictions, { since }),
    fetchAcquisitionTrend(actor, filteredJurisdictions, { since }),
    fetchDeathCauses(actor, filteredJurisdictions, { since }),
    fetchOutbreakHistory(actor, filteredJurisdictions),
    fetchRegionRanking(actor, filteredJurisdictions),
    fetchOutbreakSignalsTrend(trendCtx),
    // Sparkline for "Pets totales" KPI — registrations trend via pet_registered events.
    fetchKpiTrend("pet_registered", trendCtx),
    // Access-to-care gap: vet visits per 1k active pets by locality (care deserts).
    fetchVetAccessByLocality(trendCtx),
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

  // Compute bar chart max for death causes.
  const maxDeathCount = deathCauses.reduce((m, r) => Math.max(m, r.count), 0);

  const panelAcquisitionId = "panel-acquisition-titulo";
  const panelDeathId = "panel-death-titulo";
  const panelOutbreakId = "panel-outbreak-titulo";
  const panelRankingId = "panel-ranking-titulo";
  const panelVetAccessId = "panel-vet-access-titulo";
  // Lowest-access localities first (care deserts). fetchVetAccessByLocality
  // already sorts ascending by per1k; cap the table at the 8 lowest.
  const vetAccessRows = vetAccess.localities.slice(0, 8);

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
          label="Mascotas totales"
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
          value={formatPercent(metrics.adoptionRate)}
          tone={toneForTarget(metrics.adoptionRate, TARGETS.ADOPTION_RATE_PCT)}
          bar={metrics.adoptionRate}
          sub={`meta ${TARGETS.ADOPTION_RATE_PCT}% del total de adquisiciones`}
          info={{
            definition: `Porcentaje de mascotas adquiridas por adopción sobre el total de adquisiciones en el período (A3). Meta interna: ${TARGETS.ADOPTION_RATE_PCT}%.`,
            formula: "COUNT(acquisition_method='adoption') / COUNT(all acquisitions) × 100",
          }}
        />
        <OpKpi
          label={RABIES_VACCINATION_RATE_LABEL_ES}
          value={formatPercent(metrics.rabiesVaccinationRate)}
          tone="blue"
          bar={metrics.rabiesVaccinationRate}
          sub="histórico · toda especie con ≥1 dosis registrada"
          href="/gob/vigilancia"
          info={{
            definition:
              "Vista histórica: porcentaje de mascotas activas de CUALQUIER especie con al menos una vacunación antirrábica registrada alguna vez. NO es la métrica de cumplimiento — esa es la cobertura antirrábica del Panel/Panorama (perros con dosis en los últimos 12 meses, Ley 22.953). Por eso este número es más alto.",
            formula:
              "COUNT(pets activos, toda especie, con ≥1 vaccination_administered ~ 'rabi' alguna vez) / COUNT(pets activos) × 100",
            caveat:
              "Sin ventana temporal ni scope de perros: cuenta cualquier dosis histórica. Para el cumplimiento legal usá la tile del Panel.",
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
              "Disputas de custodia abiertas en la jurisdicción seleccionada — la misma cola accionable que lista /gob/disputas.",
            formula: "COUNT(custody_disputes WHERE status='open')",
          }}
        />
      </section>

      {/* Acquisition trend. The "Exportar CSV →" link to /gob/analytics/export
          was removed — that export flow is half-wired (see the DEFERRED BY
          DESIGN header comment on that route) and was never meant to be
          reachable from nav; the route file itself is left in place for when
          the export flow is picked back up. */}
      <OpCard aria-labelledby={panelAcquisitionId}>
        <OpCardHead title={<span id={panelAcquisitionId}>Adquisición por método</span>} />
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

      {/* Cross-region ranking table (Item 22). A "casos por 10k hab." choropleth
          previously sat above this — removed: same spatial question (open-case
          distribution by province) as /gob/vigilancia's national map, just
          normalized instead of raw. Demoted per PO review; raw counts remain
          visible on /gob/vigilancia. */}
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

      {/* Vet-access gap — vet visits per 1.000 active pets by locality. Lowest
          per-1k localities are care deserts (the CABA vs periphery inequity).
          Locality-grouped → k-anon (k=5) suppression on the active-pet population. */}
      <OpCard aria-labelledby={panelVetAccessId}>
        <OpCardHead
          title={<span id={panelVetAccessId}>Acceso veterinario por localidad</span>}
          actions={
            vetAccess.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {vetAccess.suppressedCount}{" "}
                {vetAccess.suppressedCount === 1 ? "localidad oculta" : "localidades ocultas"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {vetAccessRows.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos de acceso veterinario"
              description="No hay localidades con población activa suficiente (k-anonimato) en la cobertura seleccionada."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Visitas veterinarias por cada 1.000 mascotas activas, por localidad, de menor a
                  mayor acceso.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Localidad
                    </th>
                    <th scope="col" className="text-right py-2 px-4 font-semibold text-ln-op-mute">
                      Visitas / 1.000
                    </th>
                    <th scope="col" className="text-right py-2 px-4 font-semibold text-ln-op-mute">
                      Visitas
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      Activos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vetAccessRows.map((r) => (
                    <tr
                      key={`${r.province}::${r.locality}`}
                      className="border-b border-ln-op-line last:border-0 hover:bg-ln-op-stripe/50 transition-colors"
                    >
                      <td className="py-2 pr-4">
                        {r.locality}
                        <span className="text-ln-op-mute"> · {r.province}</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {r.per1k.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-ln-op-mute">
                        {r.visits.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums text-ln-op-mute">
                        {r.activePets.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ln-op-mute">
                Ordenado de menor a mayor acceso — las primeras filas son desiertos de atención.
                Denominador: mascotas activas de la localidad (no censo humano). Localidades con
                menos de 5 activos se ocultan por k-anonimato.
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* Top 10 death causes -- v1: simple HTML/CSS bars (spec B.6 doesn't mandate recharts here) */}
      <OpCard aria-labelledby={panelDeathId}>
        <OpCardHead title={<span id={panelDeathId}>Principales causas de muerte (12m)</span>} />
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
        <OpCardHead title={<span id={panelOutbreakId}>Brotes históricos</span>} />
        <OpCardBody>
          <OutbreakHistoryTable rows={outbreakHistory} />
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={trendCtx} />
    </div>
  );
}
