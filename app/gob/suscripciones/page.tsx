// /gob/suscripciones — Alertas y suscripciones (promoted OUT of /gob/programa
// and /admin/programa, 2026-07-21). Threshold alert subscriptions for the
// operator's OWN account: create / toggle / delete, plus a live view of any
// currently-breaching alerts.
//
// Canonical implementation — /admin/suscripciones is a thin wrapper that
// re-exports this page's default export (portal-follows-viewer pattern,
// mirrors /gob/cola + app/admin/cola/page.tsx).
//
// WHY the move: the panel used to be a 3-section stacked <ul>/<li> "form-list"
// embedded inside /gob/programa and /admin/programa's executive summary — a
// visual idiom found nowhere else in the operator surfaces (which use
// OpCard/OpCardHead/OpCardBody + row-list markup). It also had nothing to do
// with the KPI/outliers/data-quality content around it. This gives it its own
// destination with the canonical card-list presentation and an OpFilterBar
// for Métrica/Estado, driven by the same underlying data + actions.
//
// Scope — UNCHANGED from the embedded panel (presentation-only move):
//   READ (evaluateAlertSubscriptions) — reachable behind requireAdminOrGovtOrRedirect,
//     same "admin universal / govt needs an active jurisdiction assignment"
//     access gate /gob/programa used for its whole exec summary. Subscriptions
//     are NOT jurisdiction-scoped by the PAGE — each row carries its OWN
//     optional jurisdiction, and results are filtered to the CALLING user's
//     own subscriptions only (queue_oldest_days is always evaluated globally;
//     see lib/metrics/alert-evaluation.ts).
//   WRITE (create/toggle/delete server actions) — gated by requireAdminOrRedirect
//     (admin-only) inside app/actions/alert-subscriptions.ts, unchanged by this
//     move. A govt operator can view their own subscriptions here but the
//     mutation actions redirect a non-admin caller — that predates this
//     promotion (it was already true on /gob/programa) and is preserved as-is.
//
// One presentational consolidation: the two source panels diverged on delete
// UX (admin used the 2-step-confirm DeleteAlertSubscriptionButton; gob posted
// straight to deleteAlertSubscriptionAction with no confirmation). Merging
// into one canonical page means picking one — this keeps the safer 2-step
// confirm for BOTH portals. The server action + its authz are untouched.

import { toggleAlertSubscriptionAction } from "@/app/actions/alert-subscriptions";
import { AlertSubscriptionForm } from "@/components/admin/AlertSubscriptionForm";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpButton, OpCard, OpCardBody, OpCardHead, OpFilterBar } from "@/components/ui/dashboard";
import { type ALERT_DIRECTIONS, ALERT_METRIC_KEYS } from "@/db/schema";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { evaluateAlertSubscriptions } from "@/lib/metrics";
import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";
import { createClient } from "@/lib/supabase/server";

import { DeleteAlertSubscriptionButton } from "./DeleteAlertSubscriptionButton";

export const dynamic = "force-dynamic";

type AlertMetricKeyValue = (typeof ALERT_METRIC_KEYS)[number];
type AlertDirectionValue = (typeof ALERT_DIRECTIONS)[number];

const ALERT_METRIC_LABEL: Record<AlertMetricKeyValue, string> = {
  active_zoonosis: KPI_CATALOG.active_zoonosis_signals.label,
  eno_sla_ontime_pct: "SLA ENO en tiempo (%)",
  queue_oldest_days: "Días sin atender (solicitud más antigua)",
  sterilization_coverage_pct: "Cobertura de esterilización (%)",
  microchip_penetration_pct: "Penetración de microchip (%)",
  open_welfare_reports: "Denuncias de maltrato abiertas",
};

const ALERT_DIRECTION_LABEL: Record<AlertDirectionValue, string> = {
  above: "encima de",
  below: "debajo de",
};

function parseMetricParam(raw: string | undefined): AlertMetricKeyValue | null {
  if (!raw) return null;
  return (ALERT_METRIC_KEYS as readonly string[]).includes(raw)
    ? (raw as AlertMetricKeyValue)
    : null;
}

function parseStateParam(raw: string | undefined): "active" | "inactive" | null {
  return raw === "active" || raw === "inactive" ? raw : null;
}

export default async function SuscripcionesPage({
  searchParams,
}: {
  searchParams: Promise<{ metricKey?: string; state?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Same reachability gate the exec summary used for its whole page — an
  // unassigned govt account still can't reach this surface. Preserved as-is.
  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a alertas y suscripciones. Pedile al admin que te asigne jurisdicciones."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? null;

  const actor = { role: profile.role } as const;
  const alertEvals = currentUserId ? await evaluateAlertSubscriptions(currentUserId, actor) : [];

  const sp = await searchParams;
  const metricFilter = parseMetricParam(sp.metricKey);
  const stateFilter = parseStateParam(sp.state);

  // "Alertas activas" is a current-state banner, not a browsable list — it
  // always reflects the FULL breach state, unfiltered by the axes below.
  const breachingAlerts = alertEvals.filter((a) => a.breaching);

  const filteredEvals = alertEvals.filter((a) => {
    if (metricFilter && a.metricKey !== metricFilter) return false;
    if (stateFilter === "active" && !a.isActive) return false;
    if (stateFilter === "inactive" && a.isActive) return false;
    return true;
  });

  const panelAlertasId = "suscripciones-alertas-titulo";
  const panelListaId = "suscripciones-lista-titulo";
  const panelCrearId = "suscripciones-crear-titulo";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Alertas y suscripciones
        </h1>
        <p className="text-[var(--text-md)] text-ln-op-mute">
          Suscribite a umbrales de métricas del programa y recibí un aviso cuando se rompan. Cada
          suscripción es personal — solo ves y gestionás las tuyas.
        </p>
      </header>

      {/* Both axes' blank/unset default genuinely means "todas" (all metrics,
          both states) — not a hidden narrower default, so both are safe as
          OpFilterBar axes (no default-trap). */}
      <OpFilterBar
        showPeriod={false}
        axes={[
          {
            id: "metricKey",
            label: "Métrica",
            paramKey: "metricKey",
            current: metricFilter,
            options: ALERT_METRIC_KEYS.map((key) => ({
              value: key,
              label: ALERT_METRIC_LABEL[key],
            })),
          },
          {
            id: "state",
            label: "Estado",
            paramKey: "state",
            current: stateFilter,
            options: [
              { value: "active", label: "Activa" },
              { value: "inactive", label: "Inactiva" },
            ],
          },
        ]}
      />

      {/* Alertas activas — breaching subscriptions right now. */}
      <OpCard
        aria-labelledby={panelAlertasId}
        accent={breachingAlerts.length > 0 ? "danger" : undefined}
      >
        <OpCardHead title={<span id={panelAlertasId}>Alertas activas</span>} />
        <OpCardBody>
          {breachingAlerts.length === 0 ? (
            <p className="text-[var(--text-md)] text-ln-op-mute">Sin alertas activas.</p>
          ) : (
            <ul className="space-y-2">
              {breachingAlerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-[var(--text-md)] text-ln-op-danger"
                >
                  <span className="font-semibold">
                    {a.label ?? ALERT_METRIC_LABEL[a.metricKey] ?? a.metricKey}
                  </span>
                  {a.jurisdictionProvince ? (
                    <span className="ml-1 text-[var(--text-sm)] text-ln-op-mute">
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
        </OpCardBody>
      </OpCard>

      {/* Mis suscripciones — card-list of rows, filterable by the bar above. */}
      <OpCard aria-labelledby={panelListaId}>
        <OpCardHead
          title={<span id={panelListaId}>Mis suscripciones</span>}
          actions={
            alertEvals.length > 0 ? (
              <span className="text-[var(--text-sm)] text-ln-op-mute">
                {filteredEvals.length} de {alertEvals.length}
              </span>
            ) : undefined
          }
        />
        <OpCardBody>
          {alertEvals.length === 0 ? (
            <p className="text-[var(--text-md)] text-ln-op-mute">
              Sin suscripciones configuradas. Creá una abajo.
            </p>
          ) : filteredEvals.length === 0 ? (
            <p className="text-[var(--text-md)] text-ln-op-mute">
              Sin suscripciones que coincidan con el filtro.
            </p>
          ) : (
            <ul className="divide-y divide-ln-op-line-2">
              {filteredEvals.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-[var(--text-md)]">
                  <div className="flex-1">
                    <span className={a.isActive ? "text-ln-op-ink" : "text-ln-op-mute"}>
                      {a.label ?? ALERT_METRIC_LABEL[a.metricKey] ?? a.metricKey}
                    </span>
                    {a.jurisdictionProvince ? (
                      <span className="ml-1 text-[var(--text-sm)] text-ln-op-mute">
                        ({a.jurisdictionProvince})
                      </span>
                    ) : null}
                    <span className="ml-2 text-[var(--text-sm)] text-ln-op-mute">
                      {ALERT_DIRECTION_LABEL[a.direction] ?? a.direction}{" "}
                      {Number(a.threshold).toLocaleString("es-AR")}
                    </span>
                    {!a.isActive && (
                      <span className="ml-2 text-[var(--text-sm)] text-ln-op-mute italic">
                        (inactiva)
                      </span>
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
                  <DeleteAlertSubscriptionButton subscriptionId={a.id} />
                </li>
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>

      {/* Crear suscripción */}
      <OpCard aria-labelledby={panelCrearId}>
        <OpCardHead title={<span id={panelCrearId}>Crear suscripción</span>} />
        <OpCardBody>
          <AlertSubscriptionForm />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
