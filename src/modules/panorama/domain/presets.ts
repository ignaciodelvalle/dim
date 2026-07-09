// Panorama F3 — curated default views ("presets").
//
// Each preset encodes a QUESTION the operator wants to answer, mapping to a
// compatibility-valid layer set (F2) plus aggregation level and period.
// The 8 individual layer checkboxes remain available as "modo avanzado".
//
// Pure module — no DB, no React, no Next.

import type { AggregationLevel, LayerId, PanoramaKpiId } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresetId =
  | "brotes-activos"
  | "sintomas"
  | "cumplimiento"
  | "bienestar"
  | "control-poblacional"
  | "perdidas-reunificacion";

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
    level: "province",
    periodPreset: "90d",
    // Fase 1 framing demonstrator: an outbreak overview is a national question —
    // frame the whole country so cross-province patterns are visible at once.
    framing: { kind: "national" },
    // panorama-vista-redesign: the metrics column for "¿dónde hay brotes?".
    metrics: ["cobertura", "zoonosis", "mordeduras"],
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
    label: "% de cumplimiento",
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
    id: "perdidas-reunificacion",
    label: "Perdidas y reunificación (D4)",
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
