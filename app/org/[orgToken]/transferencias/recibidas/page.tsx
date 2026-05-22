// Receiver inbox of incoming cross-org transfer proposals.
// Each row is a handshake case where the canonical receiver_organization_id
// column (migration 0043) matches this org, with a payload fallback for
// legacy rows that pre-date the backfill.

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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al panel
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Transferencias entrantes
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Propuestas dirigidas a {organization.displayName}.
          </p>
        </header>

        <nav className="text-xs text-neutral-500 dark:text-neutral-400 flex gap-3">
          <Link
            href={`/org/${orgToken}/transferencias`}
            className="hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Salientes
          </Link>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">Entrantes</span>
        </nav>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
            No tenés propuestas de transferencia entrantes.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.caseId}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {r.petName ?? "(sin pet)"}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      De <strong>{r.senderOrgName ?? "—"}</strong>
                      {r.reason ? ` · ${REASON_LABEL[r.reason] ?? r.reason}` : ""}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      Recibida el {formatDate(r.openedAt)}
                      {r.closedAt ? ` · Resuelta el ${formatDate(r.closedAt)}` : ""}
                    </p>
                    {r.notes ? (
                      <p className="mt-1 text-xs italic text-neutral-600 dark:text-neutral-400">
                        “{r.notes}”
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === "open"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {r.status === "closed" && r.closedReason
                      ? (CLOSED_REASON_LABEL[r.closedReason] ?? STATUS_LABEL[r.status])
                      : (STATUS_LABEL[r.status] ?? r.status)}
                  </span>
                </div>
                <Link
                  href={`/casos/${r.publicCode}`}
                  className="inline-block text-xs underline text-neutral-700 dark:text-neutral-300 hover:text-neutral-900"
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
