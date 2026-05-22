// Tattoo cross-check helper — decision D2 (closed 2026-05-22).
//
// lookupByTattoo queries pets by normalized tattoo_code using the partial
// index pets_tattoo_code_idx (migration 0045). Returns minimal pet shape
// sufficient for an intake match preview, or null if no match.
//
// Designed to be called BEFORE inserting a new pet during intake, paralelo
// a lookupByChip. Tattoo codes collide across registries (a code like
// "K9-2014" can appear on dozens of pets from different criaderos /
// campañas), so we return the FIRST match only and let the caller resolve
// ambiguity via the foto. The surface should always say "posible
// coincidencia, verificá con foto" — never auto-merge.

import { db, ownerships, pets, profiles } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

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

// Single source of truth — app/actions/tattoo.ts imports from here. Lives in
// lib/ because the action file is "use server" and can only export async
// functions; the pure sync normalizer must live outside that constraint.
// Writers and readers converge on the same canonical form via this one export.
export function normalizeTattooCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// Pure DB lookup — no auth, no session. Caller has already verified capability.
// Returns the first match if any (codes can collide); resolution to a specific
// pet always requires visual confirmation via the tattoo photo.
export async function lookupByTattoo(rawCode: string): Promise<TattooLookupResult> {
  const normalized = normalizeTattooCode(rawCode);
  if (!normalized) return null;

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
