import Link from "next/link";

import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchCronRuns,
  fetchDecisionsMetrics,
  fetchGovtActivity,
  fetchQueueHealth,
  fetchUserMetrics,
  sortGovtActivityByActivity,
} from "@/lib/analytics/admin-metrics";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext, decisionsDeltaPct } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

type CronTone = "ok" | "danger" | "open";
const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  failed: "Fallo",
  running: "Corriendo",
};
const STATUS_TONE: Record<string, CronTone> = {
  ok: "ok",
  failed: "danger",
  running: "open",
};

// Cap the "actividad por govt" table so a universal-scope roster (which can hold
// dozens of duplicate seed govts) never pushes live operators below the fold.
const GOVT_ACTIVITY_LIMIT = 25;

export default async function AdminSistemaPage() {
  await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // Used for DashboardFreshnessFooter (lastIngestAt) — admin sees all pet_events.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

  const [users, queue, decisions, govts, crons, enoSla] = await Promise.all([
    fetchUserMetrics(),
    fetchQueueHealth(),
    fetchDecisionsMetrics(),
    fetchGovtActivity(),
    fetchCronRuns(),
    fetchEnoSla(adminCtx),
  ]);

  // deltaV2 for decisions 7d — compare vs prior 7d approximated from the 30d
  // window. Shared helper (decisionsDeltaPct) keeps this in lockstep with the
  // admin landing strip (C28).
  const total7d = decisions.approved7d + decisions.rejected7d;
  const decisionsDelta = decisionsDeltaPct(decisions);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Sistema
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Salud del sistema</h1>
        <p className="text-[13px] text-ln-op-ink-2">Métricas operativas en vivo. Solo admin.</p>
        {/* D6 — cross-link a la profundidad analítica nacional (mapa, ranking,
            métricas agregadas). El admin no tiene charts propios todavía; el
            Centro de Situación es la superficie integradora pendiente. */}
        <div className="flex flex-wrap gap-4 pt-1">
          <Link
            href="/gob/analytics"
            className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Ver analítica nacional {"→"}
          </Link>
          {/* Paquete H — executive summary cross-link */}
          <Link
            href="/admin/programa"
            className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Resumen ejecutivo {"→"}
          </Link>
        </div>
      </header>

      {/* Top KPIs — shared operational strip (C26). Paquete H ENO SLA (A7)
          measures the notification pipeline health. */}
      <section aria-label="Estado del sistema">
        <AdminKpiStrip
          data={{
            totalPersonal: users.totalPersonal,
            pendingTotal: queue.pendingTotal,
            oldestPendingDaysAgo: queue.oldestPendingDaysAgo,
            decisionsTotal7d: total7d,
            approved7d: decisions.approved7d,
            rejected7d: decisions.rejected7d,
            decisionsDelta,
            enoSla: {
              onTimePct: enoSla.onTimePct,
              breachedOpen: enoSla.breachedOpen,
              total: enoSla.total,
            },
          }}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <OpCard>
          <OpCardHead title="Usuarios" />
          <OpCardBody>
            <StatRow label="Personal" value={users.totalPersonal} />
            <StatRow label="Institucional activo" value={users.totalInstitutionalActive} />
            <StatRow
              label="Nuevos · 24h / 7d / 30d"
              value={`${users.new24h} / ${users.new7d} / ${users.new30d}`}
            />
          </OpCardBody>
        </OpCard>

        <OpCard>
          <OpCardHead title="Cola de aprobaciones" />
          <OpCardBody>
            <StatRow label="Pendientes" value={queue.pendingTotal} />
            <StatRow label="Más vieja (días)" value={queue.oldestPendingDaysAgo ?? "—"} />
            <StatRow
              label="14d+ / 30d+ / 60d+"
              value={`${queue.pending14dPlus} / ${queue.pending30dPlus} / ${queue.pending60dPlus}`}
            />
          </OpCardBody>
        </OpCard>

        <OpCard>
          <OpCardHead title="Decisiones" />
          <OpCardBody>
            <StatRow
              label="Aprobadas · 7d / 30d"
              value={`${decisions.approved7d} / ${decisions.approved30d}`}
            />
            <StatRow
              label="Rechazadas · 7d / 30d"
              value={`${decisions.rejected7d} / ${decisions.rejected30d}`}
            />
            <StatRow label="Revocaciones · 30d" value={decisions.revocations30d} />
          </OpCardBody>
        </OpCard>

        <OpCard>
          <OpCardHead
            title="Crons"
            actions={
              <Link
                href="/admin/sistema/crons"
                className="text-xs font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
              >
                Ver detalle →
              </Link>
            }
          />
          <OpCardBody>
            {crons.length === 0 ? (
              <p className="text-[13px] text-ln-op-mute">Sin runs registrados.</p>
            ) : (
              <ul className="space-y-3">
                {crons.map((c) => {
                  // Extract error summary from details JSONB when present.
                  // Route handlers write: { errors: [{ id: string, reason: string }] }
                  const errorList = Array.isArray((c.lastDetails as { errors?: unknown })?.errors)
                    ? (c.lastDetails as { errors: { id: string; reason: string }[] }).errors
                    : [];
                  const errorSummary =
                    errorList.length > 0 ? errorList.map((e) => e.reason).join("; ") : null;

                  return (
                    <li key={c.cronName} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-ln-op-ink-2">{c.cronName}</span>
                        <span className="tabular-nums text-[11px] flex items-center gap-1.5">
                          {c.lastRunAt
                            ? new Date(c.lastRunAt).toLocaleString("es-AR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                          {c.lastStatus && (
                            <OpPill tone={STATUS_TONE[c.lastStatus] ?? "neutral"}>
                              {STATUS_LABEL[c.lastStatus] ?? c.lastStatus}
                            </OpPill>
                          )}
                          {c.itemsProcessed != null && (
                            <span className="text-ln-op-mute">
                              {"·"} {c.itemsProcessed} items
                            </span>
                          )}
                        </span>
                      </div>
                      {/* Failure diagnostic: show error detail inline with a copy hint.
                          No automated re-trigger is provided because the cron routes
                          require `Authorization: Bearer <CRON_SECRET>` from the Vercel
                          infrastructure and there is no safe way to reconstruct that header
                          in a server action without exposing the secret value in the
                          browser. Diagnose via server logs / Vercel dashboard instead. */}
                      {c.lastStatus === "failed" && (
                        <details className="text-[11px] text-ln-op-danger space-y-0.5">
                          <summary className="cursor-pointer select-none font-medium">
                            Ver detalle del error
                          </summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-ln-op-danger-bg px-2 py-1 text-xs text-ln-op-danger">
                            {errorSummary ??
                              JSON.stringify(c.lastDetails, null, 2) ??
                              "Sin detalle disponible."}
                          </pre>
                          <p className="text-ln-op-mute">
                            Para reintentar: revisá los logs del servidor en el dashboard de Vercel
                            y ejecutá el cron manualmente desde ahí o vía curl con el CRON_SECRET
                            configurado.
                          </p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </OpCardBody>
        </OpCard>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Actividad por govt
        </p>
        {(() => {
          // Surface the most active operators first, then cap the render so a
          // long seed roster can't bury them.
          const sortedGovts = sortGovtActivityByActivity(govts);
          const visibleGovts = sortedGovts.slice(0, GOVT_ACTIVITY_LIMIT);
          const govtsTruncated = sortedGovts.length > GOVT_ACTIVITY_LIMIT;
          return govts.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">No hay govts activos.</p>
          ) : (
            <OpCard>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Actividad de operadores govt: localidades asignadas, decisiones y última acción
                  </caption>
                  <thead>
                    <tr className="border-b border-ln-op-line">
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                      >
                        Govt
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                      >
                        Localidades
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                      >
                        Decisiones 30d
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                      >
                        Última acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGovts.map((g) => (
                      <tr key={g.userId} className="border-t border-ln-op-line">
                        <td className="px-3 py-2 text-[13px] font-medium text-ln-op-ink">
                          {g.displayName}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-sm text-ln-op-ink-2">
                          {g.localitiesCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-sm text-ln-op-ink-2">
                          {g.decisions30d}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-ln-op-mute">
                          {g.lastActionAt
                            ? new Date(g.lastActionAt).toLocaleDateString("es-AR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {govtsTruncated && (
                <p className="px-3 py-2 text-[11px] text-ln-op-mute">
                  Mostrando los {GOVT_ACTIVITY_LIMIT} govts más activos de {sortedGovts.length}.
                </p>
              )}
            </OpCard>
          );
        })()}
      </section>

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-ln-op-mute">{label}</span>
      <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">{value}</span>
    </div>
  );
}
