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
// Privacy invariant: all fetchers receive a scoped ctx or filteredJurisdictions —
// a govt can never see data outside their assigned localities.

import {
  deleteAlertSubscriptionAction,
  toggleAlertSubscriptionAction,
} from "@/app/actions/alert-subscriptions";
import { AlertSubscriptionForm } from "@/components/admin/AlertSubscriptionForm";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpButton, OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchQueueHealthScoped } from "@/lib/analytics/admin-metrics";
import { fetchMicrochipPenetration } from "@/lib/analytics/compliance-metrics";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
} from "@/lib/analytics/govt-dashboards";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  evaluateAlertSubscriptions,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  toneForTarget,
} from "@/lib/metrics";
import { DORMANT_MONTHS_DEFAULT, registryCounts } from "@/lib/metrics/census";
import { windows } from "@/lib/metrics/period";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALERT_METRIC_LABEL: Record<string, string> = {
  active_zoonosis: "Casos de zoonosis activos",
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

  // Narrow to selected province/locality. Admin short-circuits inside fetchers.
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    filteredJurisdictions = selectedLocalityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceName);
  }

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);

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
  ] = await Promise.all([
    registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
    fetchSterilizationCoverage(ctx),
    fetchMicrochipPenetration(ctx),
    fetchEnoSla(ctx),
    fetchQueueHealthScoped(filteredJurisdictions),
    fetchDataQuality(ctx),
    fetchCrossJurisdictionOutliers(ctx),
    fetchPiiOversight(ctx),
    currentUserId ? evaluateAlertSubscriptions(currentUserId, actor) : Promise.resolve([]),
  ]);

  const breachingAlerts = alertEvals.filter((a) => a.breaching);
  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const panelOutliersId = "gob-programa-outliers-titulo";
  const panelPiiId = "gob-programa-pii-titulo";
  const panelQualityId = "gob-programa-calidad-titulo";
  const panelQueueId = "gob-programa-cola-titulo";
  const panelAlertasId = "gob-programa-alertas-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Gobierno · Resumen ejecutivo
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Resumen ejecutivo — tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "KPIs North-Star, outliers, calidad de datos y oversight de PII en tu cobertura asignada."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="trailing12m" />
      </div>

      {/* North-Star KPI strip */}
      <section
        aria-label="KPIs North-Star del programa"
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
          value={sterilRatePct > 0 ? `${sterilRatePct}%` : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/gob/poblacion"
          info={{
            definition: "% de mascotas activas con ≥1 evento sterilization_performed.",
            formula: "sterilized / active * 100",
          }}
        />
        <OpKpi
          label="Microchip"
          value={chipRatePct > 0 ? `${chipRatePct}%` : "—"}
          tone={toneForTarget(chipRatePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}%`}
          href="/gob/censo"
          info={{
            definition: "% de mascotas activas con microchip ISO activo.",
            formula: "chipped / active * 100",
          }}
        />
        <OpKpi
          label="SLA ENO"
          value={enoSla.onTimePct !== null ? `${enoSla.onTimePct}%` : "—"}
          tone={
            enoSla.onTimePct !== null
              ? toneForTarget(enoSla.onTimePct, TARGETS.ENO_SLA_PCT)
              : undefined
          }
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en breach activo`
              : "sin breach activo"
          }
          href="/gob/outbox"
          info={{
            definition: "% de notificaciones ENO entregadas dentro del SLA (A7).",
            formula: "onTime / delivered * 100",
          }}
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
                  {outliers.map((row, i) => (
                    <tr
                      key={`${row.province}-${row.metric}-${i}`}
                      className={[
                        "border-b border-ln-op-line last:border-0",
                        row.isOutlier
                          ? "bg-ln-op-danger-bg/30"
                          : "hover:bg-ln-op-stripe/50 transition-colors",
                      ].join(" ")}
                      aria-label={`${row.province} — ${METRIC_LABEL[row.metric] ?? row.metric}: ${row.rate}% (meta ${row.target}%)${row.isOutlier ? ", bajo meta" : ""}`}
                    >
                      <td className="py-2 pr-4">{row.province}</td>
                      <td className="py-2 pr-4 text-ln-op-ink-2">
                        {METRIC_LABEL[row.metric] ?? row.metric}
                      </td>
                      <td
                        className={[
                          "py-2 pr-4 text-right tabular-nums font-medium",
                          row.isOutlier ? "text-ln-op-danger" : "text-ln-op-verde",
                        ].join(" ")}
                        aria-label={`Cobertura: ${row.rate}%`}
                      >
                        {row.rate}%
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
                          ? `−${row.gap}%`
                          : row.gap < 0
                            ? `+${Math.abs(row.gap)}%`
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* PII oversight — scoped to actors in the govt's jurisdiction */}
      <OpCard aria-labelledby={panelPiiId}>
        <OpCardHead title={<span id={panelPiiId}>Oversight de PII — tu jurisdicción</span>} />
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
                      <td className="py-2 pr-4 font-mono text-[11px] text-ln-op-ink-2">
                        {row.actorUserId ? `${row.actorUserId.slice(0, 8)}…` : "Usuario eliminado"}
                      </td>
                      <td className="py-2 pr-4 text-ln-op-ink-2">{row.action}</td>
                      <td className="py-2 pr-4 text-ln-op-mute">{row.surface ?? "—"}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium">
                        {row.count.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 text-right text-[11px] text-ln-op-mute">
                        {new Date(row.lastAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
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
                          ? "text-ln-op-verde"
                          : dataQuality.completenessPct >= 60
                            ? "text-ln-op-amarillo"
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
                          ? "bg-ln-op-verde"
                          : dataQuality.completenessPct >= 60
                            ? "bg-ln-op-amarillo"
                            : "bg-ln-op-rojo",
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
                        dataQuality.orphans > 0 ? "text-ln-op-amarillo" : "text-ln-op-ink",
                      ].join(" ")}
                    >
                      {dataQuality.orphans.toLocaleString("es-AR")}
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-ln-op-mute">
                  Completitud = mascotas sin ningún campo faltante (localidad + sexo + chip) ÷
                  total.
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
                    className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-[13px] text-ln-op-danger"
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
