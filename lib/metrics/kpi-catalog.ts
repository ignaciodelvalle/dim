// lib/metrics/kpi-catalog.ts — KPI-definition-as-code catalog (Wave B systemic fix).
//
// C1 — METRIC CONTRACT (docs/reviews/results/2026-07-22-plan-maestro-integridad.md,
// §2 "C1 · Contrato de Métrica"): this module graduates from KPI documentation
// to an EXECUTABLE contract. The systemic failure C1 targets: "a KPI today is a
// fetcher + a label + a color decided ad-hoc per screen" — nothing forces a
// render site to declare the decision question, a target + its legal/programmatic
// source, when a color is legitimate, or the presentation guards that keep a
// small-N rate or a 0/0 ratio from reading as a confident verdict. The fields
// added below (question/target/semaphore/guards/confidence/exclusions) are that
// contract; lib/metrics/presentation-guards.ts is the renderer-side engine that
// enforces `guards`/`semaphore` ONCE instead of per-screen ad-hoc logic.
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
//   - The rabies-coverage render-site label swap (app/gob/**, app/gob/analytics/**,
//     components/panorama/**) is DONE — every render site imports the lib-level label
//     constant (RABIES_COVERAGE_LABEL_ES in govt-home-kpis.ts, RABIES_VACCINATION_RATE_LABEL_ES
//     in govt-dashboards.ts) instead of repeating a similar-looking string literal.
//     scripts/check-metric-labels.ts guards against a future render site drifting back
//     to a duplicated/diverging string for a catalogued KPI's label.
//
// MAINTENANCE
//   Adding a KPI to a /gob page? Add its entry here in the same PR. The test in
//   kpi-catalog.test.ts asserts every KPI fetcher imported by app/gob/page.tsx from
//   lib/analytics/{govt-home-kpis,compliance-metrics,mortality-metrics} has a matching
//   `fetcherName` in this catalog — CI fails if a new home-page KPI ships undocumented.

import { TARGETS } from "./targets";

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
  | "mortality_deaths_12m"
  | "active_pregnancies"
  | "sterilization_natalidad_ratio"
  | "data_quality_completeness"
  | "custody_return_rate"
  | "shelter_occupancy_national"
  | "deworming_coverage_population"
  | "vet_access_per_1k_locality"
  | "movement_volume"
  | "adoption_application_conversion"
  | "eno_sla_compliance"
  | "reunification_rate"
  | "bite_escalation_gap";

/** Unit of the KPI's `value` field, for consistent formatting across surfaces. */
export type KpiUnit = "percent" | "count" | "rate_per_10k" | "ratio" | "days";

/**
 * Machine-readable time window — the SAME axis that split "Cobertura
 * antirrábica" into two truths (42% trailing-12m vs 54% all-time). `cadence`
 * carries the full prose; `window` is the short categorical tag a render site
 * or the check-metric-labels guard can compare without parsing prose.
 * "mixed" is for composites whose sub-parts use different windows (e.g.
 * active_zoonosis_signals: a 'now' snapshot unioned with a 30d flow count).
 */
export type KpiWindow = "now" | "7d" | "30d" | "12m" | "all_time" | "period" | "mixed";

/**
 * Which pets the numerator/denominator population is drawn from — the OTHER
 * axis of the "Cobertura antirrábica" split (dogs-only vs any species).
 * "n/a" is for KPIs whose scope isn't pet-species-shaped (case/report counts,
 * human-population-denominated rates).
 */
export type KpiSpecies = "dogs" | "all_species" | "n/a";

/**
 * Counting basis, independent of `unit`: "stock" is a point-in-time count of
 * entities currently in a state (open cases, active pregnancies); "flow" is a
 * count of events that occurred within `window`; "ratio" is a
 * numerator/denominator computation (percent, rate, or dimensionless ratio),
 * regardless of whether `unit` renders it as "percent" or "rate_per_10k".
 */
export type KpiBasis = "stock" | "flow" | "ratio";

/**
 * es-AR user-facing copy for the OpKpi ⓘ "acerca de métricas" tooltip
 * (components/ui/dashboard/OpKpi.tsx's `InfoTooltip` prop shape — kept as a
 * STRUCTURALLY compatible, independently-declared type rather than an import,
 * so this lib module stays component-free/DB-free/pure; see kpi-catalog.test.ts).
 *
 * WHY THIS EXISTS (task #15a — staging-readiness triage):
 * numerator/denominator/cadence above are ENGLISH developer documentation.
 * The ⓘ tooltip an operator sees must be es-AR product copy — a different
 * register, not a translation. `ui` is the ONE place that copy lives; render
 * sites call `getKpiInfo(id)` instead of repeating an inline `info={{ ... }}`
 * object, so the same KPI can no longer show worded-differently text on two
 * screens (the same failure mode the label-uniqueness fix above addresses,
 * just for the tooltip body instead of the headline label).
 */
export type KpiInfoTooltip = {
  /** Plain-language es-AR definition of what the KPI measures. */
  definition: string;
  /** Optional short formula/predicate string, es-AR labels + SQL-ish shorthand. */
  formula?: string;
  /** Optional caveat — legal basis, under/over-counting risk, suppression note. */
  caveat?: string;
};

// ---------------------------------------------------------------------------
// C1 contract fields — question / target / semaphore / guards / confidence
// ---------------------------------------------------------------------------

/**
 * The benchmark value a KPI is judged against, plus WHO set it. `source`
 * names the law/programme/benchmark (e.g. "Ley 22.953", "meta programática",
 * "benchmark RSPCA") — the S1 fix for "semáforo como veredicto legal": a
 * render site can now tell a legal mandate apart from an aspirational
 * internal goal instead of painting both the same red/green.
 *
 * `value` must be POPULATED BY REFERENCING lib/metrics/targets.ts's `TARGETS`
 * constant (e.g. `TARGETS.RABIES_COVERAGE_PCT`), never by retyping the
 * number — the whole point of centralising targets.ts was to kill duplicate
 * magic numbers; a catalog entry that re-types "80" instead of importing
 * `TARGETS.RABIES_COVERAGE_PCT` reintroduces exactly that drift risk.
 */
export type KpiTarget = {
  value: number;
  source: string;
};

/**
 * What the tile's tone is legitimately painted against.
 *
 *  - "target": tone derives from comparing the current value to `target`
 *    (typically via `toneForTarget`) — only meaningful when `target` is set.
 *  - "none": there is no target whose miss constitutes a legal/programmatic
 *    failure (or the KPI is a pure uptake/adoption/historical number). The
 *    renderer must NEVER paint an ok/warn/danger "legal verdict" tone from
 *    this KPI — it degrades to "blue" (informational/progress) or "neutral".
 *    This is the fix for red-team #7 (PPP self-serve adoption painted
 *    "Peligro") and the historic all-species rabies tile (S1: "doble
 *    antirrábica").
 */
export type KpiSemaphorePolicy = {
  paintAgainst: "target" | "none";
};

/**
 * Presentation guards, AS DATA — the render-time honesty guards the plan's
 * C1/S4 sections describe, declared on the descriptor instead of re-invented
 * per screen. Enforced by lib/metrics/presentation-guards.ts.
 */
export type KpiGuards = {
  /**
   * Below this sample size (n — the count the ratio/rate is computed over,
   * e.g. lost episodes, recovered count), the renderer keeps the numeric
   * value visible (a real "100% · 2 de 2" fact) but FORCES a neutral tone
   * and surfaces a small-sample note — never a confident green/red on a tiny
   * N. Kills the "100% reunificación junto a 2 casos" class.
   */
  smallN?: { min: number };
  /**
   * When the ratio's denominator is 0, render "—" instead of a fabricated
   * 0/0 → 0% value. Kills the "0 muertes → 0% trazable" class. The union
   * leaves room for a future alternative strategy without a breaking change.
   */
  zeroDenominator?: "dash";
  /**
   * Flow-tile guard: suppress the period-over-period delta chip when the
   * PRIOR period's base count is below `minPriorBase` — a swing computed
   * against a near-zero base (e.g. 1 → 0) is not a stable trend. Kills the
   * "−95% MoM on an unstable base" class.
   */
  unstableDeltaBase?: { minPriorBase: number };
};

/**
 * What feeds the confidence note shown alongside the value — padrón
 * coverage, k-anonymity suppression, data freshness, sample size, etc.
 * Prose inputs, not a computed score (a numeric confidence SCORE is Ola
 * 2/C4 territory, not this contract).
 */
export type KpiConfidence = {
  inputs: string[];
};

export type KpiDefinition = {
  /** Stable id — see KpiId. */
  id: KpiId;
  /**
   * The decision question this KPI answers, es-AR, plain language — e.g.
   * "¿Están los perros de la jurisdicción vacunados contra la rabia según lo
   * exige la ley?". Forces every catalogued KPI to justify WHY it is on a
   * screen, not just WHAT it counts (S1: "un KPI es un fetcher + un label +
   * un color decididos ad-hoc"). Optional while the barrido (follow-up) has
   * not yet reached every entry — new entries in this task's 8 first
   * consumers all set it.
   */
  question?: string;
  /** Benchmark + its legal/programmatic source — see KpiTarget. Omit when no
   *  target is legitimate for this KPI (e.g. a pure historical/uptake count). */
  target?: KpiTarget;
  /** Tone-painting policy — see KpiSemaphorePolicy. Omit only for KPIs that
   *  don't render a tone at all (pure counts with no color). */
  semaphore?: KpiSemaphorePolicy;
  /** Presentation guards — see KpiGuards. Omit fields that don't apply. */
  guards?: KpiGuards;
  /** What feeds the confidence note next to the value — see KpiConfidence. */
  confidence?: KpiConfidence;
  /** Free-form prose naming what this KPI's population EXCLUDES, when that
   *  exclusion could otherwise be mistaken for under-counting (e.g. "no
   *  incluye reportes sin escalar"). Omit when `caveat` already covers it. */
  exclusions?: string;
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
  /** Machine-readable time window — short tag version of `cadence`. */
  window: KpiWindow;
  /** Machine-readable species scope — short tag version of the numerator/denominator prose. */
  species: KpiSpecies;
  /** Machine-readable counting basis — stock / flow / ratio. */
  basis: KpiBasis;
  /**
   * es-AR OpKpi ⓘ tooltip copy — omit while a KPI hasn't been wired through
   * getKpiInfo() yet (its render sites still pass an inline `info={{ }}` prop).
   * Task #15a wired the first batch (rabies/sterilization/microchip/mortality/
   * custody-return/ENO-SLA); see docs/reviews/2026-07-12-staging-readiness-triage.md.
   */
  ui?: KpiInfoTooltip;
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
    window: "12m",
    species: "dogs",
    basis: "ratio",
    question:
      "¿Están los perros del padrón de la jurisdicción vacunados contra la rabia según lo exige la ley, en los últimos 12 meses?",
    target: {
      value: TARGETS.RABIES_COVERAGE_PCT,
      source: "Ley 22.953 (vacunación antirrábica obligatoria)",
    },
    semaphore: { paintAgainst: "target" },
    guards: { zeroDenominator: "dash" },
    confidence: {
      inputs: [
        "cobertura del padrón (registryDenominator) — perros SIN dueño/no registrados no cuentan",
        "estimación censal (censusCoveragePct) — null cuando no hay fila de censo para el scope",
        "frescura: ventana fija de 12 meses, recalculada en cada render",
      ],
    },
    ui: {
      definition:
        "Porcentaje de perros del padrón (activos/perdidos) en la jurisdicción con al menos una vacunación antirrábica registrada en los últimos 12 meses. El padrón es el primer denominador; el segundo es la población canina estimada. Meta de salud pública: 80%.",
      formula:
        "COUNT DISTINCT perros con vaccination_administered (vaccine_name ~* 'antirr[áa]bica|rabies', últimos 12m) / COUNT DISTINCT perros del padrón. «Cobertura del padrón» = perros del padrón / población canina estimada (censo humano × 0,158 perros/hab.).",
      caveat:
        "Solo se cuentan vacunas registradas en MiMAR. La cobertura real puede ser mayor si existen campañas fuera del sistema. La «población canina estimada» deriva del censo humano INDEC con un factor de tenencia (0,158 perros/hab., GCBA — Encuesta Anual de Hogares 2022, módulo Tenencia responsable) — es una estimación piso (CABA subestima la tenencia nacional), no un censo canino; sin fila de censo se muestra «sin estimación censal». No existe cifra oficial nacional de población canina (ni INDEC, ni SENASA, ni Ministerio de Salud) — este factor NO se atribuye a OMS/OPS.",
    },
  },

  rabies_vaccination_rate_all_species: {
    id: "rabies_vaccination_rate_all_species",
    // C1 rename (2026-07-22, plan-maestro §3c / red-team "doble antirrábica"):
    // "Cobertura antirrábica — todas las mascotas (histórico)" still LOOKED
    // like a compliance figure at a glance (same "Cobertura antirrábica" stem
    // as rabies_coverage_dogs_12m). Renamed to something unmistakable — this
    // is NOT a coverage/compliance number, it's an all-time, all-species,
    // no-window historical count with no legal target.
    label: "Vacunación histórica (todas las especies, sin ventana)",
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
      "This is the KPI the four-actor critique flagged as showing 54% under the SAME label as rabies_coverage_dogs_12m's 42% (critique-govt-2026-07-03.md, 'Same metric, different numbers'). Three real differences drive the gap: (1) denominator includes non-dog species, (2) no 12-month window — a vaccine logged years ago still counts, (3) looser match ('%rabi%' substring vs the anchored regex). Neither number is wrong; they answer different questions. Render sites: app/gob/analytics/page.tsx (imports RABIES_VACCINATION_RATE_LABEL_ES = 'Vacunación histórica (todas las especies, sin ventana)', matching this entry verbatim — the old ambiguous 'Cobertura antirrábica (mascotas)' copy is gone and guarded against by RegionRankingTable.test.tsx) and the per-province ranking in lib/analytics/analytics-ranking.ts (fetchRegionRanking reuses this SAME all-species/all-time definition, so Analítica's national figure and its ranking table are internally consistent).",
    window: "all_time",
    species: "all_species",
    basis: "ratio",
    question:
      "¿Qué fracción del registro histórico de MiMAR tiene alguna vez una dosis antirrábica cargada, de cualquier especie, sin ventana temporal? (NO es la pregunta de cumplimiento legal — esa es rabies_coverage_dogs_12m).",
    // No `target`: there is no legal/programmatic benchmark for an all-time,
    // all-species, no-window count — inventing one would legitimize painting
    // a semaphore over a number that isn't a compliance measurement.
    semaphore: { paintAgainst: "none" },
    confidence: {
      inputs: [
        "sin ventana temporal — una dosis de hace años sigue contando hoy",
        "match por substring ('%rabi%'), no el regex anclado que usa la métrica de cumplimiento",
      ],
    },
    ui: {
      definition:
        "Vista histórica: porcentaje de mascotas activas de CUALQUIER especie con al menos una vacunación antirrábica registrada alguna vez. NO es la métrica de cumplimiento — esa es la cobertura antirrábica del Panel/Panorama (perros con dosis en los últimos 12 meses, Ley 22.953). Por eso este número es más alto.",
      formula:
        "COUNT(pets activos, toda especie, con ≥1 vaccination_administered ~ 'rabi' alguna vez) / COUNT(pets activos) × 100",
      caveat:
        "Sin ventana temporal ni scope de perros: cuenta cualquier dosis histórica. Para el cumplimiento legal usá la tile del Panel.",
    },
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
    window: "all_time",
    species: "all_species",
    basis: "ratio",
    ui: {
      definition:
        "Fracción de mascotas activas/extraviadas en el scope con al menos un evento sterilization_performed registrado, alguna vez.",
      formula:
        "COUNT(DISTINCT pets WHERE EXISTS sterilization_performed) / COUNT(pets activos/extraviados en scope) × 100",
      caveat:
        "Meta programática 70% (referencia interna — no es mandato legal universal como la cobertura antirrábica; es obligatoria por ley provincial solo en Santa Fe, Mendoza, La Rioja, Chubut y San Juan).",
    },
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
    window: "30d",
    species: "all_species",
    basis: "flow",
    question: "¿Cuántas esterilizaciones se registraron este mes y cómo viene la tendencia?",
    // No `target`: a flow count has no legal/programmatic benchmark of its
    // own (sterilization_coverage_population's 70% stock target is a
    // DIFFERENT KPI). semaphore stays "none" — this tile has never painted a
    // tone; the guard that matters here is the delta suppression below.
    semaphore: { paintAgainst: "none" },
    guards: {
      // Red-team's "−95% MoM" class: a delta computed against a near-zero
      // prior-30d base swings wildly on one or two events. Floor chosen to
      // match the smallN convention used elsewhere in this task (5) — below
      // it, the % change is not a stable trend, just noise amplified by a
      // tiny denominator.
      unstableDeltaBase: { minPriorBase: 5 },
    },
    ui: {
      definition:
        "Cantidad de eventos sterilization_performed registrados en los últimos 30 días en la jurisdicción. Incluye la variación porcentual respecto a los 30 días anteriores.",
      formula:
        "COUNT(sterilization_performed en últimos 30d) vs COUNT(sterilization_performed en 30d previos)",
    },
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
    window: "12m",
    species: "n/a",
    basis: "ratio",
    ui: {
      definition:
        "Tasa de incidentes de mordedura por cada 10.000 habitantes del censo provincial en los últimos 12 meses. Se usa como indicador de riesgo zoonótico (A6 proxy).",
      formula:
        "COUNT(incident_reported donde incident_type='bite_inflicted', últimos 12m) / (población_censo / 10.000)",
      caveat:
        "Denominador es población HUMANA del censo, no población de mascotas. Muestra 0 cuando la jurisdicción no tiene fila de censo, en lugar de dividir por cero.",
    },
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
    window: "mixed",
    species: "all_species",
    basis: "stock",
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
    window: "now",
    species: "all_species",
    basis: "stock",
    ui: {
      definition:
        "Mascotas con una observación antirrábica actualmente en curso (rabies_observation_status='in_progress') en la jurisdicción. Deriva de la observación tras mordedura (Ley 22.953).",
      formula: "COUNT(pets donde rabies_observation_status='in_progress') en alcance",
    },
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
    window: "now",
    species: "n/a",
    basis: "stock",
    ui: {
      definition:
        "Casos de mordedura (case_kind='bite_incident') que siguen abiertos (status='open') en la jurisdicción.",
      formula: "COUNT(cases donde case_kind='bite_incident' AND status='open') en alcance",
    },
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
    window: "30d",
    species: "n/a",
    basis: "flow",
    ui: {
      definition:
        "Nuevos eventos de enfermedad notificada (disease_reported) registrados en los últimos 30 días en la jurisdicción. El subtítulo desglosa leptospirosis e hidatidosis.",
      formula: "COUNT(disease_reported, últimos 30 días) en alcance",
    },
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
    window: "all_time",
    species: "all_species",
    basis: "ratio",
    question:
      "¿Qué porcentaje de mascotas del padrón (activas/perdidas) tiene un microchip ISO activo registrado, según lo exige la ley?",
    target: { value: TARGETS.MICROCHIP_PENETRATION_PCT, source: "Ley Provincial 14.107" },
    semaphore: { paintAgainst: "target" },
    confidence: {
      inputs: [
        "k-anonimato (k=5) en el desglose por localidad — celdas chicas ocultas",
        "solo microchips registrados en MiMAR — la penetración real puede ser mayor",
      ],
    },
    ui: {
      definition:
        "Porcentaje de mascotas activas/extraviadas en la jurisdicción con al menos una identificación microchip ISO activa registrada (C1). Exigido por Ley Provincial 14.107.",
      formula:
        "COUNT(pets activos/extraviados con pet_identifications.kind='microchip_iso' y status='active') / COUNT(pets activos/extraviados en scope)",
      caveat: "Solo cuenta microchips registrados en MiMAR.",
    },
  },

  ppp_registry_compliance: {
    id: "ppp_registry_compliance",
    // C1 rename (2026-07-22, red-team #7): the old label + toneForTarget(…,
    // 100) painted a 0% self-serve-attestation uptake number "Peligro" (red) —
    // a LEGAL-VERDICT color on what is, until the enforcement flow ships,
    // purely a MiMAR adoption/uptake number. Renamed + semaphore: none below
    // distinguish "atestación en MiMAR" (what this tile measures) from
    // "cumplimiento registral externo" (a claim this tile does NOT make).
    label: "Atestación PPP en MiMAR (razas potencialmente peligrosas)",
    numerator: "COUNT DISTINCT PPP-flagged active pets with ≥1 dangerous_breed_attested event",
    denominator: "COUNT active/lost pets where potentially_dangerous_breed = true",
    source: "pets, pet_events (dangerous_breed_attested)",
    fetcherName: "fetchDangerousBreedCompliance",
    fetcherPath: "lib/analytics/compliance-metrics.ts",
    cadence: "point-in-time snapshot",
    unit: "percent",
    suppression: "none",
    caveat:
      "Legal basis: Ley CABA 4078 / Ley Prov. 14.107. Reads 0% until the attestation form ships — that is a true value (no adoption yet), not a bug. NOT painted as a legal-verdict tone (semaphore: none) — a self-serve-attestation uptake number reading 'Peligro' misrepresents a feature-adoption gap as a legal breach (red-team #7).",
    window: "all_time",
    species: "dogs",
    basis: "ratio",
    question:
      "¿Qué porcentaje de mascotas PPP en la jurisdicción tiene su atestación cargada en MiMAR? (NO mide cumplimiento registral externo a la ley — solo adopción del flujo de atestación en la plataforma).",
    target: { value: TARGETS.PPP_ATTESTATION_PCT, source: "Ley CABA 4078 / Ley Prov. 14.107" },
    // Uptake metrics never paint a legal-verdict color (S1 principle) — the
    // target is kept (for the info popover's "meta" line, honestly sourced to
    // the law) but the RENDERED tone never derives from it.
    semaphore: { paintAgainst: "none" },
    exclusions:
      "No mide cumplimiento registral externo (habilitación municipal/provincial fuera de MiMAR) — solo la atestación cargada dentro de la plataforma.",
    ui: {
      definition:
        "Porcentaje de mascotas de razas potencialmente peligrosas (PPP) en la jurisdicción con al menos un evento dangerous_breed_attested registrado en MiMAR (C7). Ley CABA 4078 / Ley Prov. 14.107 exige la atestación; este número mide SOLO la adopción del flujo dentro de la plataforma, no el cumplimiento registral externo.",
      formula:
        "COUNT(pets PPP activos con evento dangerous_breed_attested) / COUNT(pets PPP activos)",
      caveat:
        "Mientras no exista el formulario de atestación, el numerador es 0 y la tasa refleja 0% de adopción del registro — esto es un valor verdadero e informativo, no un error.",
    },
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
    window: "now",
    species: "n/a",
    basis: "stock",
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
    window: "12m",
    species: "all_species",
    basis: "ratio",
    question:
      "De los fallecimientos registrados, ¿qué porcentaje tiene una disposición final trazable (método + instalación conocidos)?",
    target: { value: TARGETS.DISPOSAL_TRACEABILITY_PCT, source: "Ley CABA 5470" },
    semaphore: { paintAgainst: "target" },
    guards: {
      // 0 deaths → 0/0 traceableRate would read "0%" (a FAILED-traceability
      // signal) when there simply were no deaths to trace — the exact "0/0
      // → 0%" class this task fences. Mirrors mortality_deaths_12m's guard.
      zeroDenominator: "dash",
    },
    ui: {
      definition:
        "Porcentaje de fallecimientos con método de disposición conocido E instalación registrada. Mide el cumplimiento de trazabilidad exigido por la Ley CABA 5470.",
      formula: "deaths con (disposition_method ≠ null/unknown) AND (facility ≠ '') / total",
      caveat:
        "Umbral de alerta: por debajo de la meta programática (ver TARGETS.DISPOSAL_TRACEABILITY_PCT). Un valor menor al 50% se considera incumplimiento grave (B3).",
    },
  },

  mortality_deaths_12m: {
    id: "mortality_deaths_12m",
    label: "Fallecimientos registrados (12 meses)",
    numerator:
      "COUNT death_recorded events where occurred_at falls within the trailing 12 months, in scope",
    denominator:
      "n/a — absolute count (flow, not a ratio). The SAME query's traceableRate field (shown alongside on /gob home) is a ratio: COUNT death_recorded events with a known disposal method (NOT NULL and <> 'unknown') AND a disposal facility present, divided by this same 12-month total",
    source: "pets, pet_events (death_recorded)",
    fetcherName: "fetchMortalityHeadline",
    fetcherPath: "lib/analytics/mortality-metrics.ts",
    cadence:
      "FIXED trailing 12 months (ctx12m — /gob home has no period picker), recomputed on every render",
    unit: "count",
    suppression: "none",
    caveat:
      "Perf-motivated split (2026-07-19 qw#2) of mortality_disposal_traceability's first query: /gob home only ever rendered `total` + `traceableRate`, not the other four sequential queries (method/cause-week/code/locality breakdowns) fetchMortalityDisposition also runs for /gob/mortalidad — so this fetcher runs ONLY that first aggregation, cutting four serial round-trips per home render. traceableRate here uses the IDENTICAL predicate as mortality_disposal_traceability's ratio (same TRACEABLE condition) — it is not a new or different definition, just the same math computed over a fixed 12m window via a cheaper single-query path instead of the full five-query fetcher.",
    window: "12m",
    species: "all_species",
    basis: "flow",
    question:
      "¿Cuántos fallecimientos se registraron en los últimos 12 meses, y qué tan trazable fue su disposición final?",
    // The headline count itself has no target (a count of deaths isn't
    // "compliant" or not) — semaphore stays "none" for the COUNT; the
    // embedded traceableRate ratio inherits mortality_disposal_traceability's
    // target/semaphore (same predicate, see the caveat above), not a
    // separate one here.
    semaphore: { paintAgainst: "none" },
    guards: {
      // Same "0/0 → 0%" class as mortality_disposal_traceability, on the
      // SAME traceableRate field this fetcher computes over its fixed 12m
      // total. Home renders both `total` and `traceableRate` from one
      // fetcher call, so one guard entry covers both display fields.
      zeroDenominator: "dash",
    },
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
    window: "now",
    species: "all_species",
    basis: "stock",
    ui: {
      definition:
        "Mascotas en el scope con pregnancyStatus='in_progress' (preñez iniciada y aún no cerrada). Requiere que la preñez haya sido registrada por un veterinario.",
      formula: "COUNT(pets) WHERE pregnancy_status = 'in_progress' AND scope",
    },
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
    window: "period",
    species: "all_species",
    basis: "ratio",
    ui: {
      definition:
        "Eventos clinical_info_logged con sub_kind='pregnancy', pregnancy_phase='ended' y outcome='live_birth' en el período seleccionado, en el scope.",
      formula:
        "COUNT(clinical_info_logged WHERE sub_kind='pregnancy' AND pregnancy_phase='ended' AND outcome='live_birth' AND period AND scope)",
      caveat:
        "Solo cuenta partos de preñeces registradas en el sistema — partos callejeros y camadas sin seguimiento son invisibles. Subestima la natalidad real: es un indicador direccional, no un dato exacto.",
    },
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
    window: "now",
    species: "all_species",
    basis: "ratio",
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
    window: "period",
    species: "all_species",
    basis: "ratio",
    ui: {
      definition:
        "Fracción de adopciones finalizadas que fueron revertidas en el período. Menor es mejor.",
      formula: "COUNT(adoption_reversed) / COUNT(adoption_finalized) — null si den=0",
      caveat:
        "Numerador y denominador son conteos independientes de eventos en el período — un reverso de este período puede corresponder a una adopción de un período anterior, por lo que el valor puede superar el 100%.",
    },
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
    window: "now",
    species: "all_species",
    basis: "ratio",
  },

  deworming_coverage_population: {
    id: "deworming_coverage_population",
    label: "Cobertura antiparasitaria (12 meses)",
    numerator:
      "COUNT DISTINCT active/lost pets (any species) with ≥1 deworming_administered event in the trailing 12 months ending at ctx.period.until",
    denominator: "COUNT active/lost pets in scope",
    source: "pets, pet_events (deworming_administered)",
    fetcherName: "fetchDewormingCoverage",
    fetcherPath: "lib/metrics/deworming.ts",
    cadence: "FIXED trailing 12 months ending at ctx.period.until — recomputed on every render",
    unit: "percent",
    suppression: "none (province rows are never small enough to require k-anon)",
    caveat:
      "Sanitary-coverage sibling of rabies_coverage_dogs_12m and sterilization_coverage_population, surfaced on /gob/poblacion. Unlike sterilization (once-ever), deworming is periodic — the 12-month window is a 'currently protected' proxy. Only counts dewormings logged in MiMAR; real-world coverage may be higher. SEED-DENSITY CAVEAT: deworming_administered has low seed density, so this reads a low but HONEST value until owners/vets log antiparasitic doses.",
    window: "12m",
    species: "all_species",
    basis: "ratio",
    ui: {
      definition:
        "Fracción de mascotas activas/extraviadas en el scope con al menos un evento deworming_administered en los últimos 12 meses.",
      formula:
        "COUNT(DISTINCT pets WHERE EXISTS deworming_administered en 12m) / COUNT(pets activos/extraviados en scope) × 100",
      caveat:
        "A diferencia de la esterilización (una vez), la desparasitación es periódica: la ventana de 12 meses es un proxy de 'protección vigente'. Solo cuenta dosis registradas en MiMAR — la cobertura real puede ser mayor.",
    },
  },

  vet_access_per_1k_locality: {
    id: "vet_access_per_1k_locality",
    label: "Acceso veterinario (visitas / 1.000 activos)",
    numerator: "COUNT vet_visit_logged events in the ctx period whose pet is homed in the locality",
    denominator: "COUNT active/lost pets homed in the locality, divided by 1,000",
    source: "pets, pet_events (vet_visit_logged)",
    fetcherName: "fetchVetAccessByLocality",
    fetcherPath: "lib/metrics/vet-access.ts",
    cadence: "matches the caller's ProjectionContext period",
    unit: "rate_per_10k",
    suppression:
      "k-anon (k=5) on the per-locality active-pet population — a locality with <5 active pets is suppressed",
    caveat:
      "Access-to-care equity signal surfaced on /gob/analytics; localities are sorted ascending by per-1k so care deserts surface first (the CABA vs periphery inequity). Denominator is PET population per locality, not human census. Scoped and grouped by the pet's HOME jurisdiction. Unit is 'per 1,000' (reusing the rate_per_10k unit slot — closest available). SEED-DENSITY CAVEAT: vet_visit_logged density is uneven, so per-1k rates are directional.",
    window: "period",
    species: "all_species",
    basis: "ratio",
  },

  movement_volume: {
    id: "movement_volume",
    label: "Movilidad registrada (movement_recorded)",
    numerator:
      "COUNT movement_recorded events in the ctx period, scoped, decomposed by payload.sub_kind (jurisdiction_changed / cvi_issued / transport_recorded)",
    denominator: "n/a — absolute counts (a flow volume, not a ratio)",
    source: "pets, pet_events (movement_recorded)",
    fetcherName: "fetchMovementCorridors",
    fetcherPath: "lib/metrics/movement.ts",
    cadence: "matches the caller's ProjectionContext period",
    unit: "count",
    suppression: "none — jurisdiction-level totals, not locality-grouped",
    caveat:
      "Epidemiological mobility signal surfaced on /gob/vigilancia — a moved animal carries its exposure into a new jurisdiction. Scoped by the pet's HOME jurisdiction; a jurisdiction_changed move denormalizes the pet's home to the DESTINATION, so a scoped operator sees inbound relocations once the pet has landed. SEED-DENSITY CAVEAT: movement_recorded (esp. cvi_issued / transport_recorded cross-border) is sparse in seed data — reads honest low/zero totals.",
    window: "period",
    species: "all_species",
    basis: "flow",
  },

  adoption_application_conversion: {
    id: "adoption_application_conversion",
    label: "Conversión de postulaciones de adopción",
    numerator:
      "COUNT adoption_application_submitted events in the ctx period; resolved breakdown counts adoption_application_resolved by payload.outcome (approved/rejected/withdrawn)",
    denominator: "conversionRate = approved / submitted — null when submitted=0",
    source: "pets, pet_events (adoption_application_submitted, adoption_application_resolved)",
    fetcherName: "fetchAdoptionApplicationFunnel",
    fetcherPath: "lib/metrics/adoption-funnel.ts",
    cadence: "matches the caller's ProjectionContext period",
    unit: "percent",
    suppression: "none — jurisdiction-level totals, not locality-grouped",
    caveat:
      "DEMAND side of the pipeline (online postulaciones), distinct from custody_return_rate / fetchCustodyFunnel's SUPPLY side (intake→adoption_finalized). Surfaced on /gob/adopciones. Submitted and resolved are INDEPENDENT windowed counts, not a followed cohort — a resolution in-period may reference an application submitted before the period started. SEED-DENSITY CAVEAT: adoption_application_* density is low in seed data.",
    window: "period",
    species: "all_species",
    basis: "ratio",
  },

  eno_sla_compliance: {
    id: "eno_sla_compliance",
    label: "Cumplimiento SLA de notificaciones ENO",
    numerator:
      "COUNT event_notification_outbox rows where target_kind = 'eno_authority', delivered AND delivered_at <= sla_due_at, created within the ctx period",
    denominator:
      "COUNT event_notification_outbox rows where target_kind = 'eno_authority', delivered, created within the SAME period",
    source: "event_notification_outbox",
    fetcherName: "fetchEnoSla",
    fetcherPath: "lib/analytics/surveillance-metrics.ts",
    cadence: "matches the caller's ProjectionContext period; breachedOpen is a live 'now' snapshot",
    unit: "percent",
    suppression: "none",
    caveat:
      "Added to the catalog by task #15a (staging-readiness triage) after finding the SAME onTime/delivered ratio worded five different ways across /gob/vigilancia, /gob/sistema, /gob/programa, /admin/programa, and AdminKpiStrip (admin home) — none numerically wrong, just textually inconsistent. Measures the INTERNAL outbox queue's SLA, not confirmed external delivery to the health authority. breachedOpen (pending rows already past sla_due_at) is a live snapshot independent of the selected period.",
    window: "period",
    species: "n/a",
    basis: "ratio",
    ui: {
      definition:
        "Porcentaje de notificaciones ENO (Enfermedades de Notificación Obligatoria, target_kind='eno_authority') entregadas dentro del plazo SLA en el período y scope seleccionados (A7). Mide la cola interna de la bandeja de salida, no la entrega externa a la autoridad.",
      formula:
        "COUNT(outbox rows entregadas con delivered_at ≤ sla_due_at) / COUNT(outbox rows entregadas en período) × 100",
      caveat:
        "breachedOpen cuenta notificaciones pendientes con sla_due_at ya vencido en este momento (incumplimiento activo), independiente del período seleccionado.",
    },
  },

  // ---------------------------------------------------------------------------
  // C1 first consumers (2026-07-22, plan-maestro §3) — new catalog entries
  // ---------------------------------------------------------------------------

  reunification_rate: {
    id: "reunification_rate",
    label: "Tasa de reunificación",
    numerator: "COUNT lost episodes (status_changed → to_status='lost') that returned to 'active'",
    denominator:
      "COUNT all lost episodes in scope, trailing 30 days (fixed window, no period picker)",
    source: "pets, pet_events (status_changed)",
    fetcherName: "fetchReunificationRate",
    fetcherPath: "lib/analytics/compliance-metrics.ts",
    cadence:
      "FIXED trailing 30 days — /gob/perdidas has no period control (PO decision 2026-07-19)",
    unit: "percent",
    suppression: "none",
    caveat:
      "Benchmark: UK RSPCA ~39% (TARGETS.REUNIFICATION_PCT). Does not filter by species — the benchmark is measured over all lost episodes. Same fetcher also returns medianDaysToRecovery, gated by the SAME smallN guard on `recovered` (not `lostEpisodes` — red-team's '100% con N=2' class specifically concerns the recovered-episode count, since the median is computed only over recovered episodes).",
    window: "30d",
    species: "all_species",
    basis: "ratio",
    question:
      "De las mascotas que se perdieron en los últimos 30 días, ¿qué porcentaje volvió con su dueño/a? (a leer SIEMPRE junto al stock de perdidas activas — una tasa alta con pocos episodios no es una victoria poblacional).",
    target: { value: TARGETS.REUNIFICATION_PCT, source: "benchmark RSPCA (Reino Unido)" },
    semaphore: { paintAgainst: "target" },
    guards: {
      // Red-team's headline case: "100% reunificación" next to "68 perdidas
      // activas" reads as total success when N=2. Below 5 episodes, the tone
      // is forced neutral and a small-sample note accompanies the (still
      // honestly shown) percentage. Also gates the sibling median-days tile
      // via `recovered` (see the caveat above).
      smallN: { min: 5 },
      zeroDenominator: "dash",
    },
    confidence: {
      inputs: [
        "n = episodios de pérdida en el período (30d) — advertencia de muestra chica bajo 5",
        "stock co-primario: 'Perdidas activas' en la misma pantalla da el contexto poblacional",
      ],
    },
    ui: {
      definition: `Porcentaje de episodios de pérdida abiertos en los últimos 30 días que terminaron en reunificación con el dueño/a. Benchmark internacional: ${TARGETS.REUNIFICATION_PCT}% (UK RSPCA). Con menos de 5 episodios, la tasa se muestra sin semáforo — un porcentaje sobre una muestra chica no es una tendencia.`,
      formula: "COUNT(episodios_lost → status='active') / COUNT(all lost episodes en 30d) × 100",
      caveat:
        "No filtra por especie: la meta de reunificación se mide sobre todos los episodios de pérdida, no por especie — filtrar fragmentaría el benchmark poblacional. Leer siempre junto al stock de 'Perdidas activas'.",
    },
  },

  bite_escalation_gap: {
    id: "bite_escalation_gap",
    label: "Brecha de escalamiento (mordeduras vs. observaciones)",
    numerator:
      "COUNT incident_reported bite events, trailing 12 months — REUSES bites_per_10k's `reports` field (no new query/definition)",
    denominator:
      "n/a — paired with COUNT open rabies observations ('now' snapshot) — REUSES open_rabies_observations' `count` field (no new query/definition). Not a ratio: the two counts measure different populations (reports vs currently-open observations) and are shown side by side, not divided.",
    source: "pet_events (incident_reported), pets (rabies_observation_status)",
    fetcherName: "fetchBiteEscalationGap",
    fetcherPath: "lib/analytics/govt-home-kpis.ts",
    cadence: "bites: trailing 12 months ending at ctx.period.until; observations: 'now' snapshot",
    unit: "count",
    suppression: "none",
    caveat:
      "Red-team #6: a jurisdiction can show 0 open rabies observations while carrying hundreds of unescalated bite reports — an empty observations queue reads as 'controlado' when it may mean 'sin escalar', not 'sin riesgo'. This KPI exists to keep that gap visible as a PAIR, never collapsed into a single ratio that would imply one count is the other's denominator.",
    window: "mixed",
    species: "n/a",
    basis: "flow",
    question:
      "¿Cuántas mordeduras se reportaron en los últimos 12 meses frente a cuántas observaciones rábicas siguen abiertas ahora mismo? Los reportes sin escalamiento no implican ausencia de riesgo.",
    // No target: this is a transparency pairing, not a compliance ratio —
    // there is no legal/programmatic benchmark for "how many bites SHOULD
    // have an open observation". Painting a tone here would fabricate a
    // judgment neither number supports on its own.
    semaphore: { paintAgainst: "none" },
    exclusions:
      "No mide qué fracción de mordeduras derivó en una observación — los dos números son poblaciones independientes (bites_per_10k / open_rabies_observations), no numerador/denominador de un mismo evento.",
    confidence: {
      inputs: [
        "bites: reutiliza bites_per_10k — ventana fija de 12 meses",
        "observaciones abiertas: reutiliza open_rabies_observations — snapshot 'ahora'",
      ],
    },
    ui: {
      definition:
        "Mordeduras reportadas en los últimos 12 meses junto a las observaciones antirrábicas actualmente abiertas en la jurisdicción — dos conteos independientes, mostrados en par para que la brecha entre 'reportado' y 'escalado' quede visible.",
      formula:
        "COUNT(incident_reported, 12m) mostrado junto a COUNT(rabies_observation_status='in_progress')",
      caveat:
        "Los reportes de mordedura sin una observación abierta correspondiente NO implican ausencia de riesgo — pueden reflejar sub-escalamiento, no sub-incidencia.",
    },
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

/**
 * Resolve a catalogued KPI's es-AR OpKpi ⓘ tooltip copy — the #15a wiring
 * point. Render sites call `getKpiInfo("some_kpi_id")` and pass the result
 * straight to `<OpKpi info={...}>` instead of repeating an inline
 * `info={{ definition, formula, caveat }}` object literal.
 *
 * Returns `undefined` for KPIs that don't have `ui` copy yet (either
 * uncatalogued, or catalogued but not yet wired) — callers should fall back
 * to their existing inline `info` prop in that case, not render a blank ⓘ.
 */
export function getKpiInfo(id: KpiId): KpiInfoTooltip | undefined {
  return KPI_CATALOG[id]?.ui;
}
