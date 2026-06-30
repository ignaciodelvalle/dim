// Full use-case body for the privileged govt pet lookup used by the decomiso form.
// Moved verbatim from app/actions/decomiso-pet-lookup.ts (strangler 40/61, 2026-06-30).
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §6.
//
// Used by DecomisoForm to confirm a pet's identity before executing a
// decomiso. Returns full name, species, sex, status, and whether the pet
// has an active owner (to trigger the DC2 double-confirm modal).
//
// Auth: requireDecomisoPrincipal is enforced by the caller (shim). This
// use-case receives the already-resolved session so it never re-fetches.
// Returns owner display name (not just initials) because the operator
// needs to know whose custody they're about to revoke.

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, pets, profiles } from "@/db";
import type { DecomisoPrincipalSession } from "@/lib/auth-guards";

import type { GovtPetLookupResult } from "./types";

const TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export async function lookupPetForDecomiso(
  session: DecomisoPrincipalSession,
  query: string,
): Promise<GovtPetLookupResult> {
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
      jurisdictionProvince: pets.jurisdictionProvince,
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

  // Jurisdiction scope check — mirrors executeDecomisoAction Fix 1.
  // Admin role has universal scope (session.jurisdictions is empty by design).
  // For govt, the pet's registered province must appear in the user's assigned
  // jurisdictions. A null pet province means no jurisdiction was recorded at
  // registration — allow the lookup (no jurisdiction can be violated if none
  // is recorded). If the pet IS out of scope, return an error WITHOUT exposing
  // owner PII (ownerDisplayName / hasOwner).
  if (session.profile.role === "govt") {
    const petProvince = pet.jurisdictionProvince;
    const inScope = !petProvince || session.jurisdictions.some((j) => j.province === petProvince);
    if (!inScope) {
      return {
        found: false,
        error: "Esta mascota no está en tu jurisdicción asignada.",
      };
    }
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
