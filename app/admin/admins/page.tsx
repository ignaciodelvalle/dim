import Link from "next/link";

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Scaling note: auth.admin.listUsers() perPage=200. At 200+ admins this
// needs pagination or a different strategy. See ADR-8.

export default async function AdminsPage() {
  const { user } = await requireAdminOrRedirect();

  const supabase = createAdminClient();

  const adminRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      deactivatedAt: profiles.deactivatedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.role, "admin"));

  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const emailMap = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  const admins = adminRows.map((a) => ({
    ...a,
    email: emailMap.get(a.id) ?? "",
    isSelf: a.id === user.id,
  }));

  const activeAdmins = admins.filter((a) => a.deactivatedAt === null);
  const deactivatedAdmins = admins.filter((a) => a.deactivatedAt !== null);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Administradores
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Operadores institucionales con acceso de administrador.
            </p>
          </div>
          <Link
            href="/admin/admins/new"
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 rounded-md hover:opacity-90 shrink-0"
          >
            + Crear admin
          </Link>
        </header>

        {activeAdmins.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              No hay administradores activos.
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1">
              Para el bootstrap inicial, usa Supabase Studio para asignar el primer admin
              manualmente.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {activeAdmins.map((a) => (
              <AdminRow key={a.id} admin={a} />
            ))}
          </ul>
        )}

        {deactivatedAdmins.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 select-none">
              Desactivados ({deactivatedAdmins.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {deactivatedAdmins.map((a) => (
                <AdminRow key={a.id} admin={a} />
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          <Link
            href="/admin"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            &larr; Volver al dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}

type AdminRowProps = {
  admin: {
    id: string;
    displayName: string;
    email: string;
    isSelf: boolean;
    deactivatedAt: Date | null;
  };
};

function AdminRow({ admin }: AdminRowProps) {
  const isActive = admin.deactivatedAt === null;

  return (
    <li className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5 flex items-center gap-2">
        <div>
          <Link
            href={`/admin/admins/${admin.id}`}
            className="text-sm font-medium text-neutral-900 dark:text-neutral-50 hover:underline underline-offset-4"
          >
            {admin.displayName}
          </Link>
          {admin.isSelf && (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded">
              Vos
            </span>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-500">{admin.email}</p>
        </div>
      </div>

      <span
        className={`px-2 py-0.5 rounded uppercase tracking-wider text-[10px] shrink-0 ${
          isActive
            ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
        }`}
      >
        {isActive ? "Activo" : "Desactivado"}
      </span>
    </li>
  );
}
