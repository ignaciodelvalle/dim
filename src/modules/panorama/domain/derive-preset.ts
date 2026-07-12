// Panorama ViewState P2 — the DERIVED active preset (task #66 / WS-4).
//
// The active preset is NOT stored state. It is a pure projection of the current
// view: the preset (if any) whose layer SET + encoding match what is on screen.
// Storing it is what let the badge diverge from the map — pressing a KPI chip
// used to imperatively discard the stored preset (`setActivePresetId(null)`),
// jumping the vista unpredictably. With the preset DERIVED, the badge follows
// the layers truthfully: edit the layers and the vista name re-derives.
//
// MATCH RULE (design §1, §2): a preset is identified by its LAYER SET and its
// encoding — NOT by period / scope / asOf. Those are orthogonal modifiers that
// stay ON a preset (changing the period of "Brotes activos" keeps it "Brotes
// activos"). A hand-edited layer set that matches no preset is "personalizada"
// (null). A swap that lands EXACTLY on another preset's set derives to that
// preset (honest — the operator built that view, whatever route they took).
//
// Pure — NO @/db, NO next, NO React (hexagonal domain purity).

import { type PanoramaPreset, type PresetId, presetLayerIds } from "./presets";
import type { LayerId } from "./types";
import type { EncodingId } from "./view-state";

/**
 * The preset whose (layer set, encoding) matches the current view, or `null`
 * ("personalizada" / modo avanzado) when none does.
 *
 * @param activeLayers the layers currently active, in any order (a SET is
 *   compared — activation order is irrelevant to preset identity).
 * @param encoding the encoding SELECTION. `null` = "auto" (the encoding a preset
 *   implies). An explicit, non-null encoding is a custom override that no preset
 *   owns → always `null`. P1 keeps this `null` everywhere (the bivariate
 *   "riesgo-brotes" view is a display toggle WITHIN "Brotes activos", not a
 *   stored encoding, so it does not leave the preset).
 * @param presets the preset catalogue to match against.
 */
export function derivePreset(
  activeLayers: readonly LayerId[],
  encoding: EncodingId | null,
  presets: readonly PanoramaPreset[],
): PresetId | null {
  // An explicit encoding override is a hand-customized view — presets are the
  // "auto" (encoding-null) views, so only then can the layer set name one.
  if (encoding !== null) return null;

  const active = new Set<LayerId>(activeLayers);
  for (const preset of presets) {
    if (sameLayerSet(active, presetLayerIds(preset))) return preset.id;
  }
  return null;
}

/** Set-equality between the active layers and a preset's layer list (order- and
 *  duplicate-independent). */
function sameLayerSet(active: Set<LayerId>, presetLayers: readonly LayerId[]): boolean {
  const presetSet = new Set<LayerId>(presetLayers);
  if (active.size !== presetSet.size) return false;
  for (const id of presetSet) {
    if (!active.has(id)) return false;
  }
  return true;
}
