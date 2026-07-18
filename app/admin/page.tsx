import Link from "next/link";

import { Icon } from "@/components/Icon";
import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { AdminSiteMap } from "@/components/admin/AdminSiteMap";
import { CronsDownBanner } from "@/components/admin/CronsDownBanner";
import { QueueHealthCockpit } from "@/components/admin/QueueHealthCockpit";
import { NovedadesCard } from "@/components/operator/NovedadesCard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchDecisionsMetrics,
  fetchFailedCronNames,
  fetchQueueCockpit,
  fetchUserMetrics,
} from "@/lib/analytics/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext, decisionsDeltaPct } from "@/lib/metrics";
import { fetchNovedadesGroupedFeed } from "@/lib/metrics/novedades-feed";
import { windows } from "@/lib/metrics/period";
import { decisionsAuditDrillHref } from "@/lib/ui/audit-filters";

export default async function AdminDashboardPage() {
  const { user } = await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // Used for DashboardFreshnessFooter (lastIngestAt) — admin sees all pet_events.
  // The Novedades feed reuses it for scope (admin → universal); its window is the
  // per-user watermark, not the ctx period.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

  const [users, cockpit, decisions, novedades, failedCronNames] = await Promise.all([
    fetchUserMetrics(),
    // Epic D: every operational queue counted (approvals broken out per type)
    // for the cockpit — replaces the old lumped fetchQueueHealth number.
    fetchQueueCockpit(),
    fetchDecisionsMetrics(),
    // Session-start orientation feed (universal scope for admin), grouped by
    // type + locality with a distinct-subject count (Cowork M2).
    fetchNovedadesGroupedFeed(adminCtx, user.id),
    // Crons-down banner (operator-trust T3): any background job whose latest run
    // failed. One DISTINCT ON query — cheap enough for the dashboard hot path.
    fetchFailedCronNames(),
  ]);

  // deltaV2 for decisions: compare 7d vs the approximated prior 7d window.
  // Shared helper (decisionsDeltaPct) is the single source of truth — same
  // approximation as /admin/sistema, so the two strips can't drift (C28).
  const total7d = decisions.approved7d + decisions.rejected7d;
  const decisionsDelta = decisionsDeltaPct(decisions);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          miMAR Plataforma {"·"} ADMIN {"·"} Universal
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Panel de administración
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Alcance universal sobre todas las jurisdicciones. Estas colas se comparten con Gobierno,
          que las trabaja acotadas a la suya.
        </p>
      </header>

      {/* Crons-down banner (operator-trust T3) — leads the page when any
          background job's latest run failed, so the operator sees the impact
          before triaging queues. Renders nothing when the fleet is healthy. */}
      <CronsDownBanner failedCronNames={failedCronNames} />

      {/* (1) Queue-health cockpit — every operational queue as a compact tile
          with its live count and a jump-off. Approvals broken out per type.
          Leads the page: it is what an admin comes here to triage. */}
      <QueueHealthCockpit cockpit={cockpit} />

      {/* (2) System metrics — the shared operational KPI strip (C26). The
          pending-queue tile is OMITTED here: the QueueHealthCockpit above already
          owns that number (per type), so showing "Cola pendiente" again just
          duplicated it (PO ronda 4 + Cowork B1). The strip promotes
          "Instituciones activas" in its place. Links to the richer /admin/sistema. */}
      <section aria-label="Métricas del sistema" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Métricas del sistema
          </h2>
          <Link
            href="/admin/sistema"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ln-op-azul no-underline hover:underline"
          >
            Ver Sistema completo
            <Icon name="chevron-right" size="sm" decorative />
          </Link>
        </div>
        <AdminKpiStrip
          omitPendingQueue
          data={{
            totalPersonal: users.totalPersonal,
            totalInstitutionalActive: users.totalInstitutionalActive,
            pendingTotal: cockpit.approvals.pendingTotal,
            oldestPendingDaysAgo: cockpit.approvals.oldestPendingDaysAgo,
            decisionsTotal7d: total7d,
            approved7d: decisions.approved7d,
            rejected7d: decisions.rejected7d,
            decisionsDelta,
            decisionsDrillHref: decisionsAuditDrillHref(),
          }}
        />
      </section>

      {/* (3) Site map — every admin route grouped by nav section, each with a
          one-line "what you DO here" + a live pending badge where the cockpit
          above already fetched that queue's count (dispatch board, Cowork M1 +
          PO). No new queries: the counts are the SAME cockpit numbers. */}
      <AdminSiteMap
        counts={{
          "/admin/cola": cockpit.approvals.pendingTotal,
          "/admin/moderacion": cockpit.moderationPending,
          "/admin/alertas": cockpit.alertsOpen,
          "/admin/outbox": cockpit.outboxBreaches,
          "/admin/casos": cockpit.casesOpen,
          "/admin/observaciones": cockpit.rabiesInProgress,
        }}
      />

      {/* (4) Novedades — session-start orientation feed, DEMOTED below the
          cockpit and collapsible so it no longer competes with the queues.
          Starts collapsed on the admin home; "Marcar como visto" is intact. */}
      <NovedadesCard feed={novedades} collapsible defaultCollapsed />

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
