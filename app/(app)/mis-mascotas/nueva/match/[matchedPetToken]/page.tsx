// Match confirmation page — vecino path.
//
// Reached when createPetAction (with acquisitionMethod='found_stray') detects a
// microchip cross-check match with status='lost'.
//
// "Es la misma" → confirmChipMatchAction(decision='same', actorMode='vecino')
//   → ownership created, owner notified → redirect /mis-mascotas
// "No es la misma" → note event → redirect /mis-mascotas/nueva?chipMismatched=true

import { attachments, db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { petPhotoUrl } from "@/lib/storage";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchConfirmationCardVecino } from "./MatchConfirmationCardVecino";

export default async function VecinoMatchPage({
  params,
}: {
  params: Promise<{ matchedPetToken: string }>;
}) {
  const { matchedPetToken } = await params;

  // Auth — must be a logged-in user.
  await requireUserOrRedirect();

  const [petResult] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, matchedPetToken))
    .limit(1);

  if (!petResult) notFound();
  const { pet, photo } = petResult;

  if (pet.status !== "lost") {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Mascota ya no esta perdida</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            {pet.name} ya fue encontrada o su estado cambio. Podes continuar registrando la mascota.
          </p>
          <Link
            href="/mis-mascotas/nueva"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al registro
          </Link>
        </div>
      </main>
    );
  }

  const [ownerRow] = await db
    .select({ displayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);

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
          <h1 className="text-3xl font-semibold">Coincidencia de microchip</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            El chip que ingresaste ya esta registrado en MiMAR. Confirma si es el mismo animal.
          </p>
        </header>

        <MatchConfirmationCardVecino
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
        />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/mis-mascotas/nueva"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            Cancelar y volver al registro
          </Link>
        </footer>
      </div>
    </main>
  );
}
