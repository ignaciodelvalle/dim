// Microchip cross-check helper.
//
// Reads exclusively from the canonical `pet_identifications` table
// (kind='microchip_iso', status='active'). The unique partial index guarantees
// at most one active chip row per code, so there is always at most one match.
//
// Migration 0082 completed the backfill — no active pet has a chip in the
// legacy pets.microchip_id column that is absent from pet_identifications.
// The legacy fallback that existed here (compliance PR 0 transition shim) has
// been removed in ARCH-Q now that canonical completeness is verified.

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, petIdentifications, pets, profiles } from "@/db";

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

// Pure DB lookup — no auth, no session. Callers gate capability.
// Reads from the canonical `pet_identifications` (kind='microchip_iso',
// status='active'). The chip_unique partial index guarantees at most one match.
export async function lookupByChip(microchipId: string): Promise<ChipLookupResult> {
  if (!microchipId) return null;

  const [row] = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
      ownershipOwnerUserId: ownerships.ownerUserId,
      ownerDisplayName: profiles.displayName,
    })
    .from(petIdentifications)
    .innerJoin(pets, eq(pets.id, petIdentifications.petId))
    .leftJoin(
      ownerships,
      and(eq(ownerships.petId, pets.id), isNull(ownerships.endedAt), eq(ownerships.role, "owner")),
    )
    .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        eq(petIdentifications.kind, "microchip_iso"),
        eq(petIdentifications.code, microchipId),
        eq(petIdentifications.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    pet: {
      id: row.petId,
      publicToken: row.petPublicToken,
      name: row.petName,
      status: row.petStatus as "active" | "lost" | "deceased",
      photoUrl: null,
      ownerUserId: row.ownershipOwnerUserId ?? null,
    },
    ownerFirstName: row.ownerDisplayName ? row.ownerDisplayName.split(" ")[0] : null,
  };
}
