// Microchip cross-check helper — Lost & Found Fase 2.
//
// lookupByChip queries pets by microchip_id using the partial index
// pets_microchip_lookup_idx (created in Fase 1 migration). Returns minimal
// pet shape sufficient for the intake match preview, or null if no match.
//
// Called from createIntakeAction and createPetAction (found_stray path) BEFORE
// the new-pet insert to detect duplicates.

import { db, ownerships, pets, profiles } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

export type ChipLookupResult = {
  pet: {
    id: string;
    publicToken: string;
    name: string;
    status: "active" | "lost" | "deceased";
    photoUrl: string | null;
    ownerUserId: string | null;
  };
  ownerFirstName: string | null;
} | null;

// Pure DB lookup — no auth, no session. Called from server actions that
// have already verified the caller's capability / session.
export async function lookupByChip(microchipId: string): Promise<ChipLookupResult> {
  const [row] = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
      petPrimaryPhotoId: pets.primaryPhotoId,
      ownershipOwnerUserId: ownerships.ownerUserId,
      ownerDisplayName: profiles.displayName,
    })
    .from(pets)
    .leftJoin(
      ownerships,
      and(eq(ownerships.petId, pets.id), isNull(ownerships.endedAt), eq(ownerships.role, "owner")),
    )
    .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(eq(pets.microchipId, microchipId))
    .limit(1);

  if (!row) return null;

  return {
    pet: {
      id: row.petId,
      publicToken: row.petPublicToken,
      name: row.petName,
      status: row.petStatus as "active" | "lost" | "deceased",
      // primaryPhotoId is a UUID reference; the actual URL is resolved at
      // render time via storage. We expose the ID here so callers can build
      // the URL if needed; null means no photo.
      photoUrl: null,
      ownerUserId: row.ownershipOwnerUserId ?? null,
    },
    ownerFirstName: row.ownerDisplayName ? row.ownerDisplayName.split(" ")[0] : null,
  };
}
