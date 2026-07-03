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
import { TARGETS, toneForTarget } from "@/lib/metrics";

export type AdminKpiStripData = {
  /** Total personal accounts (count). */
  totalPersonal: number;
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
export function AdminKpiStrip({ data }: { data: AdminKpiStripData }) {
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
      <OpKpi
        label="Cola pendiente"
        value={data.pendingTotal}
        tone={data.pendingTotal > 0 ? "warn" : "neutral"}
        sub={
          data.oldestPendingDaysAgo != null ? `Más vieja: ${data.oldestPendingDaysAgo}d` : undefined
        }
        href="/admin/cola"
        info={{
          definition: "Solicitudes de aprobación en estado pendiente en este momento.",
          caveat: "Incluye solicitudes de todas las jurisdicciones.",
        }}
      />
      <OpKpi
        label="Decisiones 7d"
        value={data.decisionsTotal7d}
        tone="ok"
        sub={`${data.approved7d} aprobadas · ${data.rejected7d} rechazadas`}
        href="/admin/auditoria"
        info={{
          definition: "Decisiones tomadas (aprobaciones + rechazos) en los últimos 7 días.",
          formula: "request_approved + request_rejected en audit_log (últimos 7d)",
        }}
        deltaV2={
          data.decisionsDelta !== null
            ? { value: data.decisionsDelta, period: "vs 7d anteriores (aprox.)" }
            : undefined
        }
      />
      {hasEno && eno && (
        <OpKpi
          label="SLA ENO"
          value={eno.onTimePct !== null ? `${eno.onTimePct}%` : "—"}
          tone={
            eno.onTimePct !== null ? toneForTarget(eno.onTimePct, TARGETS.ENO_SLA_PCT) : undefined
          }
          sub={
            eno.breachedOpen > 0
              ? `${eno.breachedOpen} en breach activo`
              : eno.total > 0
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
      )}
    </div>
  );
}
