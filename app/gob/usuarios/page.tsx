import Link from "next/link";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import { OpBreach, OpCard, OpCardBody, OpCardHead, OpKpi, OpPill } from "@/components/ui/dashboard";
import { searchUsers } from "@/lib/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { fetchChipReplacementSignal, fetchIsoValidity } from "@/lib/compliance-metrics";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

import { ProposeUserActions } from "./ProposeUserActions";
import { RevokeUserActions } from "./RevokeUserActions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Govt",
  admin: "Admin",
};

type RoleTone = "neutral" | "ok" | "triaged" | "open";
const ROLE_TONES: Record<string, RoleTone> = {
  owner: "neutral",
  vet: "ok",
  govt: "triaged",
  admin: "open",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const results = await searchUsers(query, { role: profile.role, jurisdictions });

  // Registro & cumplimiento (Item 4): C2 ISO-validity (population-state) and C5
  // chip-fraud signal (microchip_replaced flagged fraud/duplicate, last 12m).
  // C5 surfaces replacements for HUMAN REVIEW only — it does not auto-classify.
  const complianceCtx = buildProjectionContext(
    { role: profile.role },
    jurisdictions,
    windows.trailing12m(),
  );
  const [isoValidity, chipSignal] = await Promise.all([
    fetchIsoValidity(complianceCtx),
    fetchChipReplacementSignal(complianceCtx),
  ]);

  // Fire-and-forget pii_queried entry. Logging only happens when the user
  // typed a query — empty-query landings are not a PII read.
  if (query) {
    void logPiiQueryForAuthority(user.id, query, results.length, "users");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          MiMAR Gobierno · Usuarios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Usuarios</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Buscá por nombre o DNI y proponé cambios de rol. Las búsquedas quedan registradas en el
          audit log.
        </p>
      </header>

      {/* C5 — chip-fraud signal (Item 4). Replacements flagged fraud/duplicate
          route to human review. This is a SIGNAL, not an auto-classification. */}
      {chipSignal.flaggedForReview > 0 && (
        <OpBreach
          title={`${chipSignal.flaggedForReview} reemplazo${chipSignal.flaggedForReview === 1 ? "" : "s"} de chip marcado${chipSignal.flaggedForReview === 1 ? "" : "s"} para revisión`}
          detail={`${chipSignal.byReason.fraud_detected ?? 0} por fraude · ${chipSignal.byReason.duplicate_detected ?? 0} por duplicado · ${chipSignal.total} reemplazos en total (12m)`}
        />
      )}

      {/* C2 — ISO-validity rate (Item 4, Res. SENASA 284/2024). */}
      <section
        aria-label="Registro y cumplimiento"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Validez ISO de chips"
          value={isoValidity.chipped === 0 ? "—" : `${isoValidity.ratePct}%`}
          tone={isoValidity.chipped === 0 ? "neutral" : isoValidity.ratePct >= 80 ? "ok" : "warn"}
          bar={isoValidity.chipped === 0 ? undefined : isoValidity.ratePct}
          sub={
            isoValidity.chipped === 0
              ? "sin chips en cobertura"
              : `${isoValidity.valid} de ${isoValidity.chipped} chips · ISO 11784/11785`
          }
        />
      </section>

      <form action="/gob/usuarios" method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o DNI"
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
                      <p className="text-[10px] font-mono text-ln-op-mute">{u.id}</p>
                    </div>
                    <OpPill tone={ROLE_TONES[u.role] ?? "neutral"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </OpPill>
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
              </OpCardBody>
            </OpCard>
          ),
        }))}
        targetKind="vet"
        actorUserId={user.id}
      />

      <p className="text-[12px] text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          ← Volver al dashboard
        </Link>
      </p>
    </div>
  );
}
