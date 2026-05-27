import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { searchUsers } from "@/lib/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

import { ProposeUserActions } from "./ProposeUserActions";
import { RevokeUserActions } from "./RevokeUserActions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Govt",
  admin: "Admin",
};

const ROLE_TONES: Record<string, string> = {
  owner: "bg-gob-surface-alt text-gob-text-gray",
  vet: "bg-gob-success/10 text-gob-success",
  govt: "bg-sky-100 text-sky-800",
  admin: "bg-gob-warning/20 text-gob-warning-text",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
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
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">Usuarios</h1>
          <p className="text-sm text-gob-text-gray">
            Buscá por nombre o DNI y proponé cambios de rol. Las búsquedas quedan registradas en el
            audit log.
          </p>
        </header>

        <form action="/gob/usuarios" method="get" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre o DNI"
            className="flex-1 text-sm rounded-md border border-gob-border bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gob-primary"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-gob-primary text-white hover:opacity-90"
          >
            Buscar
          </button>
        </form>

        <p className="text-xs text-gob-text-muted">
          {results.length === 0
            ? query
              ? "Sin resultados."
              : "No hay usuarios registrados."
            : query
              ? `${results.length} resultado${results.length === 1 ? "" : "s"}`
              : `Mostrando los primeros ${results.length} usuarios ordenados por rol y nombre.`}
        </p>

        <BulkRevokeList
          items={results.map((u) => ({ id: u.id, label: `${u.displayName} (${u.role})`, raw: u }))}
          targetKind="vet"
          actorUserId={user.id}
          isRevocable={(item) => (item as { raw: (typeof results)[number] }).raw.role === "vet"}
          renderItem={(item) => {
            const u = (item as { raw: (typeof results)[number] }).raw;
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-gob-text">{u.displayName}</p>
                    <p className="text-[10px] font-mono text-gob-text-muted">{u.id}</p>
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
                {u.role === "vet" && (
                  <RevokeUserActions
                    target={{
                      id: u.id,
                      displayName: u.displayName,
                      matriculaJurisdiccion: u.matriculaJurisdiccion,
                      role: u.role,
                    }}
                    actorUserId={user.id}
                    actorRole={profile.role}
                    jurisdictions={jurisdictions}
                  />
                )}
              </div>
            );
          }}
        />

        <p className="text-xs text-gob-text-muted">
          <Link href="/gob" className="underline underline-offset-4 hover:text-gob-text-gray">
            ← Volver al dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
