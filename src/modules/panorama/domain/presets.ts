// Panorama F3 — curated default views ("presets").
//
// Each preset encodes a QUESTION the operator wants to answer, mapping to a
// compatibility-valid layer set (F2) plus aggregation level and period.
// The 8 individual layer checkboxes remain available as "modo avanzado".
//
// Pure module — no DB, no React, no Next.

import type { AggregationLevel, LayerId, PanoramaKpiId } from "./types";
import type { EncodingId } from "./view-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresetId =
  | "brotes-activos"
  | "sintomas"
  | "cumplimiento"
  | "antiparasitario"
  | "microchip"
  | "registro-ppp"
  | "bienestar"
  | "control-poblacional"
  | "mortalidad"
  | "perdidas-reunificacion"
  | "desierto-veterinario"
  | "tendencia"
  | "riesgo-ppp";

/**
 * Optional map framing a preset applies on activation (panorama-redesign Fase 1).
 * CAMERA-ONLY — data scope is untouched (server-side scoping unchanged): a
 * national frame over a scoped operator shows their data on a wider canvas.
 *
 *  - `national` — fit the map to the national bbox (province-level overview).
 *  - `bbox` — fit to an explicit [[minLng,minLat],[maxLng,maxLat]] box.
 */
export type PresetFraming =
  | { kind: "national" }
  | { kind: "bbox"; bounds: [[number, number], [number, number]] };

/**
 * Decide whether activating a preset should EMIT its map frame (camera move).
 *
 * A preset's `national` framing is a DEFAULT overview that must only fire from a
 * neutral/national context — it must NEVER override an explicit drill or a
 * jurisdiction-scoped operator's own extent. Switching a nationally-framed vista
 * while drilled/scoped used to yank the camera out to the whole country ("me
 * saca de la vista"). So a national frame is suppressed whenever the operator has
 * an active scope; the caller then clears the frame and the camera stays put.
 *
 * An explicit `bbox` frame is a deliberate intent (not a default) and always
 * emits. A framing-less preset emits nothing.
 *
 * @param framing        the preset's framing field, if any.
 * @param hasActiveScope true when the operator has an active scope — a drilled
 *   province/locality OR a jurisdiction-scoped session.
 */
export function shouldEmitPresetFrame(
  framing: PresetFraming | null | undefined,
  hasActiveScope: boolean,
): boolean {
  if (!framing) return false;
  if (framing.kind === "national") return !hasActiveScope;
  return true;
}

export type PanoramaPreset = {
  id: PresetId;
  /** es-AR short label (shown on the preset button). */
  label: string;
  /**
   * The QUESTION this preset answers.  Phrased in first-person/operator voice
   * (es-AR). Shown as helper text below the preset button.
   */
  description: string;
  /**
   * The single base layer (dataType "rate" | "density").
   * Exactly 1 base per preset — enforced by the F2 compatibility model.
   */
  base: LayerId;
  /**
   * Optional overlay signal layer (dataType "signal").
   * At most 1 signal per preset — enforced by the F2 compatibility model.
   * EXCEPTION (new-vistas wave): the overlay slot of a DECLARED bivariate pair
   * (bivariate.ts BIVARIATE_PAIRS) may name a density layer — riesgo-ppp stacks
   * mordeduras (density) over the ppp rate surface; the F2 exception in
   * checkCompatibility admits exactly these vetted pairs.
   */
  signal?: LayerId;
  /**
   * The layer the Estadísticas ranking ("Peores N") ranks by — the preset's
   * PRIMARY question metric (Cowork QA ronda 3 §4, P2.5). Defaults to `base`
   * (the choropleth) when absent, which is correct for the compliance/density
   * presets whose question IS the base measure. Set it only when the base is a
   * backdrop and the question is about the SIGNAL overlay: `brotes-activos` maps
   * cobertura (base backdrop) but asks "¿dónde hay brotes?", so its ranking must
   * order by the zoonosis SIGNAL, not by coverage. Must be one of the preset's
   * activated layers ([base, signal, ...references]) so its features are loaded.
   */
  rankBy?: LayerId;
  /**
   * Optional reference layers (dataType "reference").
   * Unlimited — reference layers are always compatible.
   */
  references?: LayerId[];
  /**
   * Aggregation granularity the preset PREFERS.
   *
   * PO-ratified 2026-07-09: this is an INITIAL PREFERENCE, not a force. In
   * NATIONAL framing every preset opens at `province` (24 rows, cheap, no
   * k-anon) regardless of this field; a `level: "locality"` preset drills to
   * locality only on an intentional zoom past the boundary or a jurisdiction
   * selection (scope-wins). The preference is realized by the server first-visit
   * seed (seeded at the scope-derived level) and the live camera hysteresis —
   * NOT by pinning the console's level to this value on activation.
   */
  level: AggregationLevel;
  /** Period window the preset activates (maps to the ?period searchParam). */
  periodPreset: "30d" | "90d";
  /**
   * Optional map framing applied via onPreset when present. Absent = today's
   * behavior (the camera stays where it is). National-overview presets
   * (brotes-activos, cumplimiento, control-poblacional) frame the country;
   * locality-level drill-down presets (sintomas, bienestar) stay framing-less
   * (design-QA 2026-07-04 fast-follow, expanding the Fase 1 demonstrator).
   */
  framing?: PresetFraming;
  /**
   * panorama-vista-redesign: the 2-4 headline DECISION KPIs (in display order)
   * the per-vista metrics column shows for this preset — replaces the flat
   * 7-tile PanoramaKpiStrip with a curated set matching the preset's question.
   * Same `getPanoramaKpis()` result; this only filters/orders it. The coverage
   * denominator ("mascotas en cobertura") is NOT listed here — it is a footer
   * caption (metric-honesty demotion 2026-07-09), shown once for every vista.
   */
  metrics: readonly PanoramaKpiId[];
  /**
   * P5 (design §4.2 amendment): the display ENCODINGS this preset OWNS — the
   * operator-selectable toggles that stay WITHIN the vista instead of making it
   * "personalizada". `derivePreset` matches a non-null ViewState encoding only
   * against a preset that declares it. Today only `brotes-activos` owns one
   * (`bivariate`, the "Riesgo" toggle); #24's mode switcher broadens this.
   */
  encodings?: readonly EncodingId[];
};

// ---------------------------------------------------------------------------
// Preset catalogue
// ---------------------------------------------------------------------------

export const PANORAMA_PRESETS: readonly PanoramaPreset[] = [
  {
    id: "brotes-activos",
    label: "Brotes activos",
    description: "¿Dónde hay brotes activos sobre huecos de vacunación?",
    // base: cobertura (rate choropleth) — exact fit: vaccination gaps vs. outbreak signals.
    base: "cobertura",
    // signal: zoonosis (outbreak_signals proportional symbols over the choropleth).
    signal: "zoonosis",
    // P2.5: the question is "¿dónde hay brotes?" — rank by the zoonosis SIGNAL
    // (the outbreak measure), not the cobertura backdrop, so "Peores N" answers
    // "peores por brotes" instead of silently ranking coverage.
    rankBy: "zoonosis",
    level: "province",
    periodPreset: "90d",
    // Fase 1 framing demonstrator: an outbreak overview is a national question —
    // frame the whole country so cross-province patterns are visible at once.
    framing: { kind: "national" },
    // panorama-vista-redesign: the metrics column for "¿dónde hay brotes?".
    metrics: ["cobertura", "zoonosis", "mordeduras"],
    // P5: the "Intensidad de reporte (bivariado)" toggle (renamed from "Riesgo
    // (bivariado)" — C2, 2026-07-22) is a display encoding WITHIN this
    // vista — selecting it keeps the badge on "Brotes activos" and round-trips
    // the URL (?encoding=bivariate) so a shared link reproduces the view.
    encodings: ["bivariate"],
  },
  {
    id: "sintomas",
    label: "Síntomas / vigilancia sindrómica",
    description: "¿Dónde se concentran los síntomas reportados con alerta?",
    base: "sintomas",
    // signal: zoonosis overlaid to surface reportable-disease alerts.
    signal: "zoonosis",
    level: "locality",
    periodPreset: "30d",
    metrics: ["zoonosis", "mordeduras", "denuncias"],
  },
  {
    id: "cumplimiento",
    label: "Cumplimiento antirrábico",
    description: "¿Qué jurisdicciones están por debajo de la meta de cobertura antirrábica?",
    // base: cobertura — the antirrábica rate (Ley 22.953).
    //
    // The old note here ("a metric selector requires dedicated rate layers that
    // don't exist yet") is obsolete: microchip, ppp, esterilizacion and
    // antiparasitario ALL exist as rate layers today. They can't share this
    // map (one base per preset — F2), so each has its own vista, and the
    // compliance family is now five same-shaped vistas. D1
    // (docs/design/sdd/2026-07-25-panorama-d1-consolidacion-vistas.md) proposes
    // collapsing them into ONE vista with a metric selector — that is the right
    // end state and it is a PO decision, not a wiring one. Until it lands, a
    // dedicated vista is the only way an operator can see these layers at all.
    base: "cobertura",
    level: "province",
    periodPreset: "90d",
    // A province-level compliance ranking is a national question — frame the
    // whole country so under-target jurisdictions are comparable at a glance.
    framing: { kind: "national" },
    // v+1 rail: microchip penetration joins the compliance trio — same legal
    // family as cobertura/esterilizacion (Ley Prov 14.107), each rendering a
    // target-progress meter (bar) against TARGETS via toneForTarget. The
    // coverage denominator now rides the shared footer caption.
    metrics: ["cobertura", "esterilizacion", "microchip"],
  },
  {
    id: "antiparasitario",
    label: "Desparasitación",
    description: "¿Qué jurisdicciones tienen baja cobertura antiparasitaria (últimos 12 meses)?",
    // base: antiparasitario (rate choropleth, benchmark 80%) — a sanitary
    // coverage of the SAME shape as cobertura/esterilizacion/microchip, so it
    // renders a target-anchored (META) fill and a below-meta gap ranking with no
    // polarity ambiguity. Orphan wiring: the layer shipped 2026-07-16 with a
    // loader, tests and 17 production sites, and no preset ever activated it.
    base: "antiparasitario",
    level: "province",
    periodPreset: "90d",
    // A province-level coverage-vs-benchmark ranking is a national question —
    // same framing as cumplimiento / control-poblacional.
    framing: { kind: "national" },
    // KNOWN GAP, stated rather than hidden: there is no `antiparasitario`
    // PanoramaKpiId — get-panorama-kpis emits no deworming tile — so this vista
    // cannot headline its own indicator (the same smell D1 §4.1 flags on
    // desierto-veterinario). The two shown are the honest neighbours: the
    // parasitic-zoonosis signal deworming exists to prevent (hidatidosis is
    // named in the zoonosis layer) and the sibling 12-month sanitary coverage.
    // When a deworming KPI lands it becomes the headline and these follow it.
    metrics: ["zoonosis", "cobertura"],
  },
  {
    id: "microchip",
    label: "Identificación por microchip",
    description: "¿Qué jurisdicciones están más lejos de la meta de identificación (microchip)?",
    // base: microchip (rate choropleth, Ley Prov 14.107 · meta 80%).
    //
    // WHY its own vista: microchip is a HEADLINE legal KPI on /gob and the most
    // widely referenced layer in the codebase (195 production files), yet no
    // preset activated it — an operator could read the national percentage and
    // had NO way to ask "¿dónde?". It cannot ride cumplimiento's map (one base
    // per preset — F2), so it gets its own, exactly like registro-ppp and
    // mortalidad before it.
    base: "microchip",
    level: "province",
    periodPreset: "90d",
    // A province-level compliance ranking is a national question (cumplimiento
    // precedent) — frame the country so the laggards are comparable at a glance.
    framing: { kind: "national" },
    // The Ley Prov 14.107 pair, mirroring registro-ppp's column in reverse: the
    // vista's own indicator leads, its legal sibling follows.
    metrics: ["microchip", "ppp"],
  },
  {
    id: "registro-ppp",
    label: "Registro PPP",
    description:
      "¿Qué jurisdicciones tienen bajo registro de perros potencialmente peligrosos (PPP)?",
    // base: ppp (rate choropleth) — the C7 registry-adoption rate (Ley Prov 14.107).
    // A dedicated compliance vista so the orphaned PPP layer has an honest home;
    // it can't share cumplimiento's map (one base per preset — F2), so it gets its own.
    base: "ppp",
    level: "province",
    periodPreset: "90d",
    // A province-level registry-adoption ranking is a national question — frame the
    // whole country so under-registry jurisdictions are comparable (like cumplimiento).
    framing: { kind: "national" },
    // Same Ley Prov 14.107 compliance family as microchip — the two ride together.
    metrics: ["ppp", "microchip"],
  },
  {
    id: "bienestar",
    label: "Bienestar y fiscalización",
    description: "¿Dónde se acumulan denuncias y decomisos por bienestar animal?",
    // base: denuncias (welfare-report density) — direct fit for welfare signals.
    base: "denuncias",
    // references: decomisos as contextual reference pins.
    references: ["decomisos"],
    level: "locality",
    periodPreset: "90d",
    metrics: ["denuncias", "mordeduras"],
    // panorama-percapita v1: the "Per cápita" toggle is a display encoding
    // WITHIN this vista (base denuncias is per-cápita eligible; decomisos is a
    // reference layer and never blocks). Selecting it keeps the badge on
    // "Bienestar y fiscalización" and round-trips the URL (?encoding=percapita)
    // so a shared link reproduces the normalized view. It only APPLIES at
    // province framing — the map projection gates that (percapitaEligibleFor).
    encodings: ["percapita"],
  },
  {
    id: "control-poblacional",
    label: "Control poblacional",
    description: "¿Estamos conteniendo la población? Cobertura de esterilización vs meta.",
    // base: esterilizacion (rate choropleth) — North-Star layer for population control.
    // Province level with divergent scale anchored at TARGETS.STERILIZATION_COVERAGE_PCT (70%).
    base: "esterilizacion",
    level: "province",
    periodPreset: "90d",
    // Same national-overview question as cumplimiento: a province choropleth
    // vs the 70% target only reads when the whole country is in frame.
    framing: { kind: "national" },
    metrics: ["esterilizacion", "perdidas"],
  },
  {
    id: "mortalidad",
    label: "Mortalidad",
    description: "¿Dónde se concentra la mortalidad registrada de mascotas?",
    // base: mortalidad (density choropleth) — pets currently in status='deceased',
    // filled at province / graduated symbol at locality. Its own vista so the
    // orphaned mortality layer has an honest home (density base, one per preset).
    base: "mortalidad",
    level: "province",
    periodPreset: "90d",
    // A province-level mortality overview is a national question — frame the country
    // so cross-province concentration is visible at once (like control-poblacional).
    framing: { kind: "national" },
    // Population/health story: mortality alongside the esterilización control metric.
    metrics: ["mortalidad", "esterilizacion"],
  },
  {
    id: "perdidas-reunificacion",
    label: "Pérdidas y reunificación",
    description: "¿Cuántas mascotas perdidas se están reencontrando con su familia?",
    // base: perdidas (density point) — lost/sighting activity.
    base: "perdidas",
    // signal: reunificacion overlaid to surface the D4 reunification rate per unit.
    signal: "reunificacion",
    level: "locality",
    periodPreset: "90d",
    // v+1 rail: the "reunificacion" KPI (D4 rate vs TARGETS.REUNIFICATION_PCT,
    // target-progress bar) headlines the question this preset asks — it was
    // previously absent from the column despite naming the preset.
    // red-team-admin-2 P1.6: dropped the off-mission "denuncias" (bienestar/
    // welfare-complaints, /gob/maltrato) — a different domain that confused this
    // lost-and-reunification lens. "perdidas" already carries the lost-pets count.
    metrics: ["perdidas", "reunificacion"],
    // Locality-level drill-down question — stays framing-less, same as sintomas
    // and bienestar (design-QA 2026-07-04 convention).
  },
  {
    id: "desierto-veterinario",
    label: "Desierto veterinario",
    description:
      "¿Qué zonas llevan más días sin actividad veterinaria registrada, y qué capacidad instalada hay para cubrirlas?",
    // base: desierto-veterinario (days-without-vet-activity choropleth). The
    // default 90d window is the vista's N: a quarter without ANY registered
    // vet-attended event is a meaningful access gap (annual antirrábica boosters
    // + routine controls make quarterly activity the expected floor). The period
    // selector changes N and the caption follows (window: "period").
    base: "desierto-veterinario",
    // references: the INSTALLED CAPACITY that turns this vista from a diagnosis
    // into a diagnosis WITH A PLAN — where are the clinics and shelters that
    // could cover the silent territory, and where is there nothing to deploy
    // through? Unblocked by the PO ruling 2026-07-25: "capacidad instalada NO es
    // presupuesto" — the standing "Panorama shows no costs" rule was being read
    // so broadly that the two directory layers stayed orphaned for months.
    // Reference layers are unlimited under F2 and never contend for the base or
    // signal slot, so this costs the vista nothing. They are DIRECTORY pins
    // (temporal: false): they do not move with the period or the time scrub, and
    // a clinic pin is a registered site, never a claim that it is open today.
    references: ["clinicas", "refugios"],
    level: "province",
    periodPreset: "90d",
    // A province-level access overview is a national question — frame the
    // country so the longest-silent jurisdictions are comparable at a glance.
    framing: { kind: "national" },
    // Vet-delivered intervention KPIs — the coverage measures that stall when a
    // territory has no registered veterinary activity.
    metrics: ["cobertura", "esterilizacion"],
    //
    // WHY THE BASE IS STILL `desierto-veterinario` AND NOT `acceso-veterinario`
    // (evaluated 2026-07-26, deliberately NOT swapped).
    //
    // The critique is CORRECT on the metric: `desierto-veterinario` is
    // right-censored at the window length (censoredAtMax: 90) and 23 of 24
    // provinces sit exactly at the cap, so the map is one colour and the ranking
    // is a 23-way tie. `acceso-veterinario` (visits per 1.000 active pets, 12m)
    // is continuous, normalized and does not saturate — it is the metric this
    // vista's question actually means.
    //
    // It is NOT swapped in yet because the console is POLARITY-BLIND for
    // "density" layers, and acceso-veterinario is the only layer in the registry
    // where a HIGH value is GOOD news:
    //   1. ranking.ts sorts every density layer DESCENDING and the panel titles
    //      it "Peores N" — so the ten BEST-served provinces would be listed as
    //      the worst.
    //   2. the sequential fill (class-scale.ts, SCALE_BLUE_SEQ) darkens with
    //      value, and every other sequential layer here means "dark = more of a
    //      bad thing" (mortalidad, denuncias, and this layer's own "DARK = many
    //      days without activity = the desert signal") — so the best-served
    //      provinces would paint as the alarm.
    // Swapping today trades a flat-but-honest map for a legible INVERTED one,
    // which is the worse defect on a government console.
    //
    // UNBLOCKING WORK (small, but outside this domain-only change): declare the
    // polarity on the layer (e.g. `higherIsBetter`), honour it in
    // rankWorstUnits/rankUnitsInScope, and reverse the sequential ramp for such
    // layers. That single fix also unblocks `indice-territorial` (0-100
    // attainment index — same "higher is better", same two traps), which is why
    // both stay orphaned together rather than for two separate reasons.
    //
    // Independently REPORTED and also unfixed: the underlying metric counts only
    // `vet_visit_logged`, so vaccinating 10.000 dogs does not register as
    // veterinary activity. Widening that predicate would ALSO de-saturate this
    // layer without touching polarity.
  },
  {
    id: "tendencia",
    label: "Tendencia",
    description: "¿Dónde hay más o menos incidentes que en el período anterior?",
    // base: tendencia (two-window delta choropleth, zero-anchored diverging
    // fill with inverted polarity — more events than before = warning pole).
    //
    // The delta counts INCIDENTS only (PO decision 2026-07-25) — counting all
    // pet_events made registry adoption read as deterioration and painted 24 of
    // 24 provinces at the warning pole. Residual confound, measured and NOT yet
    // fixed: incident reporting also grows with the padrón (23 up / 1 down
    // after the restriction; 18 up / 6 down once normalised per registered
    // pet). Normalising changes the unit from a count delta to a rate delta —
    // pending PO call. See TENDENCIA_INCIDENT_EVENTS.
    base: "tendencia",
    level: "province",
    // 30d vs the prior 30d: the operational trend cadence — long enough to
    // smooth day-of-week noise, short enough that a shift is actionable.
    periodPreset: "30d",
    // A cross-province comparison is a national question — frame the country.
    framing: { kind: "national" },
    // The event families the delta is most often ABOUT — the headline movers.
    metrics: ["mordeduras", "perdidas", "denuncias"],
  },
  {
    id: "riesgo-ppp",
    label: "Riesgo PPP",
    description: "¿Dónde se cruzan mordeduras altas con bajo registro PPP?",
    // base: ppp (registry-adoption rate surface). The overlay is mordeduras —
    // a DENSITY layer riding the signal slot via the declared bivariate pair
    // (see the `signal` JSDoc exception; bivariate.ts BIVARIATE_PAIRS).
    base: "ppp",
    signal: "mordeduras",
    // The question is "¿dónde muerden más?" over the registry backdrop — rank
    // by the mordeduras overlay, not the ppp base (brotes-activos precedent).
    rankBy: "mordeduras",
    level: "province",
    periodPreset: "90d",
    // A cross-province risk read — frame the country (brotes-activos precedent).
    framing: { kind: "national" },
    // The two crossed axes + the compliance sibling that shares the Ley Prov
    // 14.107 family with ppp.
    metrics: ["mordeduras", "ppp", "microchip"],
    // The vista OWNS the bivariate encoding — navigating here opens in it (the
    // encoding-seeding rule kept from the a948c975 revert), and the badge stays
    // "Riesgo PPP" while it is selected (?encoding=bivariate round-trips).
    encodings: ["bivariate"],
  },
] as const;

/**
 * Preset auto-activated on a FIRST visit to the console (bare URL, no explicit
 * board params, no saved board) — the landing must answer "¿dónde estamos mal?"
 * instead of showing an orphan default layer with a generic reading.
 *
 * `bienestar` is the pick: QA histórico 2026-07-08 found the previous default
 * `cumplimiento` (base cobertura, the antirrábica RATE) paints an EMPTY map
 * ("Sin datos para esta capa en tu cobertura") — the rabies-coverage rate needs
 * a population of vaccinated pets that this build's cobertura data doesn't yet
 * supply, so the operator's very first panorama load was a blank choropleth
 * (reported 3× across QA rounds). `bienestar` (base denuncias, welfare-report
 * density) is the proven-populated layer that reliably draws with divisions, so
 * the first paint shows data. When cobertura data is backfilled, `cumplimiento`
 * can be reinstated as the flagship default.
 */
export const DEFAULT_PANORAMA_PRESET_ID: PresetId = "bienestar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ordered list of layer ids this preset activates:
 *   [base, signal (if any), ...references (if any)]
 *
 * The order matches the activation sequence used by `onPreset` in
 * PanoramaConsole so that F2 compatibility checks pass at each step
 * (base first, then signal, then unlimited references).
 */
export function presetLayerIds(p: PanoramaPreset): LayerId[] {
  return [p.base, ...(p.signal ? [p.signal] : []), ...(p.references ?? [])];
}

/** Look up a preset by id. Returns undefined if not found. */
export function getPreset(id: PresetId): PanoramaPreset | undefined {
  return PANORAMA_PRESETS.find((p) => p.id === id);
}
