// Org pet detail page — shows the animal's key data and mounts the
// ?sheet= action flows (elegibilidad, reemplazar-microchip, fin-transito,
// devolver-al-dueno) via OrgPetSheetMounter.
//
// Only accessible to org members with at least `pet.read_held` capability
// who have an active ownership row (shelter_custody or foster) on this pet.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { fetchPendingOwnerReturnProposalForOrg } from "@/app/actions/return-to-owner";
import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpCrumbs,
  OpStateBadge,
} from "@/components/ui/dashboard";

import { OrgPetSheetMounter } from "./OrgPetSheetMounter";
import { OwnerReturnProposalCard } from "./OwnerReturnProposalCard";

export default async function OrgPetDetailPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);

  if (!granted.has("pet.read_held") && membership.role !== "admin") {
    return (
      <main className="min-h-screen bg-ln-op-page p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Permiso requerido</h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Para ver la ficha del animal necesitás el permiso{" "}
            <code className="text-[11px]">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] hover:bg-ln-op-azul-700"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  // Load the pet, confirming the org has an active ownership row on it.
  const [petRow] = await db
    .select({ pet: pets, ownershipRole: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
        inArray(ownerships.role, ["shelter_custody", "foster", "owner", "co_owner", "caretaker"]),
      ),
    )
    .limit(1);

  if (!petRow) notFound();
  const { pet, ownershipRole } = petRow;

  // Active foster name (for the fin-transito sheet).
  const [fosterRow] = await db
    .select({ displayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  const fosterName = fosterRow?.displayName ?? null;

  // Pending return proposal check (for devolver-al-dueno sheet).
  let canProposeReturn = false;
  if (
    pet.status === "lost" &&
    ownershipRole === "shelter_custody" &&
    granted.has("custody.transfer")
  ) {
    const [latestProposal] = await db
      .select({ id: petEvents.id, occurredAt: petEvents.occurredAt })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(1);

    if (!latestProposal) {
      canProposeReturn = true;
    } else {
      const [subsequentTransfer] = await db
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "custody_transferred"),
            gt(petEvents.occurredAt, latestProposal.occurredAt),
          ),
        )
        .limit(1);
      canProposeReturn = !!subsequentTransfer;
    }
  }

  // Pending owner-initiated return proposal (owner proposes returning the pet to this org).
  // Surfaced when the org has custody.transfer capability. The proposal is for pets the
  // org previously adopted out — the adopter now wants to return them.
  let pendingOwnerReturn: {
    ownerDisplayName: string | null;
    proposedAt: string;
    proposalNotes: string | null;
  } | null = null;

  if (granted.has("custody.transfer")) {
    const pending = await fetchPendingOwnerReturnProposalForOrg(pet.id, organization.id);
    if (pending) {
      const proposalPayload = pending.proposal.payload as Record<string, unknown>;
      const notes = (proposalPayload.notes as string | null) ?? null;
      const proposedAt =
        (proposalPayload.proposed_at as string | null) ?? pending.proposal.occurredAt.toISOString();

      // Resolve owner display name.
      const [ownerProfile] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, pending.ownerUserId))
        .limit(1);

      pendingOwnerReturn = {
        ownerDisplayName: ownerProfile?.displayName ?? null,
        proposedAt,
        proposalNotes: notes,
      };
    }
  }

  const canonicalIds = await fetchActiveIdentifications(pet.id);

  const canManageEligibility = granted.has("intake.create") && ownershipRole === "shelter_custody";
  const canReplaceMicrochip = granted.has("event.write");
  const canEndFoster = granted.has("foster.end") && !!fosterName;
  const speciesLabel = pet.species === "dog" ? "Perro" : pet.species === "cat" ? "Gato" : "Otro";

  const eligibility = {
    eligible: pet.adoptionEligible,
    reason: pet.adoptionIneligibleReason,
    notes: pet.adoptionIneligibleReasonNotes,
    until: pet.adoptionIneligibleUntil
      ? new Date(pet.adoptionIneligibleUntil).toISOString().slice(0, 10)
      : null,
  };

  // Derive OpStateBadge state for the pet's adoption pipeline state.
  function adoptionState(): "published" | "paused" | "draft" | null {
    if (pet.adoptionListedAt && !pet.adoptionListingPausedAt) return "published";
    if (pet.adoptionListedAt && pet.adoptionListingPausedAt) return "paused";
    if (pet.adoptionEligible === true) return "draft";
    return null;
  }
  const adState = adoptionState();

  return (
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <OpCrumbs
            items={[{ label: "Mascotas", href: `/org/${orgToken}/mascotas` }, { label: pet.name }]}
          />
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ln-op-mute">
                {organization.displayName}
              </p>
              <h1 className="text-[22px] font-semibold text-ln-op-ink">{pet.name}</h1>
              <p className="text-[13px] text-ln-op-ink-2">
                {speciesLabel}
                {pet.breed ? ` · ${pet.breed}` : ""}
                {pet.color ? ` · ${pet.color}` : ""}
              </p>
            </div>
            {adState && <OpStateBadge state={adState} />}
          </div>
        </header>

        {/* Pet info */}
        <OpCard>
          <OpCardHead title="Datos del animal" />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ln-op-mute">Token público</dt>
              <dd>
                <OpCodeBadge tone="neutral">{pet.publicToken}</OpCodeBadge>
              </dd>
              <dt className="text-ln-op-mute">Estado</dt>
              <dd className="text-ln-op-ink capitalize">
                {pet.status === "lost"
                  ? "Perdida"
                  : pet.status === "active"
                    ? "Activa"
                    : "Fallecida"}
              </dd>
              <dt className="text-ln-op-mute">Rol de custodia</dt>
              <dd className="text-ln-op-ink">
                {ownershipRole === "shelter_custody"
                  ? "Custodia del refugio"
                  : ownershipRole === "foster"
                    ? "Tránsito"
                    : ownershipRole}
              </dd>
              {canonicalIds.microchip && (
                <>
                  <dt className="text-ln-op-mute">Microchip</dt>
                  <dd>
                    <OpCodeBadge tone="blue">{canonicalIds.microchip.code}</OpCodeBadge>
                  </dd>
                </>
              )}
              {fosterName && (
                <>
                  <dt className="text-ln-op-mute">En tránsito con</dt>
                  <dd className="text-ln-op-ink">{fosterName}</dd>
                </>
              )}
            </dl>
          </OpCardBody>
        </OpCard>

        {/* Action buttons */}
        {(canManageEligibility || canReplaceMicrochip || canEndFoster || canProposeReturn) && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ln-op-mute">
              Acciones
            </h2>
            <div className="flex flex-wrap gap-2">
              {canManageEligibility && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=elegibilidad`}
                  className="inline-block text-[12px] px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  {pet.adoptionEligible === true
                    ? "Elegibilidad · Apta ✓"
                    : pet.adoptionEligible === false
                      ? "Elegibilidad · NO apta"
                      : "Elegibilidad"}
                </Link>
              )}
              {canReplaceMicrochip && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=reemplazar-microchip`}
                  className="inline-block text-[12px] px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  Reemplazar microchip
                </Link>
              )}
              {canEndFoster && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=fin-transito`}
                  className="inline-block text-[12px] px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  Cerrar tránsito
                </Link>
              )}
              {canProposeReturn && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=devolver-al-dueno`}
                  className="inline-block text-[12px] px-3 py-1.5 rounded-[4px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700"
                >
                  Devolver al dueño
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Pending owner-initiated return proposal */}
        {pendingOwnerReturn && (
          <OwnerReturnProposalCard
            orgToken={orgToken}
            petPublicToken={publicToken}
            petName={pet.name}
            ownerDisplayName={pendingOwnerReturn.ownerDisplayName}
            proposedAt={pendingOwnerReturn.proposedAt}
            proposalNotes={pendingOwnerReturn.proposalNotes}
          />
        )}

        {/* Sheet mounter */}
        <Suspense>
          <OrgPetSheetMounter
            orgToken={orgToken}
            petPublicToken={publicToken}
            petName={pet.name}
            eligibility={eligibility}
            currentChip={canonicalIds.microchip?.code ?? null}
            fosterName={fosterName}
            canProposeReturn={canProposeReturn}
          />
        </Suspense>

        <footer className="pt-4 border-t border-ln-op-line">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-[12px] text-ln-op-mute underline hover:text-ln-op-ink"
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
