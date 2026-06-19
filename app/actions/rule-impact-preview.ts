"use server";

// Rule-impact preview action for the PPP business-rule forms (Item 22).
//
// Returns the count of dogs in the target jurisdiction that would be newly
// affected by the candidate rule payload BEFORE it is saved.
//
// For ppp_breed_list: count dogs whose breed is in the candidate list but NOT
//   currently flagged as potentially_dangerous_breed.
// For ppp_weight_threshold: count dogs whose weight_kg meets the candidate
//   threshold but are NOT currently flagged.
//
// This is a read-only preview — it does NOT write any rows.
// Requires admin session (same auth guard as the rule forms).

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

export type RuleImpactPreviewInput =
  | {
      ruleType: "ppp_breed_list";
      breeds: string[];
      country: string;
      province: string | null;
      locality: string | null;
    }
  | {
      ruleType: "ppp_weight_threshold";
      kg: number | null;
      appliesIfBreedNotPPP: boolean;
      country: string;
      province: string | null;
      locality: string | null;
    };

export type RuleImpactPreviewResult = {
  affectedCount: number;
};

function buildJurisdictionConditions(
  country: string,
  province: string | null,
  locality: string | null,
) {
  const conditions = [eq(pets.jurisdictionCountry, country), eq(pets.species, "dog")];
  if (province !== null) conditions.push(eq(pets.jurisdictionProvince, province));
  if (locality !== null) conditions.push(eq(pets.jurisdictionLocality, locality));
  return conditions;
}

/**
 * Preview how many dogs in the jurisdiction would be affected (newly classified
 * as PPP) if the candidate rule were saved. Returns 0 when the rule input
 * cannot produce new classifications (e.g. kg = null for weight threshold).
 */
export async function previewRuleImpact(
  input: RuleImpactPreviewInput,
): Promise<RuleImpactPreviewResult> {
  await requireAdminOrRedirect();

  const { country, province, locality } = input;

  if (input.ruleType === "ppp_breed_list") {
    const { breeds } = input;
    if (breeds.length === 0) return { affectedCount: 0 };

    const conditions = buildJurisdictionConditions(country, province, locality);
    conditions.push(isNotNull(pets.breed));
    // Count dogs with a breed in the candidate list that are NOT yet flagged.
    conditions.push(eq(pets.potentiallyDangerousBreed, false));
    // Breed must appear in the candidate list (case-sensitive, exact match —
    // same as the reeval logic in lib/business-rules-reeval.ts).
    conditions.push(sql`trim(${pets.breed}) = ANY(${breeds})`);

    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pets)
      .where(and(...conditions));

    return { affectedCount: row?.n ?? 0 };
  }

  if (input.ruleType === "ppp_weight_threshold") {
    const { kg, appliesIfBreedNotPPP } = input;
    if (kg === null) return { affectedCount: 0 };

    const conditions = buildJurisdictionConditions(country, province, locality);
    // Only dogs NOT yet flagged as dangerous would be newly affected.
    conditions.push(eq(pets.potentiallyDangerousBreed, false));
    // Weight must meet or exceed the threshold.
    conditions.push(sql`${pets.estimatedWeightKg} >= ${kg}`);
    conditions.push(isNotNull(pets.estimatedWeightKg));

    // If appliesIfBreedNotPPP = false, the threshold only applies to dogs
    // already on the PPP breed list — but we only count currently-unflagged
    // dogs, so this subset is empty by definition. No additional filter needed.
    // If appliesIfBreedNotPPP = true, any dog meeting the weight qualifies.
    // The preview always returns dogs that WOULD flip — when appliesIfBreedNotPPP
    // is false, no currently-unflagged dog would flip via weight alone, so we
    // short-circuit and return 0.
    if (!appliesIfBreedNotPPP) return { affectedCount: 0 };

    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pets)
      .where(and(...conditions));

    return { affectedCount: row?.n ?? 0 };
  }

  return { affectedCount: 0 };
}
