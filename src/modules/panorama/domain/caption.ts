// Panorama IA v2 — the plain-language per-view caption builder (design §2.4).
//
// captionFor(layer, level, period) turns a layer's declarative `caption` material
// + `renderPolicy[level]` into the es-AR sentence rendered between the preset row
// and the suppression notice. It is the vehicle of the "context switch": when the
// VISTA (preset), scope, or period change, the caption is recomputed.
//
// Pure module — no DB, no React, no Next. The descriptor declares the WORDS; this
// builder assembles the sentence, so the domain stays framework-free.

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

  const unit = layer.caption.unit[level];
  const base = `Cada ${subject} es una ${unit}. ${encoding} = ${layer.caption.measure}, ${when}.`;
  return layer.complianceTarget !== undefined ? `${base} Meta ${layer.complianceTarget}%.` : base;
}
