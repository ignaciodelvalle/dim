import Link from "next/link";

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
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Panel de administración
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Gestión de cuentas institucionales: govts y admins del sistema.
          </p>
        </header>

        {/* Live system metrics — spec AC3 (audit-internal-roles-pages PR5) */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted mb-3">
            Estado del sistema
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricTile label="Usuarios personales" value={users.totalPersonal} />
            <MetricTile
              label="Solicitudes pendientes"
              value={queue.pendingTotal}
              note={
                queue.oldestPendingDaysAgo != null
                  ? `Más vieja: ${queue.oldestPendingDaysAgo}d`
                  : undefined
              }
            />
            <MetricTile
              label="Decisiones (últimos 7d)"
              value={decisions.approved7d + decisions.rejected7d}
              note={`${decisions.approved7d} aprobadas · ${decisions.rejected7d} rechazadas`}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            label="Govts"
            description="Listado de govts activos. Creá nuevas cuentas, asigná localidades y revocá accesos."
            cta={{ href: "/admin/govts", label: "Ir a Govts" }}
          />
          <Card
            label="Admins"
            description="Listado de admins activos. Creá nuevas cuentas y administrá el acceso universal."
            cta={{ href: "/admin/admins", label: "Ir a Admins" }}
          />
        </section>

        <section className="rounded-lg border border-gob-border  p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gob-text ">
            Cola de solicitudes y búsqueda de usuarios
          </h2>
          <p className="text-sm text-gob-text-gray ">
            Las operaciones de aprobación, rechazo, propuestas de rol y revocaciones viven en el
            panel de gobierno.
          </p>
          <Link
            href="/gob"
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
          >
            Ir a Gobierno (cola, usuarios, organizaciones) →
          </Link>
        </section>
      </div>
    </main>
  );
}

function MetricTile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-gob-border bg-gob-surface p-4 space-y-1">
      <p className="text-xs uppercase tracking-wider text-gob-text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-gob-text">{value}</p>
      {note && <p className="text-xs text-gob-text-gray">{note}</p>}
    </div>
  );
}

function Card({
  label,
  description,
  cta,
}: {
  label: string;
  description: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-gob-border  p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-gob-text-muted ">{label}</p>
      <p className="text-sm text-gob-text-gray ">{description}</p>
      <Link
        href={cta.href}
        className="inline-block text-xs text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
      >
        {cta.label} →
      </Link>
    </div>
  );
}
