import Link from "next/link";
import { notFound } from "next/navigation";

import { db, fosterProposals, organizations, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";

import { ProposalActions } from "./ProposalActions";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalToken: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { proposalToken } = await params;

  const [row] = await db
    .select({
      proposal: fosterProposals,
      pet: pets,
      org: organizations,
      proposer: profiles,
    })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(organizations, eq(organizations.id, fosterProposals.organizationId))
    .innerJoin(profiles, eq(profiles.id, fosterProposals.proposedByUserId))
    .where(eq(fosterProposals.publicToken, proposalToken))
    .limit(1);

  if (!row) notFound();
  if (row.proposal.volunteerUserId !== user.id) notFound();

  const { proposal, pet, org, proposer } = row;
  const expires = new Date(proposal.expiresAt);
  const warnings = (proposal.matchWarnings ?? []) as string[];

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-6">
        <Link
          href="/cuenta/transitos/propuestas"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a propuestas
        </Link>

        <header className="space-y-2">
          <p className="text-sm text-neutral-500">{org.displayName} te propone cuidar a</p>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {pet.species}
            {pet.breed && ` · ${pet.breed}`}
            {pet.sex && ` · ${pet.sex}`}
          </p>
        </header>

        <section className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-2 text-sm">
          <p>
            <span className="text-neutral-500">Propuesto por:</span> {proposer.displayName}
          </p>
          <p>
            <span className="text-neutral-500">Duración estimada:</span>{" "}
            {proposal.proposedDurationWeeks
              ? `${proposal.proposedDurationWeeks} semanas`
              : "Sin definir"}
          </p>
          <p>
            <span className="text-neutral-500">Expira:</span>{" "}
            {expires.toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {proposal.proposedNotes && (
            <div>
              <p className="text-neutral-500">Notas del refugio:</p>
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap mt-1">
                {proposal.proposedNotes}
              </p>
            </div>
          )}
        </section>

        {warnings.length > 0 && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Avisos del matching
            </p>
            <ul className="text-sm text-amber-900 dark:text-amber-100 space-y-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        {proposal.status === "pending" ? (
          <ProposalActions
            proposalPublicToken={proposal.publicToken}
            petName={pet.name}
            orgName={org.displayName}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            Esta propuesta está en estado <strong>{proposal.status}</strong>.
          </p>
        )}
      </div>
    </main>
  );
}
