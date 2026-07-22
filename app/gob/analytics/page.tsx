import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpFilterBar, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { fetchRegionRanking } from "@/lib/analytics/analytics-ranking";
import {
  RABIES_VACCINATION_RATE_LABEL_ES,
  fetchAcquisitionTrend,
  fetchAnalyticsMetrics,
  fetchCasesPerCapita,
  fetchDeathCauses,
  fetchOutbreakHistory,
} from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchKpiTrend,
  fetchOutbreakSignalsTrend,
  fetchVetAccessByLocality,
  toneForTarget,
} from "@/lib/metrics";
import { getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { deathCauseLabel, formatPercent } from "@/lib/utils/format";
import { AcquisitionChartDynamic } from "./_components/AcquisitionChartDynamic";
import { CasesPerCapitaTable } from "./_components/CasesPerCapitaTable";
import { OutbreakHistoryTable } from "./_components/OutbreakHistoryTable";
import { RegionRankingTable } from "./_components/RegionRankingTable";

export const dynamic = "force-dynamic";

type AnalyticsSearchParams = {
  period?: string;
  from?: string;
  to?: string;
  province?: string;
  locality?: string;
};

// "Exportar datos" mirrors the active period + jurisdiction filters — the
// export page (export/page.tsx) reads these same searchParam keys to
// pre-fill its PeriodPicker/JurisdictionSwitcher (same pattern as
// censo/poblacion/adopciones/campanas' `exportHref`, dec0f58f). Pulled out of
// the page component to keep its cognitive-complexity score under budget.
function buildAnalyticsExportHref(sp: AnalyticsSearchParams): string {
  const exportParams = new URLSearchParams();
  if (sp.period) exportParams.set("period", sp.period);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  if (sp.province) exportParams.set("province", sp.province);
  if (sp.locality) exportParams.set("locality", sp.locality);
  return `/gob/analytics/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;
}

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
              href="mailto:hola@mimar.ar?subject=miMAR%20%E2%80%94%20Acceso%20a%20analytics"
            >
              Solicitar acceso
            </a>
          }
        />
      </div>
    );
  }

  const sp = await searchParams;

  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });
  // Both undefined unless role === "admin" (resolveJurisdictionScope's guarantee) —
  // hoisted once so every fetcher below shares the identical admin-scope value
  // (same pattern as /gob/perdidas).
  const adminProvince = adminSelectedProvince ?? undefined;
  const adminLocality = adminSelectedLocality ?? undefined;

  const exportHref = buildAnalyticsExportHref(sp);

  const period = resolveAnalyticsPeriod(sp);
  const { since } = period;
  // ProjectionContext for the D1 trend fetcher (scope-aware, period-aware).
  const trendCtx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Vigilancia sanitaria · Analítica
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Analítica</h1>
      <p className="text-[13px] text-ln-op-mute">
        {profile.role === "admin"
          ? "Vista universal — todas las jurisdicciones."
          : "Métricas analíticas de salud animal y gestión de mascotas en tu cobertura."}
      </p>
    </header>
  );

  // D2: bound the fetcher set with a deadline so a pathological query degrades
  // to an honest "tardando… reintentar" state instead of hanging the page.
  const load = await loadWithTimeout(
    Promise.all([
      // Every fetcher below now honors the admin province/locality drill-down
      // (scope-helpers-admin-fix honesty sweep) — mirrors fetchPerdidasMetrics'
      // admin branch, additive-only (never widens scope for govt callers).
      fetchAnalyticsMetrics(actor, filteredJurisdictions, { since, adminProvince, adminLocality }),
      fetchAcquisitionTrend(actor, filteredJurisdictions, { since, adminProvince, adminLocality }),
      fetchDeathCauses(actor, filteredJurisdictions, { since, adminProvince, adminLocality }),
      fetchOutbreakHistory(actor, filteredJurisdictions, { adminProvince, adminLocality }),
      fetchRegionRanking(actor, filteredJurisdictions, { adminProvince, adminLocality }),
      // E1 (2026-07-21 facades harvest) — population-adjusted per-capita open
      // cases (INDEC 2022). No admin province/locality drill-down param: the
      // fetcher scopes by actor+jurisdictions only (province-level census
      // join), matching its existing tested contract.
      fetchCasesPerCapita(actor, filteredJurisdictions),
      fetchOutbreakSignalsTrend(trendCtx),
      // Sparkline for "Pets totales" KPI — registrations trend via pet_registered events.
      fetchKpiTrend("pet_registered", trendCtx),
      // Access-to-care gap: vet visits per 1k active pets by locality (care deserts).
      fetchVetAccessByLocality(trendCtx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/analytics", sp)}
        />
      </div>
    );
  }

  const [
    metrics,
    acquisitionTrend,
    deathCauses,
    outbreakHistory,
    regionRanking,
    casesPerCapita,
    signalsTrend,
    petRegisteredTrend,
    vetAccess,
  ] = load.value;

  // Shape the outbreak-signals trend for TimeSeriesChart.
  const signalsTrendPoints = signalsTrend.points.map((p) => ({ x: p.x, y: p.y }));
  const signalsBucketWord = signalsTrend.granularity === "month" ? "mes" : "semana";

  // Compute bar chart max for death causes.
  const maxDeathCount = deathCauses.reduce((m, r) => Math.max(m, r.count), 0);

  const panelAcquisitionId = "panel-acquisition-titulo";
  const panelDeathId = "panel-death-titulo";
  const panelOutbreakId = "panel-outbreak-titulo";
  const panelRankingId = "panel-ranking-titulo";
  const panelPerCapitaId = "panel-percapita-titulo";
  const panelVetAccessId = "panel-vet-access-titulo";
  // Lowest-access localities first (care deserts). fetchVetAccessByLocality
  // already sorts ascending by per1k; cap the table at the 8 lowest.
  const vetAccessRows = vetAccess.localities.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Unified filter bar — jurisdiction + period, with "Exportar datos" rendered
          via the bar's `actions` slot (same pattern as /gob/censo's "Exportar CSV"). */}
      <OpFilterBar
        period={{ defaultPreset: "trailing12m" }}
        jurisdiction={{ allowedProvinces, localities }}
        actions={
          <a href={exportHref} className="text-[var(--text-md)] text-ln-op-azul hover:underline">
            Exportar datos →
          </a>
        }
      />

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
          info={getKpiInfo("rabies_vaccination_rate_all_species")}
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

      {/* Acquisition trend. The "Exportar datos" CTA lives in the filter bar's
          `actions` slot above (2026-07-21 rewire) — not beside this panel. */}
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
          normalized instead of raw. The CHOROPLETH form was demoted per PO
          review; the underlying metric (fetchCasesPerCapita) was reinstated
          below as a compact ranking table (E1, 2026-07-21 facades harvest) —
          raw counts remain visible on /gob/vigilancia. */}
      {(regionRanking.top.length > 0 || regionRanking.bottom.length > 0) && (
        <OpCard aria-labelledby={panelRankingId}>
          <OpCardHead
            title={
              <span id={panelRankingId}>
                Ranking · {RABIES_VACCINATION_RATE_LABEL_ES}{" "}
                <span className="text-[11px] font-normal text-ln-op-mute">por provincia</span>
              </span>
            }
          />
          <OpCardBody>
            <RegionRankingTable
              top={regionRanking.top}
              bottom={regionRanking.bottom}
              coverageLabel={RABIES_VACCINATION_RATE_LABEL_ES}
            />
          </OpCardBody>
        </OpCard>
      )}

      {/* E1 (2026-07-21 facades harvest) — population-adjusted per-capita open
          cases (INDEC 2022). Built + unit-tested since before this pass, with
          zero callers anywhere in app/ until now. */}
      <OpCard aria-labelledby={panelPerCapitaId}>
        <OpCardHead
          title={
            <span id={panelPerCapitaId}>
              Incidencia de casos abiertos por habitante{" "}
              <span className="text-[var(--text-sm)] font-normal text-ln-op-mute">INDEC 2022</span>
            </span>
          }
        />
        <OpCardBody>
          <CasesPerCapitaTable rows={casesPerCapita} />
        </OpCardBody>
      </OpCard>

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
