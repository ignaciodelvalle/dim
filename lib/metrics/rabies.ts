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
 * "Currently-valid" predicate for a single rabies dose (issue #52 refinement).
 *
 * "Al día / covered" no longer means merely "a dose exists in the trailing 12
 * months". It means the dose is CURRENTLY VALID as of `until`:
 *   - When the dose carries an explicit `next_due_at` (the vet-set expiry): the
 *     dose is valid iff `until <= next_due_at`. This lets a still-valid OLDER
 *     dose (e.g. a multi-year vaccine given >12m ago but not yet due) count, and
 *     — crucially — makes a dose whose `next_due_at` has already PASSED NOT
 *     count even if it was administered less than 12 months ago.
 *   - When `next_due_at` is absent/blank (older data, combined-dose events): fall
 *     back to the trailing-12-month proxy — `occurred_at >= since`.
 * Both branches also require `occurred_at <= until` so an as-of scrub never
 * counts a dose recorded after the as-of instant.
 *
 * next_due_at is read from the RAW payload (not the amendment overlay): the
 * overlay is reserved for vaccine_name, which decides whether a dose is a rabies
 * dose at all; next_due_at corrections are not a known workflow and applying the
 * overlay here would multiply the correlated-subquery cost on the hottest govt
 * aggregate. If that changes, swap `nextDueRef` for `amendedPayloadText`.
 *
 * @param occurredAtRef SQL ref to the event's occurred_at column.
 * @param nextDueRef    SQL ref to the event's next_due_at text (e.g.
 *                      `sql`payload->>'next_due_at'``).
 * @param window        Fixed window: `until` is the as-of instant, `since` the
 *                      trailing-12m lower bound used by the fallback proxy.
 */
export function rabiesCurrentlyValidCondition(
  occurredAtRef: SQL,
  nextDueRef: SQL,
  window: { since: Date; until: Date },
): SQL {
  const untilIso = window.until.toISOString();
  const sinceIso = window.since.toISOString();
  return sql`(
    ${occurredAtRef} <= ${untilIso}
    AND (
      (
        (${nextDueRef}) IS NOT NULL AND (${nextDueRef}) <> ''
        AND (${nextDueRef})::timestamptz >= ${untilIso}
      )
      OR (
        ((${nextDueRef}) IS NULL OR (${nextDueRef}) = '')
        AND ${occurredAtRef} >= ${sinceIso}
      )
    )
  )`;
}

/**
 * The SINGLE definition of "this dose was signed by a matriculated veterinarian".
 *
 * `author_role = 'vet' AND author_verified = true` — the SAME predicate the
 * event-confidence model uses for its `professional_verified` tier
 * (lib/events/event-confidence.ts) and that lib/domain/provenance.ts coarsens
 * into the `firmado_matricula` provenance tier. Every rabies numerator site that
 * honors the panorama "solo firmado por matrícula" toggle (task #78 Part 3)
 * references THIS helper, so the locality choropleth, the province choropleth and
 * the national KPI can never drift on what "firmado por matrícula" means.
 *
 * Takes the author columns as SQL refs so it works under ANY table alias: the
 * EXISTS subquery aliases pet_events as `pe_rabies`, while the JOIN-shaped
 * fetchers (fetchRabiesCoverage / fetchRabiesCoverageByProvince) reference the
 * `pet_events` table columns directly.
 *
 * @param authorRoleRef     SQL ref to the event's author_role column.
 * @param authorVerifiedRef SQL ref to the event's author_verified column.
 */
export function rabiesSignedByMatriculaCondition(authorRoleRef: SQL, authorVerifiedRef: SQL): SQL {
  return sql`(${authorRoleRef} = 'vet' AND ${authorVerifiedRef} = true)`;
}

/**
 * EXISTS predicate: the pet referenced by `petIdRef` has at least one
 * `vaccination_administered` event whose amended vaccine_name matches
 * RABIES_VACCINE_NAME_REGEX and that is CURRENTLY VALID as of `window.until`
 * (see rabiesCurrentlyValidCondition — next_due_at expiry, 12m proxy fallback).
 *
 * SPECIES IS NOT FILTERED HERE — the canonical numerator is DOGS, but callers
 * apply `pets.species = 'dog'` at the pets level (where they already GROUP/FILTER)
 * so this one predicate serves every EXISTS-shaped aggregate. The JOIN-shaped
 * canonical fetchers (fetchRabiesCoverage / fetchRabiesCoverageByProvince) share
 * the regex + validity condition through this module rather than this EXISTS.
 *
 * @param petIdRef SQL reference to the outer pet id (e.g. `sql`${pets.id}``).
 * @param window   Fixed trailing-12m window { since, until } (see
 *                 rabiesCurrentlyValidCondition).
 * @param opts.signedOnly When true, additionally require the dose to be signed by
 *                 a matriculated vet (rabiesSignedByMatriculaCondition) — the
 *                 panorama "solo firmado por matrícula" numerator narrowing.
 *                 Defaults to false (every recorded dose counts).
 */
export function rabiesVaccinatedExists(
  petIdRef: SQL,
  window: { since: Date; until: Date },
  opts: { signedOnly?: boolean } = {},
): SQL {
  // Optional narrowing to vet-signed doses (task #78 Part 3). The clause is aliased
  // to the subquery's pe_rabies and goes through the SHARED helper so this locality
  // numerator, the province breakdown and the national KPI stay defined in ONE place.
  const signedClause = opts.signedOnly
    ? sql` AND ${rabiesSignedByMatriculaCondition(
        sql`pe_rabies.author_role`,
        sql`pe_rabies.author_verified`,
      )}`
    : sql``;
  return sql`EXISTS (
    SELECT 1 FROM ${petEvents} pe_rabies
    WHERE pe_rabies.pet_id = ${petIdRef}
      AND pe_rabies.event_type = 'vaccination_administered'
      AND (${amendedPayloadText("vaccine_name", { id: sql`pe_rabies.id`, payload: sql`pe_rabies.payload` })}) ~* ${RABIES_VACCINE_NAME_REGEX}
      AND ${rabiesCurrentlyValidCondition(sql`pe_rabies.occurred_at`, sql`pe_rabies.payload->>'next_due_at'`, window)}${signedClause}
  )`;
}
