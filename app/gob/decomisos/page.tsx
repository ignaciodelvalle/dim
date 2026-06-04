// Govt decomiso dashboard — lista de custody_episodes abiertos por la
// organización sanitaria del usuario.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §6.
//
// Query: cases WHERE caseKind='custody_episode'
//          AND openedByOrganizationId = govtOrg.id
//        ORDER BY openedAt DESC
//
// Columns: pet, status/phase, días transcurridos, refugio receptor, acción Reasignar.
// Auth: requireDecomisoPrincipal (admin sees all; govt scoped to their org).

import { and, desc, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";

import { resolveGovtOrgForUser } from "@/app/actions/decomiso";
import { cases, db, organizations, pets } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";

import { ReasignarButton } from "./_components/ReasignarButton";

// Phase label for a custody_episode case based on spec §13.2
function phaseLabel(status: string, receiverOrgId: string | null): string {
  if (status === "closed") return "Cerrado";
  if (status === "open" && receiverOrgId) return "Esperando aceptación del refugio";
  if (status === "open" && !receiverOrgId) return "En custodia oficial (sin refugio asignado)";
  return status;
}

function phaseTone(status: string, receiverOrgId: string | null): string {
  if (status === "closed") return "bg-gob-surface-alt text-gob-text-muted";
  if (status === "open" && receiverOrgId) return "bg-gob-warning/10 text-gob-warning-text";
  return "bg-gob-info/10 text-gob-azul-link";
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
        <div className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-sm text-gob-text-muted rounded-xl border border-dashed border-gob-border p-8 text-center">
            Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador.
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gob-text">Decomisos</h1>
          <p className="text-sm text-gob-text-muted">
            {session.profile.role === "admin"
              ? "Todos los episodios de custodia del sistema."
              : "Decomisos ejecutados por tu autoridad sanitaria."}
          </p>
        </div>
        <Link
          href="/gob/decomisos/nuevo"
          className="px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Nuevo decomiso
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gob-border p-12 text-center space-y-2">
          <p className="text-sm text-gob-text-muted">No hay decomisos registrados todavía.</p>
          <p className="text-xs text-gob-text-muted">
            Usá el botón "Nuevo decomiso" para registrar una incautación por Ley 14.346.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ c, petName, petToken, petSpecies, receiverName }) => {
            const days = daysElapsed(c.openedAt);
            const canReassign = c.status === "open" && Boolean(c.receiverOrganizationId);

            return (
              <li
                key={c.id}
                className="rounded-2xl border border-gob-border bg-white p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    {/* Case code + pet */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/casos/${c.publicCode}`}
                        className="text-sm font-semibold text-gob-primary hover:underline font-mono"
                      >
                        {c.publicCode}
                      </Link>
                      {petName && (
                        <span className="text-sm text-gob-text">
                          {petName}
                          <span className="text-gob-text-muted"> ({petSpecies ?? "—"})</span>
                        </span>
                      )}
                      {petToken && (
                        <span className="text-xs font-mono text-gob-text-muted">{petToken}</span>
                      )}
                    </div>

                    {/* Phase badge */}
                    <span
                      className={`inline-flex text-xs px-2.5 py-0.5 rounded-full font-medium ${phaseTone(c.status, c.receiverOrganizationId)}`}
                    >
                      {phaseLabel(c.status, c.receiverOrganizationId)}
                    </span>
                  </div>

                  {/* Days elapsed */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-gob-text tabular-nums">{days}</p>
                    <p className="text-xs text-gob-text-muted">{days === 1 ? "día" : "días"}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gob-text-muted">
                  <div className="space-y-0.5">
                    <p>
                      Abierto el {formatDate(c.openedAt)}
                      {c.closedAt ? ` · Cerrado el ${formatDate(c.closedAt)}` : ""}
                    </p>
                    {receiverName && (
                      <p>
                        Refugio: <span className="text-gob-text font-medium">{receiverName}</span>
                      </p>
                    )}
                    {!c.receiverOrganizationId && c.status === "open" && (
                      <p className="text-gob-warning-text">Sin refugio asignado</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/casos/${c.publicCode}`}
                      className="px-3 py-1.5 rounded-lg border border-gob-border text-gob-text hover:bg-gob-surface-alt transition-colors"
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
