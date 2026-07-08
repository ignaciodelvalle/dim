// Soft same-owner pet dedupe (data-quality gate P2).
//
// Before an owner alta creates a pet, we check whether the caller ALREADY has
// an ACTIVE owned pet that looks like the same animal — same normalized name
// (case/accent/whitespace-insensitive) + same species + same sex. This is a
// non-blocking nudge: on a match the alta returns a confirmation prompt so the
// owner can open the existing pet or knowingly create a second one.
//
// Intentionally soft: two real pets can legitimately share a name/species/sex
// (littermates, "Negro" #1 and #2), so we never hard-block on this signal.

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, pets } from "@/db";

export type OwnerDuplicateMatch = {
  publicToken: string;
  name: string;
  species: string;
  sex: "male" | "female" | "unknown";
};

/**
 * Normalize a pet name for comparison: lowercase, NFD-decompose + strip
 * combining marks (accent-insensitive), collapse internal whitespace, trim.
 * Same shape as the accent-folding normalizers used elsewhere in the codebase
 * (e.g. lib/infra/ar-localidades.ts, lib/domain/symptom-matcher.ts).
 */
export function normalizePetName(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * Returns the caller's active owned pet that matches the candidate on
 * normalized name + species + sex, or null if none. Fetches the (typically
 * small) set of active ownerships for the user and compares in JS so the
 * accent-folding stays identical to the rest of the app without depending on
 * the Postgres `unaccent` extension.
 */
export async function findSameOwnerDuplicatePet(input: {
  ownerUserId: string;
  name: string;
  species: string;
  sex: "male" | "female" | "unknown";
}): Promise<OwnerDuplicateMatch | null> {
  const target = normalizePetName(input.name);
  if (!target) return null;

  const rows = await db
    .select({
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      sex: pets.sex,
    })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, input.ownerUserId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );

  for (const row of rows) {
    if (
      row.species === input.species &&
      row.sex === input.sex &&
      normalizePetName(row.name) === target
    ) {
      return {
        publicToken: row.publicToken,
        name: row.name,
        species: row.species,
        sex: row.sex as "male" | "female" | "unknown",
      };
    }
  }

  return null;
}
