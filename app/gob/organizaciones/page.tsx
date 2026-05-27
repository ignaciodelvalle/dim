import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { searchOrganizations } from "@/lib/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

import { ProposeOrgActions } from "./ProposeOrgActions";
import { RevokeOrgActions } from "./RevokeOrgActions";

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
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
  const results = await searchOrganizations(query, { role: profile.role, jurisdictions });

  if (query) {
    void logPiiQueryForAuthority(user.id, query, results.length, "organizations");
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">Organizaciones</h1>
          <p className="text-sm text-gob-text-gray">
            {profile.role === "admin"
              ? "Buscá por nombre, razón social o CUIT. Tu vista es universal."
              : `Buscá entre las orgs en tus ${jurisdictions.length} localidad${jurisdictions.length === 1 ? "" : "es"}.`}
          </p>
        </header>

        <form action="/gob/organizaciones" method="get" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre, razón social o CUIT"
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
              : "Ingresá una consulta para buscar organizaciones."
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
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-gob-text">{o.displayName}</p>
                    <p className="text-xs text-gob-text-muted">
                      {o.legalName} · {ORG_TYPE_LABELS[o.orgType] ?? o.orgType}
                      {o.cuit && ` · CUIT ${o.cuit}`}
                    </p>
                    <p className="text-[10px] text-gob-text-muted">
                      {o.jurisdictionLocality ?? "—"}, {o.jurisdictionProvince ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {o.verified ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gob-success/10 text-gob-success">
                        Verificada
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gob-warning/20 text-gob-warning-text">
                        Pendiente
                      </span>
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
