import Link from "next/link";

import { OpCallout, OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { fetchDecisionsMetrics, fetchQueueHealth, fetchUserMetrics } from "@/lib/admin-metrics";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();

  const [users, queue, decisions] = await Promise.all([
    fetchUserMetrics(),
    fetchQueueHealth(),
    fetchDecisionsMetrics(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Plataforma {"·"} ADMIN {"·"} Universal
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Panel de administración</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Gestión de cuentas institucionales: govts y admins del sistema. Las aprobaciones de cola,
          búsqueda de usuarios y verificación de orgs viven en el portal de Gobierno.
        </p>
      </header>

      {/* Live system metrics — spec AC3 (audit-internal-roles-pages PR5) */}
      <section aria-label="Estado del sistema" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <OpKpi label="Usuarios personales" value={users.totalPersonal} />
        <OpKpi
          label="Solicitudes pendientes"
          value={queue.pendingTotal}
          tone={queue.pendingTotal > 0 ? "warn" : "neutral"}
          sub={
            queue.oldestPendingDaysAgo != null
              ? `Más vieja: ${queue.oldestPendingDaysAgo}d`
              : undefined
          }
        />
        <OpKpi
          label="Decisiones (ultimos 7d)"
          value={decisions.approved7d + decisions.rejected7d}
          tone="ok"
          sub={`${decisions.approved7d} aprobadas · ${decisions.rejected7d} rechazadas`}
        />
      </section>

      {/* Govt / Admin account cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountCard
          label="Gobiernos"
          description="Listado de govts activos. Crea cuentas, asigna localidades y revoca accesos."
          cta={{ href: "/admin/govts", label: "Ir a Gobiernos" }}
        />
        <AccountCard
          label="Admins"
          description="Listado de admins activos. Crea cuentas y administra el acceso universal."
          cta={{ href: "/admin/admins", label: "Ir a Admins" }}
        />
      </section>

      {/* Callout: link to govt portal */}
      <OpCallout
        icon={<span>&#127970;</span>}
        title="Cola de solicitudes y búsqueda de usuarios"
        body={
          <>
            Las aprobaciones, rechazos, propuestas de rol y revocaciones viven en el panel de
            Gobierno.{" "}
            <Link
              href="/gob"
              className="font-semibold text-ln-op-azul underline underline-offset-4 hover:text-ln-op-azul-700"
            >
              Ir a Gobierno {"→"}&nbsp;
            </Link>
          </>
        }
      />
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
          className="mt-2 inline-block text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
        >
          {cta.label} {"→"}
        </Link>
      </OpCardBody>
    </OpCard>
  );
}
