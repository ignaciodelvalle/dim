// Shared diagonal-hatch fill-pattern for k-anon-suppressed choropleth cells.
//
// map-polish cursor #2 — a suppressed division must be perceptually distinct from
// BOTH a colored data cell and an outline-only no-data cell (the honest
// trichotomy). A 45° light-slate hatch over a transparent tile is the standard
// government-cartography mark for "dato protegido". Registered once per MapLibre
// instance via addImage and referenced by `fill-pattern`.
//
// Kept framework-light (only the DOM canvas API) so the SituationalMap and the
// CABA inset share ONE pattern — the same suppression mark on every surface.

import { bivariateSuppressedCodes } from "@/components/panorama/bivariate-fill";
import { hasSuppressedProvince } from "@/components/panorama/province-choropleth-style";
import type { BivariateCell } from "@/src/modules/panorama/domain/bivariate";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

/** The map-image id both maps register the hatch tile under. */
export const HATCH_IMAGE_ID = "pano-hatch-suppressed";

/**
 * The 45° hatch stroke color — the SINGLE source of truth shared by the canvas
 * tile (below) AND the off-canvas legend swatches (MapLegends), so the map mark
 * and its legend key can never drift apart.
 *
 * LIGHT-SKIN REGRESSION FIX (2026-07-15): the original slate-300 (`#cbd5e1`)
 * stroke was tuned for the RETIRED dark-navy canvas — light lines popped on navy.
 * After the v2C light-skin migration (2026-07-11) the canvas is near-white
 * (#eef1f4 land / #e7eaed no-data), and a slate-300 hatch on near-white is
 * effectively INVISIBLE, so a k-anon-suppressed cell read as blank "sin datos"
 * (the Córdoba/PBA antirrábica "looks broken" report). A mid-slate (slate-500)
 * stroke reads clearly on the light canvas while staying obviously "muted /
 * protected", not a data color. Same class of leftover-from-a-previous-skin bug
 * as the CVD teal near-regression.
 */
export const HATCH_STROKE_RGBA = "rgba(71,85,105,0.85)"; // slate-600, reads on the light canvas

/**
 * The legend swatch's CSS `background-image` — the exact same 45° stroke color as
 * the canvas tile, as a repeating-linear-gradient. Kept here so the legend and the
 * map hatch are defined ONCE, together.
 */
export const HATCH_SWATCH_CSS = `repeating-linear-gradient(45deg, ${HATCH_STROKE_RGBA} 0, ${HATCH_STROKE_RGBA} 1px, transparent 1px, transparent 3px)`;

// ---------------------------------------------------------------------------
// "Does THIS FRAME actually paint a hatch?" — the gate every legend surface
// that names the mark must pass.
//
// LIVE PIXEL VERIFICATION 2026-07-30. LegendPill rendered «⊘ k<5 protegido»
// UNCONDITIONALLY (its own comment said "NEVER hidden"), tooltip citing Ley
// 25.326, in frames with ZERO hatched marks on the canvas. MapLegends had
// already learned the discipline for two of its three rows (`divisionLegend
// .suppressed`, `hasSuppressedProvince`) — but not for the bivariate row, and
// the pill had never learned it at all.
//
// A legend that announces a mark the map does not paint is the exact mirror of
// a map that hatches without announcing it: both teach the operator that the
// legend and the canvas are not describing the same thing, and the second one
// they stop believing is the privacy notice. Defined HERE, beside the mark
// itself, so the question is answered ONCE — the pill and the Referencias tab
// read the same booleans and cannot drift.
// ---------------------------------------------------------------------------

/** Structural subset of an ActiveLayer — kept structural (not the imported
 *  `ActiveLayer`) so this module stays a leaf of the situational-map graph. */
export type HatchableLayer = {
  features: FeatureCollection;
  /** Present only on a bivariate province layer; its cells carry the k-anon
   *  propagation, NOT `features` (see bivariate.ts). */
  bivariateCells?: readonly BivariateCell[] | null;
};

/**
 * Whether ONE layer paints at least one hatched unit in the current frame.
 *
 * Delegates per surface to the helper that already owns that surface's rule —
 * `bivariateSuppressedCodes` for the 3×3 matrix (whose suppression lives on the
 * cells) and `hasSuppressedProvince` for an ordinary province choropleth
 * (whose suppression lives on the feature flag). No third rule is invented
 * here; a locality/point layer has no province cell to hatch and correctly
 * answers false — its hatch, if any, is the division fill, reported separately
 * by the lifted `divisionLegend.suppressed`.
 */
export function layerPaintsHatch(layer: HatchableLayer): boolean {
  if (layer.bivariateCells) return bivariateSuppressedCodes(layer.bivariateCells).length > 0;
  return hasSuppressedProvince(layer.features);
}

/**
 * Whether a CELL-LIST frame paints at least one hatched unit.
 *
 * The third carrier in this family (RA-3 C6, 2026-07-31). `MapChoropleth`
 * (components/charts) is not a Panorama layer: its frame is a flat
 * `ChoroplethRegionDatum[]`, so it has neither a `FeatureCollection` for
 * `hasSuppressedProvince` nor `bivariateCells` for `bivariateSuppressedCodes`.
 * Reading the wrong carrier silently answers false — the failure
 * legend-suppression-parity.test.tsx already pins for the other two — so the
 * atom lives HERE, beside the mark and beside its siblings, instead of as an
 * inline `.some()` inside a 1100-line chart component. One module answers
 * "does this frame paint a hatch", for every carrier there is.
 *
 * Deliberately NOT a `suppressedCount > 0` read, same as `frameHasSuppressedMark`:
 * a count describes the RESPONSE and can be non-zero at a grain the canvas is not
 * painting. This reads the marks the frame actually carries.
 */
export function cellsPaintHatch(cells: readonly { suppressed?: boolean }[]): boolean {
  return cells.some((c) => c.suppressed === true);
}

/**
 * Whether ANY surface in the current frame paints a hatch — the condition for
 * naming the k-anon mark in a legend. This is exactly "MapLegends would render
 * at least one «Protegido por privacidad (k<5)» row", by construction: it ORs
 * the same per-surface atoms that gate those rows.
 *
 * Deliberately NOT `suppressedCount > 0`. That number describes the RESPONSE —
 * it can count cells at a grain the frame is not painting (a province-grain
 * count while the canvas shows departments, a stale layer still in state), and
 * a legend must describe the CANVAS.
 */
export function frameHasSuppressedMark(
  layers: readonly HatchableLayer[],
  divisionLegend: { suppressed: boolean } | null,
): boolean {
  if (divisionLegend?.suppressed === true) return true;
  return layers.some(layerPaintsHatch);
}

/**
 * Build the diagonal-hatch tile as ImageData. Transparent background + mid-slate
 * 45° strokes (readable on the light canvas). Returns null when no canvas is
 * available (SSR / no DOM), in which case the suppressed cells fall back to
 * outline-only (still never zero).
 */
export function buildHatchImageData(): ImageData | null {
  if (typeof document === "undefined") return null;
  const tile = 8;
  const scale = 2; // matches addImage pixelRatio: 2 (crisp on hi-dpi)
  const w = tile * scale;
  const h = tile * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = HATCH_STROKE_RGBA; // slate-600 — reads on the light canvas
  ctx.lineWidth = 1.25 * scale;
  ctx.lineCap = "square";
  ctx.beginPath();
  // Three parallel bottom-left→top-right segments offset by the tile width so the
  // 45° hatch tiles seamlessly across the pattern edges.
  for (const offset of [-w, 0, w]) {
    ctx.moveTo(offset, h);
    ctx.lineTo(offset + w, 0);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, w, h);
}
