import Link from "next/link";

import { logPiiReadSafely } from "@/src/modules/organizations/application/admin-proposals/log-pii-query";
import { BulkRevokeList } from "@/components/BulkRevokeList";
import {
  OpBreach,
  OpButton,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpKpi,
  OpPill,
} from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchChipReplacementSignal, fetchIsoValidity } from "@/lib/analytics/compliance-metrics";
import { searchUsers } from "@/lib/infra/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { TARGETS, buildProjectionContext, toneForTarget } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { deriveTargetHref } from "@/lib/ui/audit-target-link";
import { portalBase } from "@/lib/ui/portal-base";

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
  const base = await portalBase();
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

  // AC2: every PII read leaves a trail — both the typed-query search AND the
  // no-query landing (which still exposes the first N users' name/id/role).
  // Awaited (not fire-and-forget) so the audit row is durable; the wrapper logs
  // to console.error and swallows on failure so it never breaks the render.
  await logPiiReadSafely(user.id, query, results.length, "users");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {base === "/admin" ? "Admin · Usuarios" : "MiMAR Gobierno · Usuarios"}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Usuarios</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Buscá por nombre y proponé cambios de rol. Las búsquedas quedan registradas en el audit
          log.
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
          tone={
            isoValidity.chipped === 0
              ? "neutral"
              : toneForTarget(isoValidity.ratePct, TARGETS.MICROCHIP_PENETRATION_PCT)
          }
          bar={isoValidity.chipped === 0 ? undefined : isoValidity.ratePct}
          sub={
            isoValidity.chipped === 0
              ? "sin chips en cobertura"
              : `${isoValidity.valid} de ${isoValidity.chipped} chips · meta ${TARGETS.MICROCHIP_PENETRATION_PCT}% · ISO 11784/11785`
          }
          info={{
            definition:
              "Porcentaje de chips registrados en la cobertura que cumplen con la norma ISO 11784/11785 (identificación electrónica de animales). Meta interna: 80%.",
            formula:
              "COUNT(pet_identifications WHERE kind='microchip_iso' AND status='active' AND is_valid_iso=true) / COUNT(pet_identifications WHERE kind='microchip_iso' AND status='active') × 100",
            caveat: `Meta recomendada: ${TARGETS.MICROCHIP_PENETRATION_PCT}%. Solo cuenta microchips con registro ISO activo en MiMAR.`,
          }}
        />
      </section>

      <form action={`${base}/usuarios`} method="get" className="flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre"
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
                      <p className="text-xs font-mono text-ln-op-mute">{u.id}</p>
                    </div>
                    <OpPill tone={ROLE_TONES[u.role] ?? "neutral"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </OpPill>
                  </div>
                  <ProposeUserActions
                    target={{ id: u.id, displayName: u.displayName, role: u.role }}
                    actorRole={profile.role}
                    // Govt/admin accounts are managed on their detail pages
                    // (create/assign-locality/revoke live there), not inline
                    // here. For an admin viewer we link to that page instead of
                    // showing a dead "sin acciones" line. Govt viewers can't
                    // reach /admin/*, so they keep the no-inline-actions notice.
                    manageHref={base === "/admin" ? deriveTargetHref(u.id, u.role) : null}
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
      />

      <p className="text-sm text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          ← Volver al dashboard
        </Link>
      </p>

      <DashboardFreshnessFooter ctx={complianceCtx} />
    </div>
  );
}
