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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-6">
        <Link
          href="/cuenta/transitos/propuestas"
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver a propuestas
        </Link>

        <header className="space-y-2">
          <p className="text-sm text-gob-text-muted">{org.displayName} te propone cuidar a</p>
          <h1 className="text-2xl font-semibold text-gob-text ">{pet.name}</h1>
          <p className="text-sm text-gob-text-gray ">
            {pet.species}
            {pet.breed && ` · ${pet.breed}`}
            {pet.sex && ` · ${pet.sex}`}
          </p>
        </header>

        <section className="rounded-lg border border-gob-border-strong  p-4 space-y-2 text-sm">
          <p>
            <span className="text-gob-text-muted">Propuesto por:</span> {proposer.displayName}
          </p>
          <p>
            <span className="text-gob-text-muted">Duración estimada:</span>{" "}
            {proposal.proposedDurationWeeks
              ? `${proposal.proposedDurationWeeks} semanas`
              : "Sin definir"}
          </p>
          <p>
            <span className="text-gob-text-muted">Expira:</span>{" "}
            {expires.toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {proposal.proposedNotes && (
            <div>
              <p className="text-gob-text-muted">Notas del refugio:</p>
              <p className="text-gob-text  whitespace-pre-wrap mt-1">{proposal.proposedNotes}</p>
            </div>
          )}
        </section>

        {warnings.length > 0 && (
          <section className="rounded-lg border border-gob-warning bg-gob-warning/10   p-4 space-y-2">
            <p className="text-sm font-medium text-gob-warning-text ">Avisos del matching</p>
            <ul className="text-sm text-gob-warning-text  space-y-1 list-disc pl-5">
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
          <p className="text-sm text-gob-text-muted">
            Esta propuesta está en estado <strong>{proposal.status}</strong>.
          </p>
        )}
      </div>
    </main>
  );
}
