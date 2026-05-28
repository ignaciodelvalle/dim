// Tattoo cross-check helper.
//
// Reads from the polymorphic `pet_identifications` table (compliance PR 0).
// Tattoo codes legitimately collide across registries; we return the FIRST
// active match and require visual confirmation downstream (always say
// "posible coincidencia, verificá con foto" — never auto-merge).

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, petIdentifications, pets, profiles } from "@/db";

export type TattooLookupResult = {
  pet: {
    id: string;
    publicToken: string;
    name: string;
    status: "active" | "lost" | "deceased";
    tattooLocation: string | null;
    tattooPhotoId: string | null;
    ownerUserId: string | null;
  };
  ownerFirstName: string | null;
} | null;

// Canonical normalizer — writers and readers converge here.
export function normalizeTattooCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function lookupByTattoo(rawCode: string): Promise<TattooLookupResult> {
  const normalized = normalizeTattooCode(rawCode);
  if (!normalized) return null;

  const [canonical] = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
      tattooLocation: petIdentifications.tattooLocation,
      tattooPhotoId: petIdentifications.photoId,
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
        eq(petIdentifications.kind, "tattoo"),
        eq(petIdentifications.code, normalized),
        eq(petIdentifications.status, "active"),
      ),
    )
    .limit(1);

  // Transition shim (compliance PR 0): fall back to the legacy pets.tattoo_*
  // columns if no canonical row matched. Migration 0057 drops both the
  // legacy columns and this fallback.
  const row = canonical ?? (await legacyTattooFallback(normalized));
  if (!row) return null;

  return {
    pet: {
      id: row.petId,
      publicToken: row.petPublicToken,
      name: row.petName,
      status: row.petStatus as "active" | "lost" | "deceased",
      tattooLocation: row.tattooLocation,
      tattooPhotoId: row.tattooPhotoId,
      ownerUserId: row.ownershipOwnerUserId ?? null,
    },
    ownerFirstName: row.ownerDisplayName ? row.ownerDisplayName.split(" ")[0] : null,
  };
}

async function legacyTattooFallback(normalized: string) {
  const [row] = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
      tattooLocation: pets.tattooLocation,
      tattooPhotoId: pets.tattooPhotoId,
      ownershipOwnerUserId: ownerships.ownerUserId,
      ownerDisplayName: profiles.displayName,
    })
    .from(pets)
    .leftJoin(
      ownerships,
      and(eq(ownerships.petId, pets.id), isNull(ownerships.endedAt), eq(ownerships.role, "owner")),
    )
    .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(eq(pets.tattooCode, normalized))
    .limit(1);
  return row ?? null;
}
