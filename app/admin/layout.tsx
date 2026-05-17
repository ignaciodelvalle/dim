import Link from "next/link";

import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

// Gate the /admin/* segment. Govt and admin only — anyone else gets sent
// to /mis-mascotas. The layout also exposes a small top nav with the
// queue link + a way out.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const scopeLabel =
    profile.role === "admin"
      ? "Universal"
      : jurisdictions.length === 0
        ? "Sin localidades asignadas"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} localidades`;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <nav className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500">
              DIM Admin
            </p>
            <span className="text-xs text-neutral-400 dark:text-neutral-600">·</span>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">{profile.role}</span>
              <span className="text-neutral-400 dark:text-neutral-600"> · </span>
              {scopeLabel}
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
            {profile.role === "admin" && (
              <>
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
              </>
            )}
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
