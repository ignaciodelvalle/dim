// Proposal detail — Libreta Nacional redesign.
// ProposalActions (client component) unchanged.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
import { db, fosterProposals, organizations, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { sexLabel, speciesLabel } from "@/lib/utils/format";
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
    .select({ proposal: fosterProposals, pet: pets, org: organizations, proposer: profiles })
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
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta/transitos/propuestas"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Propuestas
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <p className="mb-[4px] font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
          {org.displayName} te propone cuidar a
        </p>
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          {pet.name}
        </h1>
        <p className="mt-[4px] text-[13px] text-[var(--color-ln-mute)]">
          {speciesLabel(pet.species)}
          {pet.breed && ` · ${pet.breed}`}
          {pet.sex && ` · ${sexLabel(pet.sex)}`}
        </p>
      </div>

      {/* Details card */}
      <LnCard className="mb-[20px]">
        <LnCardHead title="Detalles de la propuesta" />
        <LnCardBody>
          <dl className="flex flex-col gap-[10px]">
            <DetailRow label="Propuesto por">{proposer.displayName}</DetailRow>
            <DetailRow label="Duración estimada">
              {proposal.proposedDurationWeeks
                ? `${proposal.proposedDurationWeeks} semanas`
                : "Sin definir"}
            </DetailRow>
            <DetailRow label="Expira">
              {expires.toLocaleDateString("es-AR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </DetailRow>
            {proposal.proposedNotes && (
              <DetailRow label="Notas del refugio">
                <span className="whitespace-pre-wrap">{proposal.proposedNotes}</span>
              </DetailRow>
            )}
          </dl>
        </LnCardBody>
      </LnCard>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-[20px]">
          <LnCallout tone="warn" title="Avisos del matching">
            <ul className="mt-[6px] flex flex-col gap-[4px]">
              {warnings.map((w) => (
                <li key={w} className="text-sm">
                  · {w}
                </li>
              ))}
            </ul>
          </LnCallout>
        </div>
      )}

      {/* Actions */}
      {proposal.status === "pending" ? (
        <ProposalActions
          proposalPublicToken={proposal.publicToken}
          petName={pet.name}
          orgName={org.displayName}
        />
      ) : (
        <p className="text-[13px] text-[var(--color-ln-mute)]">
          Esta propuesta está en estado <strong>{proposal.status}</strong>.
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
        {label}
      </dt>
      <dd className="mt-[2px] text-[13px] text-[var(--color-ln-ink-2)]">{children}</dd>
    </div>
  );
}
