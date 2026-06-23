import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { searchUsers } from "@/lib/admin-search";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { ProposeUserActions } from "../../gob/usuarios/ProposeUserActions";
import { RevokeUserActions } from "../../gob/usuarios/RevokeUserActions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueno/a",
  vet: "Veterinario/a",
  govt: "Govt",
  admin: "Admin",
};

type RoleTone = "neutral" | "ok" | "triaged" | "escalated";
const ROLE_TONES: Record<string, RoleTone> = {
  owner: "neutral",
  vet: "ok",
  govt: "triaged",
  admin: "escalated",
};

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user } = await requireAdminOrRedirect();
  const results = await searchUsers(query);

  if (query) {
    // Await the audit write (Ley 25.326): a fire-and-forget promise can be
    // dropped when the server component returns, weakening the PII-access
    // accountability guarantee (C3).
    await logPiiQueryForAuthority(user.id, query, results.length, "users");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Usuarios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Usuarios</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Busca por nombre o DNI y propone cambios de rol. Vista universal — todas las
          jurisdicciones. Las busquedas quedan en el audit log.
        </p>
      </header>

      <form action="/admin/usuarios" method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o DNI"
          className="flex-1 text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <button
          type="submit"
          className="text-[13px] px-3 py-1.5 rounded-[6px] bg-ln-op-navy text-white font-semibold hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      <p className="text-[11px] text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : "No hay usuarios registrados."
          : query
            ? `${results.length} resultado${results.length === 1 ? "" : "s"}`
            : `Mostrando los primeros ${results.length} usuarios ordenados por rol y nombre.`}
      </p>

      <BulkRevokeList
        items={results.map((u) => ({
          id: u.id,
          label: `${u.displayName} (${u.role})`,
          revocable: u.role === "vet",
          content: (
            <OpCard>
              <OpCardBody>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-ln-op-ink">{u.displayName}</p>
                    </div>
                    <OpPill tone={ROLE_TONES[u.role] ?? "neutral"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </OpPill>
                  </div>
                  <ProposeUserActions
                    target={{ id: u.id, displayName: u.displayName, role: u.role }}
                    actorRole="admin"
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
                      actorRole="admin"
                      jurisdictions={[]}
                    />
                  )}
                </div>
              </OpCardBody>
            </OpCard>
          ),
        }))}
        targetKind="vet"
        actorUserId={user.id}
      />

      <p className="text-[11px] text-ln-op-mute">
        <Link
          href="/admin"
          className="font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
        >
          {"<- Volver al dashboard"}
        </Link>
      </p>
    </div>
  );
}
