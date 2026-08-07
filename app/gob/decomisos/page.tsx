// Govt decomiso dashboard -- lista de custody_episodes abiertos por la
// organizacion sanitaria del usuario.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md section 6.
//
// Query: cases WHERE caseKind='custody_episode'
//          AND openedByOrganizationId = govtOrg.id
//          AND <the case's jurisdiction is inside session.jurisdictions>
//        ORDER BY openedAt DESC, createdAt DESC, id DESC
//
// Columns: pet, status/phase, dias transcurridos, refugio receptor, accion Reasignar.
// Auth: requireDecomisoPrincipal, then TWO independent narrowings for govt:
//   1. openedByOrganizationId — workflow ownership ("my authority opened it").
//   2. jurisdictionPairClause  — the jurisdictional FENCE (RA-8 R3). This list
//      used to have only (1), which a stale membership in another province's
//      authority org satisfies; the rows it surfaced fed the Reasignar and
//      Devolver buttons. See decomiso-jurisdiction-fence.ts.
// Admin is universal on both.

import { type SQL, and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";

import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpFilterBar,
  OpKpi,
  OpPill,
} from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { cases, db, organizations, pets } from "@/db";
import { fetchSeizures } from "@/lib/analytics/compliance-metrics";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";
import { buildProjectionContext } from "@/lib/metrics";
import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";
import { jurisdictionPairClause } from "@/lib/metrics/scope";
import { formatCount, formatDate, speciesLabel } from "@/lib/utils/format";
import { resolveGovtOrgForUser } from "@/src/modules/decomiso/application/resolve-govt-org";

import { DevolverAlDuenoButton } from "./_components/DevolverAlDuenoButton";
import { ReasignarButton } from "./_components/ReasignarButton";
import { resolveDecomisosPeriod } from "./resolve-decomisos-period";

// Human-readable labels for the seizure_motive enum (event-schemas.ts).
const SEIZURE_MOTIVE_LABELS: Record<string, string> = {
  maltrato_fisico: "Maltrato físico",
  abandono_extremo: "Abandono extremo",
  acumulacion: "Acumulación",
  trafico: "Tráfico",
  sin_refugio_critico: "Sin refugio (crítico)",
  pelea_de_perros: "Pelea de perros",
  otro: "Otro",
};

// Phase label for a custody_episode case based on spec section 13.2
function phaseLabel(status: string, receiverOrgId: string | null): string {
  if (status === "closed") return "Cerrado";
  if (status === "open" && receiverOrgId) return "Esperando aceptación del refugio";
  if (status === "open" && !receiverOrgId) return "En custodia oficial (sin refugio asignado)";
  return status;
}

type PhasePillTone = "neutral" | "open" | "triaged";

function phasePillTone(status: string, receiverOrgId: string | null): PhasePillTone {
  if (status === "closed") return "neutral";
  if (status === "open" && receiverOrgId) return "open";
  return "triaged";
}

/**
 * How long the episode HAS LASTED — which stops at its closure.
 *
 * This used to run off Date.now() unconditionally, so a closed episode kept
 * counting. A real row read "CERRADO · Abierto el 19 de junio · Cerrado el 19
 * de junio" with "36 días" in bold beside it: the episode lasted zero days, and
 * the largest number on the row said otherwise (external design review C8/U3).
 * The most prominent figure on a row lying, in a system whose whole premise is
 * that the record does not.
 */
function daysElapsed(openedAt: Date, closedAt: Date | null): number {
  const end = closedAt ? closedAt.getTime() : Date.now();
  return Math.max(0, Math.floor((end - openedAt.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function DecomisosDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const session = await requireDecomisoPrincipal();

  // Admin sees every custody_episode. Govt is narrowed twice — by the authority
  // that opened the episode AND by the operator's own jurisdiction assignments.
  let govtOrgId: string | null = null;
  let jurisdictionFence: SQL | undefined;
  if (session.profile.role !== "admin") {
    const govtOrg = await resolveGovtOrgForUser(session.user.id);
    if (!govtOrg) {
      return (
        <div className="space-y-6">
          <p className="text-md text-ln-op-mute rounded-[var(--radius-md)] border border-dashed border-ln-op-line p-8 text-center">
            Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador.
          </p>
        </div>
      );
    }
    govtOrgId = govtOrg.id;

    // The SQL mirror of jurisdictionScopeContains — same whole-province
    // subsumption the CREATE guard and canReadCase apply, so the list can never
    // disagree with the detail page about what this operator governs.
    // `?? sql\`false\`` is the fail-closed leg: zero assignments means zero
    // rows, never an absent predicate.
    jurisdictionFence =
      jurisdictionPairClause(
        session.jurisdictions.map((j) => ({ province: j.province, locality: j.locality })),
        sql`${cases.jurisdictionProvince}`,
        sql`${cases.jurisdictionLocality}`,
      ) ?? sql`false`;
  }

  const sp = await searchParams;
  // Default stays trailing 30d (pre-existing hardcoded behavior) — see
  // resolve-decomisos-period.ts for why this can't just be
  // resolveAnalyticsPeriod(sp) directly.
  const period = resolveDecomisosPeriod(sp);

  const rows = await db
    .select({
      c: cases,
      petName: pets.name,
      petToken: pets.publicToken,
      petSpecies: pets.species,
      receiverName: organizations.displayName,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .leftJoin(organizations, eq(organizations.id, cases.receiverOrganizationId))
    .where(
      govtOrgId
        ? and(
            eq(cases.caseKind, "custody_episode"),
            eq(cases.openedByOrganizationId, govtOrgId),
            jurisdictionFence,
          )
        : eq(cases.caseKind, "custody_episode"),
    )
    // openedAt alone is not unique — most custody_episode rows share an
    // identical batch-seeded timestamp (verified against the local DB), so
    // `ORDER BY opened_at DESC` with no tiebreaker leaves ties in whatever
    // order the seq scan happens to hand back, which for a bulk-inserted
    // batch reads out in roughly insertion order — i.e. the oldest case in
    // that tied block renders FIRST and the newest LAST, the exact "starts
    // at the end" symptom reported.
    //
    // `createdAt` recovers TRUE insertion recency for these ties: no writer
    // (production openCase() in cases-repository.ts, nor any seed script)
    // ever sets `created_at` explicitly — it is always the DB-side
    // `defaultNow()` timestamp captured at the moment the row actually landed.
    // Seed scripts DO deliberately backdate `opened_at` (a business-semantic
    // date) to a shared value across a batch, but each `cases` row is still
    // inserted via its own sequential, non-transactional `INSERT` statement
    // (verified: no `db.transaction` wraps the seed loops), so `created_at`
    // is a real, monotonically increasing timestamp distinguishing "which of
    // these same-opened_at rows landed most recently." (In real production
    // writes, `openedAt` is never set explicitly either — both columns get
    // the identical `defaultNow()` snapshot from the same INSERT, so
    // `createdAt` adds no information there; it only resolves the seed-batch
    // case, which is exactly the reported symptom.)
    //
    // `id DESC` remains the final determinism guard this project already uses
    // for newest-first case lists (lib/infra/case-queries.ts
    // listCasesForGovt/listCasesForAdmin) for the residual case where even
    // `created_at` ties (e.g. a hypothetical future batch INSERT). It does
    // NOT recover true sub-second recency on its own (id is a random UUID) —
    // `createdAt` is what does that here.
    .orderBy(desc(cases.openedAt), desc(cases.createdAt), desc(cases.id))
    .limit(200);

  // Verified-orgs list for the Reasignar combobox (V9 usability fix): same
  // eligibility gate reassign-decomiso.ts's validateReceiverOrg enforces
  // server-side (verified + active + shelter/rescue_network) — this is a
  // display-only convenience list, not a security boundary; the use-case
  // re-validates on submit regardless of what's shown here.
  const receiverOrgs = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.verified, true),
        eq(organizations.status, "active"),
        inArray(organizations.orgType, ["shelter", "rescue_network"]),
      ),
    )
    .orderBy(organizations.displayName)
    .limit(200);

  // D5 seizures (Item 4) — shelter_intake_recorded(intake_reason='seizure')
  // in the selected period (default trailing 30d), grouped by seizure_motive,
  // jurisdiction-scoped. Admin sees universal scope; govt is scoped to their
  // assigned jurisdictions.
  const seizuresCtx = buildProjectionContext(
    { role: session.profile.role },
    session.jurisdictions,
    period,
  );
  const seizures = await fetchSeizures(seizuresCtx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <ScreenHeader
          eyebrow="Ley 14.346"
          title="Decomisos"
          subtitle={
            <p className="text-md text-ln-op-mute">
              {session.profile.role === "admin"
                ? "Todos los episodios de custodia del sistema."
                : "Decomisos ejecutados por tu autoridad sanitaria."}
            </p>
          }
        />
        <Link
          href="/gob/decomisos/nuevo"
          className="px-3 py-1.5 rounded-[var(--radius-md)] bg-ln-op-azul text-white text-md font-medium hover:bg-ln-op-azul-700 transition-colors no-underline"
        >
          {"+ Nuevo decomiso"}
        </Link>
      </div>

      {/* Unified filter bar — period only (no jurisdiction/domain axes: rows
          are org-scoped via govtOrgId above, and the seizures KPI below is
          the only period-aware element on this screen). Default preset "30d"
          matches the pre-existing hardcoded windows.trailing30d() behavior. */}
      <OpFilterBar period={{ defaultPreset: "30d" }} />

      {/* D5 — seizures this period (default trailing 30d) + by-motive breakdown (Ley 14.346). */}
      <section aria-label="Decomisos del período seleccionado" className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <OpKpi
            label={KPI_CATALOG.seizures_period_count.label}
            value={formatCount(seizures.total)}
            tone={seizures.total > 0 ? "warn" : "neutral"}
            sub="incautaciones por Ley 14.346"
            info={{
              definition:
                "Total de eventos shelter_intake_recorded con intake_reason='seizure' en el período seleccionado, scoped a la jurisdicción del operador.",
              formula:
                "COUNT(shelter_intake_recorded WHERE intake_reason='seizure', período seleccionado) scoped",
            }}
            descriptorId="seizures_period_count"
          />
        </div>
        {seizures.byMotive.length > 0 && (
          <OpCard>
            <OpCardHead title="Decomisos por motivo (período seleccionado)" />
            <OpCardBody className="p-0">
              <ul className="divide-y divide-ln-op-line-2">
                {seizures.byMotive.map((m) => (
                  <li
                    key={m.motive}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                  >
                    <span className="text-md text-ln-op-ink">
                      {SEIZURE_MOTIVE_LABELS[m.motive] ?? m.motive}
                    </span>
                    <span className="text-md font-semibold text-ln-op-ink tabular-nums">
                      {m.count}
                    </span>
                  </li>
                ))}
              </ul>
            </OpCardBody>
          </OpCard>
        )}
      </section>

      {/* A control that filters ONE block must not look like it filters the
          screen. The period selector above drives the seizures KPI and nothing
          else (see the OpFilterBar comment) — the list below is the most recent
          200 episodes, period-independent. Unlabelled, that reads as a bug:
          narrow the period, watch the KPI fall, watch the list not move. Worse
          when the list is EMPTY, where "no hay decomisos" silently invites the
          reading "…en este período", which the query never asked.

          Making the list period-aware is a product decision and is NOT taken
          here; this states the boundary the code already has. */}
      <section aria-label="Episodios de custodia registrados" className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-md font-semibold text-ln-op-ink">
            Episodios de custodia registrados
          </h2>
          <p className="text-md text-ln-op-mute">
            El período seleccionado no filtra este listado: sólo afecta los indicadores de arriba.
            Se muestran los 200 episodios más recientes, sin importar su fecha de apertura.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line p-12 text-center space-y-2">
            <p className="text-md text-ln-op-mute">No hay decomisos registrados todavía.</p>
            <p className="text-sm text-ln-op-mute">
              {'Usá el botón "Nuevo decomiso" para registrar una incautación por Ley 14.346.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ c, petName, petToken, petSpecies, receiverName }) => {
              const days = daysElapsed(c.openedAt, c.closedAt ?? null);
              const canReassign = c.status === "open" && Boolean(c.receiverOrganizationId);
              // The episode is still in the OPENING govt org's direct custody
              // while status='open' (any accept/handoff closes THIS case and
              // opens a new one for the receiver — see accept-decomiso-handoff.ts).
              // Subject-kind (registered pet with a former owner) is validated
              // server-side; unowned strays fail cleanly with a clear error.
              const canReturnToOwner = c.status === "open";

              return (
                <li key={c.id}>
                  <OpCard>
                    <OpCardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          {/* Case code + pet. Both identifiers go through the
                              shared OpCodeBadge atom (queue-anatomy alignment,
                              2026-07-30) instead of bare mono text: blue for the
                              row's own case code (the linked identifier, same
                              tone CaseQueue gives it), neutral for the pet token,
                              which is a reference to another record, not this
                              row's key. */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/gob/casos/${c.publicCode}`}
                              className="no-underline"
                              aria-label={`Ver caso ${c.publicCode}`}
                            >
                              <OpCodeBadge tone="blue">{c.publicCode}</OpCodeBadge>
                            </Link>
                            {petName && (
                              <span className="text-md text-ln-op-ink">
                                {petName}
                                <span className="text-ln-op-mute">
                                  {" "}
                                  ({petSpecies ? speciesLabel(petSpecies) : "—"})
                                </span>
                              </span>
                            )}
                            {petToken && <OpCodeBadge tone="neutral">{petToken}</OpCodeBadge>}
                          </div>

                          {/* Phase pill */}
                          <OpPill tone={phasePillTone(c.status, c.receiverOrganizationId)}>
                            {phaseLabel(c.status, c.receiverOrganizationId)}
                          </OpPill>
                        </div>

                        {/* Days elapsed */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-ln-op-ink tabular-nums">{days}</p>
                          <p className="text-sm text-ln-op-mute">{days === 1 ? "día" : "días"}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-ln-op-mute mt-3">
                        <div className="space-y-0.5">
                          <p>
                            Abierto el {formatDate(c.openedAt)}
                            {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                          </p>
                          {receiverName && (
                            <p>
                              Refugio:{" "}
                              <span className="text-ln-op-ink font-medium">{receiverName}</span>
                            </p>
                          )}
                          {!c.receiverOrganizationId && c.status === "open" && (
                            <p className="text-ln-op-warn">Sin refugio asignado</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Link
                            href={`/gob/casos/${c.publicCode}`}
                            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline text-sm"
                          >
                            Ver caso
                          </Link>
                          {canReassign && (
                            <ReasignarButton
                              casePublicCode={c.publicCode}
                              currentReceiverName={receiverName ?? "el refugio actual"}
                              currentReceiverOrgId={c.receiverOrganizationId}
                              receiverOrgs={receiverOrgs}
                            />
                          )}
                          {canReturnToOwner && (
                            <DevolverAlDuenoButton casePublicCode={c.publicCode} />
                          )}
                        </div>
                      </div>
                    </OpCardBody>
                  </OpCard>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DashboardFreshnessFooter ctx={seizuresCtx} />
    </div>
  );
}

export const dynamic = "force-dynamic";
