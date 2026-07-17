// Panorama IA v2 — the plain-language per-view caption builder (design §2.4).
//
// captionFor(layer, level, period) turns a layer's declarative `caption` material
// + `renderPolicy[level]` into the es-AR sentence rendered between the preset row
// and the suppression notice. It is the vehicle of the "context switch": when the
// VISTA (preset), scope, or period change, the caption is recomputed.
//
// Pure module — no DB, no React, no Next. The descriptor declares the WORDS; this
// builder assembles the sentence, so the domain stays framework-free.

import { isNationalDepartmentGrain } from "./layers";
import type { AggregationLevel, PanoramaLayer, PanoramaPeriod, RenderMode } from "./types";

const MS_PER_DAY = 86_400_000;

/** Whole days spanned by a period (inclusive-lower / inclusive-upper ISO dates). */
function periodDays(period: PanoramaPeriod): number {
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

/** The time phrase: current-state rollups say "estado actual"; windowed layers
 *  say "últimos N días" from the active period. */
function windowPhrase(window: "period" | "current", period: PanoramaPeriod): string {
  if (window === "current") return "estado actual";
  return `últimos ${periodDays(period)} días`;
}

/** Encoding verb + mark noun for a render mode (the word the map actually shows). */
function markWords(mode: RenderMode): { subject: string; encoding: string } {
  switch (mode) {
    case "choropleth-fill":
      return { subject: "área", encoding: "Relleno" };
    case "graduated-symbol":
      return { subject: "burbuja", encoding: "Tamaño" };
    case "clustered-points":
      return { subject: "punto", encoding: "Ubicación" };
  }
}

/**
 * Build the plain es-AR caption for a layer at a given administrative level and
 * period. Template (design §2.4):
 *
 *   "Cada {área|burbuja} es una {unit}. {Relleno|Tamaño} = {measure}, {window}."
 *   + " Meta {target}%." when the layer declares a complianceTarget.
 *
 * Reference layers (clustered-points) never aggregate into a unit, so they get a
 * simpler "Puntos individuales: {measure}, {window}." sentence and never a Meta
 * clause (they carry no complianceTarget).
 */
export function captionFor(
  layer: PanoramaLayer,
  level: AggregationLevel,
  period: PanoramaPeriod,
): string {
  const mode = layer.renderPolicy[level];
  const when = windowPhrase(layer.caption.window, period);
  const { subject, encoding } = markWords(mode);

  if (mode === "clustered-points") {
    return `Puntos individuales: ${layer.caption.measure}, ${when}.`;
  }

  // A NATIONAL_DEPARTMENT_GRAIN layer (zoonosis) renders one graduated symbol per
  // DEPARTMENT even at the national/province request (PO 2026-07-16), so its caption
  // must name the "división" unit — the bubbles ARE departments, so "provincia" would
  // be a label≠map lie. Per-layer: every other layer keeps `level` verbatim. The render
  // MARK is unchanged (renderPolicy.province === renderPolicy.locality === graduated
  // for zoonosis), so only the unit noun flips.
  const unitLevel: AggregationLevel =
    level === "province" && isNationalDepartmentGrain(layer.id) ? "locality" : level;
  const unit = layer.caption.unit[unitLevel];

  // Honesty branch (v1 rate limitation — repository.ts rate-layer note): a `rate`
  // layer paints its true ratePct ONLY at province grain. At any FINER grain
  // (locality/department) the v1 loader falls back to a COUNT per unit
  // (count-density), not a percentage. So the caption must NOT promise a "%"
  // measure or a "Meta X%" target there — it names the fill as a per-unit count,
  // matching the division-fill legend ("conteos por …") and the dock. This keeps
  // the panorama canon (label = number = map): the words never claim a % the fill
  // is not painting. v2 follow-up: compute a real per-department % (needs the
  // numerator/denominator per department); then this branch collapses back into
  // the % + Meta copy below.
  if (layer.dataType === "rate" && level !== "province") {
    return `Cada ${subject} es una ${unit}. ${encoding} = ${layer.caption.measure} — conteo por unidad (no porcentaje), ${when}.`;
  }

  const base = `Cada ${subject} es una ${unit}. ${encoding} = ${layer.caption.measure}, ${when}.`;
  return layer.complianceTarget !== undefined ? `${base} Meta ${layer.complianceTarget}%.` : base;
}
