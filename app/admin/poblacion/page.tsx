// /admin/poblacion — Control poblacional (vista admin universal, Paquete G).
//
// Universal view: no JurisdictionSwitcher, admin sees all pets regardless of province.
// Adds a cross-province sterilization-coverage ranked table on top of the gob/poblacion panels.
//
// Layout:
//   KPI row      — cobertura esterilización · preñeces activas · nacimientos registrados ·
//                  balance poblacional
//   Ratio sub    — ratio esterilización/natalidad
//   Trend        — TimeSeriesChart (sterilization_performed)
//   Tabla ranked — per-province sterilization coverage (<table>)
//   Freshness footer
//
// PANORAMA NOTE: The Paquete G Panorama layer/preset is deferred to a separate
// work unit. This page is the standalone admin dashboard — not the Panorama integration.

import { ForecastChartDynamic } from "@/components/charts/ForecastChartDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { DEFAULT_DASHBOARD_PRESET } from "@/lib/analytics/analytics-period";
import { formatDelta } from "@/lib/analytics/campaign-metrics";
import { adminProvinceHref } from "@/lib/infra/admin-province-link";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchActivePregnancies,
  fetchNetGrowth,
  fetchPrevRegisteredBirths,
  fetchReproductiveOutcomes,
  fetchSterilizationCoverage,
  fetchSterilizationNatalidadRatio,
  fetchSterilizationTrend,
  projectSeries,
  toneForTarget,
} from "@/lib/metrics";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { formatPercent, formatRate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminPoblacionPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  const sp = searchParams ? await searchParams : {};
  const { resolveAnalyticsPeriod } = await import("@/lib/metrics/period");
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();

  const ctx = buildProjectionContext({ role: "admin" }, [], period);

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Admin · Control poblacional nacional
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Control poblacional</h1>
      <p className="text-[13px] text-ln-op-mute">
        Vista nacional: cobertura de esterilización, reproducción y balance, con ranking por
        provincia.
      </p>
    </header>
  );

  // D2: bound the fetcher set with a deadline (see /admin/censo).
  // fetchPrevRegisteredBirths adds ONE new query (same scope, shifted one
  // period back) purely to power the "Nacimientos registrados" deltaV2 chip —
  // mirrors campaign-metrics.ts' fetchPrevTotals pattern (same as /gob/poblacion).
  const load = await loadWithTimeout(
    Promise.all([
      fetchSterilizationCoverage(ctx),
      fetchActivePregnancies(ctx),
      fetchReproductiveOutcomes(ctx),
      fetchNetGrowth(ctx),
      fetchSterilizationNatalidadRatio(ctx),
      fetchSterilizationTrend(ctx),
      fetchPrevRegisteredBirths(ctx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/admin/poblacion", sp)}
        />
      </div>
    );
  }

  const [
    coverage,
    activePregnancies,
    outcomes,
    netGrowth,
    sterilNatalidadRatio,
    sterilTrend,
    prevRegisteredBirths,
  ] = load.value;

  const registeredBirthsDelta = formatDelta(
    outcomes.registeredBirths,
    prevRegisteredBirths,
    "vs período anterior",
  );

  const hasData = coverage.total > 0;
  const hasTrend = sterilTrend.points.length > 0;

  // Paquete J — forward projection over the sterilization FLOW series (event
  // counts/bucket). Reuses the already-fetched trend points (no extra DB call).
  // §J-D3: the legal/programmatic target is COVERAGE % (a stock); we do NOT pass
  // a %-meta ReferenceLine onto this counts axis — the volume band stands alone.
  const sterilForecast = projectSeries(sterilTrend.points, { horizon: 3 });

  const coverageTone = toneForTarget(coverage.rate, TARGETS.STERILIZATION_COVERAGE_PCT);

  const natalidadCaveatText = "Solo partos en seguimiento — subestima la natalidad real";
  // metric-honesty 2026-07-09: the ratio's denominator (partos registrados)
  // under-counts real natalidad, so the ratio OVER-states population control.
  const ratioOverstatementCaveat =
    "Contexto, no indicador de decisión: el denominador (partos en seguimiento) subestima la natalidad real, por lo que este ratio SOBRESTIMA la contención poblacional.";

  const panelTrendId = "admin-panel-esterilizacion-titulo";
  const panelForecastId = "admin-panel-esterilizacion-proyeccion-titulo";
  const panelTableId = "admin-panel-tabla-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Period filter (no JurisdictionSwitcher for admin — universal scope) */}
      <div className="flex justify-end">
        <PeriodPicker defaultPreset={DEFAULT_DASHBOARD_PRESET} />
      </div>

      {/* KPI row */}
      <section
        aria-label="Indicadores de control poblacional nacional"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {/* KPI 1: Sterilization coverage */}
        <OpKpi
          label="Cobertura de esterilización"
          value={hasData ? formatPercent(coverage.rate) : "—"}
          bar={hasData ? coverage.rate : undefined}
          tone={hasData ? coverageTone : "neutral"}
          sub={
            hasData
              ? `meta programática 70% · ${coverage.sterilized.toLocaleString("es-AR")} de ${coverage.total.toLocaleString("es-AR")}`
              : "Sin datos"
          }
          info={getKpiInfo("sterilization_coverage_population")}
        />

        {/* KPI 2: Active pregnancies */}
        <OpKpi
          label="Preñeces activas"
          value={activePregnancies.toLocaleString("es-AR")}
          sub="mascotas con pregnancy_status='in_progress' (nacional)"
          tone={activePregnancies > 0 ? "warn" : "neutral"}
          info={getKpiInfo("active_pregnancies")}
        />

        {/* KPI 3: Registered births — with natalidad caveat */}
        <OpKpi
          label="Nacimientos registrados"
          value={outcomes.registeredBirths.toLocaleString("es-AR")}
          sub={natalidadCaveatText}
          tone="neutral"
          deltaV2={registeredBirthsDelta ?? undefined}
          info={{
            definition:
              "Eventos clinical_info_logged con sub_kind='pregnancy', pregnancy_phase='ended' y outcome='live_birth' en el período seleccionado, a nivel nacional.",
            formula:
              "COUNT(clinical_info_logged WHERE sub_kind='pregnancy' AND pregnancy_phase='ended' AND outcome='live_birth' AND period)",
            caveat:
              "Solo cuenta partos de preñeces registradas en el sistema. Partos callejeros y camadas sin seguimiento son invisibles. Indicador direccional, no exacto.",
          }}
        />

        {/* KPI 4: Net registry inflow — directional, neutral tone.
            demo-review M2 (mirrored from /gob/poblacion): "Balance
            poblacional" read as real population growth, but "altas" is
            pets.created_at (new registrations, including pre-existing
            animals just onboarded), not new animals born. Relabeled to keep
            this surface consistent with the govt dashboard's honest wording. */}
        <OpKpi
          label="Altas netas registradas"
          value={
            netGrowth.net > 0
              ? `+${netGrowth.net.toLocaleString("es-AR")}`
              : netGrowth.net.toLocaleString("es-AR")
          }
          sub={natalidadCaveatText}
          tone="neutral"
          info={{
            definition:
              "Altas nuevas en el período + nacimientos registrados − muertes registradas (nacional).",
            formula: "COUNT(altas) + COUNT(live_birth events) − COUNT(death_recorded events)",
            caveat:
              "INDICADOR DIRECCIONAL, NO EXACTO — no es crecimiento poblacional real. 'Altas nuevas' son mascotas RECIÉN REGISTRADAS en miMAR (pets.created_at), que en su mayoría ya existían y no representan nacimientos. Los nacimientos registrados solo cubren partos en seguimiento — callejero e ilegítimos son invisibles.",
          }}
        />
      </section>

      {/* Ratio esterilización/natalidad — CONTEXT tile (metric-honesty
          2026-07-09). Demoted out of the headline: it OVER-states population
          control because its denominator (partos en seguimiento) under-counts
          real natalidad. */}
      {sterilNatalidadRatio !== null && (
        <section aria-label={KPI_CATALOG.sterilization_natalidad_ratio.label}>
          <div className="rounded-xl border border-ln-op-line bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ln-op-mute">
              Contexto · Ratio esterilización / natalidad registrada (nacional)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ln-op-ink">
              {formatRate(sterilNatalidadRatio, { decimals: 2 })}
            </p>
            <p className="mt-1 text-[11px] text-ln-op-mute">
              esterilizaciones del período por parto en seguimiento
            </p>
            <p className="mt-1 text-[11px] italic text-ln-op-mute">{ratioOverstatementCaveat}</p>
          </div>
        </section>
      )}

      {/* Sterilization trend */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Tendencia de esterilizaciones</span>}
          actions={
            sterilTrend.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {sterilTrend.suppressedCount}{" "}
                {sterilTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin esterilizaciones en el período"
              description="No hay eventos sterilization_performed en el rango seleccionado."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={sterilTrend.points}
              seriesLabel="Esterilizaciones"
              yLabel="Eventos registrados"
              variant="area"
              fallbackTableLabel={`Esterilizaciones por ${sterilTrend.granularity === "month" ? "mes" : "semana"}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Sterilization forecast — Paquete J (additive; trend card stays intact) */}
      <OpCard aria-labelledby={panelForecastId}>
        <OpCardHead title={<span id={panelForecastId}>Proyección de esterilizaciones</span>} />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos para proyectar"
              description="No hay eventos sterilization_performed en el rango seleccionado."
            />
          ) : (
            <ForecastChartDynamic
              result={sterilForecast}
              seriesLabel="Esterilizaciones"
              unit="esterilizaciones"
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Cross-province sterilization coverage ranked table */}
      <OpCard aria-labelledby={panelTableId}>
        <OpCardHead
          title={<span id={panelTableId}>Cobertura de esterilización por provincia</span>}
        />
        <OpCardBody>
          {coverage.byProvince.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">Sin datos provinciales disponibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Ranking de cobertura de esterilización por provincia, ordenado de mayor a menor.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Provincia
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      Esterilizadas
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      Total activas
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      Cobertura
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...coverage.byProvince]
                    .sort((a, b) => b.ratePct - a.ratePct)
                    .map((row, i) => {
                      const tone = toneForTarget(row.ratePct, TARGETS.STERILIZATION_COVERAGE_PCT);
                      const rateColor =
                        tone === "ok"
                          ? "text-ln-op-ok"
                          : tone === "warn"
                            ? "text-ln-op-warn"
                            : "text-ln-op-danger";
                      const drillHref = adminProvinceHref(row.province);
                      return (
                        <tr
                          key={row.province}
                          className={[
                            "border-b border-ln-op-line last:border-0",
                            // Only signal interactivity when the row actually links
                            // out — an unresolvable province is not clickable (C4).
                            drillHref ? "hover:bg-ln-op-stripe/50 transition-colors" : "",
                          ].join(" ")}
                        >
                          <td className="py-2 pr-4">
                            <span className="text-[11px] tabular-nums text-ln-op-mute mr-2">
                              {i + 1}.
                            </span>
                            {drillHref ? (
                              <a
                                href={drillHref}
                                className="text-ln-op-azul underline-offset-2 hover:underline"
                              >
                                {row.province}
                              </a>
                            ) : (
                              row.province
                            )}
                          </td>
                          <td className="py-2 pl-4 text-right tabular-nums">
                            {row.sterilized.toLocaleString("es-AR")}
                          </td>
                          <td className="py-2 pl-4 text-right tabular-nums">
                            {row.total.toLocaleString("es-AR")}
                          </td>
                          <td
                            className={`py-2 pl-4 text-right tabular-nums font-semibold ${rateColor}`}
                          >
                            {formatPercent(row.ratePct)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {(() => {
                const assignedTotal = coverage.byProvince.reduce((sum, r) => sum + r.total, 0);
                const unassigned = coverage.total - assignedTotal;
                if (unassigned <= 0) return null;
                return (
                  <p className="mt-2 text-xs text-ln-op-mute">
                    * {unassigned.toLocaleString("es-AR")} mascotas sin provincia asignada no
                    aparecen en la tabla — la suma de las filas no equivale al total nacional.
                  </p>
                );
              })()}
            </div>
          )}
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
