// /gob/programa — Executive summary scoped to jurisdiction (govt view of /admin/programa).
//
// What's kept vs. admin/programa:
//   KEEP: registryCounts, fetchSterilizationCoverage, fetchMicrochipPenetration,
//         fetchEnoSla, fetchDataQuality, fetchCrossJurisdictionOutliers (relabeled
//         "Tus provincias" — returns only the govt's assigned provinces),
//         fetchPiiOversight (scoped to govt actors in their jurisdiction),
//         evaluateAlertSubscriptions (per-user, unchanged).
//   REPLACE: fetchQueueHealth() → fetchQueueHealthScoped(filteredJurisdictions)
//   DROP: fetchCronRuns() — platform infra, admin-meta, not gov data.
//
// Fold from /gob/sistema (2026-07-09 audit, PO-ratified): for a govt operator,
// /gob/sistema's KPIs (ENO SLA %, scoped queue aging) were already rendered
// here from the same fetchers. The one figure that was NOT already here —
// enoSla.total, the notification count backing the SLA % — is now surfaced
// in the "SLA ENO" KPI sub-line below. /gob/sistema now redirects govt here;
// see app/gob/sistema/page.tsx.
//
// Privacy invariant: all fetchers receive a scoped ctx or filteredJurisdictions —
// a govt can never see data outside their assigned localities.

import { inArray } from "drizzle-orm";

import {
  deleteAlertSubscriptionAction,
  toggleAlertSubscriptionAction,
} from "@/app/actions/alert-subscriptions";
import { AlertSubscriptionForm } from "@/components/admin/AlertSubscriptionForm";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpButton,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpFilterBar,
  OpKpi,
} from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { db, profiles } from "@/db";
import { fetchQueueHealthScoped } from "@/lib/analytics/admin-metrics";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { fetchMicrochipPenetration } from "@/lib/analytics/compliance-metrics";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { govtProvinceHref } from "@/lib/infra/admin-province-link";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  enoSlaTone,
  evaluateAlertSubscriptions,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  toneForTarget,
} from "@/lib/metrics";
import { DORMANT_MONTHS_DEFAULT, registryCounts } from "@/lib/metrics/census";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { createClient } from "@/lib/supabase/server";
import { auditActionLabel } from "@/lib/ui/audit-action-labels";
import { formatDateShort, formatPercent } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

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

const METRIC_LABEL: Record<string, string> = {
  rabies: "Antirrábica",
  sterilization: "Esterilización",
  microchip: "Microchip",
};

// es-AR labels for the PII-oversight "surface" dimension (operator search origin).
// Mirrors SURFACE_LABEL in app/admin/programa — the gob twin previously leaked the
// raw enum code into the operator UI.
const SURFACE_LABEL: Record<string, string> = {
  users: "Usuarios",
  organizations: "Organizaciones",
  omnibox: "Buscador",
};

export default async function GobProgramaPage({
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
  const actor = { role: profile.role } as const;

  // Capability guard: exec summary requires admin OR (govt AND has assignments).
  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso al resumen ejecutivo. Pedile al admin que te asigne jurisdicciones."
        />
      </div>
    );
  }

  // Resolve current user for alert subscription evaluation.
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? null;

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

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Header + filters render in both the data and degraded (timeout) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Gobierno · Resumen ejecutivo
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
        Resumen ejecutivo — tu jurisdicción
      </h1>
      <p className="text-[13px] text-ln-op-mute">
        {profile.role === "admin"
          ? "Vista universal — todas las jurisdicciones."
          : "KPIs principales, valores atípicos por jurisdicción, calidad de datos y supervisión de PII en tu cobertura asignada."}
      </p>
    </header>
  );
  const filtersRow = (
    <OpFilterBar
      period={{ defaultPreset: "trailing12m" }}
      jurisdiction={{ allowedProvinces, localities }}
    />
  );

  // Bound the fetcher set with a deadline so a degraded DB yields an honest
  // "reintentar" state instead of an unbounded hang (parity with /admin/programa).
  const load = await loadWithTimeout(
    Promise.all([
      registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
      fetchSterilizationCoverage(ctx),
      fetchMicrochipPenetration(ctx),
      fetchEnoSla(ctx),
      fetchQueueHealthScoped(filteredJurisdictions, { adminProvince, adminLocality }),
      fetchDataQuality(ctx),
      fetchCrossJurisdictionOutliers(ctx),
      fetchPiiOversight(ctx),
      currentUserId ? evaluateAlertSubscriptions(currentUserId, actor) : Promise.resolve([]),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        {filtersRow}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/programa", sp)}
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
    dataQuality,
    outliers,
    piiOversight,
    alertEvals,
  ] = load.value;

  const breachingAlerts = alertEvals.filter((a) => a.breaching);
  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  // Batch-resolve actor UUIDs in the PII oversight table to display names — the
  // panel asks "¿quién consultó qué?", so an opaque UUID fragment defeats it.
  // Mirrors the admin twin. Scope is already enforced upstream: fetchPiiOversight
  // only returns actors acting within this operator's jurisdiction.
  const uniqueActorIds = [
    ...new Set(piiOversight.map((r) => r.actorUserId).filter((id): id is string => Boolean(id))),
  ];
  const actorNameMap = new Map<string, string>();
  if (uniqueActorIds.length > 0) {
    const actorRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, uniqueActorIds));
    for (const row of actorRows) actorNameMap.set(row.id, row.displayName);
  }

  const panelOutliersId = "gob-programa-outliers-titulo";
  const panelPiiId = "gob-programa-pii-titulo";
  const panelQualityId = "gob-programa-calidad-titulo";
  const panelQueueId = "gob-programa-cola-titulo";
  const panelAlertasId = "gob-programa-alertas-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Filters row */}
      {filtersRow}

      {/* North-Star KPI strip */}
      <section
        aria-label="KPIs principales del programa"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <OpKpi
          label="Total registradas"
          value={registry.total > 0 ? registry.total.toLocaleString("es-AR") : "—"}
          sub="mascotas activas o extraviadas"
          href="/gob/censo"
          info={{
            definition: "Total de mascotas con status 'active' o 'lost' en tu jurisdicción.",
            formula: "COUNT(pets) WHERE status IN ('active','lost') AND scope",
          }}
        />
        <OpKpi
          label="Esterilización"
          value={sterilRatePct > 0 ? formatPercent(sterilRatePct) : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/gob/poblacion"
          info={getKpiInfo("sterilization_coverage_population")}
        />
        <OpKpi
          label="Microchip"
          value={chipRatePct > 0 ? formatPercent(chipRatePct) : "—"}
          tone={toneForTarget(chipRatePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}%`}
          href="/gob/censo"
          info={getKpiInfo("microchip_penetration")}
        />
        <OpKpi
          label="SLA ENO"
          value={enoSla.onTimePct !== null ? formatPercent(enoSla.onTimePct) : "—"}
          tone={enoSlaTone(enoSla)}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en breach activo de ${enoSla.total.toLocaleString("es-AR")}`
              : enoSla.total > 0
                ? `${enoSla.total.toLocaleString("es-AR")} notificaciones, sin breach activo`
                : "sin notificaciones en el período"
          }
          href="/gob/outbox"
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
          sub={`${queue.pendingTotal} pendientes en tu jurisdicción`}
          href="/gob/cola"
          info={{
            definition:
              "Días de antigüedad de la solicitud pendiente más antigua en tu jurisdicción.",
            formula: "now() - min(created_at) WHERE status='pending' AND jurisdiction IN scope",
          }}
        />
        <OpKpi
          label="Provincias en alerta"
          value={outlierCount.toLocaleString("es-AR")}
          tone={outlierCount === 0 ? "ok" : outlierCount > 5 ? "danger" : "warn"}
          sub="combinaciones provincia×métrica bajo meta"
          info={{
            definition:
              "Número de combinaciones (provincia × métrica) con cobertura por debajo de la meta en tu jurisdicción.",
            formula: "COUNT rows WHERE rate < target AND scope",
          }}
        />
      </section>

      {/* Outliers table — relabeled "Tus provincias" since scope is already the govt's own */}
      <OpCard aria-labelledby={panelOutliersId}>
        <OpCardHead
          title={<span id={panelOutliersId}>Tus provincias — cobertura vs meta</span>}
          actions={
            <span className="text-[11px] text-ln-op-mute">
              {outlierCount} de {outliers.length} combinaciones bajo meta
            </span>
          }
        />
        <OpCardBody>
          {outliers.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">Sin datos provinciales disponibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Cobertura por provincia y métrica vs meta programática en tu jurisdicción. Filas
                  marcadas en rojo están por debajo de la meta.
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
                    const drillHref = govtProvinceHref(row.province);
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

      {/* PII oversight — scoped to actors in the govt's jurisdiction */}
      <OpCard aria-labelledby={panelPiiId}>
        <OpCardHead title={<span id={panelPiiId}>Supervisión de PII — tu jurisdicción</span>} />
        <OpCardBody>
          {piiOversight.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">
              Sin consultas PII registradas en el período en tu jurisdicción.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Top actores por cantidad de consultas PII-sensibles en el período, restringido a
                  tu jurisdicción asignada.
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

        {/* Scoped queue aging — replaces global fetchQueueHealth */}
        <OpCard aria-labelledby={panelQueueId}>
          <OpCardHead
            title={<span id={panelQueueId}>Cola de aprobaciones — tu jurisdicción</span>}
          />
          <OpCardBody>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">Pendientes</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.pendingTotal}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">Más vieja (días)</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.oldestPendingDaysAgo ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">14d+ / 30d+ / 60d+</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.pending14dPlus} / {queue.pending30dPlus} / {queue.pending60dPlus}
                </span>
              </div>
            </div>
          </OpCardBody>
        </OpCard>
      </div>

      {/* Alert subscriptions — per-user, unchanged */}
      <OpCard
        aria-labelledby={panelAlertasId}
        accent={breachingAlerts.length > 0 ? "danger" : undefined}
      >
        <OpCardHead title={<span id={panelAlertasId}>Alertas y suscripciones</span>} />
        <OpCardBody>
          {/* (a) Active breaching alerts */}
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

          {/* (b) My subscriptions list with delete / toggle */}
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
                    <form action={deleteAlertSubscriptionAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <OpButton
                        type="submit"
                        variant="danger"
                        size="sm"
                        aria-label="Eliminar suscripción"
                        className="h-11 px-3"
                      >
                        Eliminar
                      </OpButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* (c) Create subscription form */}
          <section aria-label="Crear suscripción">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ln-op-mute">
              Crear suscripción
            </h4>
            <AlertSubscriptionForm />
          </section>
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
