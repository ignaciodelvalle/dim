import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpKpi, OpPill } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchCronRuns,
  fetchDecisionsMetrics,
  fetchGovtActivity,
  fetchQueueHealth,
  fetchUserMetrics,
} from "@/lib/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { buildProjectionContext, computeDeltaPct, toneForTarget } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { fetchEnoSla } from "@/lib/surveillance-metrics";

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

  // deltaV2 for decisions 7d — compare vs prior 7d approximated from the 30d window.
  const total7d = decisions.approved7d + decisions.rejected7d;
  const total30d = decisions.approved30d + decisions.rejected30d;
  const prior23d = total30d - total7d;
  const decisionsDelta =
    prior23d > 0 ? computeDeltaPct(total7d, Math.round((prior23d / 23) * 7)) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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
            className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Ver analítica nacional {"→"}
          </Link>
          {/* Paquete H — executive summary cross-link */}
          <Link
            href="/admin/programa"
            className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Resumen ejecutivo {"→"}
          </Link>
        </div>
      </header>

      {/* Top KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <OpKpi
          label="Usuarios personales"
          value={users.totalPersonal}
          href="/admin/usuarios"
          info={{
            definition: "Total de cuentas personales activas en la plataforma.",
            formula: "count(*) where account_type = 'personal'",
          }}
        />
        <OpKpi
          label="Cola pendiente"
          value={queue.pendingTotal}
          tone={queue.pendingTotal > 0 ? "warn" : "neutral"}
          sub={
            queue.oldestPendingDaysAgo != null
              ? `Más vieja: ${queue.oldestPendingDaysAgo}d`
              : undefined
          }
          href="/admin/cola"
          info={{
            definition: "Solicitudes de aprobación en estado pendiente en este momento.",
            caveat: "Incluye solicitudes de todas las jurisdicciones.",
          }}
        />
        <OpKpi
          label="Decisiones 7d"
          value={total7d}
          tone="ok"
          sub={`${decisions.approved7d} aprobadas · ${decisions.rejected7d} rechazadas`}
          href="/admin/auditoria"
          info={{
            definition: "Decisiones tomadas (aprobaciones + rechazos) en los últimos 7 días.",
            formula: "request_approved + request_rejected en audit_log (últimos 7d)",
          }}
          deltaV2={
            decisionsDelta !== null
              ? { value: decisionsDelta, period: "vs 7d anteriores (aprox.)" }
              : undefined
          }
        />
        {/* Paquete H — ENO SLA (A7): measures our notification pipeline health. */}
        <OpKpi
          label="SLA ENO"
          value={enoSla.onTimePct !== null ? `${enoSla.onTimePct}%` : "—"}
          tone={enoSla.onTimePct !== null ? toneForTarget(enoSla.onTimePct, 95) : undefined}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en breach activo`
              : enoSla.total > 0
                ? "sin breach activo"
                : "sin notificaciones en el período"
          }
          href="/admin/outbox"
          info={{
            definition:
              "% de notificaciones ENO (target_kind='eno_authority') entregadas dentro del SLA (A7). breachedOpen: pendientes con sla_due_at vencido en este momento.",
            formula: "onTime / delivered * 100 — período seleccionado",
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
          <OpCardHead title="Crons" />
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
                        <span className="text-[12px] text-ln-op-ink-2">{c.cronName}</span>
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
                          <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-ln-op-danger-bg px-2 py-1 text-[10px] text-ln-op-danger">
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
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Actividad por govt
        </p>
        {govts.length === 0 ? (
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
                      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                    >
                      Govt
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                    >
                      Localidades
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                    >
                      Decisiones 30d
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                    >
                      Última acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {govts.map((g) => (
                    <tr key={g.userId} className="border-t border-ln-op-line">
                      <td className="px-3 py-2 text-[13px] font-medium text-ln-op-ink">
                        {g.displayName}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[12px] text-ln-op-ink-2">
                        {g.localitiesCount}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[12px] text-ln-op-ink-2">
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
          </OpCard>
        )}
      </section>

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-ln-op-mute">{label}</span>
      <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">{value}</span>
    </div>
  );
}
