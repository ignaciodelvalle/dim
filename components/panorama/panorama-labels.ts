// Panorama v3 — de-dup information architecture (task #38 item 5) + the Filtro
// counter semantics (item 3). PURE display helpers: no React, no DB. English
// identifiers, es-AR copy (invariant #4).
//
// DE-DUP RULE (PO-directed): "no string repeats a concept its CONTAINER already
// states." The active vista name is shown ONCE — the rail's Vista trigger, the
// KPI-cluster caption, and the Filtro panel header. The KPI cards and the Filtro
// layer rows then drop the stem the vista name already carries. Concrete PO
// example — "Pérdidas y reunificación" used to echo near-identical strings 5×
// (the vista name, KPI "Pérdidas activas", KPI "Tasa de reunificación", layer
// "Pérdidas / avistajes", layer "Reunificación").
//
// IMPORTANT — canonical labels are NOT mutated here. The KPI `label`
// (get-panorama-kpis.ts) carries DASHBOARD PARITY (it must equal the /gob tile
// wording) and is pinned by many tests; the layer `label` (layers.ts) is pinned
// by the domain suite. This module produces CHROME-ONLY short forms layered on
// top — a display transform the parity contract and the tests never see. The
// maps below are CURATED and reviewed (not algorithmic): an entry exists only
// where the vista context makes the shortened form self-sufficient. Anything not
// listed falls back to the canonical label unchanged.

import { PANORAMA_DEFAULT_PRESET } from "@/lib/analytics/analytics-period";
import { roleOf } from "@/src/modules/panorama/domain/compatibility";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import { type PresetId, getPreset } from "@/src/modules/panorama/domain/presets";
import type { LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

// ---------------------------------------------------------------------------
// Vista name — shown ONCE by the chrome container.
// ---------------------------------------------------------------------------

/** The active vista's display name, or null in manual/advanced mode. */
export function activeVistaName(presetId: PresetId | null): string | null {
  if (presetId === null) return null;
  return getPreset(presetId)?.label ?? null;
}

// ---------------------------------------------------------------------------
// Curated per-vista SHORT labels (the de-dup, item 5).
// ---------------------------------------------------------------------------

/**
 * KPI card short labels, keyed presetId → kpiId. Only clear wins where the vista
 * name already states the stem AND the remainder is a self-sufficient noun.
 *
 * DELIBERATELY NOT shortened (flagged as semantically risky, kept canonical):
 *  - `cumplimiento` cobertura: "Cobertura antirrábica (perros, 12m)" sits beside
 *    "Cobertura de esterilización" in the same trio, so bare "Cobertura" would be
 *    ambiguous — the vista prefix would be dropped at the cost of meaning.
 *  - `perdidas-reunificacion` reunificacion: "Tasa de reunificación" — bare
 *    "Reunificación" loses the "rate/percentage" reading; "Tasa" alone is
 *    ambiguous. Kept whole.
 */
const KPI_SHORT: Partial<Record<PresetId, Partial<Record<PanoramaKpiId, string>>>> = {
  "perdidas-reunificacion": {
    // vista states "Pérdidas" → "Pérdidas activas" becomes just "Activas".
    perdidas: "Activas",
  },
};

/**
 * Filtro layer-row short labels, keyed presetId → layerId. The Filtro groups
 * rows under the vista heading, so a row can drop the stem the heading states.
 */
const LAYER_SHORT: Partial<Record<PresetId, Partial<Record<LayerId, string>>>> = {
  sintomas: {
    // vista name IS "Síntomas / vigilancia sindrómica" → the base row is "Síntomas".
    sintomas: "Síntomas",
  },
  bienestar: {
    // vista states "Bienestar" → "Denuncias de bienestar" becomes "Denuncias".
    denuncias: "Denuncias",
  },
  "perdidas-reunificacion": {
    // vista states "Pérdidas" and "reunificación".
    perdidas: "Avistajes",
    reunificacion: "Tasa por unidad",
  },
};

/**
 * The KPI card label to SHOW: the curated short form when the active vista makes
 * the concept obvious, else the canonical label unchanged.
 */
export function shortKpiLabel(
  presetId: PresetId | null,
  kpiId: PanoramaKpiId,
  canonicalLabel: string,
): string {
  if (presetId === null) return canonicalLabel;
  return KPI_SHORT[presetId]?.[kpiId] ?? canonicalLabel;
}

/**
 * The Filtro layer-row label to SHOW under the active vista heading: the curated
 * short form when the vista states the stem, else the canonical label.
 */
export function shortLayerLabel(
  presetId: PresetId | null,
  layerId: LayerId,
  canonicalLabel: string,
): string {
  if (presetId === null) return canonicalLabel;
  return LAYER_SHORT[presetId]?.[layerId] ?? canonicalLabel;
}

// ---------------------------------------------------------------------------
// Filtro counter semantics (item 3).
// ---------------------------------------------------------------------------

/**
 * The Filtro badge count — "active map modifiers beyond the vista's defaults".
 *
 * The PO's complaint: the old badge counted only active OVERLAY layers ("el
 * contador está malito, o debería contar más que capas"). The documented rule:
 *
 *   count =  (# active OVERLAY layers: signal + reference; the base is implicit
 *             and never counted)
 *          + (# non-default FILTERS deviating from the active vista's defaults):
 *              · base layer re-based away from the vista's default base   → +1
 *              · period differs from the vista's default periodPreset      → +1
 *              · "solo firmado por matrícula" (verifiedOnly) is ON         → +1
 *
 * DELIBERATELY EXCLUDED: the aggregation `level` — it is camera/zoom-derived
 * (hysteresis), not a deliberate operator filter, so counting it would make the
 * badge jump on pan/zoom. In manual/advanced mode (no active vista) there is no
 * "vista default" base, and the period baseline is the app default preset.
 */
export function countFiltroModifiers(input: {
  /** All currently active layer ids (base + overlays). */
  activeLayerIds: readonly LayerId[];
  /** The active vista, or null (manual/advanced mode). */
  presetId: PresetId | null;
  /** The layer currently painting the choropleth (the base), or null. */
  baseLayerId: LayerId | null;
  /** The committed period preset id (e.g. "90d"). */
  activePeriod: string;
  /** The "solo firmado por matrícula" numerator toggle. */
  verifiedOnly: boolean;
}): number {
  const overlays = input.activeLayerIds.filter((id) => {
    const layer = getLayer(id);
    if (!layer) return false;
    const role = roleOf(layer);
    return role === "signal" || role === "reference";
  }).length;

  let deviations = 0;
  const preset = input.presetId ? getPreset(input.presetId) : null;
  if (preset) {
    if (input.baseLayerId != null && input.baseLayerId !== preset.base) deviations += 1;
    if (input.activePeriod !== preset.periodPreset) deviations += 1;
  } else if (input.activePeriod !== PANORAMA_DEFAULT_PRESET) {
    deviations += 1;
  }
  if (input.verifiedOnly) deviations += 1;

  return overlays + deviations;
}
