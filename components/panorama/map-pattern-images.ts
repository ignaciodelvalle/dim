// Register the choropleth's two textural marks on a MapLibre instance.
//
// The operator map encodes three states, and only one of them is a colour:
//   value      → a class from the blue ramp
//   protected  → the 45° hatch (k-anon suppression)
//   no data    → the stipple (D.5(b))
//
// The two textures are registered together because they are one decision: on a
// light canvas the fills for "protected", "empty" and bare land all collapse
// into the same narrow band of greys, so form is what keeps them apart. Doing
// this in one place also means the SituationalMap and the CABA inset cannot end
// up with different sets of marks — a mark that exists on one surface and not
// the other is worse than no mark, because the reader learns it and then it
// lies on the next screen.
//
// Fail-soft by design: with no canvas (SSR, hardened browser) the tiles cannot
// be built, and each overlay degrades on its own terms — suppression to a solid
// tone, no-data to its existing solid fill.

import type maplibregl from "maplibre-gl";

import { HATCH_IMAGE_ID, buildHatchImageData } from "@/components/panorama/hatch-pattern";
import { NO_DATA_IMAGE_ID, buildNoDataImageData } from "@/components/panorama/no-data-pattern";

/** Idempotent: safe to call on every `load`, and on a style reload. */
export function registerChoroplethPatterns(map: maplibregl.Map): void {
  try {
    if (!map.hasImage(HATCH_IMAGE_ID)) {
      const hatch = buildHatchImageData();
      if (hatch) map.addImage(HATCH_IMAGE_ID, hatch, { pixelRatio: 2 });
    }
    if (!map.hasImage(NO_DATA_IMAGE_ID)) {
      const stipple = buildNoDataImageData();
      if (stipple) map.addImage(NO_DATA_IMAGE_ID, stipple, { pixelRatio: 2 });
    }
  } catch {
    // No canvas / addImage unavailable — both overlays degrade honestly.
  }
}
