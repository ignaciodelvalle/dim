// Govt decomiso dashboard -- lista de custody_episodes abiertos por la
// organizacion sanitaria del usuario.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md section 6.
//
// Query: cases WHERE caseKind='custody_episode'
//          AND openedByOrganizationId = govtOrg.id
//        ORDER BY openedAt DESC
//
// Columns: pet, status/phase, dias transcurridos, refugio receptor, accion Reasignar.
// Auth: requireDecomisoPrincipal (admin sees all; govt scoped to their org).

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { resolveGovtOrgForUser } from "@/app/actions/decomiso";
import { OpCard, OpCardBody, OpCardHead, OpKpi, OpPill } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { cases, db, organizations, pets } from "@/db";
import { fetchSeizures } from "@/lib/analytics/compliance-metrics";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { formatDate } from "@/lib/utils/format";

import { ReasignarButton } from "./_components/ReasignarButton";

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
  if (status === "open" && receiverOrgId) return "Esperando aceptacion del refugio";
  if (status === "open" && !receiverOrgId) return "En custodia oficial (sin refugio asignado)";
  return status;
}

type PhasePillTone = "neutral" | "open" | "triaged";

function phasePillTone(status: string, receiverOrgId: string | null): PhasePillTone {
  if (status === "closed") return "neutral";
  if (status === "open" && receiverOrgId) return "open";
  return "triaged";
}

function daysElapsed(openedAt: Date): number {
  return Math.floor((Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function DecomisosDashboardPage() {
  const session = await requireDecomisoPrincipal();

  // Admin sees every custody_episode. Govt is scoped to cases opened by their
  // own sanitary_authority org.
  let govtOrgId: string | null = null;
  if (session.profile.role !== "admin") {
    const govtOrg = await resolveGovtOrgForUser(session.user.id);
    if (!govtOrg) {
      return (
        <div className="space-y-6">
          <p className="text-[13px] text-ln-op-mute rounded-[6px] border border-dashed border-ln-op-line p-8 text-center">
            Tu usuario no esta asociado a ninguna autoridad sanitaria. Contacta al administrador.
          </p>
        </div>
      );
    }
    govtOrgId = govtOrg.id;
  }

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
        ? and(eq(cases.caseKind, "custody_episode"), eq(cases.openedByOrganizationId, govtOrgId))
        : eq(cases.caseKind, "custody_episode"),
    )
    .orderBy(desc(cases.openedAt))
    .limit(200);

  // D5 seizures (Item 4) — shelter_intake_recorded(intake_reason='seizure')
  // in the last 30 days, grouped by seizure_motive, jurisdiction-scoped.
  // Admin sees universal scope; govt is scoped to their assigned jurisdictions.
  const seizuresCtx = buildProjectionContext(
    { role: session.profile.role },
    session.jurisdictions,
    windows.trailing30d(),
  );
  const seizures = await fetchSeizures(seizuresCtx);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Decomisos</p>
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Decomisos</h1>
          <p className="text-[13px] text-ln-op-mute">
            {session.profile.role === "admin"
              ? "Todos los episodios de custodia del sistema."
              : "Decomisos ejecutados por tu autoridad sanitaria."}
          </p>
        </div>
        <Link
          href="/gob/decomisos/nuevo"
          className="px-3 py-1.5 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700 transition-colors no-underline"
        >
          {"+ Nuevo decomiso"}
        </Link>
      </header>

      {/* D5 — seizures this period (last 30d) + by-motive breakdown (Ley 14.346). */}
      <section aria-label="Decomisos del período" className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <OpKpi
            label="Decomisos (30d)"
            value={String(seizures.total)}
            tone={seizures.total > 0 ? "warn" : "neutral"}
            sub="incautaciones por Ley 14.346"
            info={{
              definition:
                "Total de eventos shelter_intake_recorded con intake_reason='seizure' en los últimos 30 días, scoped a la jurisdicción del operador.",
              formula:
                "COUNT(shelter_intake_recorded WHERE intake_reason='seizure', últimos 30d) scoped",
            }}
          />
        </div>
        {seizures.byMotive.length > 0 && (
          <OpCard>
            <OpCardHead title="Decomisos por motivo (30d)" />
            <OpCardBody className="p-0">
              <ul className="divide-y divide-ln-op-line-2">
                {seizures.byMotive.map((m) => (
                  <li
                    key={m.motive}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                  >
                    <span className="text-[13px] text-ln-op-ink">
                      {SEIZURE_MOTIVE_LABELS[m.motive] ?? m.motive}
                    </span>
                    <span className="text-[13px] font-semibold text-ln-op-ink tabular-nums">
                      {m.count}
                    </span>
                  </li>
                ))}
              </ul>
            </OpCardBody>
          </OpCard>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-ln-op-line p-12 text-center space-y-2">
          <p className="text-[13px] text-ln-op-mute">No hay decomisos registrados todavia.</p>
          <p className="text-sm text-ln-op-mute">
            {'Usa el boton "Nuevo decomiso" para registrar una incautacion por Ley 14.346.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ c, petName, petToken, petSpecies, receiverName }) => {
            const days = daysElapsed(c.openedAt);
            const canReassign = c.status === "open" && Boolean(c.receiverOrganizationId);

            return (
              <li key={c.id}>
                <OpCard>
                  <OpCardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        {/* Case code + pet */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/casos/${c.publicCode}`}
                            className="text-[13px] font-semibold text-ln-op-azul hover:underline font-mono no-underline"
                          >
                            {c.publicCode}
                          </Link>
                          {petName && (
                            <span className="text-[13px] text-ln-op-ink">
                              {petName}
                              <span className="text-ln-op-mute"> ({petSpecies ?? "—"})</span>
                            </span>
                          )}
                          {petToken && (
                            <span className="text-[11px] font-mono text-ln-op-mute">
                              {petToken}
                            </span>
                          )}
                        </div>

                        {/* Phase pill */}
                        <OpPill tone={phasePillTone(c.status, c.receiverOrganizationId)}>
                          {phaseLabel(c.status, c.receiverOrganizationId)}
                        </OpPill>
                      </div>

                      {/* Days elapsed */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-ln-op-ink tabular-nums">{days}</p>
                        <p className="text-sm text-ln-op-mute">{days === 1 ? "dia" : "dias"}</p>
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
                          href={`/casos/${c.publicCode}`}
                          className="px-3 py-1.5 rounded-[6px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline text-sm"
                        >
                          Ver caso
                        </Link>
                        {canReassign && (
                          <ReasignarButton
                            casePublicCode={c.publicCode}
                            currentReceiverName={receiverName ?? "el refugio actual"}
                          />
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

      <DashboardFreshnessFooter ctx={seizuresCtx} />
    </div>
  );
}

export const dynamic = "force-dynamic";
