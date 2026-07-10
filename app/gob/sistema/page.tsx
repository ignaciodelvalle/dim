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

import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchQueueHealthScoped } from "@/lib/analytics/admin-metrics";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
} from "@/lib/analytics/govt-dashboards";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { TARGETS, buildProjectionContext, enoSlaTone, toneForTarget } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
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

  // Narrow to selected province/locality within the govt's assignments.
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    filteredJurisdictions = selectedLocalityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceName);
  }

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing30d();
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);

  const [enoSla, queue] = await Promise.all([
    fetchEnoSla(ctx),
    fetchQueueHealthScoped(filteredJurisdictions),
  ]);

  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Gobierno · Sistema
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Salud operativa — tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "SLA de notificaciones ENO y antigüedad de la cola de aprobaciones en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

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
          info={{
            definition:
              "% de notificaciones ENO (target_kind='eno_authority') entregadas dentro del SLA en tu jurisdicción.",
            formula: "onTime / delivered * 100 — período seleccionado",
          }}
        />
        <OpKpi
          label="Cola pendiente"
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
