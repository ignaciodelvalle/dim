// Devolver-al-dueno page — refugio surface for proposing a return-to-owner
// transfer. Only visible when:
//   - The org has active shelter_custody on this pet
//   - The pet is currently lost
//   - No pending custody_transfer_proposed event exists
//
// On submit: proposeReturnToOwnerAction, on success stay on page with
// success state (the form component handles it inline).

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposeReturnForm } from "./ProposeReturnForm";

export default async function DevolverAlDuenoPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);

  if (!granted.has("custody.transfer")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para proponer una devolución necesitás el permiso{" "}
            <code className="text-xs">custody.transfer</code>.
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

  // Load pet and verify org has active shelter_custody.
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

  if (!petRow) notFound();
  const pet = petRow.pet;

  // Only allow when pet is lost.
  if (pet.status !== "lost") {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">No aplicable</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            {pet.name} no está en estado &quot;perdida&quot;. Solo se puede proponer devolución
            cuando la mascota está perdida.
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

  // Check if there's already a pending proposal.
  const [latestProposal] = await db
    .select({ id: petEvents.id, occurredAt: petEvents.occurredAt })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  let hasPendingProposal = false;
  if (latestProposal) {
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
    if (!subsequentTransfer) hasPendingProposal = true;
  }

  if (hasPendingProposal) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Propuesta pendiente</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Ya existe una propuesta de devolución pendiente para {pet.name}. El dueño aún no
            respondió.
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

  // Load the original owner's first name and phone (respecting public info only).
  const [ownerRow] = await db
    .select({ displayName: profiles.displayName, phone: profiles.phone })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);

  const ownerFirstName = ownerRow?.displayName ? ownerRow.displayName.split(" ")[0] : "el dueño";
  const ownerPhone = ownerRow?.phone ?? null;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Devolver a {pet.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Proponé la devolución al dueño original. El dueño recibirá una notificación y deberá
            confirmar cuando tenga a {pet.name} físicamente.
          </p>
        </header>

        <section className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
            Dueño registrado
          </h2>
          <p className="text-base">{ownerFirstName}</p>
          {ownerPhone && (
            <a
              href={`tel:${ownerPhone}`}
              className="text-sm text-blue-600 dark:text-blue-400 underline"
            >
              {ownerPhone}
            </a>
          )}
          {!ownerPhone && <p className="text-sm text-neutral-500">Teléfono no disponible.</p>}
        </section>

        <ProposeReturnForm orgToken={orgToken} petPublicToken={publicToken} />

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
