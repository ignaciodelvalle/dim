// Match confirmation page — refugio path.
//
// Reached when createIntakeAction detects a microchip cross-check match with
// status='lost'. Shows the matched pet's public info and two actions:
//   "Es la misma mascota" → confirmChipMatchAction → ownership + notification
//   "No es la misma"     → note event → redirect back to intake
//
// Disclosure prefs: for Fase 2 the owner's name and last location are always
// shown. Fase 3 will gate these on the disclose_* columns.

import { attachments, db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { petPhotoUrl } from "@/lib/storage";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchConfirmationCard } from "./MatchConfirmationCard";

export default async function IntakeMatchPage({
  params,
}: {
  params: Promise<{ orgToken: string; matchedPetToken: string }>;
}) {
  const { orgToken, matchedPetToken } = await params;

  // Auth — must be an active member of this org.
  const { organization } = await requireOrgAccessByToken(orgToken);

  // Load the matched pet.
  const [petResult] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, matchedPetToken))
    .limit(1);

  if (!petResult) notFound();
  const { pet, photo } = petResult;

  // Must still be lost — if it was found in the meantime, tell the user.
  if (pet.status !== "lost") {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Mascota ya no esta perdida</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            {pet.name} ya fue encontrada o su estado cambio. Podes continuar el ingreso
            normalmente.
          </p>
          <Link
            href={`/org/${orgToken}/intake`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al ingreso
          </Link>
        </div>
      </main>
    );
  }

  // Load owner first name (Fase 2: always shown; Fase 3 gates on disclose_first_name_when_lost).
  const [ownerRow] = await db
    .select({ displayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);

  // Last known location from the most recent status_changed → lost event.
  const [latestLostEvent] = await db
    .select({ payload: petEvents.payload, occurredAt: petEvents.occurredAt })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "status_changed"),
        sql`${petEvents.payload}->>'to_status' = 'lost'`,
      ),
    )
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  const lostPayload = latestLostEvent?.payload as
    | { location_description?: string | null }
    | null
    | undefined;
  const lastLocationText = lostPayload?.location_description ?? null;
  const lastLocationDate = latestLostEvent?.occurredAt?.toISOString() ?? null;

  const photoUrl = petPhotoUrl(photo?.storagePath);
  const ownerFirstName = ownerRow?.displayName?.split(" ")[0] ?? null;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Coincidencia de microchip</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Este chip ya esta registrado en DIM. Confirma si es el mismo animal.
          </p>
        </header>

        <MatchConfirmationCard
          matchedPetToken={matchedPetToken}
          petName={pet.name}
          petSpecies={pet.species}
          petBreed={pet.breed}
          petColor={pet.color}
          petSex={pet.sex}
          petPhotoUrl={photoUrl}
          ownerFirstName={ownerFirstName}
          lastLocationText={lastLocationText}
          lastLocationDate={lastLocationDate}
          actorMode="refugio"
          orgToken={orgToken}
          successRedirect={`/org/${orgToken}/intake?matched=true&token=${matchedPetToken}`}
          cancelRedirect={`/org/${orgToken}/intake`}
        />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}/intake`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            Cancelar y volver al ingreso
          </Link>
        </footer>
      </div>
    </main>
  );
}
