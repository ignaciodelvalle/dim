// AdminKpiStrip — the shared operational KPI strip for the admin portal.
//
// WHY (critique C26): the admin landing (/admin) and /admin/sistema both render
// the same operational quartet — Usuarios personales / Cola pendiente /
// Decisiones 7d / SLA ENO — with the same tones, info tooltips and drill hrefs.
// They had drifted (label wording, SLA presence). This component is the single
// presentational source of truth so the tiles can't diverge again.
//
// PRESENTATIONAL ONLY — no data fetching. Each page keeps its own fetchers and
// passes the already-computed values in as props. SLA ENO is optional so the
// landing (which doesn't fetch ENO) can render the 3-tile variant.
//
// Tokens: relies entirely on OpKpi (design tokens `ln-op-*`). No raw colours.

import { OpKpi } from "@/components/ui/dashboard";
import { enoSlaTone } from "@/lib/metrics";
import { getKpiInfo } from "@/lib/metrics/kpi-catalog";

export type AdminKpiStripData = {
  /** Total personal accounts (count). */
  totalPersonal: number;
  /**
   * Active institutional accounts (count). Rendered in place of the pending-queue
   * tile when `omitPendingQueue` is set (the admin home, where the cockpit above
   * already owns the pending number). Omit when the pending tile is shown.
   */
  totalInstitutionalActive?: number;
  /** Queue: pending approvals right now. */
  pendingTotal: number;
  /** Queue: age in days of the oldest pending request (null when none pending). */
  oldestPendingDaysAgo: number | null;
  /** Decisions: count of approvals + rejections in the trailing 7d. */
  decisionsTotal7d: number;
  /** Decisions: approvals in the trailing 7d (for the sub line). */
  approved7d: number;
  /** Decisions: rejections in the trailing 7d (for the sub line). */
  rejected7d: number;
  /**
   * Decisions: percent change vs the approximated prior 7d window, or null when
   * there is no baseline. Compute with `decisionsDeltaPct` (lib/metrics).
   */
  decisionsDelta: number | null;
  /**
   * Drill href for the "Decisiones 7d" tile. Build with `decisionsAuditDrillHref`
   * (lib/ui/audit-filters) so the link carries the decision-action + last-7d
   * filters and lands on the reconcilable rows — not the all-time audit log.
   * Falls back to the unfiltered log when omitted.
   */
  decisionsDrillHref?: string;
  /**
   * ENO SLA on-time percentage (0–100), or null when there is no data.
   * Omit the whole `enoSla` prop to render the 3-tile variant (landing).
   */
  enoSla?: {
    onTimePct: number | null;
    breachedOpen: number;
    total: number;
  };
};

/**
 * Renders the shared operational KPI tiles inside a responsive grid.
 *
 * The grid auto-fits 3 tiles (no ENO) or 4 tiles (with ENO). The caller owns
 * the surrounding <section>/heading; this returns the tiles wrapped in a grid
 * so the layout stays consistent across both pages.
 */
export function AdminKpiStrip({
  data,
  omitPendingQueue = false,
}: {
  data: AdminKpiStripData;
  /**
   * Hide the "Cola pendiente" tile and render "Instituciones activas" in its
   * place. Used by the admin home, where the QueueHealthCockpit above already
   * shows the pending count (per-type) — the two must not duplicate it (PO ronda
   * 4 + Cowork B1). /admin/sistema keeps the pending tile (no duplication there).
   */
  omitPendingQueue?: boolean;
}) {
  const hasEno = data.enoSla !== undefined;
  const eno = data.enoSla;

  return (
    <div
      className={[
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        hasEno ? "lg:grid-cols-4" : "sm:grid-cols-3",
      ].join(" ")}
    >
      <OpKpi
        label="Usuarios personales"
        value={data.totalPersonal}
        href="/admin/usuarios"
        info={{
          definition: "Total de cuentas personales activas en la plataforma.",
          formula: "count(*) where account_type = 'personal'",
        }}
      />
      {omitPendingQueue ? (
        // The cockpit above owns the pending-approvals number (broken out per
        // type), so the home strip promotes a non-duplicated metric here instead.
        <OpKpi
          label="Instituciones activas"
          value={data.totalInstitutionalActive ?? 0}
          href="/admin/organizaciones"
          info={{
            definition: "Cuentas institucionales activas (no desactivadas).",
            formula: "count(*) where account_type = 'institutional' and deactivated_at is null",
          }}
        />
      ) : (
        <OpKpi
          label="Cola pendiente"
          value={data.pendingTotal}
          tone={data.pendingTotal > 0 ? "warn" : "neutral"}
          sub={
            data.oldestPendingDaysAgo != null
              ? `Más vieja: ${data.oldestPendingDaysAgo}d`
              : undefined
          }
          href="/admin/cola"
          info={{
            definition: "Solicitudes de aprobación en estado pendiente en este momento.",
            caveat: "Incluye solicitudes de todas las jurisdicciones.",
          }}
        />
      )}
      {(() => {
        // Zero-activity is not a crash (Cowork B2): a demo week with no
        // decisions previously rendered "0" in ok-green with a red "−100%"
        // deltaV2 (↓ arrow) — reading as "something broke". When there are no
        // decisions this week, render a neutral "Sin decisiones esta semana"
        // and suppress the delta chip entirely (a −100% vs a prior week is not
        // an alarm on an empty demo).
        const noDecisions = data.decisionsTotal7d === 0;
        return (
          <OpKpi
            label="Decisiones 7d"
            value={data.decisionsTotal7d}
            tone={noDecisions ? "neutral" : "ok"}
            sub={
              noDecisions
                ? "Sin decisiones esta semana"
                : `${data.approved7d} aprobadas · ${data.rejected7d} rechazadas`
            }
            href={data.decisionsDrillHref ?? "/admin/auditoria"}
            info={{
              definition: "Decisiones tomadas (aprobaciones + rechazos) en los últimos 7 días.",
              formula: "request_approved + request_rejected en audit_log (últimos 7d)",
            }}
            deltaV2={
              !noDecisions && data.decisionsDelta !== null
                ? { value: data.decisionsDelta, period: "vs 7d anteriores (aprox.)" }
                : undefined
            }
          />
        );
      })()}
      {hasEno &&
        eno &&
        (() => {
          // Headline honesty (Cowork A3/C1). `onTimePct` measures ONLY delivered
          // rows (onTime / delivered), so it reads 100% while notifications sit
          // pending PAST their sla_due_at — the tile showed "100%" in green next
          // to "12 en breach activo", two numbers that contradict. The two
          // windows don't share a denominator (onTimePct is period-scoped over
          // delivered rows; breachedOpen is a live "now" count of pending+overdue
          // rows), so folding them into one % would be dishonest. Instead, when
          // there is an active breach we LEAD with the breach count (the live,
          // actionable number) and demote the historical % to the sub-line, which
          // states exactly what it measures ("de las entregadas"). Tone comes from
          // enoSlaTone, which already degrades to warn/danger on any open breach.
          const hasBreach = eno.breachedOpen > 0;
          const pctLabel = eno.onTimePct !== null ? `${eno.onTimePct}%` : "—";
          return (
            <OpKpi
              label="SLA ENO"
              value={hasBreach ? `${eno.breachedOpen} en incumplimiento` : pctLabel}
              tone={enoSlaTone(eno)}
              sub={
                hasBreach
                  ? eno.onTimePct !== null
                    ? `Cumplimiento histórico ${pctLabel} de las entregadas · ${eno.breachedOpen} vencidas AHORA`
                    : `Sin entregas en el período · ${eno.breachedOpen} vencidas AHORA`
                  : eno.total > 0
                    ? eno.onTimePct !== null
                      ? `${pctLabel} de las entregadas a tiempo · sin vencidas`
                      : "Sin entregas en el período"
                    : "Sin notificaciones en el período"
              }
              href="/admin/outbox"
              info={getKpiInfo("eno_sla_compliance")}
            />
          );
        })()}
    </div>
  );
}
