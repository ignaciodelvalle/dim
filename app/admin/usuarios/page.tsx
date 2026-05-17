import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { searchUsers } from "@/lib/admin-search";

import { ProposeUserActions } from "./ProposeUserActions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Govt",
  admin: "Admin",
};

const ROLE_TONES: Record<string, string> = {
  owner: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  vet: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  govt: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  admin: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user, profile } = await requireAdminOrGovtOrRedirect();
  const results = await searchUsers(query);

  // Fire-and-forget pii_queried entry. Logging only happens when the user
  // typed a query — empty-query landings are not a PII read.
  if (query) {
    void logPiiQueryForAuthority(user.id, query, results.length, "users");
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Usuarios
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Buscá por nombre o DNI y proponé cambios de rol. Las búsquedas quedan registradas
            en el audit log.
          </p>
        </header>

        <form action="/admin/usuarios" method="get" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre o DNI"
            className="flex-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:opacity-90"
          >
            Buscar
          </button>
        </form>

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          {results.length === 0
            ? query
              ? "Sin resultados."
              : "Ingresá una consulta para buscar usuarios."
            : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
        </p>

        <ul className="space-y-2">
          {results.map((u) => (
            <li
              key={u.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {u.displayName}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600">
                    {u.id}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${ROLE_TONES[u.role] ?? ""}`}
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </div>

              <ProposeUserActions
                target={{ id: u.id, displayName: u.displayName, role: u.role }}
                actorRole={profile.role}
              />
            </li>
          ))}
        </ul>

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          <Link
            href="/admin"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ← Volver al dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
