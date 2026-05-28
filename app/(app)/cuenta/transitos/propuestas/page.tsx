import Link from "next/link";

import { db, fosterProposals, organizations, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { desc, eq, inArray } from "drizzle-orm";

export default async function PropuestasInboxPage() {
  const { user } = await requireUserOrRedirect();

  const proposals = await db
    .select({
      proposal: fosterProposals,
      pet: pets,
      org: organizations,
    })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(organizations, eq(organizations.id, fosterProposals.organizationId))
    .where(eq(fosterProposals.volunteerUserId, user.id))
    .orderBy(desc(fosterProposals.proposedAt));

  const active = proposals.filter((p) => p.proposal.status === "pending");
  const past = proposals.filter((p) => p.proposal.status !== "pending");

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto pt-10 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-gob-text ">Propuestas de tránsito</h1>
          <p className="mt-2 text-sm text-gob-text-gray ">
            Los refugios te proponen cuidar mascotas que tienen en custodia. Tenés 7 días para
            responder antes de que la propuesta expire.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gob-text ">Activas</h2>
          {active.length === 0 && (
            <p className="text-sm text-gob-text-muted ">No tenés propuestas pendientes.</p>
          )}
          <ul className="space-y-2">
            {active.map(({ proposal, pet, org }) => (
              <li
                key={proposal.id}
                className="rounded-lg border border-gob-border-strong  p-4 hover:bg-gob-surface-alt  transition-colors"
              >
                <Link
                  href={`/cuenta/transitos/propuestas/${proposal.publicToken}`}
                  className="block"
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="font-medium text-gob-text ">
                        {org.displayName}{" "}
                        <span className="text-gob-text-muted  font-normal">→ {pet.name}</span>
                      </p>
                      <p className="text-xs text-gob-text-muted  mt-1">
                        Especie: {pet.species}
                        {proposal.proposedDurationWeeks &&
                          ` · ${proposal.proposedDurationWeeks} sem.`}{" "}
                        · Expira{" "}
                        {new Date(proposal.expiresAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span className="text-xs text-gob-text-muted">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-gob-text ">Historial</h2>
            <ul className="space-y-2">
              {past.map(({ proposal, pet, org }) => (
                <li key={proposal.id} className="rounded-lg border border-gob-border  p-3 text-sm">
                  <p className="text-gob-text-gray ">
                    {org.displayName} · {pet.name} ·{" "}
                    <span
                      className={
                        proposal.status === "accepted" ? "text-gob-success " : "text-gob-text-muted"
                      }
                    >
                      {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                        proposal.status}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

const STATUS_LABELS = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
} as const;
