// Re-evaluation helper for PPP classification (breed list + weight
// threshold, admin-rules-console ADR-3).
// Spec 2026-05-19-govt-business-rules-poc-design §4.5 + BR9.
//
// When admin creates / updates / deletes a `ppp_breed_list` OR
// `ppp_weight_threshold` row, all pets within the affected jurisdiction get
// re-evaluated via the SAME composed classifier the write-path uses
// (resolvePppClassificationForJurisdiction). The flag
// `pets.potentially_dangerous_breed` is flipped to match the new ruling
// and the human owners receive an urgent notification if the flag turned
// true (a false→true flip is the direction we surface — see the notif type
// comment below for why the reverse isn't).
//
// IMPORTANT: this is idempotent — running it twice produces the same end
// state. Safe to call from a cron OR inline after the rule write. Registered
// as the reevalHook for BOTH ppp_breed_list and ppp_weight_threshold in
// lib/infra/rule-types-effects.ts — either rule type changing triggers the
// SAME full re-evaluation (a pet's classification depends on both rules
// together, so a breed-list change can also need a weight re-check and
// vice versa).

import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

import { db, ownerships, pets } from "@/db";

import { createNotificationsBulk } from "@/lib/infra/notification-service";
import {
  type PppRules,
  classifyPpp,
  resolvePppRulesForJurisdiction,
} from "@/lib/infra/ppp-classification";

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
 * Re-evaluate the PPP flag for every dog whose jurisdiction matches `scope`.
 * The match uses the most-specific non-null field of `scope`:
 *   - scope.locality set → match pets with that exact locality
 *   - scope.province set → match pets with that province (regardless of locality)
 *   - scope.country set  → match pets with that country (regardless of province)
 *
 * Returns counts for observability + a list of notified user IDs for tests.
 */
export async function reEvaluatePppClassificationChange(
  scope: JurisdictionScope,
): Promise<ReevalCounters> {
  const country = scope.country ?? "AR";
  const province = scope.province ?? null;
  const locality = scope.locality ?? null;

  // Select dogs in scope (PPP applies to dogs only today) that have EITHER a
  // breed OR a weight on file — a dog with NEITHER can never classify as PPP
  // under either rule (breedInList needs a breed, weightHits needs a
  // weight), so scanning it is pure waste. This is a real scale concern, not
  // a micro-optimization: unlike the pre-weight-enforcement predecessor
  // (isNotNull(breed) only), a naive "all dogs in scope" scan blows up on
  // datasets where most dogs have neither field populated (the shared local
  // DB has ~36k dogs in AR but only ~32 with breed OR weight set — a
  // province-scoped sweep without this filter timed out scanning 11k+ rows
  // it could never flip).
  const conditions = [
    eq(pets.jurisdictionCountry, country),
    eq(pets.species, "dog"),
    or(isNotNull(pets.breed), isNotNull(pets.estimatedWeightKg)),
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
      estimatedWeightKg: pets.estimatedWeightKg,
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

  // Cache resolved rules per DISTINCT (province, locality) tuple — a sweep
  // frequently covers many pets sharing the same jurisdiction, and
  // classification now needs 2 rules (breed + weight, up from 1
  // pre-weight-enforcement). Without this cache a country-wide sweep would
  // re-resolve both rules once PER PET instead of once per distinct
  // jurisdiction, which measurably slowed the reeval sweep in practice.
  // classifyPpp itself stays pure/sync — see lib/infra/ppp-classification.ts.
  const rulesCache = new Map<string, Promise<PppRules>>();
  function rulesFor(jurisdiction: {
    country: string;
    province: string | null;
    locality: string | null;
  }): Promise<PppRules> {
    const key = `${jurisdiction.country}|${jurisdiction.province ?? ""}|${jurisdiction.locality ?? ""}`;
    let cached = rulesCache.get(key);
    if (!cached) {
      cached = resolvePppRulesForJurisdiction(jurisdiction);
      rulesCache.set(key, cached);
    }
    return cached;
  }

  for (const pet of rows) {
    const weightKg =
      pet.estimatedWeightKg !== null ? Number.parseFloat(pet.estimatedWeightKg) : null;
    const rules = await rulesFor({
      country: pet.jurisdictionCountry,
      province: pet.jurisdictionProvince,
      locality: pet.jurisdictionLocality,
    });
    const nowPpp = classifyPpp("dog", pet.breed, Number.isNaN(weightKg) ? null : weightKg, rules);
    if (nowPpp === pet.potentiallyDangerousBreed) continue;

    await db.update(pets).set({ potentiallyDangerousBreed: nowPpp }).where(eq(pets.id, pet.id));

    if (nowPpp) counters.flippedToPpp += 1;
    else counters.flippedToNonPpp += 1;

    if (nowPpp) {
      // Notify each active human owner of this pet. Copy is breed-flavored
      // when the breed drove the flip and weight-flavored when weight did
      // (or a generic message when both apply) — see notificationCopyFor.
      const breedLabel = (pet.breed ?? "").trim();
      const { notificationType, body } = notificationCopyFor(pet.name, breedLabel);

      const owners = await db
        .select({ userId: ownerships.ownerUserId })
        .from(ownerships)
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)));
      const userIds = owners
        .map((o) => o.userId)
        .filter((id): id is string => typeof id === "string");
      if (userIds.length > 0) {
        // Route through the canonical write path (createNotificationsBulk) rather
        // than a raw db.insert. This closes an ARCH-P silent-loss gap that was
        // specific to this sweep: the flag UPDATE above COMMITS before the notify,
        // so if a raw insert threw, the NEXT reeval run would see
        // `nowPpp === pet.potentiallyDangerousBreed` and `continue` — the urgent
        // PPP alert was lost forever, never retried. The service instead
        // dead-letters a failed insert (recoverable via the
        // drain-notification-dead-letter cron), and the stable dedupe key
        // `ppp-flip:${petId}:${userId}` makes a repeat sweep idempotent
        // (ON CONFLICT DO NOTHING) instead of re-notifying on every run.
        const result = await createNotificationsBulk(
          userIds.map((userId) => ({
            userId,
            notificationType,
            severity: "warning" as const,
            title: `Cambio en la regulación PPP que afecta a ${pet.name}`,
            body,
            relatedPetId: pet.id,
            ctaLabel: "Ver requisitos",
            ctaUrl: `/mis-mascotas/${pet.publicToken}`,
            dedupeKey: `ppp-flip:${pet.id}:${userId}`,
          })),
        );
        counters.notified += result.insertedCount;
      }
    }
  }

  return counters;
}

/**
 * Best-effort notification copy selection. We don't know definitively WHICH
 * rule caused the flip without re-deriving both branches separately (the
 * composed resolver returns only the final boolean) — as a pragmatic
 * approximation, breed-list-driven copy is used whenever the pet's breed is
 * on file (the common case, matches pre-weight-enforcement copy exactly),
 * and the weight-specific notification type otherwise.
 */
function notificationCopyFor(
  petName: string,
  breedLabel: string,
): { notificationType: string; body: string } {
  if (breedLabel.length > 0) {
    return {
      // no-cta: copy fragment only — the caller's insert attaches
      // ctaLabel/ctaUrl ("Ver requisitos" → the pet profile).
      notificationType: "ppp_breed_list_updated_now_applies",
      body: `La raza de ${petName} (${breedLabel}) ahora figura en la lista de Animales Potencialmente Peligrosos de tu jurisdicción. Conocé los requisitos legales y, si corresponde, registrá la atestación.`,
    };
  }
  return {
    // no-cta: copy fragment only — the caller's insert attaches
    // ctaLabel/ctaUrl ("Ver requisitos" → the pet profile).
    notificationType: "ppp_weight_threshold_updated_now_applies",
    body: `El peso de ${petName} ahora supera el umbral de peso PPP de tu jurisdicción. Conocé los requisitos legales y, si corresponde, registrá la atestación.`,
  };
}
