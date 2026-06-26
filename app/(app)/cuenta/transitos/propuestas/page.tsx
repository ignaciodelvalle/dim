// Propuestas de tránsito inbox — Libreta Nacional redesign.

import Link from "next/link";

import { LnSectionHead } from "@/components/ui/DocElements";
import { db, fosterProposals, organizations, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { desc, eq } from "drizzle-orm";

const STATUS_LABELS = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
} as const;

export default async function PropuestasInboxPage() {
  const { user } = await requireUserOrRedirect();

  const proposals = await db
    .select({ proposal: fosterProposals, pet: pets, org: organizations })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(organizations, eq(organizations.id, fosterProposals.organizationId))
    .where(eq(fosterProposals.volunteerUserId, user.id))
    .orderBy(desc(fosterProposals.proposedAt));

  const active = proposals.filter((p) => p.proposal.status === "pending");
  const past = proposals.filter((p) => p.proposal.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta/transitos"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Tránsitos
      </Link>

      {/* Header */}
      <div className="mb-[24px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Propuestas de tránsito
          </h1>
          <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
            Los refugios te proponen cuidar mascotas que tienen en custodia. Tenés 7 días para
            responder antes de que la propuesta expire.
          </p>
        </div>
        <Link
          href="/cuenta/ofrecerme-como-transito"
          className="mt-[4px] flex-shrink-0 rounded-[3px] bg-[var(--color-ln-azul)] px-[14px] py-[8px] font-[var(--font-ln-sans)] text-[12.5px] font-semibold text-white no-underline hover:bg-[var(--color-ln-azul-700)]"
        >
          Ofrecerme como tránsito
        </Link>
      </div>

      <div className="flex flex-col gap-[32px]">
        {/* Active */}
        <section>
          <LnSectionHead
            num="01"
            title="Activas"
            meta={
              active.length > 0
                ? `${active.length} pendiente${active.length !== 1 ? "s" : ""}`
                : undefined
            }
            className="mb-[16px]"
          />
          {active.length === 0 ? (
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              No tenés propuestas pendientes.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
              {active.map(({ proposal, pet, org }) => (
                <Link
                  key={proposal.id}
                  href={`/cuenta/transitos/propuestas/${proposal.publicToken}`}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[14px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
                >
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ln-ink)]">
                      {org.displayName}{" "}
                      <span className="font-normal text-[var(--color-ln-mute)]">→ {pet.name}</span>
                    </p>
                    <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                      {pet.species}
                      {proposal.proposedDurationWeeks &&
                        ` · ${proposal.proposedDurationWeeks} sem.`}{" "}
                      · Expira{" "}
                      {new Date(proposal.expiresAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 text-base text-[var(--color-ln-mute)]"
                  >
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* History */}
        {past.length > 0 && (
          <section>
            <LnSectionHead num="02" title="Historial" className="mb-[16px]" />
            <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
              {past.map(({ proposal, pet, org }) => (
                <div
                  key={proposal.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-ln-line-2)] px-[16px] py-[12px] last:border-b-0"
                >
                  <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                    {org.displayName} · {pet.name}
                  </p>
                  <span
                    className={`flex-shrink-0 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] ${
                      proposal.status === "accepted"
                        ? "text-[var(--color-ln-ok)]"
                        : "text-[var(--color-ln-mute)]"
                    }`}
                  >
                    {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                      proposal.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
