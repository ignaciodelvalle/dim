import Link from "next/link";

import { requireAdminOrRedirect } from "@/lib/auth-guards";

// Gate the /admin/* segment. Admin-only — govt and everyone else gets sent
// to / (root). Uses the strict requireAdminOrRedirect guard which also rejects
// deactivated admins (Fase 5 invariant).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminOrRedirect();

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
