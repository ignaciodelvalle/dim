// lib/metrics/kpi-catalog.ts — KPI-definition-as-code catalog (Wave B systemic fix).
//
// WHY THIS EXISTS
// ----------------
// The four-actor critique + gob audit (docs/design/handoffs/critiques-smoke-2026-07-03/
// critique-govt-2026-07-03.md) found that "Cobertura antirrábica" showed 42% on the
// Panel/Panorama surfaces and 54% on Analítica/Vigilancia — SAME label, TWO different
// computations (dogs-only/12m/anchored-regex vs all-species/all-time/substring-match).
// An operator has no way to tell these apart from the label alone.
//
// This module is the single source of truth for "what does this KPI actually MEAN":
// numerator, denominator, source tables/events, cadence (time window), and unit —
// for every program KPI surfaced on the /gob dashboards. It is DOCUMENTATION-AS-CODE,
// not a new computation: no KPI's math changes here. Fetchers keep living where they
// already do (lib/metrics/**, lib/analytics/govt-*.ts, lib/analytics/compliance-metrics.ts,
// lib/analytics/mortality-metrics.ts) — this catalog just names and cross-references them.
//
// DISAMBIGUATION (the fix for the 42%/54% drift):
//   RABIES_COVERAGE_DOGS_12M            — dogs only, trailing 12 months, anchored regex.
//   RABIES_VACCINATION_RATE_ALL_SPECIES — all species, all-time, substring match.
//   These get DISTINCT es-AR labels below. Neither is "wrong" — they answer different
//   questions ("are the dogs we're legally required to vaccinate covered in the last
//   year?" vs "what fraction of the whole registry has ever had a rabies shot logged?").
//   The bug was sharing one label across two answers, not the math itself.
//
// SCOPE / NON-GOALS
//   - This catalog does NOT invent new metrics or composite/derived scores (PO decision).
//   - It does NOT change any fetcher's numerator or denominator.
//   - Render-site label swaps (app/gob/**, components/panorama/**) are a follow-up —
//     see the "renderSitesToUpdate" note on each disambiguated entry. This catalog only
//     owns the canonical definitions + the lib-level label constants they're derived from
//     (RABIES_COVERAGE_LABEL_ES in govt-home-kpis.ts, RABIES_VACCINATION_RATE_LABEL_ES in
//     govt-dashboards.ts).
//
// MAINTENANCE
//   Adding a KPI to a /gob page? Add its entry here in the same PR. The test in
//   kpi-catalog.test.ts asserts every KPI fetcher imported by app/gob/page.tsx from
//   lib/analytics/{govt-home-kpis,compliance-metrics,mortality-metrics} has a matching
//   `fetcherName` in this catalog — CI fails if a new home-page KPI ships undocumented.

/** Stable identifier for a catalogued KPI. Snake_case, never reused once shipped. */
export type KpiId =
  | "rabies_coverage_dogs_12m"
  | "rabies_vaccination_rate_all_species"
  | "sterilization_coverage_population"
  | "sterilizations_per_month"
  | "bites_per_10k"
  | "active_zoonosis_signals"
  | "open_rabies_observations"
  | "open_bite_cases"
  | "notified_diseases"
  | "microchip_penetration"
  | "ppp_registry_compliance"
  | "open_welfare_reports"
  | "mortality_disposal_traceability"
  | "active_pregnancies"
  | "sterilization_natalidad_ratio"
  | "data_quality_completeness"
  | "custody_return_rate"
  | "shelter_occupancy_national";

/** Unit of the KPI's `value` field, for consistent formatting across surfaces. */
export type KpiUnit = "percent" | "count" | "rate_per_10k" | "ratio" | "days";

export type KpiDefinition = {
  /** Stable id — see KpiId. */
  id: KpiId;
  /** es-AR display label. MUST be distinct from any other catalog entry's label —
   *  this is the field that fixes the "same label, two truths" bug. */
  label: string;
  /** What is counted in the numerator, in plain language + the matching predicate. */
  numerator: string;
  /** What is counted in the denominator (or "n/a" for absolute counts). */
  denominator: string;
  /** Tables / event types this KPI reads from. */
  source: string;
  /** Exported fetcher function name — cross-referenced by the /gob coverage test. */
  fetcherName: string;
  /** File where the fetcher lives (relative to repo root). */
  fetcherPath: string;
  /** Time window / recomputation cadence (e.g. "trailing 12 months", "all-time", "now"). */
  cadence: string;
  /** Display unit. */
  unit: KpiUnit;
  /** k-anonymity or other suppression applied, if any. "none" when not applicable. */
  suppression: string;
  /** Free-form caveat — under/over-counting risks, legal basis, etc. Omit if none. */
  caveat?: string;
};

export const KPI_CATALOG: Record<KpiId, KpiDefinition> = {
  rabies_coverage_dogs_12m: {
    id: "rabies_coverage_dogs_12m",
    label: "Cobertura antirrábica — perros (12 meses)",
    numerator:
      "COUNT DISTINCT dogs with ≥1 vaccination_administered event where vaccine_name matches the anchored regex /(antirr[áa]bica|rabies)/i (via the amendment overlay — corrected names count under their current value), occurred_at within the trailing 12 months",
    denominator: "COUNT active/lost dogs (pets.species = 'dog') in scope",
    source: "pets, pet_events (vaccination_administered)",
    fetcherName: "fetchRabiesCoverage",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "trailing 12 months, recomputed on every render",
    unit: "percent",
    suppression: "none (province rows are never small enough to require k-anon)",
    caveat:
      "Legal basis: Ley 22.953 (vacunación antirrábica obligatoria). Only counts vaccines logged in MiMAR — real-world coverage may be higher. DISTINCT FROM rabies_vaccination_rate_all_species: different denominator population (dogs only) and time window (12m, not all-time). Rendered on /gob (Panel de jurisdicción) and Panorama — see app/gob/page.tsx and src/modules/panorama/application/get-panorama-kpis.ts (render-site label already reads 'Cobertura antirrábica (perros, 12m)', consistent with this entry).",
  },

  rabies_vaccination_rate_all_species: {
    id: "rabies_vaccination_rate_all_species",
    label: "Cobertura antirrábica — todas las mascotas (histórico)",
    numerator:
      "COUNT DISTINCT active/lost pets of ANY species with ≥1 vaccination_administered event where unaccent(vaccine_name) ILIKE unaccent('%rabi%') (via the amendment overlay), NO occurred_at filter — all-time",
    denominator: "COUNT active/lost pets (any species) in scope",
    source: "pets, pet_events (vaccination_administered)",
    fetcherName: "fetchAnalyticsMetrics",
    fetcherPath: "lib/analytics/govt-dashboards.ts",
    cadence: "all-time (no trailing window) — recomputed on every render",
    unit: "percent",
    suppression: "none",
    caveat:
      "This is the KPI the four-actor critique flagged as showing 54% under the SAME label as rabies_coverage_dogs_12m's 42% (critique-govt-2026-07-03.md, 'Same metric, different numbers'). Three real differences drive the gap: (1) denominator includes non-dog species, (2) no 12-month window — a vaccine logged years ago still counts, (3) looser match ('%rabi%' substring vs the anchored regex). Neither number is wrong; they answer different questions. Render sites: app/gob/analytics/page.tsx ('Cobertura antirrábica (mascotas)') and the per-province ranking in lib/analytics/analytics-ranking.ts (fetchRegionRanking reuses this SAME all-species/all-time definition, so Analítica's national figure and its ranking table are internally consistent). FOLLOW-UP (render-site, out of lane): app/gob/analytics/page.tsx's label should read 'Cobertura antirrábica — todas las mascotas (histórico)' to match this catalog entry verbatim.",
  },

  sterilization_coverage_population: {
    id: "sterilization_coverage_population",
    label: "Cobertura de esterilización (stock)",
    numerator: "COUNT DISTINCT active/lost pets with ≥1 sterilization_performed event, ever",
    denominator: "COUNT active/lost pets in scope",
    source: "pets, pet_events (sterilization_performed)",
    fetcherName: "fetchSterilizationCoverage",
    fetcherPath: "lib/metrics/population-control.ts",
    cadence: "point-in-time snapshot (not period-bound — 'ever sterilized', not 'in period')",
    unit: "percent",
    suppression: "none",
    caveat:
      "Programmatic benchmark (70%), not a universal legal mandate — obligatory by provincial law only in Santa Fe, Mendoza, La Rioja, Chubut, San Juan. Shared by /gob/poblacion and Panorama (same fetcher — dashboard parity guaranteed by construction).",
  },

  sterilizations_per_month: {
    id: "sterilizations_per_month",
    label: "Esterilizaciones / mes",
    numerator: "COUNT sterilization_performed events in the trailing 30 days",
    denominator:
      "n/a — flow count, not a ratio (compared against the prior 30d window for deltaPct)",
    source: "pet_events (sterilization_performed)",
    fetcherName: "fetchSterilizationMetrics",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "trailing 30 days vs prior 30 days",
    unit: "count",
    suppression: "none",
  },

  bites_per_10k: {
    id: "bites_per_10k",
    label: "Mordeduras / 10.000 habitantes",
    numerator:
      "COUNT incident_reported events where payload.incident_type = 'bite_inflicted', occurred_at within the trailing 12 months",
    denominator: "jurisdictions_census.population (summed over scope) / 10,000",
    source: "pet_events (incident_reported), jurisdictions_census",
    fetcherName: "fetchBitesPer10k",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "trailing 12 months vs prior 12 months",
    unit: "rate_per_10k",
    suppression: "none",
    caveat:
      "Denominator is HUMAN census population, not pet population — used as a zoonotic-risk proxy (A6). Renders as 0 when a jurisdiction has no census row rather than throwing on division by zero.",
  },

  active_zoonosis_signals: {
    id: "active_zoonosis_signals",
    label: "Casos de zoonosis activos",
    numerator:
      "COUNT DISTINCT pets with an active rabies observation (rabies_observation_status = 'in_progress') OR an open bite_incident case (deduplicated via UNION, not summed) + COUNT disease_reported events where payload.disease = 'lepto' (trailing 30d) + COUNT disease_reported events where payload.disease = 'hidatidosis' (trailing 30d)",
    denominator: "n/a — absolute count",
    source: "pets, cases, pet_events (disease_reported, rabies_observation_started)",
    fetcherName: "fetchActiveZoonosis",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "rabies/bite components are a 'now' snapshot; lepto/hidat are trailing 30 days",
    unit: "count",
    suppression: "none",
    caveat:
      "The rabies+bite union is deduplicated at the pet level — a pet in both an active observation AND an open bite case counts once, not twice (fixed from an earlier Math.max approximation that assumed full nesting). STILL SURFACED on Panorama's metrics column (src/modules/panorama/application/get-panorama-kpis.ts) even though /gob home replaced it with its three decomposed parts below (open_rabies_observations, open_bite_cases, notified_diseases) — kept here because it is a genuinely different, still-rendered composite, not dead code.",
  },

  open_rabies_observations: {
    id: "open_rabies_observations",
    label: "Observaciones rábicas abiertas",
    numerator: "COUNT active/lost pets where rabies_observation_status = 'in_progress'",
    denominator: "n/a — absolute count",
    source: "pets, pet_events (rabies_observation_started, for the weekly delta)",
    fetcherName: "fetchOpenRabiesObservations",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "'now' snapshot; deltaWeek compares the trailing 7 days of opens vs the prior 7 days",
    unit: "count",
    suppression: "none",
    caveat:
      "Decomposed from active_zoonosis_signals's rabies arm (PO-ratified split of the opaque composite into legible signals) — same predicate and same deltaWeek computation, just no longer merged with the open-bite-case count.",
  },

  open_bite_cases: {
    id: "open_bite_cases",
    label: "Mordeduras abiertas",
    numerator: "COUNT cases where case_kind = 'bite_incident' AND status = 'open'",
    denominator: "n/a — absolute count",
    source: "cases",
    fetcherName: "fetchOpenBiteCases",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "'now' snapshot",
    unit: "count",
    suppression: "none",
    caveat:
      "Decomposed from active_zoonosis_signals's open-bite-case arm (PO-ratified split) — same casesScopeClause and predicate the composite used for its dedup UNION, now counted on its own instead of merged with rabies-observation pets.",
  },

  notified_diseases: {
    id: "notified_diseases",
    label: "Enfermedades notificadas",
    numerator:
      "COUNT disease_reported events in the trailing 30 days in scope (ALL diseases, not only lepto/hidatidosis)",
    denominator: "n/a — absolute count",
    source: "pet_events (disease_reported)",
    fetcherName: "fetchNotifiedDiseases",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "trailing 30 days ending at ctx.period.until",
    unit: "count",
    suppression: "none",
    caveat:
      "Generalises active_zoonosis_signals's lepto+hidat arms (PO-ratified split) to every disease_reported event in the window — the truest 'enfermedades notificadas' axis. Returns lepto/hidat as a sub-breakdown for continuity with the composite's legend, but the catalogued count is the ALL-diseases total, not just those two.",
  },

  microchip_penetration: {
    id: "microchip_penetration",
    label: "Penetración de microchip",
    numerator: "COUNT active/lost pets with ≥1 active microchip_iso identification",
    denominator: "COUNT active/lost pets in scope",
    source: "pets, pet_identifications",
    fetcherName: "fetchMicrochipPenetration",
    fetcherPath: "lib/analytics/compliance-metrics.ts",
    cadence: "point-in-time snapshot",
    unit: "percent",
    suppression:
      "k-anon (k=5) on the per-locality breakdown; the national/province figure is unsuppressed",
    caveat: "Legal basis: Ley Provincial 14.107. Only counts microchips registered in MiMAR.",
  },

  ppp_registry_compliance: {
    id: "ppp_registry_compliance",
    label: "Registro PPP (razas potencialmente peligrosas)",
    numerator: "COUNT DISTINCT PPP-flagged active pets with ≥1 dangerous_breed_attested event",
    denominator: "COUNT active/lost pets where potentially_dangerous_breed = true",
    source: "pets, pet_events (dangerous_breed_attested)",
    fetcherName: "fetchDangerousBreedCompliance",
    fetcherPath: "lib/analytics/compliance-metrics.ts",
    cadence: "point-in-time snapshot",
    unit: "percent",
    suppression: "none",
    caveat:
      "Legal basis: Ley CABA 4078 / Ley Prov. 14.107. Reads 0% until the attestation form ships — that is a true value (no adoption yet), not a bug.",
  },

  open_welfare_reports: {
    id: "open_welfare_reports",
    label: "Denuncias ciudadanas activas",
    numerator: "COUNT welfare_reports rows where status NOT IN ('closed', 'duplicate')",
    denominator: "n/a — absolute count",
    source: "welfare_reports",
    fetcherName: "fetchOpenWelfareReportsCount",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "point-in-time snapshot",
    unit: "count",
    suppression: "none",
  },

  mortality_disposal_traceability: {
    id: "mortality_disposal_traceability",
    label: "Disposición trazable de fallecimientos",
    numerator:
      "COUNT death_recorded events where disposal method is known (NOT NULL and <> 'unknown') AND a disposal facility is present",
    denominator: "COUNT death_recorded events in the trailing 12 months",
    source: "pet_events (death_recorded)",
    fetcherName: "fetchMortalityDisposition",
    fetcherPath: "lib/analytics/mortality-metrics.ts",
    cadence: "trailing 12 months",
    unit: "percent",
    suppression: "none",
    caveat:
      "Target: 75% traceable; ≥25% unknown disposition is treated as a breach (DISPOSAL_UNKNOWN_BREACH_PCT).",
  },

  active_pregnancies: {
    id: "active_pregnancies",
    label: "Preñeces en seguimiento",
    numerator: "COUNT active/lost pets where pregnancy_status = 'in_progress'",
    denominator: "n/a — absolute count",
    source: "pets (denormalized pregnancy_status column)",
    fetcherName: "fetchActivePregnancies",
    fetcherPath: "lib/metrics/population-control.ts",
    cadence: "point-in-time snapshot",
    unit: "count",
    suppression: "none",
  },

  sterilization_natalidad_ratio: {
    id: "sterilization_natalidad_ratio",
    label: "Ratio esterilización / natalidad registrada",
    numerator: "COUNT sterilization_performed events in the ctx period",
    denominator:
      "COUNT registered live births in the SAME period (clinical_info_logged events with sub_kind='pregnancy', pregnancy_phase='ended', outcome='live_birth') — null when 0",
    source: "pet_events (sterilization_performed, clinical_info_logged)",
    fetcherName: "fetchSterilizationNatalidadRatio",
    fetcherPath: "lib/metrics/population-control.ts",
    cadence: "matches the caller's ProjectionContext period",
    unit: "ratio",
    suppression: "none",
    caveat:
      "NATALIDAD CAVEAT: the denominator only counts TRACKED pregnancies recorded in MiMAR — street/untracked litters are invisible, so this ratio systematically OVER-estimates containment (under-counts births). Directional signal, not exact. Must ship with the UI caveat 'Solo partos en seguimiento — subestima la natalidad real'.",
  },

  data_quality_completeness: {
    id: "data_quality_completeness",
    label: "Completitud de datos del registro",
    numerator:
      "COUNT active/lost pets with NONE of: jurisdiction_locality IS NULL, sex = 'unknown', missing active microchip_iso",
    denominator: "COUNT active/lost pets in scope",
    source: "pets, pet_identifications",
    fetcherName: "fetchDataQuality",
    fetcherPath: "lib/metrics/program-health.ts",
    cadence: "point-in-time snapshot",
    unit: "percent",
    suppression: "none",
  },

  custody_return_rate: {
    id: "custody_return_rate",
    label: "Tasa de devolución de adopciones",
    numerator: "COUNT adoption_reversed events in the ctx period",
    denominator: "COUNT adoption_finalized events in the SAME period — null when 0",
    source: "pet_events (adoption_finalized, adoption_reversed)",
    fetcherName: "fetchReturnRate",
    fetcherPath: "lib/metrics/custody.ts",
    cadence: "matches the caller's ProjectionContext period",
    unit: "ratio",
    suppression: "none",
    caveat:
      "Numerator and denominator are independent 'events in window' counts, not a followed cohort — a reversal in-period may reference an adoption finalized before the period started.",
  },

  shelter_occupancy_national: {
    id: "shelter_occupancy_national",
    label: "Ocupación de refugios (nacional)",
    numerator: "SUM active ownerships where role = 'shelter_custody' AND ended_at IS NULL",
    denominator:
      "SUM organizations.capacity_total for organizations where org_type = 'shelter' — null when no capacity declared",
    source: "ownerships, organizations",
    fetcherName: "fetchShelterOccupancyNational",
    fetcherPath: "lib/metrics/custody.ts",
    cadence: "point-in-time snapshot",
    unit: "percent",
    suppression: "none",
    caveat: "Admin-only aggregate (national); capacity is org self-reported config, not verified.",
  },
};

/** All catalog entries as an array — convenience for iteration/rendering. */
export const KPI_CATALOG_LIST: KpiDefinition[] = Object.values(KPI_CATALOG);

/**
 * Look up a catalog entry by its fetcher function name.
 * Used by tests/tooling that start from "which fetcher renders this tile"
 * rather than from the KpiId.
 */
export function findKpiByFetcherName(fetcherName: string): KpiDefinition | undefined {
  return KPI_CATALOG_LIST.find((k) => k.fetcherName === fetcherName);
}
