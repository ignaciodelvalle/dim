import { and, eq, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { db, eventNotificationOutbox } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

// Gate the /admin/* segment. Admin-only — govt and everyone else gets sent
// to / (root). Uses the strict requireAdminOrRedirect guard which also rejects
// deactivated admins (Fase 5 invariant).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminOrRedirect();

  // Cheap breach count: pending rows past their SLA deadline.
  // Uses the outbox_sla_due_idx(sla_due_at, status) index — no seq scan.
  const [breachCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventNotificationOutbox)
    .where(
      and(
        eq(eventNotificationOutbox.status, "pending"),
        lt(eventNotificationOutbox.slaDueAt, new Date()),
      ),
    );
  const breachCount = breachCountRow?.count ?? 0;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <nav className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500">
              MiMAR Admin
            </p>
            <span className="text-xs text-neutral-400 dark:text-neutral-600">·</span>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">{profile.role}</span>
              <span className="text-neutral-400 dark:text-neutral-600"> · </span>
              Universal
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/admin"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/cola"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Cola
            </Link>
            <Link
              href="/admin/usuarios"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Usuarios
            </Link>
            <Link
              href="/admin/organizaciones"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Organizaciones
            </Link>
            <Link
              href="/admin/historial"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Historial
            </Link>
            <Link
              href="/admin/auditoria"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Auditoría
            </Link>
            <Link
              href="/admin/outbox"
              className="relative text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Outbox
              {breachCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {breachCount}
                </span>
              )}
            </Link>
            <Link
              href="/admin/sistema"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Sistema
            </Link>
            <Link
              href="/admin/govts"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Govts
            </Link>
            <Link
              href="/admin/admins"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Admins
            </Link>
            <Link
              href="/admin/servicios"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Servicios
            </Link>
            <Link
              href="/admin/observaciones"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Observaciones
            </Link>
            <Link
              href="/admin/moderacion"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Moderación
            </Link>
            <Link
              href="/admin/casos"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Casos
            </Link>
            <Link
              href="/admin/jurisdicciones"
              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Jurisdicciones
            </Link>
            <Link
              href="/gob"
              className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Ir a Gobierno →
            </Link>
            <Link
              href="/mis-mascotas"
              className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              ← Salir
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
