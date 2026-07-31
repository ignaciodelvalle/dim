// Match confirmation page — Libreta Nacional redesign.
// Presentation only; MatchConfirmationCardVecino and data fetching unchanged.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LnButton } from "@/components/ui/Button";
import { attachments, db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { petPhotoUrl } from "@/lib/infra/storage";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { MatchConfirmationCardVecino } from "./MatchConfirmationCardVecino";

export default async function VecinoMatchPage({
  params,
}: {
  params: Promise<{ matchedPetToken: string }>;
}) {
  const { matchedPetToken } = await params;

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
      <div className="mx-auto max-w-md px-8 py-7 pb-12 text-center">
        <p className="font-ln-serif text-xl font-semibold text-[var(--color-ln-ink)]">
          Mascota ya no está perdida
        </p>
        <p className="mt-1.5 text-[13px] text-[var(--color-ln-mute)]">
          {pet.name} ya fue encontrada o su estado cambió. Podés continuar registrando la mascota.
        </p>
        <div className="mt-5 flex justify-center">
          <Link href="/mis-mascotas/nueva">
            <LnButton variant="primary" size="md">
              Volver al registro
            </LnButton>
          </Link>
        </div>
      </div>
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
    <div className="mx-auto max-w-xl px-8 py-7 pb-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 font-ln-serif text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Coincidencia de microchip
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          El chip que ingresaste ya está registrado en miMAR. Confirmá si es el mismo animal.
        </p>
      </div>

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

      <div className="mt-6 border-t border-[var(--color-ln-line-2)] pt-4">
        <Link
          href="/mis-mascotas/nueva"
          className="font-ln-mono text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Cancelar y volver al registro
        </Link>
      </div>
    </div>
  );
}
