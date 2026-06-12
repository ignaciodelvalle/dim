import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { VerifyOrgButton } from "@/components/VerifyOrgButton";
import { OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { searchOrganizations } from "@/lib/admin-search";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { ProposeOrgActions } from "../../gob/organizaciones/ProposeOrgActions";
import { RevokeOrgActions } from "../../gob/organizaciones/RevokeOrgActions";

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clinica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Otro",
};

export default async function AdminOrganizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  // Default to "pendiente" so the page opens on the actionable queue
  const estado = sp.estado === "todas" ? "todas" : "pendiente";
  const { user } = await requireAdminOrRedirect();

  // Admin sees all orgs — pass role=admin and empty jurisdictions.
  // verifiedFilter is pushed into SQL so the DB LIMIT applies after the filter
  // (prevents the "Pendientes" tab from silently truncating the queue).
  const verifiedFilter = estado === "pendiente" ? "pending" : "all";
  const { items: results, truncated } = await searchOrganizations(
    query,
    { role: "admin", jurisdictions: [] },
    verifiedFilter,
  );

  if (query) {
    // Log the count of rows the DB actually returned (exposed row count).
    void logPiiQueryForAuthority(user.id, query, results.length, "organizations");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Organizaciones
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Organizaciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Verificá organizaciones pendientes o buscá por nombre, razon social o CUIT.
        </p>
      </header>

      {/* Search */}
      <form action="/admin/organizaciones" method="get" className="flex items-center gap-2">
        <input type="hidden" name="estado" value={estado} />
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre, razon social o CUIT"
          className="flex-1 text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <button
          type="submit"
          className="text-[13px] px-3 py-1.5 rounded-[6px] bg-ln-op-navy text-white font-semibold hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      {/* Estado filter tabs */}
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/organizaciones?estado=pendiente${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          className={[
            "text-[12px] px-3 py-1 rounded-[6px] border no-underline",
            estado === "pendiente"
              ? "border-ln-op-azul bg-ln-op-azul text-white font-semibold"
              : "border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe",
          ].join(" ")}
        >
          Pendientes
        </Link>
        <Link
          href={`/admin/organizaciones?estado=todas${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          className={[
            "text-[12px] px-3 py-1 rounded-[6px] border no-underline",
            estado === "todas"
              ? "border-ln-op-azul bg-ln-op-azul text-white font-semibold"
              : "border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe",
          ].join(" ")}
        >
          Todas
        </Link>
      </div>

      <p className="text-[11px] text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : estado === "pendiente"
              ? "No hay organizaciones pendientes de verificación."
              : "No hay organizaciones registradas."
          : truncated
            ? `Mostrando los primeros ${results.length} resultado${results.length === 1 ? "" : "s"}. Usá el buscador para acotar la lista.`
            : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
      </p>

      <BulkRevokeList
        items={results.map((o) => ({
          id: o.id,
          label: o.displayName,
          revocable: o.verified,
          content: (
            <OpCard>
              <OpCardBody>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-ln-op-ink">{o.displayName}</p>
                      <p className="text-[12px] text-ln-op-mute">
                        {o.legalName} {"·"} {ORG_TYPE_LABELS[o.orgType] ?? o.orgType}
                        {o.cuit && ` · CUIT ${o.cuit}`}
                      </p>
                      <p className="text-[11px] text-ln-op-mute">
                        {o.jurisdictionLocality ?? "—"}, {o.jurisdictionProvince ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {o.verified ? (
                        <OpPill tone="ok">Verificada</OpPill>
                      ) : (
                        <OpPill tone="open">Pendiente</OpPill>
                      )}
                    </div>
                  </div>

                  {/* Verify action — only for unverified orgs */}
                  {!o.verified && <VerifyOrgButton org={o} />}

                  {/* Propose approval request (existing) */}
                  <ProposeOrgActions org={o} />

                  {/* Evidence-backed formal revocation (existing) */}
                  {o.verified && (
                    <RevokeOrgActions
                      org={o}
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
        targetKind="org"
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
