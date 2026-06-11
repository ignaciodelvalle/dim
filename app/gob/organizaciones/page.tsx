import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { searchOrganizations } from "@/lib/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

import { ProposeOrgActions } from "./ProposeOrgActions";
import { RevokeOrgActions } from "./RevokeOrgActions";

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clinica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Otro",
};

export default async function OrganizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const { items: results, truncated } = await searchOrganizations(query, {
    role: profile.role,
    jurisdictions,
  });

  if (query) {
    void logPiiQueryForAuthority(user.id, query, results.length, "organizations");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · Organizaciones
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Organizaciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {profile.role === "admin"
            ? "Busca por nombre, razon social o CUIT. Tu vista es universal."
            : `Busca entre las orgs en tus ${jurisdictions.length} localidad${jurisdictions.length === 1 ? "" : "es"}.`}
        </p>
      </header>

      <form action="/gob/organizaciones" method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre, razon social o CUIT"
          className="flex-1 text-[13px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-ln-op-ink placeholder:text-ln-op-mute focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <button
          type="submit"
          className="text-[13px] px-3 py-1.5 rounded-[6px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700 transition-colors"
        >
          Buscar
        </button>
      </form>

      <p className="text-[12px] text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : "Ingresa una consulta para buscar organizaciones."
          : truncated
            ? `Mostrando los primeros ${results.length} resultado${results.length === 1 ? "" : "s"}. Usá el buscador para acotar la lista.`
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
                        {o.legalName} · {ORG_TYPE_LABELS[o.orgType] ?? o.orgType}
                        {o.cuit && ` · CUIT ${o.cuit}`}
                      </p>
                      <p className="text-[10px] text-ln-op-mute">
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
                      actorRole={profile.role}
                      jurisdictions={jurisdictions}
                    />
                  )}
                </div>
              </OpCardBody>
            </OpCard>
          );
        }}
      />

      <p className="text-[12px] text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          {"<-"} Volver al dashboard
        </Link>
      </p>
    </div>
  );
}
