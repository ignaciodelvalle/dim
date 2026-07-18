import Link from "next/link";

import { BulkRevokeList } from "@/components/BulkRevokeList";
import { OpButton, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { searchOrganizations } from "@/lib/infra/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { portalBase } from "@/lib/ui/portal-base";
import { pluralizeEs } from "@/lib/utils/format";
import { logPiiReadSafely } from "@/src/modules/organizations/application/admin-proposals/log-pii-query";

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
  const base = await portalBase();
  const { items: results, truncated } = await searchOrganizations(query, {
    role: profile.role,
    jurisdictions,
  });

  // AC2: every PII read leaves a trail — both the typed-query search AND the
  // no-query landing. Awaited so the audit row is durable; the wrapper logs to
  // console.error and swallows on failure so it never breaks the render.
  await logPiiReadSafely(user.id, query, results.length, "organizations");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · Organizaciones
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Organizaciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {profile.role === "admin"
            ? "Buscá por nombre, razón social o CUIT. Tu vista es universal."
            : `Buscá entre las orgs en tus ${jurisdictions.length} ${pluralizeEs(jurisdictions.length, "localidad")}.`}
        </p>
      </header>

      <form action={`${base}/organizaciones`} method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          aria-label="Buscar organizaciones por nombre, razón social o CUIT"
          placeholder="Buscar por nombre, razón social o CUIT"
          className="flex-1 text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-ln-op-ink placeholder:text-ln-op-mute focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <OpButton type="submit" variant="primary" size="sm">
          Buscar
        </OpButton>
      </form>

      <p className="text-sm text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : "Ingresa una consulta para buscar organizaciones."
          : truncated
            ? `Mostrando los primeros ${results.length} ${pluralizeEs(results.length, "resultado")}. Usá el buscador para acotar la lista.`
            : `${results.length} ${pluralizeEs(results.length, "resultado")}`}
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
                      <p className="text-sm text-ln-op-mute">
                        {o.legalName} · {ORG_TYPE_LABELS[o.orgType] ?? o.orgType}
                        {o.cuit && ` · CUIT ${o.cuit}`}
                      </p>
                      <p className="text-xs text-ln-op-mute">
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
          ),
        }))}
        targetKind="org"
      />

      <p className="text-sm text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          {"←"} Volver al dashboard
        </Link>
      </p>
    </div>
  );
}
