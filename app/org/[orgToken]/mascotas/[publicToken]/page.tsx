// Org pet detail page — shows the animal's key data and mounts the
// ?sheet= action flows (elegibilidad, reemplazar-microchip, fin-transito,
// devolver-al-dueno) via OrgPetSheetMounter.
//
// Only accessible to org members with at least `pet.read_held` capability
// who have an active ownership row (shelter_custody or foster) on this pet.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import { OrgPetSheetMounter } from "./OrgPetSheetMounter";

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
      <main className="min-h-screen p-6 bg-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray">
            Para ver la ficha del animal necesitás el permiso{" "}
            <code className="text-xs">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white"
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

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">{pet.name}</h1>
          <p className="text-sm text-gob-text-gray">
            {speciesLabel}
            {pet.breed ? ` · ${pet.breed}` : ""}
            {pet.color ? ` · ${pet.color}` : ""}
          </p>
        </header>

        {/* Pet info */}
        <section className="rounded border border-gob-border p-4 space-y-2 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-gob-text-muted">Token público</dt>
            <dd>
              <code className="text-xs">{pet.publicToken}</code>
            </dd>
            <dt className="text-gob-text-muted">Estado</dt>
            <dd className="capitalize">
              {pet.status === "lost" ? "Perdida" : pet.status === "active" ? "Activa" : "Fallecida"}
            </dd>
            <dt className="text-gob-text-muted">Rol de custodia</dt>
            <dd>
              {ownershipRole === "shelter_custody"
                ? "Custodia del refugio"
                : ownershipRole === "foster"
                  ? "Tránsito"
                  : ownershipRole}
            </dd>
            {pet.microchipId && (
              <>
                <dt className="text-gob-text-muted">Microchip</dt>
                <dd>
                  <code className="text-xs">{pet.microchipId}</code>
                </dd>
              </>
            )}
            {fosterName && (
              <>
                <dt className="text-gob-text-muted">En tránsito con</dt>
                <dd>{fosterName}</dd>
              </>
            )}
          </dl>
        </section>

        {/* Action buttons */}
        {(canManageEligibility || canReplaceMicrochip || canEndFoster || canProposeReturn) && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gob-text-muted uppercase tracking-wide">
              Acciones
            </h2>
            <div className="flex flex-wrap gap-2">
              {canManageEligibility && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=elegibilidad`}
                  className="inline-block text-sm px-3 py-1.5 rounded border border-gob-border-strong hover:bg-gob-surface-alt"
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
                  className="inline-block text-sm px-3 py-1.5 rounded border border-gob-border-strong hover:bg-gob-surface-alt"
                >
                  Reemplazar microchip
                </Link>
              )}
              {canEndFoster && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=fin-transito`}
                  className="inline-block text-sm px-3 py-1.5 rounded border border-gob-border-strong hover:bg-gob-surface-alt"
                >
                  Cerrar tránsito
                </Link>
              )}
              {canProposeReturn && (
                <Link
                  href={`/org/${orgToken}/mascotas/${publicToken}?sheet=devolver-al-dueno`}
                  className="inline-block text-sm px-3 py-1.5 rounded bg-gob-info text-white hover:bg-gob-info"
                >
                  Devolver al dueño
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Sheet mounter */}
        <Suspense>
          <OrgPetSheetMounter
            orgToken={orgToken}
            petPublicToken={publicToken}
            petName={pet.name}
            eligibility={eligibility}
            currentChip={pet.microchipId ?? null}
            fosterName={fosterName}
            canProposeReturn={canProposeReturn}
          />
        </Suspense>

        <footer className="pt-4 border-t border-gob-border text-sm">
          <Link href={`/org/${orgToken}/mascotas`} className="text-gob-text-gray underline">
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
