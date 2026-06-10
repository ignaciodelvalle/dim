import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
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
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user } = await requireAdminOrRedirect();

  // Admin sees all orgs — pass role=admin and empty jurisdictions.
  const results = await searchOrganizations(query, { role: "admin", jurisdictions: [] });

  if (query) {
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
          Busca por nombre, razon social o CUIT. Vista universal — todas las jurisdicciones.
        </p>
      </header>

      <form action="/admin/organizaciones" method="get" className="flex items-center gap-2">
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

      <p className="text-[11px] text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : "Ingresa una consulta para buscar organizaciones."
          : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
      </p>

      <BulkRevokeList
        items={results.map((o) => ({ id: o.id, label: o.displayName, raw: o }))}
        targetKind="org"
        actorUserId={user.id}
        isRevocable={(item) => (item as { raw: (typeof results)[number] }).raw.verified}
        renderItem={(item) => {
          const o = (item as { raw: (typeof results)[number] }).raw;
          return (
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
                  <ProposeOrgActions org={o} />
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
          );
        }}
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
