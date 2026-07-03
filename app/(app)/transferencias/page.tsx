// Transferencias hub — Libreta Nacional redesign.
// UX 3.1: added outgoing (Enviadas) section alongside the existing received view.

import Link from "next/link";

import { LnSectionHead } from "@/components/ui/DocElements";
import { db, petTransfers, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { speciesLabel } from "@/lib/utils/format";
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

  const recipientMatch = callerEmail
    ? or(
        eq(petTransfers.toOwnerId, user.id),
        and(isNull(petTransfers.toOwnerId), eq(petTransfers.toOwnerEmail, callerEmail)),
      )
    : eq(petTransfers.toOwnerId, user.id);

  // --- Received: active pending ---
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

  // --- Received: history ---
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

  // --- Outgoing: all transfers initiated by the current user ---
  // Mirror the received query pattern but filter on fromOwnerId = user.id.
  // We join the recipient profile (toOwnerId) to show the recipient name when resolved.
  const outgoingRows = await db
    .select({
      transfer: petTransfers,
      petName: pets.name,
      petToken: pets.publicToken,
      toDisplayName: profiles.displayName,
    })
    .from(petTransfers)
    .innerJoin(pets, eq(pets.id, petTransfers.petId))
    .leftJoin(profiles, eq(profiles.id, petTransfers.toOwnerId))
    .where(eq(petTransfers.fromOwnerId, user.id))
    .orderBy(desc(petTransfers.initiatedAt));

  return (
    <div className="mx-auto max-w-3xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Transferencias
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Transferencias de mascotas recibidas y enviadas.
        </p>
      </div>

      <div className="flex flex-col gap-[32px]">
        {/* ------------------------------------------------------------------ */}
        {/* RECIBIDAS                                                           */}
        {/* ------------------------------------------------------------------ */}
        <section aria-labelledby="recibidas-heading">
          <h2
            id="recibidas-heading"
            className="mb-[16px] font-[var(--font-ln-mono)] text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-ink-2)]"
          >
            Recibidas
          </h2>

          {/* Pending */}
          <div className="flex flex-col gap-[20px]">
            <div>
              <LnSectionHead
                num="01"
                title="Pendientes"
                meta={activeRows.length > 0 ? `${activeRows.length}` : undefined}
                className="mb-[16px]"
              />
              {activeRows.length === 0 ? (
                <p className="text-[13px] text-[var(--color-ln-mute)]">
                  No tenés transferencias pendientes.
                </p>
              ) : (
                <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
                  {activeRows.map(
                    ({ transfer, petName, petToken, petSpecies, fromDisplayName }) => (
                      <Link
                        key={transfer.id}
                        href={`/transferencias/${transfer.publicToken}`}
                        className="flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[16px] py-[14px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-[var(--font-ln-serif)] text-[15px] font-semibold text-[var(--color-ln-ink)]">
                            {petName}{" "}
                            <span className="font-[var(--font-ln-sans)] text-[13px] font-normal text-[var(--color-ln-mute)]">
                              ({speciesLabel(petSpecies)})
                            </span>
                          </p>
                          {fromDisplayName && (
                            <p className="mt-[2px] text-sm text-[var(--color-ln-mute)]">
                              De: {fromDisplayName}
                            </p>
                          )}
                          <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                            Vence{" "}
                            {new Date(transfer.expiresAt).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-[8px]">
                          <span className="inline-flex items-center rounded-[2px] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-warn)]">
                            Pendiente
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-base text-[var(--color-ln-mute)]"
                          >
                            ›
                          </span>
                        </div>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* History */}
            {historyRows.length > 0 && (
              <div>
                <LnSectionHead num="02" title="Historial" className="mb-[16px]" />
                <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
                  {historyRows.map(({ transfer, petName, fromDisplayName }) => (
                    <Link
                      key={transfer.id}
                      href={`/transferencias/${transfer.publicToken}`}
                      className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[12px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
                    >
                      <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                        {petName}
                        {fromDisplayName && (
                          <span className="text-[var(--color-ln-mute)]"> · {fromDisplayName}</span>
                        )}
                        {" · "}
                        <span
                          className={
                            transfer.status === "accepted"
                              ? "text-[var(--color-ln-ok)]"
                              : "text-[var(--color-ln-mute)]"
                          }
                        >
                          {STATUS_LABELS[transfer.status] ?? transfer.status}
                        </span>
                      </p>
                      <span
                        aria-hidden="true"
                        className="flex-shrink-0 text-md text-[var(--color-ln-mute)]"
                      >
                        ›
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* ENVIADAS                                                            */}
        {/* ------------------------------------------------------------------ */}
        <section aria-labelledby="enviadas-heading">
          <h2
            id="enviadas-heading"
            className="mb-[16px] font-[var(--font-ln-mono)] text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-ink-2)]"
          >
            Enviadas
          </h2>

          <LnSectionHead num="03" title="Mis transferencias enviadas" className="mb-[16px]" />

          {outgoingRows.length === 0 ? (
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              No enviaste ninguna transferencia todavía.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
              {outgoingRows.map(({ transfer, petName, toDisplayName }) => (
                <Link
                  key={transfer.id}
                  href={`/transferencias/${transfer.publicToken}`}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[12px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                      {petName}
                      {(toDisplayName ?? transfer.toOwnerEmail) && (
                        <span className="text-[var(--color-ln-mute)]">
                          {" · "}
                          Para: {toDisplayName ?? transfer.toOwnerEmail}
                        </span>
                      )}
                    </p>
                    <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                      {new Date(transfer.initiatedAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-[8px]">
                    <span
                      className={
                        transfer.status === "pending"
                          ? "inline-flex items-center rounded-[2px] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-warn)]"
                          : transfer.status === "accepted"
                            ? "inline-flex items-center rounded-[2px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-ok)]"
                            : "inline-flex items-center rounded-[2px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
                      }
                    >
                      {STATUS_LABELS[transfer.status] ?? transfer.status}
                    </span>
                    <span aria-hidden="true" className="text-md text-[var(--color-ln-mute)]">
                      ›
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
