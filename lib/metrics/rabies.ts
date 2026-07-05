// Shared rabies-vaccination predicate — the SINGLE definition of "this pet has a
// qualifying rabies vaccination in the reporting window".
//
// WHY THIS EXISTS (data-correctness review C3, the "42%-vs-54%" class): the
// canonical KPI `rabies_coverage_dogs_12m` (govt-home-kpis.ts fetchRabiesCoverage /
// fetchRabiesCoverageByProvince) counts DOGS, over the trailing 12 months, whose
// vaccine_name matches an anchored, accent-aware regex through the amendment
// overlay. But three other surfaces had DRIFTED away from that definition:
//   - fetchCrossJurisdictionOutliers (the /admin panel) matched the regex but had
//     NO occurred_at window → all-time coverage.
//   - the Panorama LOCALITY choropleth used `ILIKE '%rabi%'` (accent-SENSITIVE, so
//     it silently missed the canonical form "Antirrábica") over ALL species and
//     ALL time.
// This module extracts ONE predicate + ONE regex so panel / locality / province /
// national all agree.
//
// vaccine_name is read through the amendment overlay (amendedPayloadText) so a
// corrected vaccine counts under its CURRENT name (projection-cron audit A2).

import { type SQL, sql } from "drizzle-orm";

import { petEvents } from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";

/**
 * Anchored, accent-aware regex identifying a rabies vaccine by its (amended)
 * vaccine_name. The SINGLE source of "is this a rabies vaccine": matches the
 * canonical form name "Antirrábica" (accented á) as well as "rabies", but NOT
 * arbitrary substrings. Used with the `~*` (case-insensitive regex) operator.
 */
export const RABIES_VACCINE_NAME_REGEX = "(antirr[áa]bica|rabies)";

/**
 * EXISTS predicate: the pet referenced by `petIdRef` has at least one
 * `vaccination_administered` event whose amended vaccine_name matches
 * RABIES_VACCINE_NAME_REGEX, with `occurred_at >= since` (the trailing-12-month
 * reporting window).
 *
 * SPECIES IS NOT FILTERED HERE — the canonical numerator is DOGS, but callers
 * apply `pets.species = 'dog'` at the pets level (where they already GROUP/FILTER)
 * so this one predicate serves every EXISTS-shaped aggregate. The JOIN-shaped
 * canonical fetchers (fetchRabiesCoverage / fetchRabiesCoverageByProvince) share
 * the regex + window through RABIES_VACCINE_NAME_REGEX rather than this EXISTS.
 *
 * @param petIdRef SQL reference to the outer pet id (e.g. `sql`${pets.id}``).
 * @param since    Inclusive lower bound on occurred_at (trailing-12m `period.since`).
 */
export function rabiesVaccinatedExists(petIdRef: SQL, since: Date): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${petEvents} pe_rabies
    WHERE pe_rabies.pet_id = ${petIdRef}
      AND pe_rabies.event_type = 'vaccination_administered'
      AND (${amendedPayloadText("vaccine_name", { id: sql`pe_rabies.id`, payload: sql`pe_rabies.payload` })}) ~* ${RABIES_VACCINE_NAME_REGEX}
      AND pe_rabies.occurred_at >= ${since.toISOString()}
  )`;
}
