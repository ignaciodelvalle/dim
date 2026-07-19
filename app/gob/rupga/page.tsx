import Link from "next/link";
import { Suspense } from "react";

import { type UrlTabItem, UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import { OpButton, OpCard, OpCardBody, OpPill } from "@/components/ui/dashboard";
import {
  type ServiceDogCredentialStatusFilter,
  searchServiceDogCredentials,
} from "@/lib/infra/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { SERVICE_TYPE_LABELS } from "@/lib/infra/service-dog-labels";
import { portalBase } from "@/lib/ui/portal-base";
import { pluralizeEs } from "@/lib/utils/format";

import { RevokeServiceDogActions } from "./RevokeServiceDogActions";

// Listing surface for RUPGA service-dog credentials, with a "Revocar
// credencial" action per vigente row.
//
// Before this page, revokeServiceDogCredentialAction (fully built and
// tested backend, app/actions/service-dog.ts) had no UI caller anywhere in
// app/gob or app/admin — its siblings (org verification, vet role) each
// have a revocation console (RevokeOrgActions.tsx / RevokeUserActions.tsx);
// this page + RevokeServiceDogActions.tsx close that gap.
//
// Status filter (honesty fix, 2026-07-19): used to hardcode
// credential_status='vigente', so revoked credentials were permanently
// invisible — no way to review revocation history. A status filter (UrlTabs,
// same reasoning as /gob/servicios: the real default is "vigente", not "show
// all", so it fits the tabs idiom) now exposes vigente/revocada/all,
// defaulting to vigente (previous hardcoded behavior unchanged unless the
// operator switches tabs).

const CREDENTIAL_STATUS_TABS: UrlTabItem[] = [
  { value: "vigente", label: "Vigentes" },
  { value: "revocada", label: "Revocadas" },
  { value: "all", label: "Todas" },
];

function parseCredentialStatus(raw: string | undefined): ServiceDogCredentialStatusFilter {
  if (raw === "revocada" || raw === "all") return raw;
  return "vigente";
}

type PillTone = "ok" | "danger" | "neutral";
const STATUS_PILL: Record<string, { label: string; tone: PillTone }> = {
  vigente: { label: "Vigente", tone: "ok" },
  revocada: { label: "Revocada", tone: "danger" },
};

export default async function RupgaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const statusFilter = parseCredentialStatus(sp.status);
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();
  const { items: results, truncated } = await searchServiceDogCredentials(
    query,
    { role: profile.role, jurisdictions },
    { status: statusFilter },
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          miMAR Gobierno · Credenciales RUPGA
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Credenciales RUPGA
        </h1>
        <p className="text-[var(--text-sm)] text-ln-op-ink-2">
          {profile.role === "admin"
            ? "Credenciales de perro de asistencia. Buscá por nombre de la mascota, token o número RUPGA. Tu vista es universal."
            : `Credenciales en tus ${jurisdictions.length} ${pluralizeEs(jurisdictions.length, "localidad")}.`}
        </p>
      </header>

      <form action={`${base}/rupga`} method="get" className="flex items-center gap-2">
        {/* Preserve the active status tab so a new search doesn't reset it. */}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
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

      <Suspense>
        <UrlTabs
          paramKey="status"
          defaultValue="vigente"
          tabs={CREDENTIAL_STATUS_TABS}
          aria-label="Filtrar por estado de la credencial"
        >
          <UrlTabsContent value={statusFilter}>
            <p className="mt-4 text-sm text-ln-op-mute">
              {results.length === 0
                ? query
                  ? "Sin resultados."
                  : "No hay credenciales en tu alcance para este estado."
                : truncated
                  ? `Mostrando las primeras ${results.length} ${pluralizeEs(results.length, "credencial")}. Usá el buscador para acotar la lista.`
                  : `${results.length} ${pluralizeEs(results.length, "credencial")}`}
            </p>

            <div className="space-y-3 mt-3">
              {results.map((c) => {
                const pill = STATUS_PILL[c.credentialStatus] ?? {
                  label: c.credentialStatus,
                  tone: "neutral" as const,
                };
                return (
                  <OpCard key={c.petId}>
                    <OpCardBody>
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-[var(--text-sm)] font-medium text-ln-op-ink">
                              {c.petName}
                            </p>
                            <p className="text-sm text-ln-op-mute">
                              {SERVICE_TYPE_LABELS[c.serviceType]}
                              {c.rupgaCredential && ` · RUPGA ${c.rupgaCredential}`}
                            </p>
                            <p className="text-xs text-ln-op-mute">
                              {c.jurisdictionLocality ?? "—"}, {c.jurisdictionProvince ?? "—"}
                            </p>
                          </div>
                          <OpPill tone={pill.tone}>{pill.label}</OpPill>
                        </div>
                        {/* Revoking an already-revoked credential has nothing to do —
                            only offer the action on a currently vigente credential. */}
                        {c.credentialStatus === "vigente" && (
                          <RevokeServiceDogActions
                            credential={c}
                            actorRole={profile.role}
                            jurisdictions={jurisdictions}
                          />
                        )}
                      </div>
                    </OpCardBody>
                  </OpCard>
                );
              })}
            </div>
          </UrlTabsContent>
        </UrlTabs>
      </Suspense>

      <p className="text-sm text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          {"←"} Volver al dashboard
        </Link>
      </p>
    </div>
  );
}
