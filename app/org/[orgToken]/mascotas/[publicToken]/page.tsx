// Org pet detail page — shows the animal's key data and mounts the
// ?sheet= action flows (elegibilidad, reemplazar-microchip, fin-transito,
// devolver-al-dueno, vacuna, peso, nota) via OrgPetSheetMounter.
//
// Only accessible to org members with at least `pet.read_held` capability
// who have an active ownership row (shelter_custody or foster) on this pet.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { cases, db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { type PetSituationTone, derivePetSituation } from "@/lib/ui/pet-situation";
import { situationLabelForSex, speciesLabel } from "@/lib/utils/format";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { fetchPendingOwnerReturnProposalForOrg } from "@/src/modules/return-to-owner/application/proposal-queries";
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
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Permiso requerido
          </h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Para ver la ficha del animal necesitás el permiso{" "}
            <code className="text-[11px]">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded-[var(--radius-md)] bg-ln-op-azul text-white text-[13px] hover:bg-ln-op-azul-700"
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

  if (!petRow) {
    // The org has no active ownership row on this pet. Distinguish "the pet
    // genuinely does not exist" (→ 404) from "the pet exists but left this
    // org's custody" (e.g. a finalized adoption or transfer). The latter is a
    // stale in-app link and deserves a confirming state, not a bare dead-end
    // 404 (QA ALTO, 2026-07-16). Existence by publicToken is already public
    // (Tier-0 credential, /p/[token]), so this leaks nothing new.
    const [stillExists] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, publicToken))
      .limit(1);
    if (!stillExists) notFound();

    return (
      <main className="min-h-screen bg-ln-op-page p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <Icon name="check-circle" className="mx-auto text-ln-op-ok" decorative />
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Esta mascota ya no está bajo tu custodia
          </h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Pasó a un nuevo dueño o fue transferida, así que salió del listado de tu organización.
            Es el resultado esperado de una adopción o transferencia finalizada.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded-[var(--radius-md)] bg-ln-op-azul text-white text-[13px] hover:bg-ln-op-azul-700"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }
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

  // Open custody_episode opened by a sanitary_authority org — the same DC13
  // canonical discriminator /p and the owner profile use. Feeds the
  // custodia-oficial situation on the ficha (pet-state-header R6).
  const openCustodyRows = await db
    .select({ caseId: cases.id })
    .from(cases)
    .innerJoin(
      organizations,
      and(
        eq(organizations.id, cases.openedByOrganizationId),
        eq(organizations.orgType, "sanitary_authority"),
      ),
    )
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "custody_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

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
    const pending = await fetchPendingOwnerReturnProposalForOrg(pet.id, organization.id, db);
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
  // Clinical event recording on the held-pet ficha (staging validation
  // 2026-07-04, bug 2): the capability existed but had no surface here. The
  // shared server actions re-enforce event.write at the signing boundary
  // (lib/infra/pet-access.ts), so this flag only gates UI visibility.
  // Vaccine/weight require a living pet (requireAlivePetAccess); nota stays
  // available for deceased pets (parity with the owner-side note action).
  const canWriteEvents = granted.has("event.write");
  const canRecordClinical = canWriteEvents && pet.status !== "deceased";
  const canEndFoster = granted.has("foster.end") && !!fosterName;
  // Finalize adoption is reachable from the pet ficha (not only the list card),
  // so the "aprobación → finalizá en la ficha" guidance actually lands on a
  // page that has the action. The finalize page itself enforces eligibility.
  const canFinalizeAdoption =
    granted.has("adoption.finalize") && ownershipRole === "shelter_custody";
  const petSpeciesLabel = speciesLabel(pet.species);

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

  // Pet SITUATION (pet-state-header R6) — the same single derivation every
  // other surface uses, FULL set: org viewers are custodians, not the public,
  // so no privacy filtering applies here. Renders as an Op-toned strip at the
  // top of the ficha + a badge replacing the plain-text Estado value. Default
  // al-dia → no strip (quiet ficha). Note: en-tratamiento is not derivable
  // here (no medication projection is loaded on this page); all other
  // situations are wired.
  const petSituation = derivePetSituation({
    status: pet.status,
    rabiesObservationStatus: pet.rabiesObservationStatus,
    pregnancyStatus: pet.pregnancyStatus,
    inAdoption: Boolean(pet.adoptionListedAt) && !pet.adoptionListingPausedAt,
    inTransit: !!fosterName,
    underOfficialCustody: openCustodyRows.length > 0,
  });
  const orgSituation = petSituation.isDefault ? null : petSituation;
  const orgSituationLabel = orgSituation ? situationLabelForSex(orgSituation.label, pet.sex) : null;

  // Situation tone → Op design-language classes (the org console does not use
  // the ln-* document palette). WCAG: tone never travels alone — the strip and
  // badge both pair it with the situation icon + label. `ok` is unreachable
  // (isDefault → no strip); rosa has no Op family, viol is its Op analog.
  const OP_TONE_CLASSES: Record<PetSituationTone, string> = {
    ok: "bg-ln-op-ok-bg border-ln-op-ok-bd text-ln-op-ok",
    alerta: "bg-ln-op-danger-bg border-ln-op-danger-bd text-ln-op-danger",
    vigilancia: "bg-ln-op-blue-bg border-ln-op-blue-bd text-ln-op-azul",
    tratamiento: "bg-ln-op-warn-bg border-ln-op-warn-bd text-ln-op-warn",
    gestacion: "bg-ln-op-viol-bg border-ln-op-viol-bd text-ln-op-viol",
    accion: "bg-ln-op-stripe border-ln-op-line text-ln-op-ink-2",
    memoria: "bg-ln-op-stripe border-ln-op-line text-ln-op-mute",
  };

  return (
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Situation strip (pet-state-header R6) — the ficha's state carrier,
            same tone families as the credential masthead, Op design language. */}
        {orgSituation && (
          <div
            data-section="org-situation-strip"
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] border border-l-[3px] px-4 py-2.5 text-md font-semibold ${OP_TONE_CLASSES[orgSituation.tone]}`}
          >
            <Icon name={orgSituation.icon} size="sm" decorative />
            {orgSituationLabel}
          </div>
        )}

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
              <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">{pet.name}</h1>
              <p className="text-[13px] text-ln-op-ink-2">
                {petSpeciesLabel}
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
              <dd>
                {orgSituation ? (
                  // Badge with icon + gendered label — replaces the old
                  // plain-text value whenever a situation is active.
                  <span
                    data-section="org-situation-badge"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${OP_TONE_CLASSES[orgSituation.tone]}`}
                  >
                    <Icon name={orgSituation.icon} size={13} decorative />
                    {orgSituationLabel}
                  </span>
                ) : (
                  <span className="text-ln-op-ink">Activa</span>
                )}
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
        {(canManageEligibility ||
          canReplaceMicrochip ||
          canWriteEvents ||
          canEndFoster ||
          canProposeReturn ||
          canFinalizeAdoption) && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ln-op-mute">
              Acciones
            </h2>
            <div className="flex flex-wrap gap-2">
              {canFinalizeAdoption && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}/adoption`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] bg-ln-op-ok text-white hover:opacity-90"
                >
                  Finalizar adopción
                </Link>
              )}
              {canManageEligibility && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=elegibilidad`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  {pet.adoptionEligible === true ? (
                    <span className="inline-flex items-center gap-1">
                      Elegibilidad · Apta <Icon name="check" size={13} decorative />
                    </span>
                  ) : pet.adoptionEligible === false ? (
                    "Elegibilidad · NO apta"
                  ) : (
                    "Elegibilidad"
                  )}
                </Link>
              )}
              {canRecordClinical && (
                <>
                  <Link
                    href={`/org/${orgToken}/mascotas/${publicToken}?sheet=vacuna`}
                    className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                  >
                    Registrar vacuna
                  </Link>
                  <Link
                    href={`/org/${orgToken}/mascotas/${publicToken}?sheet=peso`}
                    className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                  >
                    Registrar peso
                  </Link>
                </>
              )}
              {canWriteEvents && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=nota`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  Agregar nota
                </Link>
              )}
              {canReplaceMicrochip && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=reemplazar-microchip`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  Reemplazar microchip
                </Link>
              )}
              {canEndFoster && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=fin-transito`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card text-ln-op-ink hover:bg-ln-op-stripe"
                >
                  Cerrar tránsito
                </Link>
              )}
              {canProposeReturn && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=devolver-al-dueno`}
                  className="inline-block text-sm px-3 py-1.5 rounded-[var(--radius-sm)] bg-ln-op-azul text-white hover:bg-ln-op-azul-700"
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
            petSpecies={pet.species}
            canWriteEvents={canWriteEvents}
            canRecordClinical={canRecordClinical}
            eligibility={eligibility}
            currentChip={canonicalIds.microchip?.code ?? null}
            fosterName={fosterName}
            canProposeReturn={canProposeReturn}
          />
        </Suspense>

        <footer className="pt-4 border-t border-ln-op-line">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-sm text-ln-op-mute underline hover:text-ln-op-ink"
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
