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
import { DateInputAr } from "@/components/ui/DateInputAr";
import { OpButton, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import {
  ALERT_FIRING_STATUSES,
  ALERT_METRIC_KEYS,
  type AlertFiring,
  type AlertMetricKey,
} from "@/db/schema";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import {
  type AlertInboxFilters,
  fetchAlertFirings,
  logAlertInboxView,
} from "@/lib/metrics/alert-firing-inbox";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";

export const dynamic = "force-dynamic";

// Server-render budget for the inbox fetch. On expiry (or a fetcher rejection,
// caught below) the page renders a degraded-but-honest state — "no pudimos
// cargar la bandeja, reintentá" — instead of hanging the RSC stream forever
// behind loading.tsx (QA histórico 2026-07-08: deterministic 25s+ eternal
// spinner). Mirrors the panorama page's withDbBudget guard (task #74).
const PAGE_BUDGET_MS = 9000;

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

  // Bound the inbox fetch on BOTH axes (time + crash-safety). `null` is the
  // degraded sentinel: on a timeout or a rejected query the page renders an
  // honest "reintentá" card instead of an eternal skeleton.
  const rows = await withDbBudget<AlertFiring[] | null>(
    fetchAlertFirings(filters),
    PAGE_BUDGET_MS,
    "admin/alertas firings",
    null,
  ).catch(() => null);

  const degraded = rows === null;

  // Mandatory PII audit row for this list view (surface: alert_inbox) — only
  // when we actually read rows. Bounded so a degraded audit-log write can never
  // re-introduce the hang we just fixed; a failed audit is logged and swallowed.
  if (!degraded) {
    await withDbBudget(
      logAlertInboxView(session.user.id, filters, rows.length),
      PAGE_BUDGET_MS,
      "admin/alertas audit",
      undefined,
    ).catch(() => undefined);
  }

  const inputCls =
    "h-11 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2 text-sm text-ln-op-ink";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin · Operaciones
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Bandeja de alertas
        </h1>
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

            <label
              htmlFor="alertas-from"
              className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute"
            >
              Desde
              {/* Browser-independent dd/mm/aaaa entry (DateInputAr): native
                  date inputs render mm/dd/yyyy outside Chromium, which produced
                  wrong ranges. The submitted value stays ISO. */}
              <DateInputAr
                id="alertas-from"
                name="from"
                defaultValue={filters.from}
                className={inputCls}
              />
            </label>

            <label
              htmlFor="alertas-to"
              className="flex flex-col gap-1 text-[11px] font-semibold text-ln-op-mute"
            >
              Hasta
              <DateInputAr
                id="alertas-to"
                name="to"
                defaultValue={filters.to}
                className={inputCls}
              />
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
            degraded ? undefined : (
              <span className="text-[11px] text-ln-op-mute">
                {rows.length} {rows.length === 1 ? "alerta" : "alertas"}
              </span>
            )
          }
        />
        <OpCardBody>
          {degraded ? (
            <div className="space-y-3 py-4 text-center">
              <p className="text-[var(--text-sm)] font-semibold text-ln-op-ink">
                No pudimos cargar la bandeja de alertas.
              </p>
              <p className="text-[var(--text-sm)] text-ln-op-mute">
                La consulta tardó demasiado o falló. Reintentá en unos segundos.
              </p>
              <a
                href="/admin/alertas"
                className="inline-flex items-center justify-center rounded-[var(--radius-op-btn,6px)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-sm font-semibold text-ln-op-ink no-underline hover:bg-ln-op-stripe"
              >
                Reintentar
              </a>
            </div>
          ) : (
            <AlertInboxTable rows={rows} />
          )}
        </OpCardBody>
      </OpCard>
    </div>
  );
}
