import Link from "next/link";

import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { AdminSiteMap } from "@/components/admin/AdminSiteMap";
import { QueueHealthCockpit } from "@/components/admin/QueueHealthCockpit";
import { NovedadesCard } from "@/components/operator/NovedadesCard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchDecisionsMetrics,
  fetchQueueCockpit,
  fetchUserMetrics,
} from "@/lib/analytics/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext, decisionsDeltaPct } from "@/lib/metrics";
import { fetchNovedadesFeed } from "@/lib/metrics/novedades-feed";
import { windows } from "@/lib/metrics/period";
import { decisionsAuditDrillHref } from "@/lib/ui/audit-filters";

export default async function AdminDashboardPage() {
  const { user } = await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // Used for DashboardFreshnessFooter (lastIngestAt) — admin sees all pet_events.
  // The Novedades feed reuses it for scope (admin → universal); its window is the
  // per-user watermark, not the ctx period.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

  const [users, cockpit, decisions, novedades] = await Promise.all([
    fetchUserMetrics(),
    // Epic D: every operational queue counted (approvals broken out per type)
    // for the cockpit — replaces the old lumped fetchQueueHealth number.
    fetchQueueCockpit(),
    fetchDecisionsMetrics(),
    // Session-start orientation feed (universal scope for admin).
    fetchNovedadesFeed(adminCtx, user.id),
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
          MiMAR Plataforma {"·"} ADMIN {"·"} Universal
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Panel de administración</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Operás con alcance universal sobre todas las jurisdicciones. Abajo: el estado de cada cola
          operativa, las métricas del sistema y el mapa completo del portal. Estas colas se
          comparten con Gobierno, que las trabaja acotadas a su jurisdicción.
        </p>
      </header>

      {/* (1) Queue-health cockpit — every operational queue as a compact tile
          with its live count and a jump-off. Approvals broken out per type.
          Leads the page: it is what an admin comes here to triage. */}
      <QueueHealthCockpit cockpit={cockpit} />

      {/* (2) System metrics — the shared operational KPI strip (C26). Pending
          approvals + oldest come from the same cockpit query so this strip and
          the cockpit above can't disagree. Links to the richer /admin/sistema. */}
      <section aria-label="Métricas del sistema" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Métricas del sistema
          </h2>
          <Link
            href="/admin/sistema"
            className="text-sm font-semibold text-ln-op-azul no-underline hover:underline"
          >
            Ver Sistema completo {"->"}
          </Link>
        </div>
        <AdminKpiStrip
          data={{
            totalPersonal: users.totalPersonal,
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
          one-line purpose. Folds in the old account cards (Gobiernos /
          Administradores) and analytics shortcuts as first-class destinations. */}
      <AdminSiteMap />

      {/* (4) Novedades — session-start orientation feed, DEMOTED below the
          cockpit and collapsible so it no longer competes with the queues.
          Starts collapsed on the admin home; "Marcar como visto" is intact. */}
      <NovedadesCard feed={novedades} collapsible defaultCollapsed />

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}
