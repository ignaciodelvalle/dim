import Link from "next/link";

import { OpButton, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import { searchServiceDogCredentials } from "@/lib/infra/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { SERVICE_TYPE_LABELS } from "@/lib/infra/service-dog-labels";
import { portalBase } from "@/lib/ui/portal-base";
import { pluralizeEs } from "@/lib/utils/format";

import { RevokeServiceDogActions } from "./RevokeServiceDogActions";

// Listing surface for verified (credential_status='vigente') RUPGA
// service-dog credentials, with a "Revocar credencial" action per row.
//
// Before this page, revokeServiceDogCredentialAction (fully built and
// tested backend, app/actions/service-dog.ts) had no UI caller anywhere in
// app/gob or app/admin — its siblings (org verification, vet role) each
// have a revocation console (RevokeOrgActions.tsx / RevokeUserActions.tsx);
// this page + RevokeServiceDogActions.tsx close that gap.
export default async function RupgaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();
  const { items: results, truncated } = await searchServiceDogCredentials(query, {
    role: profile.role,
    jurisdictions,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · Credenciales RUPGA
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Credenciales RUPGA
        </h1>
        <p className="text-[var(--text-sm)] text-ln-op-ink-2">
          {profile.role === "admin"
            ? "Credenciales de perro de asistencia vigentes. Buscá por nombre de la mascota, token o número RUPGA. Tu vista es universal."
            : `Credenciales vigentes en tus ${jurisdictions.length} ${pluralizeEs(jurisdictions.length, "localidad")}.`}
        </p>
      </header>

      <form action={`${base}/rupga`} method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          aria-label="Buscar credenciales RUPGA por mascota, token o número"
          placeholder="Buscar por nombre de la mascota, token o número RUPGA"
          className="flex-1 text-[var(--text-sm)] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-ln-op-ink placeholder:text-ln-op-mute focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <OpButton type="submit" variant="primary" size="sm">
          Buscar
        </OpButton>
      </form>

      <p className="text-sm text-ln-op-mute">
        {results.length === 0
          ? query
            ? "Sin resultados."
            : "No hay credenciales vigentes en tu alcance."
          : truncated
            ? `Mostrando las primeras ${results.length} ${pluralizeEs(results.length, "credencial")}. Usá el buscador para acotar la lista.`
            : `${results.length} ${pluralizeEs(results.length, "credencial")}`}
      </p>

      <div className="space-y-3">
        {results.map((c) => (
          <OpCard key={c.petId}>
            <OpCardBody>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[var(--text-sm)] font-medium text-ln-op-ink">{c.petName}</p>
                    <p className="text-sm text-ln-op-mute">
                      {SERVICE_TYPE_LABELS[c.serviceType]}
                      {c.rupgaCredential && ` · RUPGA ${c.rupgaCredential}`}
                    </p>
                    <p className="text-xs text-ln-op-mute">
                      {c.jurisdictionLocality ?? "—"}, {c.jurisdictionProvince ?? "—"}
                    </p>
                  </div>
                  <OpPill tone="ok">Vigente</OpPill>
                </div>
                <RevokeServiceDogActions
                  credential={c}
                  actorRole={profile.role}
                  jurisdictions={jurisdictions}
                />
              </div>
            </OpCardBody>
          </OpCard>
        ))}
      </div>

      <p className="text-sm text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          {"←"} Volver al dashboard
        </Link>
      </p>
    </div>
  );
}
