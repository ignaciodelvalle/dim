// Historial de tránsitos — Libreta Nacional redesign.

import Link from "next/link";

import { LnSectionHead } from "@/components/ui/DocElements";
import { db, fosterProposals, organizations, ownerships, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

const STATUS_LABELS = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
} as const;

export default async function TransitosHistorialPage() {
  const { user } = await requireUserOrRedirect();

  const past = await db
    .select({ ownership: ownerships, pet: pets })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "foster"),
        isNotNull(ownerships.endedAt),
      ),
    )
    .orderBy(desc(ownerships.endedAt));

  const noProposals = await db
    .select({ proposal: fosterProposals, pet: pets, org: organizations })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(organizations, eq(organizations.id, fosterProposals.organizationId))
    .where(
      and(
        eq(fosterProposals.volunteerUserId, user.id),
        ne(fosterProposals.status, "pending"),
        ne(fosterProposals.status, "accepted"),
      ),
    )
    .orderBy(desc(fosterProposals.proposedAt));

  return (
    <div className="mx-auto max-w-3xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Historial de tránsitos
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Tránsitos terminados y propuestas que no llegaron a aceptarse.
        </p>
      </div>

      <div className="flex flex-col gap-[32px]">
        {/* Finalized */}
        <section>
          <LnSectionHead num="01" title="Tránsitos finalizados" className="mb-[16px]" />
          {past.length === 0 ? (
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              Todavía no tenés tránsitos finalizados.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
              {past.map(({ ownership, pet }) => (
                <div
                  key={ownership.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[12px] last:border-b-0"
                >
                  <div>
                    <Link
                      href={`/mis-mascotas/${pet.publicToken}`}
                      className="text-[13.5px] font-medium text-[var(--color-ln-ink)] no-underline hover:underline"
                    >
                      {pet.name}
                    </Link>
                    <p className="mt-[1px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                      {ownership.startedAt
                        ? new Date(ownership.startedAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : ""}
                      {ownership.endedAt &&
                        ` → ${new Date(ownership.endedAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Not-accepted proposals */}
        <section>
          <LnSectionHead num="02" title="Propuestas no concretadas" className="mb-[16px]" />
          {noProposals.length === 0 ? (
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              No hay propuestas en el historial.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
              {noProposals.map(({ proposal, pet, org }) => (
                <div
                  key={proposal.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[12px] last:border-b-0"
                >
                  <div>
                    <p className="text-[13px] font-medium text-[var(--color-ln-ink)]">
                      {pet.name}{" "}
                      <span className="font-normal text-[var(--color-ln-mute)]">
                        · {org.displayName}
                      </span>
                    </p>
                    {proposal.rejectionReason && (
                      <p className="mt-[2px] text-[11.5px] text-[var(--color-ln-mute)]">
                        Motivo: {proposal.rejectionReason}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
                    {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                      proposal.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Nav */}
      <div className="mt-[32px] border-t border-[var(--color-ln-line-2)] pt-[14px]">
        <Link
          href="/cuenta/transitos/activos"
          className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Tránsitos activos
        </Link>
      </div>
    </div>
  );
}
