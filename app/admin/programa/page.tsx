// /admin/programa — Resumen ejecutivo del programa (Paquete H).
//
// Executive summary: North-Star KPIs + outliers + PII oversight + data quality
// + cron health + threshold alert subscriptions.
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
//   evaluateAlertSubscriptions ← lib/metrics/alert-evaluation.ts

import { inArray } from "drizzle-orm";

import { toggleAlertSubscriptionAction } from "@/app/actions/alert-subscriptions";
import { DeleteAlertSubscriptionButton } from "@/app/admin/programa/DeleteAlertSubscriptionButton";
import { AlertSubscriptionForm } from "@/components/admin/AlertSubscriptionForm";
import { ForecastChartDynamic } from "@/components/charts/ForecastChartDynamic";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpButton, OpCard, OpCardBody, OpCardHead, OpKpi, OpPill } from "@/components/ui/dashboard";
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
  TARGETS,
  buildProjectionContext,
  enoSlaTone,
  evaluateAlertSubscriptions,
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
import { createClient } from "@/lib/supabase/server";
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

const ALERT_METRIC_LABEL: Record<string, string> = {
  active_zoonosis: KPI_CATALOG.active_zoonosis_signals.label,
  eno_sla_ontime_pct: "SLA ENO en tiempo (%)",
  queue_oldest_days: "Días sin atender (solicitud más antigua)",
  sterilization_coverage_pct: "Cobertura de esterilización (%)",
  microchip_penetration_pct: "Penetración de microchip (%)",
  open_welfare_reports: "Denuncias de maltrato abiertas",
};

const ALERT_DIRECTION_LABEL: Record<string, string> = {
  above: "encima de",
  below: "debajo de",
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

  // Resolve the current user id for alert subscription evaluation.
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? null;

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
      currentUserId
        ? evaluateAlertSubscriptions(currentUserId, { role: "admin" })
        : Promise.resolve([]),
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
    alertEvals,
    rabiesTrend,
  ] = load.value;

  // Paquete J — forward projection over the antirrábica vaccination FLOW series
  // (distinct dogs vaccinated/bucket). §J-D3: the LEGAL target is COVERAGE %
  // (a stock, 80%), which is a DIFFERENT unit than these vaccination COUNTS — so
  // we project the volume band WITHOUT painting a %-meta ReferenceLine on the
  // counts axis. The coverage-% forecast is deferred to Fase J3.
  const rabiesForecast = projectSeries(rabiesTrend.points, { horizon: 3 });
  const hasRabiesTrend = rabiesTrend.points.length > 0;

  const breachingAlerts = alertEvals.filter((a) => a.breaching);

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

  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  // Panel element IDs for accessible aria-labelledby.
  const panelRabiesForecastId = "admin-programa-rabies-proyeccion-titulo";
  const panelOutliersId = "admin-programa-outliers-titulo";
  const panelPiiId = "admin-programa-pii-titulo";
  const panelQualityId = "admin-programa-calidad-titulo";
  const panelCronsId = "admin-programa-crons-titulo";
  const panelAlertasId = "admin-programa-alertas-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Period filter */}
      <div className="flex justify-end">
        <PeriodPicker defaultPreset={DEFAULT_DASHBOARD_PRESET} />
      </div>

      {/* North-Star KPI strip */}
      <section
        aria-label="KPIs principales del programa"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <OpKpi
          label="Total registradas"
          value={registry.total > 0 ? registry.total.toLocaleString("es-AR") : "—"}
          sub="mascotas activas o extraviadas"
          href="/admin/censo"
          info={{
            definition: "Total de mascotas con status 'active' o 'lost' a nivel nacional.",
            formula: "COUNT(pets) WHERE status IN ('active','lost')",
          }}
        />
        <OpKpi
          label="Esterilización"
          value={sterilRatePct > 0 ? formatPercent(sterilRatePct) : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/admin/poblacion"
          info={getKpiInfo("sterilization_coverage_population")}
        />
        <OpKpi
          label="Microchip"
          value={chipRatePct > 0 ? formatPercent(chipRatePct) : "—"}
          tone={toneForTarget(chipRatePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}%`}
          href="/admin/censo"
          info={getKpiInfo("microchip_penetration")}
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
        />
        <OpKpi
          label="Cola más vieja"
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
        />
        <OpKpi
          label="Provincias en alerta"
          value={outlierCount.toLocaleString("es-AR")}
          tone={outlierCount === 0 ? "ok" : outlierCount > 5 ? "danger" : "warn"}
          sub="combinaciones provincia×métrica bajo meta"
          info={{
            definition:
              "Número de combinaciones (provincia × métrica) con cobertura por debajo de la meta programática.",
            formula: "COUNT rows WHERE rate < target",
          }}
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
            </div>
          )}
        </OpCardBody>
      </OpCard>

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
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Actor
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Acción
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Superficie
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
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
                    <span className="text-ln-op-ink-2 truncate max-w-[160px]" title={c.cronName}>
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

      {/* Alertas / suscripciones — Paquete H */}
      <OpCard
        aria-labelledby={panelAlertasId}
        accent={breachingAlerts.length > 0 ? "danger" : undefined}
      >
        <OpCardHead title={<span id={panelAlertasId}>Alertas y suscripciones</span>} />
        <OpCardBody>
          {/* (a) Alertas activas — breaching subscriptions */}
          <section aria-label="Alertas activas" className="mb-5">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-ln-op-mute">
              Alertas activas
            </h4>
            {breachingAlerts.length === 0 ? (
              <p className="text-[13px] text-ln-op-mute">Sin alertas activas.</p>
            ) : (
              <ul className="space-y-2">
                {breachingAlerts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-[13px] text-ln-op-danger"
                  >
                    <span className="font-semibold">
                      {a.label ?? ALERT_METRIC_LABEL[a.metricKey] ?? a.metricKey}
                    </span>
                    {a.jurisdictionProvince ? (
                      <span className="ml-1 text-[11px] text-ln-op-mute">
                        ({a.jurisdictionProvince})
                      </span>
                    ) : null}
                    {" — "}
                    actual{" "}
                    <span className="font-semibold">
                      {a.currentValue !== null ? a.currentValue.toLocaleString("es-AR") : "—"}
                    </span>{" "}
                    {ALERT_DIRECTION_LABEL[a.direction] ?? a.direction} umbral{" "}
                    <span className="font-semibold">
                      {Number(a.threshold).toLocaleString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* (b) Mis suscripciones — all subscriptions list with delete / toggle */}
          <section aria-label="Mis suscripciones" className="mb-5">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-ln-op-mute">
              Mis suscripciones
            </h4>
            {alertEvals.length === 0 ? (
              <p className="text-[13px] text-ln-op-mute">
                Sin suscripciones configuradas. Creá una abajo.
              </p>
            ) : (
              <ul className="divide-y divide-ln-op-line-2">
                {alertEvals.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2 text-[13px]">
                    <div className="flex-1">
                      <span className={a.isActive ? "text-ln-op-ink" : "text-ln-op-mute"}>
                        {a.label ?? ALERT_METRIC_LABEL[a.metricKey] ?? a.metricKey}
                      </span>
                      {a.jurisdictionProvince ? (
                        <span className="ml-1 text-[11px] text-ln-op-mute">
                          ({a.jurisdictionProvince})
                        </span>
                      ) : null}
                      <span className="ml-2 text-[11px] text-ln-op-mute">
                        {ALERT_DIRECTION_LABEL[a.direction] ?? a.direction}{" "}
                        {Number(a.threshold).toLocaleString("es-AR")}
                      </span>
                      {!a.isActive && (
                        <span className="ml-2 text-[11px] text-ln-op-mute italic">(inactiva)</span>
                      )}
                    </div>
                    {/* Toggle active/inactive */}
                    <form action={toggleAlertSubscriptionAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="isActive" value={a.isActive ? "false" : "true"} />
                      <OpButton
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={a.isActive ? "Desactivar suscripción" : "Activar suscripción"}
                        className="h-11 px-3"
                      >
                        {a.isActive ? "Pausar" : "Activar"}
                      </OpButton>
                    </form>
                    {/* Delete — 2-step inline confirmation (C10) */}
                    <DeleteAlertSubscriptionButton subscriptionId={a.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* (c) Crear suscripción form */}
          <section aria-label="Crear suscripción">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ln-op-mute">
              Crear suscripción
            </h4>
            <AlertSubscriptionForm />
          </section>
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
