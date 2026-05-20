// Re-evaluation helper for the PPP breed list rule.
// Spec 2026-05-19-govt-business-rules-poc-design §4.5 + BR9.
//
// When admin creates / updates / deletes a `ppp_breed_list` row, all pets
// within the affected jurisdiction get re-evaluated. The flag
// `pets.potentially_dangerous_breed` is flipped to match the new ruling
// and the human owners receive an urgent notification if the flag turned
// true (a non-PPP breed is unlikely to flip the other way without explicit
// owner action, so the false→true direction is the one we surface).
//
// IMPORTANT: this is idempotent — running it twice produces the same end
// state. Safe to call from a cron OR inline after the rule write.

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db, notifications, ownerships, pets } from "@/db";

import { resolveBusinessRule } from "./business-rules-resolver";

export interface ReevalCounters {
  scanned: number;
  flippedToPpp: number;
  flippedToNonPpp: number;
  notified: number;
}

export interface JurisdictionScope {
  country?: string;
  province?: string | null;
  locality?: string | null;
}

/**
 * Re-evaluate the PPP flag for every pet whose jurisdiction matches
 * `scope`. The match uses the most-specific non-null field of `scope`:
 *   - scope.locality set → match pets with that exact locality
 *   - scope.province set → match pets with that province (regardless of locality)
 *   - scope.country set  → match pets with that country (regardless of province)
 *
 * Returns counts for observability + a list of notified user IDs for tests.
 */
export async function reEvaluatePppBreedListChange(
  scope: JurisdictionScope,
): Promise<ReevalCounters> {
  const country = scope.country ?? "AR";
  const province = scope.province ?? null;
  const locality = scope.locality ?? null;

  // Select dogs in scope (PPP rule only applies to dogs today —
  // resolver returns null/false for other species via isPotentiallyDangerousBreed,
  // but we still scan all pets so the flag can flip back if needed).
  const conditions = [
    eq(pets.jurisdictionCountry, country),
    eq(pets.species, "dog"),
    isNotNull(pets.breed),
  ];
  if (province !== null) {
    conditions.push(eq(pets.jurisdictionProvince, province));
  }
  if (locality !== null) {
    conditions.push(eq(pets.jurisdictionLocality, locality));
  }
  const rows = await db
    .select({
      id: pets.id,
      name: pets.name,
      breed: pets.breed,
      publicToken: pets.publicToken,
      potentiallyDangerousBreed: pets.potentiallyDangerousBreed,
      jurisdictionCountry: pets.jurisdictionCountry,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(and(...conditions));

  const counters: ReevalCounters = {
    scanned: rows.length,
    flippedToPpp: 0,
    flippedToNonPpp: 0,
    notified: 0,
  };

  for (const pet of rows) {
    const rule = await resolveBusinessRule("ppp_breed_list", {
      country: pet.jurisdictionCountry,
      province: pet.jurisdictionProvince,
      locality: pet.jurisdictionLocality,
    });
    const breedLabel = (pet.breed ?? "").trim();
    const nowPpp = breedLabel.length > 0 && rule.payload.breeds.includes(breedLabel);
    if (nowPpp === pet.potentiallyDangerousBreed) continue;

    await db.update(pets).set({ potentiallyDangerousBreed: nowPpp }).where(eq(pets.id, pet.id));

    if (nowPpp) counters.flippedToPpp += 1;
    else counters.flippedToNonPpp += 1;

    if (nowPpp) {
      // Notify each active human owner of this pet.
      const owners = await db
        .select({ userId: ownerships.ownerUserId })
        .from(ownerships)
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)));
      const userIds = owners
        .map((o) => o.userId)
        .filter((id): id is string => typeof id === "string");
      if (userIds.length > 0) {
        await db.insert(notifications).values(
          userIds.map((userId) => ({
            userId,
            notificationType: "ppp_breed_list_updated_now_applies",
            severity: "warning" as const,
            title: `Cambio en la regulación PPP que afecta a ${pet.name}`,
            body: `La raza de ${pet.name} (${breedLabel}) ahora figura en la lista de Animales Potencialmente Peligrosos de tu jurisdicción. Conocé los requisitos legales y, si corresponde, registrá la atestación.`,
            relatedPetId: pet.id,
            ctaLabel: "Ver requisitos",
            ctaUrl: `/mis-mascotas/${pet.publicToken}`,
          })),
        );
        counters.notified += userIds.length;
      }
    }
  }

  return counters;
}
