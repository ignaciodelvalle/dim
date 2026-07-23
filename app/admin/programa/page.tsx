// /admin/programa — Resumen ejecutivo del programa (Paquete H).
//
// Executive summary: North-Star KPIs + outliers + PII oversight + data quality
// + cron health.
//
// Data sources:
//   fetchEnoSla          ← lib/surveillance-metrics.ts  (A7)
//   fetchQueueHealth     ← lib/admin-metrics.ts
//   fetchCronRuns        ← lib/admin-metrics.ts
//   fetchDataQuality     ← lib/metrics/program-health.ts
//   fetchCrossJurisdictionOutliers ← lib/metrics/program-health.ts
//   fetchPiiOversight    ← lib/metrics/program-health.ts
//   registryCounts       ← lib/metrics/census.ts  (total registradas)
//   fetchSterilizationCoverage ← lib/metrics/population-control.ts
//   fetchMicrochipPenetration  ← lib/compliance-metrics.ts
//
// MOVED (2026-07-21): the embedded "Alertas y suscripciones" panel
// (evaluateAlertSubscriptions + create/toggle/delete) was promoted to its own
// page at /admin/suscripciones (thin wrapper over /gob/suscripciones) — see
// that file for the full rationale. This page keeps only a discovery link.

import { inArray } from "drizzle-orm";

import { ForecastChartDynamic } from "@/components/charts/ForecastChartDynamic";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpFilterBar,
  OpKpi,
  OpPill,
} from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { db, profiles } from "@/db";
import { fetchCronRuns, fetchQueueHealth } from "@/lib/analytics/admin-metrics";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { DEFAULT_DASHBOARD_PRESET } from "@/lib/analytics/analytics-period";
import { fetchMicrochipPenetration } from "@/lib/analytics/compliance-metrics";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { adminProvinceHref } from "@/lib/infra/admin-province-link";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { cronDisplayLabel } from "@/lib/infra/cron-registry";
import {
  K_ANON_MIN,
  TARGETS,
  buildProjectionContext,
  countAlertedProvinces,
  enoSlaTone,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  fetchRabiesVaccinationTrend,
  projectSeries,
  toneForTarget,
} from "@/lib/metrics";
import { DORMANT_MONTHS_DEFAULT, registryCounts } from "@/lib/metrics/census";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { auditActionLabel } from "@/lib/ui/audit-action-labels";
import { AR_TIME_ZONE, formatDateShort, formatPercent } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

type CronTone = "ok" | "danger" | "open";
const CRON_STATUS_TONE: Record<string, CronTone> = {
  ok: "ok",
  failed: "danger",
  running: "open",
};
const CRON_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  failed: "Fallo",
  running: "Corriendo",
};

const METRIC_LABEL: Record<string, string> = {
  rabies: "Antirrábica",
  sterilization: "Esterilización",
  microchip: "Microchip",
};

// es-AR labels for the PII-oversight "surface" dimension (operator search origin).
const SURFACE_LABEL: Record<string, string> = {
  users: "Usuarios",
  organizations: "Organizaciones",
  omnibox: "Buscador",
};

export default async function AdminProgramaPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = searchParams ? await searchParams : {};
  const { resolveAnalyticsPeriod } = await import("@/lib/metrics/period");
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();

  const adminCtx = buildProjectionContext({ role: "admin" }, [], period);

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Admin · Resumen ejecutivo
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Salud del programa</h1>
      <p className="text-[13px] text-ln-op-mute">
        KPIs principales, valores atípicos por jurisdicción, calidad de datos y supervisión de PII.
      </p>
      <a
        href="/admin/suscripciones"
        className="inline-block text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
      >
        Alertas y suscripciones →
      </a>
    </header>
  );

  // D2: bound the fetcher set with a deadline (see /admin/censo).
  const load = await loadWithTimeout(
    Promise.all([
      registryCounts(adminCtx, DORMANT_MONTHS_DEFAULT),
      fetchSterilizationCoverage(adminCtx),
      fetchMicrochipPenetration(adminCtx),
      fetchEnoSla(adminCtx),
      fetchQueueHealth(),
      fetchCronRuns(),
      fetchDataQuality(adminCtx),
      fetchCrossJurisdictionOutliers(adminCtx),
      fetchPiiOversight(adminCtx),
      fetchRabiesVaccinationTrend(adminCtx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/admin/programa", sp)}
        />
      </div>
    );
  }

  const [
    registry,
    sterilization,
    microchip,
    enoSla,
    queue,
    crons,
    dataQuality,
    outliers,
    piiOversight,
    rabiesTrend,
  ] = load.value;

  // Paquete J — forward projection over the antirrábica vaccination FLOW series
  // (distinct dogs vaccinated/bucket). §J-D3: the LEGAL target is COVERAGE %
  // (a stock, 80%), which is a DIFFERENT unit than these vaccination COUNTS — so
  // we project the volume band WITHOUT painting a %-meta ReferenceLine on the
  // counts axis. The coverage-% forecast is deferred to Fase J3.
  const rabiesForecast = projectSeries(rabiesTrend.points, { horizon: 3 });
  const hasRabiesTrend = rabiesTrend.points.length > 0;

  // Batch-resolve actor UUIDs in the PII oversight table to display names.
  const actorIds = piiOversight
    .map((r) => r.actorUserId)
    .filter((id): id is string => id !== null && id !== undefined);
  const uniqueActorIds = [...new Set(actorIds)];
  const actorNameMap = new Map<string, string>();
  if (uniqueActorIds.length > 0) {
    const actorRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, uniqueActorIds));
    for (const row of actorRows) {
      actorNameMap.set(row.id, row.displayName);
    }
  }

  // outlierCount is a COMBINATION count (provincia × métrica) — correct for the
  // outliers table caption below ("N de M combinaciones bajo meta"), but NOT
  // honest as the value behind a KPI literally labeled Provincias en alerta
  // (a province can contribute several rows here, one per below-target
  // metric — hence outlierCount routinely exceeding the ~24 AR provinces).
  // alertedProvinceCount collapses those rows to DISTINCT provinces so the KPI
  // matches its own label; it can never exceed the real province count.
  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const alertedProvinceCount = countAlertedProvinces(outliers);
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  // Panel element IDs for accessible aria-labelledby.
  const panelRabiesForecastId = "admin-programa-rabies-proyeccion-titulo";
  const panelOutliersId = "admin-programa-outliers-titulo";
  const panelPiiId = "admin-programa-pii-titulo";
  const panelQualityId = "admin-programa-calidad-titulo";
  const panelCronsId = "admin-programa-crons-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Unified filter bar — period only (F-migration 2026-07-21, off the
          bare <PeriodPicker>). Admin scope is universal (parity with
          /gob/programa's OpFilterBar, minus the jurisdiction axis that only
          makes sense for a govt viewer with assignments). */}
      <OpFilterBar period={{ defaultPreset: DEFAULT_DASHBOARD_PRESET }} />

      {/* North-Star KPI strip */}
      <section
        aria-label="KPIs principales del programa"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <OpKpi
          label="Total registradas"
          value={registry.total > 0 ? registry.total.toLocaleString("es-AR") : "—"}
          sub="mascotas activas o extraviadas"
          href="/admin/padron?vista=censo"
          info={{
            definition: "Total de mascotas con status 'active' o 'lost' a nivel nacional.",
            formula: "COUNT(pets) WHERE status IN ('active','lost')",
          }}
          descriptorId="registry_total_pets"
        />
        <OpKpi
          label="Esterilización"
          value={sterilRatePct > 0 ? formatPercent(sterilRatePct) : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/admin/padron?vista=poblacion"
          info={getKpiInfo("sterilization_coverage_population")}
          descriptorId="sterilization_coverage_population"
        />
        <OpKpi
          label="Microchip"
          value={chipRatePct > 0 ? formatPercent(chipRatePct) : "—"}
          tone={toneForTarget(chipRatePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}%`}
          href="/admin/padron?vista=censo"
          info={getKpiInfo("microchip_penetration")}
          descriptorId="microchip_penetration"
        />
        <OpKpi
          label="SLA ENO (resueltos)"
          value={enoSla.onTimePct !== null ? formatPercent(enoSla.onTimePct) : "—"}
          tone={enoSlaTone(enoSla)}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en incumplimiento activo`
              : "sin incumplimientos activos"
          }
          href="/admin/outbox"
          info={getKpiInfo("eno_sla_compliance")}
          descriptorId="eno_sla_compliance"
        />
        <OpKpi
          label="Aprobaciones — más vieja"
          value={queue.oldestPendingDaysAgo !== null ? `${queue.oldestPendingDaysAgo}d` : "—"}
          tone={
            queue.oldestPendingDaysAgo !== null
              ? queue.oldestPendingDaysAgo > 30
                ? "danger"
                : queue.oldestPendingDaysAgo > 14
                  ? "warn"
                  : "ok"
              : undefined
          }
          sub={`${queue.pendingTotal} pendientes`}
          href="/admin/cola"
          info={{
            definition: "Días de antigüedad de la solicitud pendiente más antigua.",
            formula: "now() - min(created_at) WHERE status='pending'",
          }}
          descriptorId="queue_oldest_pending_days"
        />
        {/* Honesty fix (2026-07-22): this used to render outlierCount, a
            provincia×métrica COMBINATION count — routinely > 24, impossible
            for a KPI labeled Provincias en alerta when Argentina has ~24
            provinces. alertedProvinceCount is the DISTINCT-province count
            (≤ total provinces) that actually matches the label. */}
        <OpKpi
          label={KPI_CATALOG.alerted_provinces_below_target.label}
          value={alertedProvinceCount.toLocaleString("es-AR")}
          tone={alertedProvinceCount === 0 ? "ok" : alertedProvinceCount > 5 ? "danger" : "warn"}
          sub="provincias con ≥1 métrica bajo meta"
          info={{
            definition:
              "Número de provincias con al menos una métrica (esterilización, microchip, etc.) por debajo de la meta programática.",
            formula: "COUNT(DISTINCT province) WHERE EXISTS métrica con rate < target",
          }}
          descriptorId="alerted_provinces_below_target"
        />
      </section>

      {/* Antirrábica vaccination forecast — Paquete J (additive) */}
      <OpCard aria-labelledby={panelRabiesForecastId}>
        <OpCardHead
          title={<span id={panelRabiesForecastId}>Proyección de vacunación antirrábica</span>}
          actions={
            rabiesTrend.suppressedCount > 0 ? (
              <span className="text-[11px] text-ln-op-mute">
                {rabiesTrend.suppressedCount}{" "}
                {rabiesTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasRabiesTrend ? (
            <p className="text-[13px] text-ln-op-mute">
              Sin eventos de vacunación antirrábica en el período para proyectar.
            </p>
          ) : (
            <ForecastChartDynamic
              result={rabiesForecast}
              seriesLabel="Vacunación antirrábica"
              unit="perros vacunados"
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Outliers table */}
      <OpCard aria-labelledby={panelOutliersId}>
        <OpCardHead
          title={<span id={panelOutliersId}>Valores atípicos por provincia</span>}
          actions={
            <span className="text-[11px] text-ln-op-mute">
              {outlierCount} de {outliers.length} combinaciones bajo meta
            </span>
          }
        />
        <OpCardBody>
          {outliers.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos"
              description="Sin datos provinciales disponibles."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Cobertura por provincia y métrica vs meta programática. Filas marcadas en rojo
                  están por debajo de la meta.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Provincia
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Métrica
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Cobertura
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Meta
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Brecha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((row, i) => {
                    const drillHref = adminProvinceHref(row.province);
                    return (
                      <tr
                        key={`${row.province}-${row.metric}-${i}`}
                        className={[
                          "border-b border-ln-op-line last:border-0",
                          row.isOutlier
                            ? "bg-ln-op-danger-bg/30"
                            : "hover:bg-ln-op-stripe/50 transition-colors",
                        ].join(" ")}
                        aria-label={`${row.province} — ${METRIC_LABEL[row.metric] ?? row.metric}: ${formatPercent(row.rate)} (meta ${row.target}%)${row.isOutlier ? ", bajo meta" : ""}`}
                      >
                        <td className="py-2 pr-4">
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
                        <td className="py-2 pr-4 text-ln-op-ink-2">
                          {METRIC_LABEL[row.metric] ?? row.metric}
                        </td>
                        <td
                          className={[
                            "py-2 pr-4 text-right tabular-nums font-medium",
                            row.isOutlier ? "text-ln-op-danger" : "text-ln-op-ok",
                          ].join(" ")}
                          aria-label={`Cobertura: ${formatPercent(row.rate)}`}
                        >
                          {formatPercent(row.rate)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ln-op-mute">
                          {row.target}%
                        </td>
                        <td
                          className={[
                            "py-2 text-right tabular-nums",
                            row.isOutlier ? "text-ln-op-danger" : "text-ln-op-mute",
                          ].join(" ")}
                        >
                          {row.gap > 0
                            ? `−${formatPercent(row.gap)}`
                            : row.gap < 0
                              ? `+${formatPercent(Math.abs(row.gap))}`
                              : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ln-op-mute">
                Provincias con menos de {K_ANON_MIN} mascotas no se listan (privacidad).
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* Diagnóstico (Ola 4 / decision-density audit, 2026-07-21): PII
          oversight + data quality + cron health are operational detail, not
          the executive headline — collapsed behind a disclosure so they read
          as secondary depth instead of co-equal with the KPI hierarchy and
          the rabies-forecast/outliers story above. */}
      <details className="group">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ln-op-ink-2 hover:text-ln-op-ink">
          Diagnóstico — PII, calidad de datos y crons
        </summary>
        <div className="mt-4 space-y-4">
          {/* PII oversight */}
          <OpCard aria-labelledby={panelPiiId}>
            <OpCardHead
              title={<span id={panelPiiId}>Supervisión de PII — ¿quién consultó qué?</span>}
            />
            <OpCardBody>
              {piiOversight.length === 0 ? (
                <p className="text-[13px] text-ln-op-mute">
                  Sin consultas PII registradas en el período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                    <caption className="sr-only">
                      Top actores por cantidad de consultas PII-sensibles en el período. Datos del
                      audit_log (pii_queried, welfare_location_viewed).
                    </caption>
                    <thead>
                      <tr className="border-b border-ln-op-line">
                        <th
                          scope="col"
                          className="text-left py-2 pr-4 font-semibold text-ln-op-mute"
                        >
                          Actor
                        </th>
                        <th
                          scope="col"
                          className="text-left py-2 pr-4 font-semibold text-ln-op-mute"
                        >
                          Acción
                        </th>
                        <th
                          scope="col"
                          className="text-left py-2 pr-4 font-semibold text-ln-op-mute"
                        >
                          Superficie
                        </th>
                        <th
                          scope="col"
                          className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                        >
                          Consultas
                        </th>
                        <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                          Última
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {piiOversight.map((row) => (
                        <tr
                          key={`${row.actorUserId ?? "deleted"}-${row.action}-${row.surface ?? ""}`}
                          className="border-b border-ln-op-line last:border-0 hover:bg-ln-op-stripe/50 transition-colors"
                        >
                          <td className="py-2 pr-4 text-[13px] text-ln-op-ink-2">
                            {row.actorUserId
                              ? (actorNameMap.get(row.actorUserId) ?? "Operador desconocido")
                              : "Usuario eliminado"}
                          </td>
                          <td className="py-2 pr-4 text-ln-op-ink-2" title={row.action}>
                            {auditActionLabel(row.action)}
                          </td>
                          <td className="py-2 pr-4 text-ln-op-mute">
                            {row.surface ? (SURFACE_LABEL[row.surface] ?? row.surface) : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums font-medium">
                            {row.count.toLocaleString("es-AR")}
                          </td>
                          <td className="py-2 text-right text-[11px] text-ln-op-mute">
                            {formatDateShort(row.lastAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </OpCardBody>
          </OpCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Data quality scorecard */}
            <OpCard aria-labelledby={panelQualityId}>
              <OpCardHead title={<span id={panelQualityId}>Calidad de datos</span>} />
              <OpCardBody>
                {dataQuality.total === 0 ? (
                  <p className="text-[13px] text-ln-op-mute">Sin mascotas activas en el padrón.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Completeness bar */}
                    <div>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm text-ln-op-mute">Completitud</span>
                        <span
                          className={[
                            "text-[13px] font-semibold tabular-nums",
                            dataQuality.completenessPct >= 80
                              ? "text-ln-op-ok"
                              : dataQuality.completenessPct >= 60
                                ? "text-ln-op-warn"
                                : "text-ln-op-danger",
                          ].join(" ")}
                          aria-label={`Completitud: ${dataQuality.completenessPct}%`}
                        >
                          {dataQuality.completenessPct}%
                        </span>
                      </div>
                      <div
                        className="h-2 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                        role="presentation"
                      >
                        <div
                          className={[
                            "h-full rounded transition-all",
                            dataQuality.completenessPct >= 80
                              ? "bg-ln-op-ok"
                              : dataQuality.completenessPct >= 60
                                ? "bg-ln-op-warn"
                                : "bg-ln-op-danger",
                          ].join(" ")}
                          style={{ width: `${dataQuality.completenessPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Missing field counts */}
                    <ul className="space-y-1.5 text-sm" aria-label="Campos faltantes por categoría">
                      <li className="flex justify-between items-baseline">
                        <span className="text-ln-op-mute">Sin localidad</span>
                        <span className="tabular-nums text-ln-op-ink">
                          {dataQuality.missingLocality.toLocaleString("es-AR")}
                        </span>
                      </li>
                      <li className="flex justify-between items-baseline">
                        <span className="text-ln-op-mute">Sexo desconocido</span>
                        <span className="tabular-nums text-ln-op-ink">
                          {dataQuality.missingSex.toLocaleString("es-AR")}
                        </span>
                      </li>
                      <li className="flex justify-between items-baseline">
                        <span className="text-ln-op-mute">Sin microchip activo</span>
                        <span className="tabular-nums text-ln-op-ink">
                          {dataQuality.missingChip.toLocaleString("es-AR")}
                        </span>
                      </li>
                      <li className="flex justify-between items-baseline border-t border-ln-op-line pt-1.5">
                        <span className="text-ln-op-mute">Huérfanas (sin propietario)</span>
                        <span
                          className={[
                            "tabular-nums font-medium",
                            dataQuality.orphans > 0 ? "text-ln-op-warn" : "text-ln-op-ink",
                          ].join(" ")}
                        >
                          {dataQuality.orphans.toLocaleString("es-AR")}
                        </span>
                      </li>
                    </ul>

                    <p className="text-xs text-ln-op-mute">
                      Completitud = mascotas sin ningún campo faltante (localidad + sexo + chip) ÷
                      total. Huérfanas: sin ninguna fila en ownerships.
                    </p>
                  </div>
                )}
              </OpCardBody>
            </OpCard>

            {/* Cron health */}
            <OpCard aria-labelledby={panelCronsId}>
              <OpCardHead title={<span id={panelCronsId}>Salud de crons</span>} />
              <OpCardBody>
                {crons.length === 0 ? (
                  <p className="text-[13px] text-ln-op-mute">Sin crons registrados.</p>
                ) : (
                  <ul className="space-y-2" aria-label="Estado de los crons del sistema">
                    {crons.map((c) => (
                      <li
                        key={c.cronName}
                        className="flex items-baseline justify-between gap-3 text-sm"
                        aria-label={`${c.cronName}: ${c.lastStatus ?? "desconocido"}`}
                      >
                        {/* M2 (cowork demo): es-AR label; raw key on `title`. */}
                        <span
                          className="text-ln-op-ink-2 truncate max-w-[160px]"
                          title={c.cronName}
                        >
                          {cronDisplayLabel(c.cronName)}
                        </span>
                        <span className="flex items-center gap-1.5 tabular-nums text-[11px] shrink-0">
                          {c.lastRunAt
                            ? new Date(c.lastRunAt).toLocaleString("es-AR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: AR_TIME_ZONE,
                              })
                            : "—"}
                          {c.lastStatus && (
                            <OpPill tone={CRON_STATUS_TONE[c.lastStatus] ?? "neutral"}>
                              {CRON_STATUS_LABEL[c.lastStatus] ?? c.lastStatus}
                            </OpPill>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </OpCardBody>
            </OpCard>
          </div>
        </div>
      </details>

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
