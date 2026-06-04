"use server";

// Privileged pet lookup for the govt decomiso form.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §6.
//
// Used by DecomisoForm to confirm a pet's identity before executing a
// decomiso. Returns full name, species, sex, status, and whether the pet
// has an active owner (to trigger the DC2 double-confirm modal).
//
// Auth: requireDecomisoPrincipal — only govt / admin can reach this.
// Returns owner display name (not just initials) because the operator
// needs to know whose custody they're about to revoke.

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, pets, profiles } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";

export type GovtPetLookupResult =
  | { found: false; error: string }
  | {
      found: true;
      id: string;
      publicToken: string;
      name: string;
      species: string;
      sex: string;
      status: string;
      /** true when there is an active 'owner' ownership row with a user_id */
      hasOwner: boolean;
      ownerDisplayName: string | null;
    };

const TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export async function lookupPetForDecomisoAction(query: string): Promise<GovtPetLookupResult> {
  await requireDecomisoPrincipal();

  const trimmed = query.trim().toUpperCase();
  if (!trimmed) return { found: false, error: "Ingresá un token de mascota." };
  if (!TOKEN_PATTERN.test(trimmed)) {
    return { found: false, error: "El formato del token es DIM-XXXX-XXXX." };
  }

  const [pet] = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      sex: pets.sex,
      status: pets.status,
    })
    .from(pets)
    .where(eq(pets.publicToken, trimmed))
    .limit(1);

  if (!pet) {
    return {
      found: false,
      error: `No se encontró ninguna mascota con el token ${trimmed}.`,
    };
  }

  // Check for an active user-based 'owner' ownership.
  const [ownerRow] = await db
    .select({
      ownerUserId: ownerships.ownerUserId,
    })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
        isNull(ownerships.ownerOrganizationId),
      ),
    )
    .limit(1);

  let ownerDisplayName: string | null = null;
  if (ownerRow?.ownerUserId) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, ownerRow.ownerUserId))
      .limit(1);
    ownerDisplayName = profile?.displayName ?? null;
  }

  return {
    found: true,
    id: pet.id,
    publicToken: pet.publicToken,
    name: pet.name,
    species: pet.species,
    sex: pet.sex,
    status: pet.status,
    hasOwner: Boolean(ownerRow?.ownerUserId),
    ownerDisplayName,
  };
}
