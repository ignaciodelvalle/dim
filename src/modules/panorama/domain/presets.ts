// Panorama F3 — curated default views ("presets").
//
// Each preset encodes a QUESTION the operator wants to answer, mapping to a
// compatibility-valid layer set (F2) plus aggregation level and period.
// The 8 individual layer checkboxes remain available as "modo avanzado".
//
// Pure module — no DB, no React, no Next.

import type { AggregationLevel, LayerId } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresetId =
  | "brotes-activos"
  | "sintomas"
  | "cumplimiento"
  | "bienestar"
  | "control-poblacional";

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
  /** Aggregation granularity the preset sets on activation. */
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
  },
  {
    id: "sintomas",
    label: "Síntomas / vigilancia sindrómica",
    description: "¿Dónde se concentran los eventos clínicos con mayor alerta?",
    // base: mordeduras — best existing proxy for syndromic/clinical event density.
    // Future: replace with a dedicated symptom/syndromic density layer when available.
    base: "mordeduras",
    // signal: zoonosis overlaid to surface reportable-disease alerts.
    signal: "zoonosis",
    level: "locality",
    periodPreset: "30d",
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
  },
] as const;

/**
 * Preset auto-activated on a FIRST visit to the console (bare URL, no explicit
 * board params, no saved board) — design-QA 2026-07-04 highest-leverage nit:
 * the landing must answer "¿dónde estamos mal?" instead of showing an orphan
 * default layer with a generic reading. `cumplimiento` is the pick because its
 * single base layer (cobertura, the antirrábica rate) is the most reliably
 * present dataset in every scope, and its national framing + question-framed
 * label align the map, the presets row and the auto-reading on first paint.
 */
export const DEFAULT_PANORAMA_PRESET_ID: PresetId = "cumplimiento";

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
