import Link from "next/link";

import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { CronsDownBanner } from "@/components/admin/CronsDownBanner";
import { PetStatusDriftCard } from "@/components/admin/PetStatusDriftCard";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchCronRuns,
  fetchDecisionsMetrics,
  fetchGovtActivity,
  fetchPetStatusDrift,
  fetchQueueHealth,
  fetchUserMetrics,
  sortGovtActivityByActivity,
} from "@/lib/analytics/admin-metrics";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { cronDisplayLabel } from "@/lib/infra/cron-registry";
import { buildProjectionContext, decisionsDeltaPct } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { decisionsAuditDrillHref } from "@/lib/ui/audit-filters";
import { AR_TIME_ZONE, formatDateShort } from "@/lib/utils/format";

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

// Operator-facing plain-es-AR explanation of each background job (Cowork M6).
// `does` = what the job does for the program; `whenFails` = what stops working
// when it is in FALLO. The dev-only detail (logs / CRON_SECRET) is kept in a
// collapsed "Detalle técnico" block — an operator needs the impact and the
// action ("avisale al equipo técnico"), not the curl command.
const CRON_JOB_HELP: Record<string, { does: string; whenFails: string }> = {
  vaccine_due: {
    does: "Envía los recordatorios de vacunas a los dueños.",
    whenFails: "los recordatorios de vacunas no se están enviando.",
  },
  post_adoption_checkin: {
    does: "Envía los seguimientos post-adopción a las familias adoptantes.",
    whenFails: "los seguimientos post-adopción no se están enviando.",
  },
  expire_foster_proposals: {
    does: "Cierra las propuestas de tránsito que vencieron sin respuesta.",
    whenFails: "las propuestas de tránsito vencidas quedan abiertas.",
  },
  auto_expire_approvals: {
    does: "Da de baja las solicitudes de aprobación que caducaron.",
    whenFails: "solicitudes ya vencidas siguen figurando como pendientes en la cola.",
  },
  close_rabies_observations: {
    does: "Cierra las observaciones antirrábicas de 10 días ya cumplidas.",
    whenFails: "las observaciones antirrábicas cumplidas no se cierran solas.",
  },
  close_stale_lost_episodes: {
    does: "Cierra los casos de mascota perdida que quedaron inactivos.",
    whenFails: "los casos de pérdida inactivos siguen abiertos.",
  },
  close_followup_expired_adoptions: {
    does: "Cierra los seguimientos de adopción vencidos.",
    whenFails: "los seguimientos de adopción vencidos quedan abiertos.",
  },
  escalate_stale_welfare_cases: {
    does: "Escala las denuncias de maltrato que no tuvieron avance.",
    whenFails: "las denuncias estancadas no se escalan al siguiente nivel.",
  },
  escalate_stale_disputes: {
    does: "Escala las disputas de custodia que no tuvieron avance.",
    whenFails: "las disputas estancadas no se escalan.",
  },
  expire_cross_org_transfers: {
    does: "Vence las transferencias entre organizaciones que nadie aceptó.",
    whenFails: "las transferencias entre organizaciones sin aceptar no vencen.",
  },
  drain_outbox: {
    does: "Entrega las notificaciones pendientes de la bandeja de salida.",
    whenFails: "las notificaciones pendientes (incluidas las ENO) no se entregan.",
  },
  process_eno_queue: {
    does: "Notifica los eventos ENO (enfermedades de notificación obligatoria) a la autoridad sanitaria.",
    whenFails: "las notificaciones ENO a la autoridad sanitaria no se están enviando.",
  },
  expire_pet_transfers: {
    does: "Vence las transferencias de mascota que nadie aceptó.",
    whenFails: "las transferencias de mascota sin aceptar no vencen.",
  },
  expire_decomiso_handoffs: {
    does: "Vence las entregas de decomiso que no se confirmaron.",
    whenFails: "las entregas de decomiso sin confirmar no vencen.",
  },
  materialize_slots: {
    does: "Genera los turnos disponibles de las agendas.",
    whenFails: "no se generan turnos nuevos en las agendas.",
  },
  business_rules_reeval: {
    does: "Reevalúa las reglas de negocio por jurisdicción.",
    whenFails: "las reglas no se reevalúan con los datos nuevos.",
  },
  data_lifecycle: {
    does: "Aplica las políticas de retención y borrado de datos.",
    whenFails: "las políticas de retención de datos no se aplican.",
  },
  purge_scan_events: {
    does: "Depura los eventos de escaneo antiguos.",
    whenFails: "los eventos de escaneo antiguos no se depuran.",
  },
  evaluate_alerts: {
    does: "Evalúa las reglas de vigilancia y dispara las alertas.",
    whenFails: "las alertas de vigilancia no se están disparando.",
  },
  reconcile_pet_status: {
    does: "Reconcilia el estado cacheado de las mascotas con el libro de eventos.",
    whenFails: "el estado de las mascotas puede quedar desactualizado.",
  },
  cron_health: {
    does: "Controla que el resto de los procesos automáticos hayan corrido.",
    whenFails: "no se controla la salud de los demás procesos automáticos.",
  },
};

export default async function AdminSistemaPage() {
  await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // Used for DashboardFreshnessFooter (lastIngestAt) — admin sees all pet_events.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

  const [users, queue, decisions, govts, crons, enoSla, drift] = await Promise.all([
    fetchUserMetrics(),
    fetchQueueHealth(),
    fetchDecisionsMetrics(),
    fetchGovtActivity(),
    fetchCronRuns(),
    fetchEnoSla(adminCtx),
    fetchPetStatusDrift(),
  ]);

  // deltaV2 for decisions 7d — compare vs prior 7d approximated from the 30d
  // window. Shared helper (decisionsDeltaPct) keeps this in lockstep with the
  // admin landing strip (C28).
  const total7d = decisions.approved7d + decisions.rejected7d;
  const decisionsDelta = decisionsDeltaPct(decisions);

  // Crons-down banner (operator-trust T3) — derived from the crons already
  // fetched for the Crons card (no extra query). FALLO = the latest run failed.
  const failedCronNames = crons.filter((c) => c.lastStatus === "failed").map((c) => c.cronName);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Sistema
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Salud del sistema</h1>
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

      {/* Crons-down banner (operator-trust T3) — mirrors the Crons card below
          but leads the page so the operator sees the impact first. No
          "Ver detalle" link: this IS the detail surface. */}
      <CronsDownBanner failedCronNames={failedCronNames} showSistemaLink={false} />

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
            decisionsDrillHref: decisionsAuditDrillHref(),
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
              label="Nuevos personal · 24h / 7d / 30d"
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
                        {/* M2 (cowork demo): show the es-AR label; the raw
                            snake_case key rides `title` for support/debugging. */}
                        <span className="text-sm text-ln-op-ink-2" title={c.cronName}>
                          {cronDisplayLabel(c.cronName)}
                        </span>
                        <span className="tabular-nums text-[11px] flex items-center gap-1.5">
                          {c.lastRunAt
                            ? new Date(c.lastRunAt).toLocaleString("es-AR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: AR_TIME_ZONE,
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
                      {/* Failure copy is operator-first (Cowork M6): a plain-es-AR
                          impact line + the action ("avisale al equipo técnico"),
                          with the dev detail (logs / CRON_SECRET) folded into a
                          collapsed "Detalle técnico" block. No automated re-trigger
                          is offered: the cron routes require `Authorization: Bearer
                          <CRON_SECRET>` from the Vercel infrastructure and there is
                          no safe way to reconstruct that header in a server action
                          without exposing the secret in the browser. */}
                      {c.lastStatus === "failed" &&
                        (() => {
                          const help = CRON_JOB_HELP[c.cronName];
                          return (
                            <div className="space-y-1.5 text-[11px]">
                              {help && (
                                <>
                                  <p className="text-ln-op-danger">
                                    <span className="font-semibold">FALLO:</span> {help.whenFails}{" "}
                                    Avisale al equipo técnico.
                                  </p>
                                  <p className="text-ln-op-mute">
                                    Qué hace este proceso: {help.does}
                                  </p>
                                </>
                              )}
                              <details className="space-y-0.5 text-ln-op-mute">
                                <summary className="cursor-pointer select-none font-medium">
                                  Detalle técnico
                                </summary>
                                <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-ln-op-danger-bg px-2 py-1 text-xs text-ln-op-danger">
                                  {errorSummary ??
                                    JSON.stringify(c.lastDetails, null, 2) ??
                                    "Sin detalle disponible."}
                                </pre>
                                <p className="text-ln-op-mute">
                                  Para el equipo técnico: revisá los logs en el dashboard de Vercel
                                  y reejecutá el cron desde ahí (o vía curl con el CRON_SECRET
                                  configurado).
                                </p>
                              </details>
                            </div>
                          );
                        })()}
                    </li>
                  );
                })}
              </ul>
            )}
          </OpCardBody>
        </OpCard>

        {/* Deriva de caché pets.status ↔ event log — projection-cron audit
            2026-07-03 B3. Detección solamente; la reparación es manual. */}
        <PetStatusDriftCard data={drift} />
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Actividad por gobierno
        </p>
        {(() => {
          // Surface the most active operators first, then cap the render so a
          // long seed roster can't bury them.
          const sortedGovts = sortGovtActivityByActivity(govts);
          const visibleGovts = sortedGovts.slice(0, GOVT_ACTIVITY_LIMIT);
          const govtsTruncated = sortedGovts.length > GOVT_ACTIVITY_LIMIT;
          return govts.length === 0 ? (
            <p className="text-[var(--text-md)] text-ln-op-mute">No hay gobiernos activos.</p>
          ) : (
            <OpCard>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Actividad de operadores de gobierno: localidades asignadas, decisiones y última
                    acción
                  </caption>
                  <thead>
                    <tr className="border-b border-ln-op-line">
                      <th
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute"
                      >
                        Gobierno
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
                        <td className="px-3 py-2 text-[var(--text-md)] font-medium text-ln-op-ink">
                          {g.displayName}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-sm text-ln-op-ink-2">
                          {g.localitiesCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-sm text-ln-op-ink-2">
                          {g.decisions30d}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-sm)] text-ln-op-mute">
                          {g.lastActionAt ? formatDateShort(g.lastActionAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {govtsTruncated && (
                <p className="px-3 py-2 text-[var(--text-sm)] text-ln-op-mute">
                  Mostrando los {GOVT_ACTIVITY_LIMIT} gobiernos más activos de {sortedGovts.length}.
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
