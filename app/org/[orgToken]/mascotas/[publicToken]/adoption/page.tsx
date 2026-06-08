// Adoption-finalize page. Capability-gated on `adoption.finalize`, validates
// the pet is in shelter_custody by the active org, and renders the composite-
// event form. Heavy lifting (DNI lookup, atomic custody transfer, stub-profile
// creation) lives in app/actions/adoption.ts.

import { db, fosterProposals, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { FinalizeAdoptionForm } from "./FinalizeAdoptionForm";

export default async function AdoptionPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;

  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("adoption.finalize")) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para finalizar adopciones necesitás el permiso{" "}
            <code className="text-xs">adoption.finalize</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Animal no disponible</h1>
          <p className="text-gob-text-gray ">
            Este animal no figura bajo custodia activa de {organization.displayName}.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }
  const pet = petRow.pet;

  // Detect "foster came from the pool" shortcut (spec §15.1). When an active
  // foster row was created via an accepted foster_proposal, surface the
  // shortcut button so the org can finalize directly to that foster.
  const [poolFosterRow] = await db
    .select({
      ownership: ownerships,
      foster: profiles,
    })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .innerJoin(
      fosterProposals,
      and(
        eq(fosterProposals.resolvedOwnershipId, ownerships.id),
        eq(fosterProposals.status, "accepted"),
      ),
    )
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);

  const fosterShortcut = poolFosterRow
    ? {
        adopterUserId: poolFosterRow.foster.id,
        displayName: poolFosterRow.foster.displayName,
      }
    : null;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Finalizar adopción: {pet.name}</h1>
          <p className="text-sm text-gob-text-gray ">
            Esta acción cierra la custodia del refugio y, si hay un tránsito activo, también lo
            cierra. Queda registrado como evento inmutable en la historia de {pet.name}.
          </p>
        </header>

        {!pet.adoptionEligible && (
          <div className="rounded-lg border border-gob-warning bg-gob-warning/10   p-3 text-sm space-y-1">
            <p className="text-gob-warning-text ">
              {pet.adoptionEligible === false
                ? `Esta mascota está marcada como NO apta para adopción (motivo: ${pet.adoptionIneligibleReason ?? "sin motivo"}).`
                : "Esta mascota no fue evaluada para adopción todavía."}
            </p>
            <Link
              href={`/org/${orgToken}/mascotas/${publicToken}/eligibility`}
              className="inline-block underline text-gob-warning-text "
            >
              Resolver elegibilidad
            </Link>
          </div>
        )}

        <FinalizeAdoptionForm
          orgToken={orgToken}
          publicToken={publicToken}
          fosterShortcut={fosterShortcut}
        />

        <footer className="pt-4 border-t border-gob-border ">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-sm text-gob-text-gray underline "
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
