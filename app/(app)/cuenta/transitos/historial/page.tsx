import Link from "next/link";

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

  // Past foster ownerships of this user.
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

  // Non-accepted proposals (rejected, expired, cancelled).
  const noProposals = await db
    .select({
      proposal: fosterProposals,
      pet: pets,
      org: organizations,
    })
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto pt-10 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-gob-text ">Historial de tránsitos</h1>
          <p className="mt-2 text-sm text-gob-text-gray ">
            Tránsitos terminados y propuestas que no llegaron a aceptarse.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gob-text ">Tránsitos finalizados</h2>
          {past.length === 0 ? (
            <p className="text-sm text-gob-text-muted">Todavía no tenés tránsitos finalizados.</p>
          ) : (
            <ul className="space-y-2">
              {past.map(({ ownership, pet }) => (
                <li
                  key={ownership.id}
                  className="rounded-lg border border-gob-border  p-3 text-sm flex items-baseline justify-between gap-3"
                >
                  <div>
                    <Link
                      href={`/mis-mascotas/${pet.publicToken}`}
                      className="font-medium hover:underline"
                    >
                      {pet.name}
                    </Link>
                    <p className="text-xs text-gob-text-muted mt-0.5">
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
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gob-text ">Propuestas no concretadas</h2>
          {noProposals.length === 0 ? (
            <p className="text-sm text-gob-text-muted">No hay propuestas en el historial.</p>
          ) : (
            <ul className="space-y-2">
              {noProposals.map(({ proposal, pet, org }) => (
                <li key={proposal.id} className="rounded-lg border border-gob-border  p-3 text-sm">
                  <p>
                    {org.displayName} · {pet.name} ·{" "}
                    <span className="text-gob-text-muted">
                      {STATUS_LABELS[proposal.status as keyof typeof STATUS_LABELS] ??
                        proposal.status}
                    </span>
                    {proposal.rejectionReason && ` · motivo: ${proposal.rejectionReason}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pt-4 border-t border-gob-border  text-sm">
          <Link href="/cuenta/transitos/activos" className="underline hover:text-gob-text ">
            ← Tránsitos activos
          </Link>
        </footer>
      </div>
    </main>
  );
}
