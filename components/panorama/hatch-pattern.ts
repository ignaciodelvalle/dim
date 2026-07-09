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
 * Build the diagonal-hatch tile as ImageData. Transparent background + light
 * slate 45° strokes. Returns null when no canvas is available (SSR / no DOM), in
 * which case the suppressed cells fall back to outline-only (still never zero).
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
  ctx.strokeStyle = "rgba(203,213,225,0.8)"; // slate-300
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
