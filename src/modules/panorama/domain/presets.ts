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
  | "registro-ppp"
  | "bienestar"
  | "control-poblacional"
  | "mortalidad"
  | "perdidas-reunificacion"
  | "desierto-veterinario"
  | "tendencia";

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
    // P5: the "Riesgo (bivariado)" toggle is a display encoding WITHIN this
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
    // base: cobertura — the ONLY existing rate/compliance layer (antirrábica).
    // Future: a metric selector (microchip / PPP / esterilización) requires dedicated
    // rate layers that don't exist yet; cobertura is the sole rate layer in v1.
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
    metrics: ["perdidas", "reunificacion", "denuncias"],
    // Locality-level drill-down question — stays framing-less, same as sintomas
    // and bienestar (design-QA 2026-07-04 convention).
  },
  {
    id: "desierto-veterinario",
    label: "Desierto veterinario",
    description: "¿Qué zonas llevan más días sin actividad veterinaria registrada?",
    // base: desierto-veterinario (days-without-vet-activity choropleth). The
    // default 90d window is the vista's N: a quarter without ANY registered
    // vet-attended event is a meaningful access gap (annual antirrábica boosters
    // + routine controls make quarterly activity the expected floor). The period
    // selector changes N and the caption follows (window: "period").
    base: "desierto-veterinario",
    level: "province",
    periodPreset: "90d",
    // A province-level access overview is a national question — frame the
    // country so the longest-silent jurisdictions are comparable at a glance.
    framing: { kind: "national" },
    // Vet-delivered intervention KPIs — the coverage measures that stall when a
    // territory has no registered veterinary activity.
    metrics: ["cobertura", "esterilizacion"],
  },
  {
    id: "tendencia",
    label: "Tendencia",
    description: "¿Dónde hay más o menos eventos registrados que en el período anterior?",
    // base: tendencia (two-window delta choropleth, zero-anchored diverging
    // fill with inverted polarity — more events than before = warning pole).
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
