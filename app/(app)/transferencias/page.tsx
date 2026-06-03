// Transfers inbox — /transferencias
//
// Lists all incoming pet ownership transfers for the authenticated user:
//   - Active (pending) — transfers awaiting acceptance or rejection.
//   - History — resolved transfers (accepted / rejected / expired / cancelled).
//
// The inbox query uses a dual OR to handle both cases:
//   1. Registered recipient: toOwnerId = user.id
//   2. Not-yet-registered recipient: toOwnerId IS NULL AND toOwnerEmail = caller's email
//
// This mirrors acceptPetTransferAction / rejectPetTransferAction in
// app/actions/pet-transfer.ts and countPendingTransfers in lib/owner-dashboard.ts.

import Link from "next/link";

import { db, petTransfers, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

const HISTORY_STATUSES = ["accepted", "rejected", "expired", "cancelled"] as const;

export default async function TransferenciasHubPage() {
  const { supabase, user } = await requireUserOrRedirect();

  const { data: authData } = await supabase.auth.getUser();
  const callerEmail = (authData?.user?.email ?? "").toLowerCase();

  // Recipient match predicate: always match by toOwnerId; include the email
  // branch only when callerEmail is non-empty (defense-in-depth against
  // phone-only / OAuth-without-email accounts where email could be "").
  const recipientMatch = callerEmail
    ? or(
        eq(petTransfers.toOwnerId, user.id),
        and(isNull(petTransfers.toOwnerId), eq(petTransfers.toOwnerEmail, callerEmail)),
      )
    : eq(petTransfers.toOwnerId, user.id);

  // Active: pending transfers where the caller is the intended recipient.
  // Dual OR: resolved recipients (toOwnerId set) OR unregistered recipients
  // (toOwnerId NULL but email matches).
  const activeRows = await db
    .select({
      transfer: petTransfers,
      petName: pets.name,
      petToken: pets.publicToken,
      petSpecies: pets.species,
      fromDisplayName: profiles.displayName,
    })
    .from(petTransfers)
    .innerJoin(pets, eq(pets.id, petTransfers.petId))
    .leftJoin(profiles, eq(profiles.id, petTransfers.fromOwnerId))
    .where(and(eq(petTransfers.status, "pending"), recipientMatch))
    .orderBy(desc(petTransfers.initiatedAt));

  // History: resolved transfers.  Once accepted/rejected the toOwnerId is
  // always resolved, so matching by userId alone is sufficient.  We
  // additionally include the email OR for symmetry (e.g. edge-case where a
  // row was rejected before the user ever logged in and toOwnerId stayed NULL).
  const historyRows = await db
    .select({
      transfer: petTransfers,
      petName: pets.name,
      petToken: pets.publicToken,
      fromDisplayName: profiles.displayName,
    })
    .from(petTransfers)
    .innerJoin(pets, eq(pets.id, petTransfers.petId))
    .leftJoin(profiles, eq(profiles.id, petTransfers.fromOwnerId))
    .where(and(inArray(petTransfers.status, [...HISTORY_STATUSES]), recipientMatch))
    .orderBy(desc(petTransfers.respondedAt));

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-3xl mx-auto pt-10 space-y-8">
        <header>
          <Link
            href="/mis-mascotas"
            className="inline-block text-sm text-gob-text-gray underline underline-offset-4 mb-4"
          >
            ← Mis mascotas
          </Link>
          <h1 className="text-2xl font-semibold text-gob-text">Transferencias recibidas</h1>
          <p className="mt-2 text-sm text-gob-text-gray">
            Mascotas que alguien quiere transferirte. Tenés 7 días para aceptar o rechazar cada
            propuesta.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gob-text">Pendientes</h2>
          {activeRows.length === 0 ? (
            <p className="text-sm text-gob-text-muted">No tenés transferencias pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {activeRows.map(({ transfer, petName, petToken, petSpecies, fromDisplayName }) => (
                <li
                  key={transfer.id}
                  className="rounded-lg border border-gob-border-strong p-4 hover:bg-gob-surface-alt transition-colors"
                >
                  <Link href={`/transferencias/${transfer.publicToken}`} className="block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium text-gob-text">
                          {petName}{" "}
                          <span className="text-gob-text-muted font-normal text-sm">
                            ({petSpecies})
                          </span>
                        </p>
                        {fromDisplayName && (
                          <p className="text-xs text-gob-text-muted">De: {fromDisplayName}</p>
                        )}
                        <p className="text-xs text-gob-text-muted">
                          Vence{" "}
                          {new Date(transfer.expiresAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 inline-block rounded-full bg-gob-warning/20 text-gob-warning text-xs font-medium px-2 py-0.5">
                        Pendiente
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {historyRows.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-gob-text">Historial</h2>
            <ul className="space-y-2">
              {historyRows.map(({ transfer, petName, fromDisplayName }) => (
                <li key={transfer.id} className="rounded-lg border border-gob-border p-3 text-sm">
                  <Link
                    href={`/transferencias/${transfer.publicToken}`}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <p className="text-gob-text-gray">
                      {petName}
                      {fromDisplayName && (
                        <span className="text-gob-text-muted font-normal">
                          {" "}
                          · {fromDisplayName}
                        </span>
                      )}
                      {" · "}
                      <span
                        className={
                          transfer.status === "accepted"
                            ? "text-gob-success"
                            : "text-gob-text-muted"
                        }
                      >
                        {STATUS_LABELS[transfer.status] ?? transfer.status}
                      </span>
                    </p>
                    <span className="shrink-0 text-xs text-gob-text-muted">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
