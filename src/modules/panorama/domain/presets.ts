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

export type PresetId = "brotes-activos" | "sintomas" | "cumplimiento" | "bienestar";

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
] as const;

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
