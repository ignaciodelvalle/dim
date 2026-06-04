// Receiver inbox of incoming transfer proposals — two kinds:
//
// 1. custody_transfer_handshake  — routine cross-org custody transfer.
//    Sender opened a handshake case; the proposal event contains reason/notes.
//
// 2. custody_episode (decomiso)  — state seizure under Ley 14.346.
//    Discriminator: caseKind='custody_episode' + openedByOrganizationId.orgType=
//    'sanitary_authority'. These carry a DECOMISO badge, the govt org name, and
//    the seizure motive from the shelter_intake_recorded payload.
//    Reference: decomiso spec §7 + DC13.
//
// Both kinds use receiverOrganizationId (canonical, migration 0043) as the
// "directed at this org" signal, with a payload fallback for legacy rows.

// ---------------------------------------------------------------------------
// WIRED (sprint 5 PR-047 + sprint 4 PR-033 — 2026-05-27)
// S5 extension: decomiso badge + custody_episode proposals (2026-06-04).
// ---------------------------------------------------------------------------

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";

import { cases, db, organizations, petEvents, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";

const REASON_LABEL: Record<string, string> = {
  space_constraint: "Falta de espacio",
  specialization_needed: "Especialización requerida",
  network_redistribution: "Redistribución en network",
  shelter_closing: "Cierre operativo",
  post_adoption_failed_return: "Devolución post-adopción",
  org_to_org_handoff: "Handoff inter-organizacional",
  other: "Otro motivo",
};

const SEIZURE_MOTIVE_LABEL: Record<string, string> = {
  maltrato_fisico: "Maltrato físico",
  abandono_extremo: "Abandono extremo",
  acumulacion: "Acumulación",
  trafico: "Tráfico",
  sin_refugio_critico: "Sin refugio (crítico)",
  pelea_de_perros: "Pelea de perros",
  otro: "Otro motivo",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Pendiente de respuesta",
  closed: "Cerrada",
};

const CLOSED_REASON_LABEL: Record<string, string> = {
  resolved: "Aceptada",
  cancelled: "Rechazada / Cancelada",
  auto_expired: "Expirada",
};

export default async function OrgTransferenciasEntrantesPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  // -------------------------------------------------------------------------
  // 1. Routine cross-org transfer proposals (custody_transfer_handshake)
  // -------------------------------------------------------------------------
  // Cases where receiverOrganizationId = this org (canonical, migration 0043),
  // with payload fallback for legacy rows.
  const handshakeRows = await db
    .select({
      caseId: cases.id,
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      status: cases.status,
      closedReason: cases.closedReason,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      petName: pets.name,
      reason: sql<string | null>`(${petEvents.payload}->>'reason')`.as("reason"),
      notes: sql<string | null>`(${petEvents.payload}->>'notes')`.as("notes"),
      senderOrgName: organizations.displayName,
      senderOrgType: organizations.orgType,
      // seizure_motive not applicable for handshakes; NULL here.
      seizureMotive: sql<string | null>`NULL`.as("seizure_motive"),
    })
    .from(cases)
    .innerJoin(
      petEvents,
      and(eq(petEvents.caseId, cases.id), eq(petEvents.eventType, "custody_transfer_proposed")),
    )
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .leftJoin(organizations, eq(organizations.id, cases.openedByOrganizationId))
    .where(
      and(
        eq(cases.caseKind, "custody_transfer_handshake"),
        or(
          eq(cases.receiverOrganizationId, organization.id),
          and(
            isNull(cases.receiverOrganizationId),
            sql`${petEvents.payload}->>'to_organization_id' = ${organization.id}`,
          ),
        ),
      ),
    )
    .orderBy(desc(cases.openedAt))
    .limit(200);

  // -------------------------------------------------------------------------
  // 2. Decomiso handoff proposals (custody_episode opened by sanitary_authority)
  // -------------------------------------------------------------------------
  // Discriminator: caseKind='custody_episode' + opener.orgType='sanitary_authority'.
  // The seizure_motive comes from the shelter_intake_recorded event payload.
  // We join on the intake event to pull the motive; custody_transfer_proposed
  // is also present but we don't need it for display (the case itself IS the
  // proposal — the custody_episode case represents the in-flight handoff).
  const decommissaRows = await db
    .select({
      caseId: cases.id,
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      status: cases.status,
      closedReason: cases.closedReason,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      petName: pets.name,
      reason: sql<string | null>`NULL`.as("reason"),
      notes: sql<string | null>`NULL`.as("notes"),
      senderOrgName: organizations.displayName,
      senderOrgType: organizations.orgType,
      seizureMotive: sql<string | null>`(${petEvents.payload}->>'seizure_motive')`.as(
        "seizure_motive",
      ),
    })
    .from(cases)
    .innerJoin(
      organizations,
      and(
        eq(organizations.id, cases.openedByOrganizationId),
        eq(organizations.orgType, "sanitary_authority"),
      ),
    )
    .innerJoin(
      petEvents,
      and(eq(petEvents.caseId, cases.id), eq(petEvents.eventType, "shelter_intake_recorded")),
    )
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .where(
      and(eq(cases.caseKind, "custody_episode"), eq(cases.receiverOrganizationId, organization.id)),
    )
    .orderBy(desc(cases.openedAt))
    .limit(200);

  // Merge and sort by openedAt desc.
  const allRows = [...handshakeRows, ...decommissaRows].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}`}
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver al panel
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
            Transferencias entrantes
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Propuestas dirigidas a {organization.displayName}.
          </p>
        </header>

        <nav className="text-xs text-gob-text-muted  flex gap-3">
          <Link href={`/org/${orgToken}/transferencias`} className="hover:text-gob-text ">
            ← Salientes
          </Link>
          <span className="font-medium text-gob-text ">Entrantes</span>
        </nav>

        {allRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gob-border-strong  p-8 text-center text-sm text-gob-text-muted">
            No tenés propuestas de transferencia entrantes.
          </p>
        ) : (
          <ul className="space-y-3">
            {allRows.map((r) => {
              const isDecomiso =
                r.caseKind === "custody_episode" && r.senderOrgType === "sanitary_authority";

              return (
                <li
                  key={r.caseId}
                  className={`rounded-lg border p-4 space-y-2 ${
                    isDecomiso ? "border-gob-danger bg-gob-danger/5 " : "border-gob-border "
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      {/* DECOMISO badge — rendered only for state seizure handoffs */}
                      {isDecomiso && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-gob-danger text-white ">
                            DECOMISO
                          </span>
                          <span className="text-xs text-gob-danger  font-medium">
                            Custodia estatal — Ley 14.346
                          </span>
                        </div>
                      )}

                      <p className="text-sm font-medium text-gob-text ">
                        {r.petName ?? "(sin pet)"}
                      </p>

                      <p className="text-xs text-gob-text-muted ">
                        {isDecomiso ? (
                          <>
                            Autoridad sanitaria: <strong>{r.senderOrgName ?? "—"}</strong>
                            {r.seizureMotive
                              ? ` · Motivo: ${SEIZURE_MOTIVE_LABEL[r.seizureMotive] ?? r.seizureMotive}`
                              : ""}
                          </>
                        ) : (
                          <>
                            De <strong>{r.senderOrgName ?? "—"}</strong>
                            {r.reason ? ` · ${REASON_LABEL[r.reason] ?? r.reason}` : ""}
                          </>
                        )}
                      </p>

                      <p className="text-xs text-gob-text-muted ">
                        Recibida el {formatDate(r.openedAt)}
                        {r.closedAt ? ` · Resuelta el ${formatDate(r.closedAt)}` : ""}
                      </p>

                      {!isDecomiso && r.notes ? (
                        <p className="mt-1 text-xs italic text-gob-text-gray ">"{r.notes}"</p>
                      ) : null}

                      {isDecomiso && r.status === "open" && (
                        <p className="text-xs text-gob-danger  font-medium">
                          Tenés 7 días para aceptar o rechazar esta custodia estatal.
                        </p>
                      )}
                    </div>

                    <span
                      className={`shrink-0 text-xs uppercase tracking-wider px-2 py-0.5 rounded ${
                        r.status === "open"
                          ? isDecomiso
                            ? "bg-gob-danger/10 text-gob-danger  "
                            : "bg-gob-warning/10 text-gob-warning-text  "
                          : "bg-gob-surface-alt text-gob-text-gray  "
                      }`}
                    >
                      {r.status === "closed" && r.closedReason
                        ? (CLOSED_REASON_LABEL[r.closedReason] ?? STATUS_LABEL[r.status])
                        : (STATUS_LABEL[r.status] ?? r.status)}
                    </span>
                  </div>

                  <Link
                    href={`/casos/${r.publicCode}`}
                    className="inline-block text-xs underline text-gob-text-gray  hover:text-gob-text"
                  >
                    Ver caso →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
