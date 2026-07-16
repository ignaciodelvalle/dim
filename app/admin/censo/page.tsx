// /admin/censo — Censo poblacional (vista admin universal, Paquete E).
//
// Universal view: no JurisdictionSwitcher, admin sees all pets regardless of province.
// Adds a cross-jurisdiction ranked table on top of the gob/censo panels.
//
// Layout:
//   KPI row      — total registradas · activas · dormant · perfiles incompletos
//   Altas nuevas — TimeSeriesChart (registrationTrend)
//   Embudo       — horizontal bars (identification funnel)
//   Tabla ranked — per-province registry count (<table>)
//   Freshness footer

import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { DEFAULT_DASHBOARD_PRESET } from "@/lib/analytics/analytics-period";
import { adminProvinceHref } from "@/lib/infra/admin-province-link";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import {
  DORMANT_MONTHS_DEFAULT,
  TARGETS,
  buildProjectionContext,
  funnelPercents,
  identificationFunnel,
  registrationTrend,
  registryByProvince,
  registryCounts,
  toneForTarget,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { formatPercent } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminCensoPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // PeriodPicker allows customisation but the default is always trailing 12m.
  const sp = searchParams ? await searchParams : {};
  const { resolveAnalyticsPeriod } = await import("@/lib/metrics/period");
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();

  const ctx = buildProjectionContext({ role: "admin" }, [], period);

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Admin · Censo nacional
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
        Censo y salud del registro
      </h1>
      <p className="text-[13px] text-ln-op-mute">
        Vista nacional: total del padrón, mascotas dormant, calidad de identificación y ranking por
        provincia.
      </p>
    </header>
  );

  // D2: bound the fetcher set with a deadline so a pathological query degrades
  // to an honest "tardando… reintentar" state instead of hanging the page.
  const load = await loadWithTimeout(
    Promise.all([
      registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
      registrationTrend(ctx),
      identificationFunnel(ctx),
      registryByProvince(ctx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/admin/censo", sp)}
        />
      </div>
    );
  }

  const [counts, trend, funnel, provinceRows] = load.value;

  const hasData = counts.total > 0;
  const hasTrend = trend.points.length > 0;

  const dormantPct = counts.total > 0 ? Math.round((counts.dormant / counts.total) * 100) : 0;
  const incompletePct = counts.total > 0 ? Math.round((counts.incomplete / counts.total) * 100) : 0;
  const chipPct = funnel.total > 0 ? Math.round((funnel.chipped / funnel.total) * 100) : 0;

  const fPct = funnelPercents(funnel);

  const panelTrendId = "admin-panel-altas-titulo";
  const panelFunnelId = "admin-panel-embudo-titulo";
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
        aria-label="Indicadores del censo nacional"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Total registradas"
          value={hasData ? counts.total.toLocaleString("es-AR") : "—"}
          sub={hasData ? "mascotas activas o extraviadas (nacional)" : "Sin datos"}
          tone={!hasData ? "neutral" : undefined}
          info={{
            definition:
              "Total de mascotas con status 'active' o 'lost' a nivel nacional (alcance global admin).",
            formula: "COUNT(pets) WHERE status IN ('active','lost')",
          }}
        />
        <OpKpi
          label="Activas"
          value={hasData ? counts.active.toLocaleString("es-AR") : "—"}
          sub={hasData ? "con status activo (excluye extraviadas)" : undefined}
          tone={!hasData ? "neutral" : undefined}
          info={{
            definition: "Mascotas con status='active' a nivel nacional.",
            formula: "COUNT(pets) WHERE status = 'active'",
          }}
        />
        <OpKpi
          label="Inactivas"
          value={hasData ? counts.dormant.toLocaleString("es-AR") : "—"}
          sub={`sin actividad >${TARGETS.DORMANT_MONTHS}m · ${dormantPct}% del total`}
          tone={
            hasData && dormantPct > 40 ? "danger" : hasData && dormantPct > 20 ? "warn" : undefined
          }
          info={{
            definition: `Mascotas activas/extraviadas sin ningún evento del propietario en los últimos ${TARGETS.DORMANT_MONTHS} meses. Mascotas sin ningún evento registrado también cuentan como dormant.`,
            formula: `NOT EXISTS (pet_events WHERE event_type <> 'credential_scanned' AND occurred_at >= now - ${TARGETS.DORMANT_MONTHS}m)`,
            caveat:
              "Los eventos credential_scanned se excluyen porque se purgan automáticamente a los 90 días y no representan actividad del propietario.",
          }}
        />
        <OpKpi
          label="Perfiles incompletos"
          value={hasData ? counts.incomplete.toLocaleString("es-AR") : "—"}
          sub={`${incompletePct}% del total · sin chip, sexo o localidad`}
          tone={
            hasData && incompletePct > 30
              ? "danger"
              : hasData && incompletePct > 15
                ? "warn"
                : undefined
          }
          info={{
            definition:
              "Mascotas activas/extraviadas sin chip ISO activo, sexo desconocido, o sin localidad de jurisdicción.",
            formula:
              "NOT EXISTS active microchip_iso OR sex = 'unknown' OR jurisdiction_locality IS NULL",
          }}
        />
      </section>

      {/* Altas nuevas — registration trend */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Altas nuevas</span>}
          actions={
            trend.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {trend.suppressedCount}{" "}
                {trend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"} (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin altas en el período"
              description="No hay mascotas registradas en el rango seleccionado."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={trend.points}
              seriesLabel="Altas nuevas"
              yLabel="Mascotas registradas"
              variant="area"
              fallbackTableLabel={`Altas nuevas por ${trend.granularity === "month" ? "mes" : "semana"}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Embudo de identificación */}
      <OpCard aria-labelledby={panelFunnelId}>
        <OpCardHead title={<span id={panelFunnelId}>Embudo de identificación</span>} />
        <OpCardBody>
          {funnel.total === 0 ? (
            <LnEmptyState
              icon="heart"
              title="Sin datos de identificación"
              description="No hay mascotas en el registro nacional."
            />
          ) : (
            <figure
              role="img"
              aria-label={`Embudo de identificación — ${funnel.total.toLocaleString("es-AR")} mascotas en total.`}
            >
              <figcaption className="sr-only">
                Gráfico de barras horizontales: etapas del embudo de identificación de mascotas a
                nivel nacional.
              </figcaption>
              <ul className="space-y-2" aria-label="Etapas del embudo de identificación">
                <li
                  className="flex items-center gap-3"
                  aria-label={`Total: ${funnel.total.toLocaleString("es-AR")} mascotas (100%)`}
                >
                  <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                    Total registradas
                  </span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div className="h-full rounded bg-ln-op-azul" style={{ width: "100%" }} />
                  </div>
                  <span
                    className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                    aria-hidden="true"
                  >
                    {funnel.total.toLocaleString("es-AR")} (100%)
                  </span>
                </li>

                {(() => {
                  const pct = fPct.chipped;
                  const tone = toneForTarget(chipPct, TARGETS.MICROCHIP_PENETRATION_PCT);
                  const barColor =
                    tone === "ok"
                      ? "bg-ln-op-ok"
                      : tone === "warn"
                        ? "bg-ln-op-warn"
                        : "bg-ln-op-danger";
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`Con chip: ${funnel.chipped.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        Con chip ISO activo
                      </span>
                      <div
                        className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.chipped.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}

                {(() => {
                  const pct = fPct.isoValid;
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`ISO válido: ${funnel.isoValid.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        ISO 11784/11785 válido
                      </span>
                      <div
                        className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded bg-ln-op-azul"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.isoValid.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}

                {(() => {
                  const pct = fPct.scanned;
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`Escaneada en el período: ${funnel.scanned.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        Escaneada en el período
                        <span className="sr-only"> (eventos de los últimos 90 días solamente)</span>
                      </span>
                      <div
                        className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded bg-ln-op-azul"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.scanned.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}
              </ul>
              <p className="mt-2 text-xs text-ln-op-mute">
                Meta chip: {TARGETS.MICROCHIP_PENETRATION_PCT}% · Escaneada en el período: solo
                últimos 90 días (los eventos se purgan automáticamente).
              </p>
            </figure>
          )}
        </OpCardBody>
      </OpCard>

      {/* Cross-jurisdiction ranked table */}
      <OpCard aria-labelledby={panelTableId}>
        <OpCardHead title={<span id={panelTableId}>Ranking por provincia</span>} />
        <OpCardBody>
          {provinceRows.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">Sin datos provinciales disponibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Ranking de mascotas registradas por provincia, ordenado de mayor a menor.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Provincia
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Registradas
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      % del total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {provinceRows.map((row, i) => {
                    const sharePct =
                      counts.total > 0 ? Math.round((row.count / counts.total) * 1000) / 10 : 0;
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
                        <td className="py-2 text-right tabular-nums">
                          {row.count.toLocaleString("es-AR")}
                        </td>
                        <td className="py-2 pl-4 text-right tabular-nums text-ln-op-mute">
                          {sharePct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(() => {
                const assignedTotal = provinceRows.reduce((sum, r) => sum + r.count, 0);
                const unassigned = counts.total - assignedTotal;
                const unassignedPct =
                  counts.total > 0 ? Math.round((unassigned / counts.total) * 1000) / 10 : 0;
                if (unassigned <= 0) return null;
                return (
                  <p className="mt-2 text-xs text-ln-op-mute">
                    * {unassignedPct}% sin provincia asignada ({unassigned.toLocaleString("es-AR")}{" "}
                    mascotas) no aparece en la tabla — los porcentajes no suman 100%.
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
