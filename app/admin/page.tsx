import Link from "next/link";

import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { OpCallout, OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import {
  fetchDecisionsMetrics,
  fetchQueueHealth,
  fetchUserMetrics,
} from "@/lib/analytics/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { buildProjectionContext, decisionsDeltaPct } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { decisionsAuditDrillHref } from "@/lib/ui/audit-filters";

export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();

  // Admin context: global scope (no jurisdiction restriction), trailing 12m window.
  // Used for DashboardFreshnessFooter (lastIngestAt) — admin sees all pet_events.
  const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());

  const [users, queue, decisions] = await Promise.all([
    fetchUserMetrics(),
    fetchQueueHealth(),
    fetchDecisionsMetrics(),
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
          Operás con alcance universal: la cola de aprobaciones, la búsqueda de usuarios y la
          verificación de organizaciones son tuyas y abarcan todas las jurisdicciones. Estas colas
          se comparten con Gobierno, que las trabaja acotadas a su jurisdicción.
        </p>
      </header>

      {/* Live system metrics — shared operational strip (C26). Leads the landing
          so the North-Star numbers come before the account cards. */}
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
          }}
        />
      </section>

      {/* Govt / Admin account cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountCard
          label="Gobiernos"
          description="Listado de gobiernos activos. Crea cuentas, asigna localidades y revoca accesos."
          cta={{ href: "/admin/govts", label: "Ir a Gobiernos" }}
        />
        <AccountCard
          label="Administradores"
          description="Listado de administradores activos. Crea cuentas y administra el acceso universal."
          cta={{ href: "/admin/admins", label: "Ir a Administradores" }}
        />
      </section>

      {/* National analytics shortcut (Item 22) — admin sees all provinces */}
      <OpCard>
        <OpCardHead title="Analítica nacional" />
        <OpCardBody>
          <p className="text-[13px] text-ln-op-ink-2">
            Vista de analítica con cobertura de todas las provincias. Ranking entre regiones, mapa
            nacional y métricas agregadas del sistema.
          </p>
          <Link
            href="/gob/analytics"
            className="mt-2 inline-block text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Ir a Analítica nacional {"→"}
          </Link>
        </OpCardBody>
      </OpCard>

      {/* Callout: context switch to the govt portal (not "the queue lives there"). */}
      <OpCallout
        icon={<span>&#127970;</span>}
        title="¿Necesitás la vista de una jurisdicción?"
        body={
          <>
            Tu cola, usuarios y organizaciones acá abarcan todo el país. Para ver cómo trabaja una
            jurisdicción acotada, cambiá de contexto al portal de Gobierno.{" "}
            <Link
              href="/gob"
              className="font-semibold text-ln-op-azul underline underline-offset-4 hover:text-ln-op-azul-700"
            >
              Ver el portal de Gobierno {"→"}&nbsp;
            </Link>
          </>
        }
      />

      <DashboardFreshnessFooter ctx={adminCtx} />
    </div>
  );
}

function AccountCard({
  label,
  description,
  cta,
}: {
  label: string;
  description: string;
  cta: { href: string; label: string };
}) {
  return (
    <OpCard>
      <OpCardHead title={label} />
      <OpCardBody>
        <p className="text-[13px] text-ln-op-ink-2">{description}</p>
        <Link
          href={cta.href}
          className="mt-2 inline-block text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
        >
          {cta.label} {"→"}
        </Link>
      </OpCardBody>
    </OpCard>
  );
}
