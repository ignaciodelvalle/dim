// /admin/alertas — Bandeja de alertas + triage (Paquete K).
//
// Lists alert_firings (the lifecycle records opened when an alert_subscriptions
// threshold is crossed) and lets an admin work each alert through its state
// machine: reconocer → investigar / registrar seguimiento → contactar autoridad
// → resolver / descartar. Dedicated a11y table (NOT CaseQueue — firings are not
// CaseListItem-shaped). Every list view writes a pii_queried audit row
// (surface: "alert_inbox").
//
// Auth: requireAdminOrRedirect (admin-only; govt + everyone else → /).

import { AlertInboxTable } from "@/components/admin/AlertInboxTable";
import { OpButton, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { ALERT_FIRING_STATUSES, ALERT_METRIC_KEYS, type AlertMetricKey } from "@/db/schema";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import {
  type AlertInboxFilters,
  fetchAlertFirings,
  logAlertInboxView,
} from "@/lib/metrics/alert-firing-inbox";
import { PROVINCES } from "@/lib/reference/ar-provincias";

export const dynamic = "force-dynamic";

const METRIC_LABEL: Record<string, string> = {
  active_zoonosis: "Zoonosis activos",
  eno_sla_ontime_pct: "SLA ENO (%)",
  queue_oldest_days: "Días sin atender",
  sterilization_coverage_pct: "Cobertura esteriliz. (%)",
  microchip_penetration_pct: "Microchip (%)",
  open_welfare_reports: "Maltrato abiertas",
};

const STATUS_FILTER_LABEL: Record<string, string> = {
  open: "Abiertas (todas)",
  all: "Todas",
  disparada: "Disparada",
  reconocida: "Reconocida",
  en_investigacion: "En investigación",
  autoridad_contactada: "Autoridad contactada",
  resuelta: "Resuelta",
  descartada: "Descartada",
};

function parseFilters(sp: Record<string, string | undefined>): AlertInboxFilters {
  const status = sp.status;
  const metricKey =
    sp.metric && (ALERT_METRIC_KEYS as readonly string[]).includes(sp.metric)
      ? (sp.metric as AlertMetricKey)
      : undefined;
  return {
    status:
      status && (status === "all" || (ALERT_FIRING_STATUSES as readonly string[]).includes(status))
        ? (status as AlertInboxFilters["status"])
        : "open",
    metricKey,
    province: sp.province || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };
}

export default async function AdminAlertasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireAdminOrRedirect();
  const sp = searchParams ? await searchParams : {};
  const filters = parseFilters(sp);

  const rows = await fetchAlertFirings(filters);

  // Mandatory PII audit row for this list view (surface: alert_inbox).
  await logAlertInboxView(session.user.id, filters, rows.length);

  const inputCls =
    "h-11 rounded-[6px] border border-ln-op-line bg-ln-op-card px-2 text-sm text-ln-op-ink";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin · Operaciones
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Bandeja de alertas</h1>
        <p className="text-[13px] text-ln-op-mute">
          Alertas disparadas al cruzar un umbral suscripto. Reconocé, investigá, contactá a la
          autoridad de la jurisdicción y cerrá cada alerta. El SLA de atención (antigüedad) refuerza
          el grado sanitario del programa.
        </p>
      </header>

      <OpCard>
        <OpCardHead title="Filtros" />
        <OpCardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute">
              Estado
              <select name="status" defaultValue={filters.status ?? "open"} className={inputCls}>
                {Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute">
              Métrica
              <select name="metric" defaultValue={filters.metricKey ?? ""} className={inputCls}>
                <option value="">Todas</option>
                {ALERT_METRIC_KEYS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABEL[m] ?? m}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute">
              Provincia
              <select name="province" defaultValue={filters.province ?? ""} className={inputCls}>
                <option value="">Todas</option>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute">
              Desde
              <input
                type="date"
                name="from"
                defaultValue={filters.from ?? ""}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute">
              Hasta
              <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputCls} />
            </label>

            <OpButton type="submit" variant="primary" size="sm" className="h-11 px-4">
              Aplicar
            </OpButton>
          </form>
        </OpCardBody>
      </OpCard>

      <OpCard>
        <OpCardHead
          title="Alertas"
          actions={
            <span className="text-[11px] text-ln-op-mute">
              {rows.length} {rows.length === 1 ? "alerta" : "alertas"}
            </span>
          }
        />
        <OpCardBody>
          <AlertInboxTable rows={rows} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
