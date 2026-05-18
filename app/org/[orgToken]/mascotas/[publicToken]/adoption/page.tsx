// Adoption-finalize page. Capability-gated on `adoption.finalize`, validates
// the pet is in shelter_custody by the active org, and renders the composite-
// event form. Heavy lifting (DNI lookup, atomic custody transfer, stub-profile
// creation) lives in app/actions/adoption.ts.

import { db, fosterProposals, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
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
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para finalizar adopciones necesitás el permiso{" "}
            <code className="text-xs">adoption.finalize</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
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
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Animal no disponible</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Este animal no figura bajo custodia activa de {organization.displayName}.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Finalizar adopción: {pet.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Esta acción cierra la custodia del refugio y, si hay un tránsito activo, también lo
            cierra. Queda registrado como evento inmutable en la historia de {pet.name}.
          </p>
        </header>

        {!pet.adoptionEligible && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm space-y-1">
            <p className="text-amber-900 dark:text-amber-100">
              {pet.adoptionEligible === false
                ? `Esta mascota está marcada como NO apta para adopción (motivo: ${pet.adoptionIneligibleReason ?? "sin motivo"}).`
                : "Esta mascota no fue evaluada para adopción todavía."}
            </p>
            <Link
              href={`/org/${orgToken}/mascotas/${publicToken}/eligibility`}
              className="inline-block underline text-amber-900 dark:text-amber-100"
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

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
