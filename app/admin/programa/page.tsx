// /admin/programa — Resumen ejecutivo del programa (Paquete H).
//
// Executive summary: North-Star KPIs + outliers + PII oversight + data quality
// + cron health. Universal admin scope (no JurisdictionSwitcher).
//
// ALERTS / SUBSCRIPTIONS — NOT IMPLEMENTED:
//   The alerts/subscriptions feature requires a new `alert_subscriptions` table
//   (product decision pending). A "Próximamente" placeholder is rendered below.
//   DO NOT add functionality or a migration until the product decision is made.
//
// Data sources (all NO-SCHEMA):
//   fetchEnoSla          ← lib/surveillance-metrics.ts  (A7)
//   fetchQueueHealth     ← lib/admin-metrics.ts
//   fetchCronRuns        ← lib/admin-metrics.ts
//   fetchDataQuality     ← lib/metrics/program-health.ts
//   fetchCrossJurisdictionOutliers ← lib/metrics/program-health.ts
//   fetchPiiOversight    ← lib/metrics/program-health.ts
//   registryCounts       ← lib/metrics/census.ts  (total registradas)
//   fetchSterilizationCoverage ← lib/metrics/population-control.ts
//   fetchMicrochipPenetration  ← lib/compliance-metrics.ts

import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { OpCard, OpCardBody, OpCardHead, OpKpi, OpPill } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchCronRuns, fetchQueueHealth } from "@/lib/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { fetchMicrochipPenetration } from "@/lib/compliance-metrics";
import {
  TARGETS,
  buildProjectionContext,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  toneForTarget,
} from "@/lib/metrics";
import { registryCounts } from "@/lib/metrics/census";
import { DORMANT_MONTHS_DEFAULT } from "@/lib/metrics/census";
import { windows } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { fetchEnoSla } from "@/lib/surveillance-metrics";

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
  ] = await Promise.all([
    registryCounts(adminCtx, DORMANT_MONTHS_DEFAULT),
    fetchSterilizationCoverage(adminCtx),
    fetchMicrochipPenetration(adminCtx),
    fetchEnoSla(adminCtx),
    fetchQueueHealth(),
    fetchCronRuns(),
    fetchDataQuality(adminCtx),
    fetchCrossJurisdictionOutliers(adminCtx),
    fetchPiiOversight(adminCtx),
  ]);

  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  // Panel element IDs for accessible aria-labelledby.
  const panelOutliersId = "admin-programa-outliers-titulo";
  const panelPiiId = "admin-programa-pii-titulo";
  const panelQualityId = "admin-programa-calidad-titulo";
  const panelCronsId = "admin-programa-crons-titulo";
  const panelAlertasId = "admin-programa-alertas-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin · Resumen ejecutivo
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Salud del programa</h1>
        <p className="text-[13px] text-ln-op-mute">
          KPIs North-Star, outliers por jurisdicción, calidad de datos y oversight de PII.
        </p>
      </header>

      {/* Period filter */}
      <div className="flex justify-end">
        <PeriodPicker defaultPreset="ytd" />
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
          href="/admin/censo"
          info={{
            definition: "Total de mascotas con status 'active' o 'lost' a nivel nacional.",
            formula: "COUNT(pets) WHERE status IN ('active','lost')",
          }}
        />
        <OpKpi
          label="Esterilización"
          value={sterilRatePct > 0 ? `${sterilRatePct}%` : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/admin/poblacion"
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
          href="/admin/censo"
          info={{
            definition: "% de mascotas activas con microchip ISO activo.",
            formula: "chipped / active * 100",
          }}
        />
        <OpKpi
          label="SLA ENO"
          value={enoSla.onTimePct !== null ? `${enoSla.onTimePct}%` : "—"}
          tone={enoSla.onTimePct !== null ? toneForTarget(enoSla.onTimePct, 95) : undefined}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en breach activo`
              : "sin breach activo"
          }
          href="/admin/outbox"
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

      {/* Outliers table */}
      <OpCard aria-labelledby={panelOutliersId}>
        <OpCardHead
          title={<span id={panelOutliersId}>Outliers por provincia</span>}
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

      {/* PII oversight */}
      <OpCard aria-labelledby={panelPiiId}>
        <OpCardHead title={<span id={panelPiiId}>Oversight de PII — ¿quién consultó qué?</span>} />
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
                {/* Completeness bar */}
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[12px] text-ln-op-mute">Completitud</span>
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

                {/* Missing field counts */}
                <ul className="space-y-1.5 text-[12px]" aria-label="Campos faltantes por categoría">
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

                <p className="text-[10px] text-ln-op-mute">
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
                    className="flex items-baseline justify-between gap-3 text-[12px]"
                    aria-label={`${c.cronName}: ${c.lastStatus ?? "desconocido"}`}
                  >
                    <span className="text-ln-op-ink-2 truncate max-w-[160px]">{c.cronName}</span>
                    <span className="flex items-center gap-1.5 tabular-nums text-[11px] shrink-0">
                      {c.lastRunAt
                        ? new Date(c.lastRunAt).toLocaleString("es-AR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
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

      {/* Alertas / suscripciones — PLACEHOLDER (requires schema) */}
      {/*
        PRÓXIMAMENTE — alert_subscriptions table required.
        This card is intentionally inert. The feature needs a new `alert_subscriptions`
        table to persist threshold rules and subscriber lists (product decision pending).
        DO NOT add real functionality here until the schema is created and approved.
      */}
      <OpCard aria-labelledby={panelAlertasId}>
        <OpCardHead title={<span id={panelAlertasId}>Alertas y suscripciones</span>} />
        <OpCardBody>
          <p className="text-[13px] text-ln-op-mute">
            Próximamente — requiere una tabla de suscripciones (decisión de producto pendiente).
          </p>
          <p className="mt-1 text-[11px] text-ln-op-mute">
            Las alertas de umbral sobre breaches activos (zoonosis, SLA ENO, cobertura) serán
            configurables cuando se apruebe el diseño de la tabla{" "}
            <code className="font-mono">alert_subscriptions</code>.
          </p>
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
