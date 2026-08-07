// Server-only breed helpers — kept out of `lib/breeds.ts` so that
// client components can import the catalogs and the synchronous
// `isPotentiallyDangerousBreed` without dragging the
// business-rules-resolver (and its `db` transitive import) into the
// client bundle.

import "server-only";

import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";

/**
 * Jurisdiction-aware variant of `isPotentiallyDangerousBreed` that
 * consults the govt_business_rules resolver (spec
 * 2026-05-19-govt-business-rules-poc-design §4.3). Returns whether
 * `breed` is in the *effective* PPP list for the given location.
 * Defaults to the country-wide AR list when no override row exists.
 *
 * Use this in server actions that persist
 * `pets.potentially_dangerous_breed` — the synchronous variant in
 * `lib/breeds.ts` is kept for client-side UX (warning the owner
 * inline while typing).
 */
export async function isPotentiallyDangerousBreedForJurisdiction(
  species: string | null | undefined,
  breed: string | null | undefined,
  jurisdiction: { country?: string; province?: string | null; locality?: string | null },
): Promise<boolean> {
  if (species !== "dog" || !breed) return false;
  const rule = await resolveBusinessRule("ppp_breed_list", jurisdiction);
  return rule.payload.breeds.includes(breed.trim());
}
