// /gob/sistema — folded into /gob/programa for govt operators (2026-07-09
// audit, PO-ratified). Its KPIs (ENO SLA, scoped queue aging) duplicated
// fetchers already rendered on /gob/programa; the one figure that was NOT
// already there — total ENO notifications in period — moved into Programa's
// SLA KPI sub-line. Govt visitors (including stale deep links) now redirect
// to /gob/programa with filters preserved. Admin's /gob/sistema behaviour is
// UNCHANGED — /admin/sistema (full platform ops) is the separate admin
// surface and was never in scope for this fold.
//
// Privacy invariant: both fetchers receive scope-restricted context/jurisdictions.

import { OpCard, OpCardBody, OpCardHead, OpFilterBar, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchQueueHealthScoped } from "@/lib/analytics/admin-metrics";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { TARGETS, buildProjectionContext, enoSlaTone } from "@/lib/metrics";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GobSistemaPage({
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
  const sp = await searchParams;

  // Govt: this page is folded into /gob/programa — redirect, carrying the
  // period/scope filters over so a stale deep link lands on the same slice.
  if (profile.role === "govt") {
    const qs = new URLSearchParams();
    if (sp.period) qs.set("period", sp.period);
    if (sp.from) qs.set("from", sp.from);
    if (sp.to) qs.set("to", sp.to);
    if (sp.province) qs.set("province", sp.province);
    if (sp.locality) qs.set("locality", sp.locality);
    const query = qs.toString();
    redirect(query ? `/gob/programa?${query}` : "/gob/programa");
  }

  // Admin only past this point (requireAdminOrGovtOrRedirect allows only
  // 'admin' | 'govt', and 'govt' redirected above) — unchanged full view.
  const actor = { role: profile.role } as const;

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
  // (same pattern as /gob/perdidas). Note: this page is admin-only past this
  // point (govt redirects to /gob/programa above), so adminProvince/adminLocality
  // are the only meaningful branch here.
  const adminProvince = adminSelectedProvince ?? undefined;
  const adminLocality = adminSelectedLocality ?? undefined;

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing30d();
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  const [enoSla, queue] = await Promise.all([
    fetchEnoSla(ctx),
    fetchQueueHealthScoped(filteredJurisdictions, { adminProvince, adminLocality }),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Gobierno · Sistema
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Salud operativa — tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "SLA de notificaciones ENO y antigüedad de la cola de aprobaciones en tu cobertura."}
        </p>
      </header>

      {/* Unified filter bar — period + jurisdiction, same rail as programa/vigilancia. */}
      <OpFilterBar
        period={{ defaultPreset: "30d" }}
        jurisdiction={{ allowedProvinces, localities }}
      />

      {/* Top KPI strip */}
      <section
        aria-label="KPIs de salud operativa"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        <OpKpi
          label="SLA ENO (resueltos)"
          value={enoSla.onTimePct !== null ? `${enoSla.onTimePct}%` : "—"}
          tone={enoSlaTone(enoSla)}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en incumplimiento activo`
              : enoSla.total > 0
                ? "sin incumplimientos activos"
                : "sin notificaciones en el período"
          }
          href="/gob/outbox"
          info={getKpiInfo("eno_sla_compliance")}
          descriptorId="eno_sla_compliance"
        />
        <OpKpi
          label={KPI_CATALOG.queue_pending_total.label}
          value={queue.pendingTotal.toLocaleString("es-AR")}
          tone={queue.pendingTotal > 0 ? "warn" : "neutral"}
          sub={
            queue.oldestPendingDaysAgo != null
              ? `Más vieja: ${queue.oldestPendingDaysAgo}d`
              : "sin solicitudes pendientes"
          }
          href="/gob/cola"
          info={{
            definition: "Solicitudes de aprobación en estado pendiente en tu jurisdicción.",
            formula: "count(*) WHERE status='pending' AND jurisdiction IN scope",
          }}
          descriptorId="queue_pending_total"
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
          sub="días de antigüedad (solicitud más antigua)"
          info={{
            definition:
              "Días de antigüedad de la solicitud pendiente más antigua en tu jurisdicción.",
            formula: "now() - min(created_at) WHERE status='pending' AND scope",
          }}
          descriptorId="queue_oldest_pending_days"
        />
      </section>

      {/* ENO SLA detail card */}
      <OpCard>
        <OpCardHead title="ENO SLA — detalle" />
        <OpCardBody>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ln-op-mute">En tiempo (on-time)</span>
              <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                {enoSla.onTimePct !== null ? `${enoSla.onTimePct}%` : "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ln-op-mute">Total notificaciones</span>
              <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                {enoSla.total.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ln-op-mute">En incumplimiento activo</span>
              <span
                className={[
                  "text-[13px] font-medium tabular-nums",
                  enoSla.breachedOpen > 0 ? "text-ln-op-danger" : "text-ln-op-ink",
                ].join(" ")}
              >
                {enoSla.breachedOpen}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-ln-op-mute">
            SLA objetivo: {TARGETS.ENO_SLA_PCT}% de notificaciones ENO entregadas en tiempo (A7).
            Solo se muestran notificaciones cuyo target_jurisdiction corresponde a tu jurisdicción
            asignada.
          </p>
        </OpCardBody>
      </OpCard>

      {/* Scoped queue aging card */}
      <OpCard>
        <OpCardHead title="Cola de aprobaciones — envejecimiento" />
        <OpCardBody>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ln-op-mute">Pendientes</span>
              <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                {queue.pendingTotal.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ln-op-mute">Más vieja (días)</span>
              <span
                className={[
                  "text-[13px] font-medium tabular-nums",
                  queue.oldestPendingDaysAgo !== null && queue.oldestPendingDaysAgo > 30
                    ? "text-ln-op-danger"
                    : queue.oldestPendingDaysAgo !== null && queue.oldestPendingDaysAgo > 14
                      ? "text-ln-op-warn"
                      : "text-ln-op-ink",
                ].join(" ")}
              >
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
          <p className="mt-3 text-xs text-ln-op-mute">
            Solo incluye solicitudes cuya jurisdicción (provincia + localidad) coincide con tu
            cobertura asignada.
          </p>
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
