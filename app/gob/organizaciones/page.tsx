import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
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
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Organizaciones
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
              : "Ingresá una consulta para buscar organizaciones."
            : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
        </p>

        <ul className="space-y-2">
          {results.map((o) => (
            <li
              key={o.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {o.displayName}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500">
                    {o.legalName} · {ORG_TYPE_LABELS[o.orgType] ?? o.orgType}
                    {o.cuit && ` · CUIT ${o.cuit}`}
                  </p>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
                    {o.jurisdictionLocality ?? "—"}, {o.jurisdictionProvince ?? "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {o.verified && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Verificada
                    </span>
                  )}
                  {!o.verified && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
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
            </li>
          ))}
        </ul>

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          <Link
            href="/gob"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ← Volver al dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
