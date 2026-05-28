// Receiver inbox of incoming cross-org transfer proposals.
// Each row is a handshake case where the canonical receiver_organization_id
// column (migration 0043) matches this org, with a payload fallback for
// legacy rows that pre-date the backfill.

// ---------------------------------------------------------------------------
// WIRED (sprint 5 PR-047 + sprint 4 PR-033 — 2026-05-27)
//
// Reachable from the org dashboard "Transferencias pendientes" count card.
// Sender side is wired by PR-033 (ProposeTransferForm as wizard). Receiver
// accept/reject still lives in the case detail page (/casos/[publicCode]) —
// folding it inline here is a future improvement.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
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

  // Cases whose canonical receiver org is this org (column added in
  // migration 0043). Fall back to the proposal payload for legacy rows
  // that pre-date the backfill (receiverOrganizationId IS NULL).
  const rows = await db
    .select({
      caseId: cases.id,
      publicCode: cases.publicCode,
      status: cases.status,
      closedReason: cases.closedReason,
      openedAt: cases.openedAt,
      closedAt: cases.closedAt,
      petName: pets.name,
      reason: sql<string | null>`(${petEvents.payload}->>'reason')`.as("reason"),
      notes: sql<string | null>`(${petEvents.payload}->>'notes')`.as("notes"),
      senderOrgName: organizations.displayName,
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

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gob-border-strong  p-8 text-center text-sm text-gob-text-muted">
            No tenés propuestas de transferencia entrantes.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.caseId} className="rounded-lg border border-gob-border  p-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gob-text ">{r.petName ?? "(sin pet)"}</p>
                    <p className="text-xs text-gob-text-muted ">
                      De <strong>{r.senderOrgName ?? "—"}</strong>
                      {r.reason ? ` · ${REASON_LABEL[r.reason] ?? r.reason}` : ""}
                    </p>
                    <p className="text-xs text-gob-text-muted ">
                      Recibida el {formatDate(r.openedAt)}
                      {r.closedAt ? ` · Resuelta el ${formatDate(r.closedAt)}` : ""}
                    </p>
                    {r.notes ? (
                      <p className="mt-1 text-xs italic text-gob-text-gray ">“{r.notes}”</p>
                    ) : null}
                  </div>
                  <span
                    className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === "open"
                        ? "bg-gob-warning/10 text-gob-warning-text  "
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
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
