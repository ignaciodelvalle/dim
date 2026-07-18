// Per-cápita encoding domain — province grain, v1 (panorama-percapita).
//
// The panorama's count layers paint ABSOLUTE province counts, so Buenos Aires
// always dwarfs Tierra del Fuego regardless of incidence. The per-cápita
// encoding renormalizes a count-shaped province cell by the INDEC census
// population: value10k = count / population × 10.000 — the same convention (and
// the SAME denominator table, `jurisdictions_census`) the "Mordeduras / 10.000
// habitantes" KPI (lib/analytics/govt-home-kpis.fetchBitesPer10k) already uses,
// so the map and the KPI can never disagree on what "por 10.000 hab." means.
//
// V1 IS PROVINCE-GRAIN ONLY: `jurisdictions_census` holds 24 province rows
// (Censo 2022) and NO department/locality populations. Below province framing
// per-cápita is NOT computable — the UI shows a disabled roadmap affordance
// ("Per cápita por departamento (en desarrollo)", requires an INDEC department
// import) and falls back to counts EXPLICITLY, never silently.
//
// PRIVACY (v1): the k=5 numerator suppression is applied UPSTREAM (repository
// rollups); a suppressed count reaches this module as null and STAYS null — no
// rate is ever derived from a hidden count. No denominator-privacy floor is
// needed at province grain: every census population is > 190.000 (smallest:
// Tierra del Fuego, 190.641), so a per-10k rate can never be inverted into a
// small-cell count. PHASE 2 (department grain) MUST revisit this: department
// populations go down to ~3 digits, where a rate over a tiny denominator can
// leak a k-suppressed numerator — add a denominator floor there.
//
// Pure module — NO @/db, NO next, NO React (hexagonal domain purity, enforced
// by the biome noRestrictedImports override for src/modules/*/domain/**).

import { getLayer } from "./layers";
import type { AggregationLevel, FeatureCollection, LayerId, PanoramaFeature } from "./types";

// ---------------------------------------------------------------------------
// Layer eligibility — a DECLARED per-layer property (the
// PROVINCE_ONLY_CHOROPLETH_IDS / NATIONAL_DEPARTMENT_GRAIN_IDS precedent).
// ---------------------------------------------------------------------------

/**
 * The layers whose PROVINCE cells are raw event/report COUNTS for which a
 * human-population denominator is meaningful — the per-cápita eligible set.
 *
 * WHY these four:
 *  - `perdidas`   — lost-pet reports per province: per-inhabitant incidence is
 *                   the honest cross-province comparison (population ∝ pets).
 *  - `mordeduras` — bite incidents: the KPI strip ALREADY reads this concept as
 *                   "Mordeduras / 10.000 habitantes" (fetchBitesPer10k) over the
 *                   SAME `jurisdictions_census` denominator. The MAP layer serves
 *                   raw counts (loadMordedurassByUnit) — dividing here is the
 *                   first and only division (no double-divide).
 *  - `denuncias`  — welfare reports per province: per-inhabitant report rate.
 *  - `sintomas`   — syndromic-surveillance reports: per-inhabitant incidence.
 *
 * WHY the rest are excluded:
 *  - cobertura / esterilizacion / microchip / ppp / antiparasitario — % rates
 *    over a PET denominator; dividing a percentage by humans is meaningless.
 *  - reunificacion — a ratePct signal (0-100), same reason.
 *  - acceso-veterinario — ALREADY normalized (visits per 1.000 pets); a second
 *    division would double-normalize.
 *  - indice-territorial — a 0-100 attainment index, not a count.
 *  - zoonosis — renders DEPARTMENT grain even at the national vista
 *    (NATIONAL_DEPARTMENT_GRAIN_IDS): its cells are departments, and v1 has no
 *    department census denominator (that is exactly the phase-2 gap).
 *  - mortalidad — deceased-pet counts: the meaningful denominator is the PET
 *    registry (like acceso-veterinario's per-1.000 pets), not the human census;
 *    a per-inhabitant pet-mortality rate would imply an incidence claim the
 *    denominator cannot support. (It is also the one count choropleth the admin
 *    cube serves — keeping it out keeps every eligible layer on the live
 *    province rollup path, per the "cube untouched" constraint.)
 *  - refugios / clinicas / decomisos — reference pins (individual entities),
 *    never per-unit counts.
 */
export const PERCAPITA_ELIGIBLE_IDS: ReadonlySet<LayerId> = new Set<LayerId>([
  "perdidas",
  "mordeduras",
  "denuncias",
  "sintomas",
]);

/** True when the layer's province cells may be re-encoded per 10.000 habitantes. */
export function isPercapitaEligible(id: LayerId): boolean {
  return PERCAPITA_ELIGIBLE_IDS.has(id);
}

/**
 * View-level gate predicate: the per-cápita encoding is offered iff
 *  - the view reads the PROVINCE axis (v1 has no finer census denominator), and
 *  - EVERY aggregating (non-reference) active layer is per-cápita eligible, and
 *    at least one is.
 *
 * The "every aggregating layer" rule exists because the graduated-symbol scale
 * is SHARED across the active count layers (graduatedMaxCount): transforming
 * only the base while a raw-count signal (zoonosis) rides the same scale would
 * mix units in one legend — a label≠map lie. Reference layers (refugios /
 * decomisos / clinicas) are pins, not counts; they never block. Mirrors the
 * bivariate P2 precedent: pin v1 to the sets the encoding can render honestly.
 */
export function percapitaEligibleFor(layers: readonly LayerId[], level: AggregationLevel): boolean {
  if (level !== "province") return false;
  let aggregating = 0;
  for (const id of layers) {
    const layer = getLayer(id);
    if (!layer || layer.dataType === "reference") continue;
    if (!isPercapitaEligible(id)) return false;
    aggregating += 1;
  }
  return aggregating > 0;
}

// ---------------------------------------------------------------------------
// The math
// ---------------------------------------------------------------------------

/**
 * value10k = count / population × 10.000 — the RAW, UNROUNDED rate.
 *
 * F2: a 2-decimal round here collapsed a tiny-but-real rate (1..8 events over
 * Buenos Aires's 17,5 M hab. ≈ 0,0006..0,0046) to 0 — a fabricated "no
 * incidence". A positive count must NEVER project to 0, so the math stays exact
 * and the SCALE (buildGraduatedScale) is the only place a max is quantized (for
 * binning), while {@link per10kDisplayValue} owns the honest small-rate LABEL.
 *
 * Returns null — NEVER 0 — when either arm is unusable: a null count (k-anon
 * suppressed upstream) or a missing/non-positive population (no census row).
 * A fabricated 0 would claim "no incidence" where the truth is "no data".
 */
export function perCapitaRate(
  count: number | null | undefined,
  population: number | null | undefined,
): number | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  if (typeof population !== "number" || !Number.isFinite(population) || population <= 0) {
    return null;
  }
  return (count / population) * 10_000;
}

/**
 * Honest es-AR display string for a per-10k rate (F2). The map paints the RAW
 * rate (see perCapitaRate), but a 2-decimal readout of a very small positive
 * rate rounds to "0,00" and reads as "no incidence". This display:
 *  - null / non-finite → "" (the caller renders its own no-data copy);
 *  - 0 < v < 0,005     → "<0,01" (positive, but below the 2-decimal grid);
 *  - otherwise         → es-AR with EXACTLY 2 decimals (a genuine 0 → "0,00").
 */
export function per10kDisplayValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value > 0 && value < 0.005) return "<0,01";
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// The census join (server-side enrichment)
// ---------------------------------------------------------------------------

/** The census lookup the repository loads from `jurisdictions_census` (24 rows). */
export type CensusLookup = {
  /** population keyed by CANONICAL province display name (the table's PK). */
  populations: Readonly<Record<string, number>>;
  /** Four-digit census year (e.g. 2022). */
  year: number;
  /** Human-readable source citation (e.g. "INDEC Censo 2022"). */
  source: string;
};

/**
 * Normalize a province name for the rollup↔census join: case/space tolerant and
 * accent-stripped (NFD + diacritic removal) — the SAME rule the bivariate join
 * uses (domain/bivariate.ts normName), so "Córdoba" matches "Cordoba" even if
 * one side lost its accent upstream. Both sides speak the canonical province
 * vocabulary (pets.jurisdiction_province ↔ jurisdictions_census.province_name,
 * schema comment on migration 0067), so this is belt-and-suspenders, not a
 * fuzzy match: an unmatched name stays unmatched → honest no-data.
 */
export function normalizeProvinceName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** The structural props subset the enrichment reads (an AggregatedPointProps). */
type ProvinceCountProps = Record<string, unknown> & {
  province?: unknown;
  level?: unknown;
  count?: unknown;
  suppressed?: unknown;
};

/** Extra props the enrichment adds to a PROVINCE cell. Carried ON THE FEATURE
 * (not a side channel) so every payload path — Data Cache, first-visit seed,
 * saved boards — preserves them wherever the features travel. */
export type PerCapitaProps = {
  /** Census population for the cell's province; null = no census row matched. */
  population: number | null;
  /** count / population × 10.000 (2 decimals); null = suppressed or no census. */
  per10k: number | null;
  censusYear: number;
  censusSource: string;
};

/**
 * Join province-grain aggregated cells to the census lookup by normalized
 * province name, adding `population` / `per10k` / census metadata to each
 * PROVINCE feature. Non-province features pass through untouched. The raw
 * `count` is NOT modified here — {@link projectPerCapita} performs the swap at
 * render time, so the same enriched payload serves BOTH encodings.
 *
 * Honesty rules:
 *  - unmatched province → population null, per10k null (no-data, never 0);
 *  - suppressed / null count → per10k null (no rate from a hidden count).
 */
export function enrichPerCapita(
  features: FeatureCollection,
  lookup: CensusLookup,
): FeatureCollection {
  const byNorm = new Map<string, number>();
  for (const [name, population] of Object.entries(lookup.populations)) {
    byNorm.set(normalizeProvinceName(name), population);
  }
  return {
    type: "FeatureCollection",
    features: features.features.map((f) => {
      const p = f.properties as ProvinceCountProps;
      if (p.level !== "province" || typeof p.province !== "string") return f;
      const population = byNorm.get(normalizeProvinceName(p.province)) ?? null;
      const suppressed = p.suppressed === true;
      const count = typeof p.count === "number" ? p.count : null;
      const per10k = suppressed ? null : perCapitaRate(count, population);
      const enriched: PerCapitaProps = {
        population,
        per10k,
        censusYear: lookup.year,
        censusSource: lookup.source,
      };
      return { ...f, properties: { ...f.properties, ...enriched } };
    }),
  };
}

// ---------------------------------------------------------------------------
// The render-time projection (client-side)
// ---------------------------------------------------------------------------

/**
 * Project an enriched province collection into its per-cápita encoding: `count`
 * becomes `per10k` so the graduated scale, legend, popup and table all read the
 * normalized value through the SAME property the count encoding uses (two
 * surfaces reading one value cannot diverge).
 *
 *  - suppressed cell → count null, `suppressed` PRESERVED (renders muted, the
 *    popup says "protegido" — k-anon propagates, per the bivariate precedent);
 *  - no census match → count null, suppressed false (honest no-data, never 0);
 *  - un-enriched feature (stale cache / census unavailable) → count null: the
 *    denominator is unknown, so no rate is claimed.
 */
export function projectPerCapita(features: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.features.map((f) => {
      const p = f.properties as ProvinceCountProps & Partial<PerCapitaProps>;
      if (p.level !== "province") return f;
      const per10k = typeof p.per10k === "number" ? p.per10k : null;
      return {
        ...f,
        properties: { ...f.properties, count: per10k, perCapita: true },
      } as PanoramaFeature;
    }),
  };
}

// ---------------------------------------------------------------------------
// Census metadata → the honest footer
// ---------------------------------------------------------------------------

/** Census metadata for the caption footer, read from the enriched features. */
export type CensusMeta = { year: number; source: string };

/** Read the census metadata off an enriched collection (null when absent —
 * the footer is then omitted rather than fabricated). */
export function censusMetaOf(features: FeatureCollection): CensusMeta | null {
  for (const f of features.features) {
    const p = f.properties as Partial<PerCapitaProps>;
    if (typeof p.censusYear === "number" && typeof p.censusSource === "string") {
      return { year: p.censusYear, source: p.censusSource };
    }
  }
  return null;
}

/** es-AR unit phrase — shared by the layer label, legend and popup surfaces. */
export const PERCAPITA_UNIT_LABEL = "por 10.000 hab.";

/**
 * The honest footer line, built from the census TABLE's own metadata (year +
 * source institution), never hardcoded: "Tasas por 10.000 habitantes — Censo
 * 2022 (INDEC)". The institution is the source citation's leading word (the
 * seeded rows read "INDEC Censo 2022"); a full-citation fallback keeps an
 * unexpected format honest rather than truncated wrong.
 */
export function percapitaFooterLabel(meta: CensusMeta): string {
  const institution = meta.source.trim().split(/[\s,]+/)[0] || meta.source;
  return `Tasas por 10.000 habitantes — Censo ${meta.year} (${institution})`;
}

/** Layer label with the per-10k unit appended — the ONE transform every surface
 * that names the layer (legend, popup, panel row) applies while the encoding is
 * active, so the unit switch is visible wherever the name is. */
export function percapitaLayerLabel(label: string): string {
  return `${label} (${PERCAPITA_UNIT_LABEL})`;
}
