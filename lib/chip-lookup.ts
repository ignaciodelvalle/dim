// Microchip cross-check helper.
//
// Reads from the polymorphic `pet_identifications` table (compliance PR 0).
// The active chip row is joined back to its pet and owner. Previously this
// helper queried `pets.microchip_id` directly; now it indirects through the
// canonical identifier table so chip replacements preserve history.

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
// status='active'). The unique index guarantees at most one match.
//
// Transition shim (compliance PR 0): during this sprint we also fall back
// to the legacy `pets.microchip_id` column if no canonical row matched.
// Migration 0057 drops the legacy column and this fallback. The fallback
// only fires when both `pets.microchip_id` and pet_identifications miss —
// it cannot return phantom data because both lookups use the same code.
export async function lookupByChip(microchipId: string): Promise<ChipLookupResult> {
  if (!microchipId) return null;

  const [canonical] = await db
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

  const row = canonical ?? (await legacyChipFallback(microchipId));
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

async function legacyChipFallback(microchipId: string) {
  const [row] = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
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
  return row ?? null;
}
