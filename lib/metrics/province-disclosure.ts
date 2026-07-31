// lib/metrics/province-disclosure.ts — the D.10 disclosure rule for per-province
// aggregates published to an AUTHENTICATED operator (censo + control poblacional).
//
// THE RULING (PO, 2026-07-31, plan nocturno 2026-08-01 § "Decisiones del PO" D.10):
//
//   "El funcionario ve SU propia jurisdicción con el número real; se suprime lo
//    ajeno. El export coincide EXACTAMENTE con la pantalla."
//
// Rationale, preserved because it is the reason the rule is shaped this way and
// not the usual blanket k-anon: looking at your OWN municipality's census is not
// a disclosure. Those animals are your administrados — they are already in your
// padrón, by name, with their owners. Suppression exists to stop an operator
// INFERRING about OTHER jurisdictions, so it applies to foreign cells only. And
// an export that differs from the screen becomes the documented way to bypass
// the protection, so the decision is made HERE, once, inside the fetcher — the
// screen and the CSV consume the same already-decided rows and cannot diverge.
//
// WHY THIS EXISTS AT ALL (#40b triage): the retired premise was "no k-anon at
// province level, province cells are large". True of a province's POPULATION,
// false of a province's DENOMINATOR — and a per-unit RATE reveals its
// denominator while a per-province COUNT *is* the denominator. Both families
// route through here now.
//
// Pure and DB-free: `ProjectionContext` is only read for its scope, so the rule
// is unit-testable without Postgres.

import { ANONYMITY_K, complementarySuppress, suppressSmallCells } from "./anonymity";
import type { ProjectionContext } from "./context";
import { isOwnJurisdictionProvince } from "./scope";

/**
 * The exact text a withheld numeric cell exports as. Never a number, never "0"
 * — a withheld value is ABSENT, not zero (a false zero reads as real data AND
 * asserts something untrue).
 *
 * Deliberately the same wording as `SUPPRESSED_MARKER` in
 * lib/open-data/province-suppression.ts so an operator reads the SAME words in a
 * /gob CSV and in a public open-data download. `province-disclosure.test.ts`
 * pins the two strings together.
 */
export const SUPPRESSED_CELL_TEXT = "suprimido por privacidad";

/**
 * The complementary-suppression group: the whole country. Identical choice, and
 * for the identical reason, as the open-data province tier — the published
 * aggregate one level coarser than a province row is the NATIONAL total, so the
 * group across which a single hidden cell must not be isolable is national.
 */
const NATIONAL_GROUP = "AR";

/**
 * The minimum a row must carry for the rule to decide: which province it is, and
 * the DENOMINATOR the protected group is counted in.
 *
 * THE DENOMINATOR IS REQUIRED ON PURPOSE — the same contract, and the same
 * reason, as `provinceCell`'s obligatory 4th parameter (build-features.ts): every
 * caller has one (censo → the count itself, which IS the population; coverage →
 * `total`, the active-pet base), and making it required means the COMPILER, not a
 * reviewer, enumerates the sites where the question must be answered.
 */
export type ProvinceDenominatorRow = { province: string; denominator: number };

/** The decision for one province grouping, ready to apply to any row shape. */
export type ProvinceDisclosurePlan = {
  /** Provinces whose values must be WITHHELD (published as null, never 0). */
  withheld: ReadonlySet<string>;
  /**
   * How many provinces were withheld. Every surface that renders these rows
   * MUST say this number out loud. #40's own follow-up shipped a fully hatched
   * map with `suppressedCount: 0`: it hid the data and told nobody, which is
   * strictly worse than publishing it, because the operator reads absence as
   * "no pasa nada acá".
   */
  suppressedCount: number;
  /**
   * Σ denominator over ALL rows, withheld ones included — the honest input for a
   * "N sin provincia asignada" footnote, which must NOT be recomputed from the
   * visible rows alone (that would overstate the residual AND turn the footnote
   * into the subtraction channel).
   *
   * `null` when publishing it would isolate a single withheld cell by
   * subtraction. `complementarySuppress` already guarantees 0 or ≥2 withheld
   * cells in every group that HAS a visible sibling; this covers the one residual
   * it documents as un-complementable — a lone foreign cell with no visible
   * foreign sibling. Callers must render nothing when this is null.
   */
  publishableRowTotal: number | null;
};

/**
 * Decide, for one province-grouped result set and one viewer, which cells are
 * published and which are withheld.
 *
 * The rule, in order:
 *  1. OWN jurisdiction → always published. `isOwnJurisdictionProvince` (scope.ts)
 *     is the single scope model; this file does not define a second one.
 *  2. FOREIGN + denominator in (0, k) → withheld. k and the `>= k` comparison
 *     both come from `suppressSmallCells` — this function only routes rows
 *     through it, exactly as `provinceCell` does.
 *  3. THE ZERO NUANCE: a denominator of EXACTLY 0 is NOT protected. An empty
 *     group re-identifies nobody, and badging it "protegido por privacidad"
 *     would dress a genuine coverage gap as a deliberate withholding. Same
 *     nuance as `provinceCell`, `suppressDelta` and `isProtectedCount`.
 *  4. COMPLEMENTARY suppression over the foreign cells, grouped nationally, so a
 *     lone hidden province cannot be recovered by subtracting the published ones
 *     from a published total. Own cells are never promoted — D.10 says the
 *     operator sees their own number, and a rule that hides it to protect a
 *     stranger's cell has picked the wrong cell.
 *
 * ADMIN (scope.kind === "global") — decided on the merits, per the brief:
 * an admin owns NO province at this grain, so every cell is foreign and the
 * ordinary k-anon applies. Three reasons, in descending weight:
 *  (a) The padrón argument D.10 rests on is JURISDICTIONAL — "son sus
 *      administrados, ya están en tu padrón". A national platform admin has no
 *      padrón; the scope model agrees, `petsScopeClause` returns `null` for
 *      them, and "no jurisdiction predicate" is the ABSENCE of a jurisdiction,
 *      not ownership of all 24 (`censusEligibleProvince` reads global-no-drill
 *      as `null` for the same reason).
 *  (b) Repo precedent: task #40 already suppresses the province choropleth for
 *      admins — `provinceCell` decides on the denominator and never asks who is
 *      looking. Publishing "Tierra del Fuego: 3" on /admin/censo while
 *      /gob/panorama hatches that exact cell for that exact viewer would make
 *      the censo the documented bypass for the Panorama's protection: the same
 *      failure D.10 names for screen-vs-export, one surface further out.
 *  (c) An admin PROVINCE DRILL (`ctx.adminProvince`) is a URL parameter, not an
 *      assignment. Treating it as ownership would mean the whole protection is
 *      switched off by appending `?province=AR-V` — a suppression any viewer can
 *      turn off is not a suppression. So the drill narrows the rows and changes
 *      nothing about the verdict.
 *
 * KNOWN, ACCEPTED DIVERGENCE: a govt operator in a sub-k jurisdiction now sees
 * their real count on /gob/censo and a hatched cell for the same province on
 * /gob/panorama, whose loaders were closed by #40 under the earlier blanket
 * rule. D.10 is scoped to #40c (censo + población); realigning Panorama is a
 * separate decision, flagged rather than smuggled in here.
 */
export function planProvinceDisclosure(
  ctx: ProjectionContext,
  rows: readonly ProvinceDenominatorRow[],
): ProvinceDisclosurePlan {
  const rowTotal = rows.reduce((sum, r) => sum + r.denominator, 0);

  // (1) + (3): own cells and empty groups are never candidates.
  const candidates: ProvinceDenominatorRow[] = [];
  for (const r of rows) {
    if (isOwnJurisdictionProvince(ctx, r.province)) continue;
    if (r.denominator <= 0) continue;
    candidates.push(r);
  }

  // (2) k and the comparison come from the shared primitive, never re-typed.
  const primary = suppressSmallCells(candidates, {
    count: (r) => r.denominator,
    key: (r) => r.province,
    k: ANONYMITY_K,
  });

  // (4) national complementary pass over the foreign cells only.
  const { suppressed } = complementarySuppress(
    primary.visible as unknown as readonly ProvinceDenominatorRow[],
    primary.suppressed,
    { group: () => NATIONAL_GROUP, count: (r) => r.denominator },
  );

  const withheld = new Set(suppressed.map((r) => r.province));
  return {
    withheld,
    suppressedCount: withheld.size,
    // A single withheld cell is recoverable from a published Σ; withhold the Σ too.
    publishableRowTotal: withheld.size === 1 ? null : rowTotal,
  };
}

/**
 * The Spanish disclosure line every surface renders when `suppressedCount > 0`,
 * so the four consumers cannot drift into four different wordings (and so a
 * reviewer greps ONE string). Returns `null` when there is nothing to disclose —
 * a surface must never announce a suppression this frame does not carry (the
 * inverse failure: a legend promising a hatch the map never paints).
 */
export function provinceSuppressionNotice(suppressedCount: number): string | null {
  if (suppressedCount <= 0) return null;
  return suppressedCount === 1
    ? `1 provincia oculta por privacidad (menos de ${ANONYMITY_K} mascotas en la jurisdicción)`
    : `${suppressedCount} provincias ocultas por privacidad (menos de ${ANONYMITY_K} mascotas en la jurisdicción)`;
}
