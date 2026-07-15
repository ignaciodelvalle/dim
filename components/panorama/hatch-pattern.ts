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
