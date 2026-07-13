// Pure builders for the PINNED situational-map popup (Esri "number in context").
//
// The hover tooltip is a fast preview; the PINNED popup is a DOCUMENT: selectable
// text, a value WITH its unit, the k-anon state when protected, the compliance
// meta + gap for rate layers, and — the PO's most-repeated ask — a MULTI-LAYER
// readout that names every active layer's value at the clicked unit (not just one
// metric). Extracted here so the readout formatting is unit-testable WITHOUT
// importing maplibre-gl (SituationalMap wires the DOM + interaction lifecycle).
//
// English identifiers, es-AR user copy (project invariant #4).

import { escapeHtml } from "@/lib/utils/escape-html";
import { isMetaLayer } from "@/src/modules/panorama/domain/capabilities";

/** The taxonomy the readout formatter branches on (subset of ActiveLayer.dataType). */
export type ReadoutDataType = "rate" | "density" | "signal" | "reference" | undefined;

/** One layer's contribution to the pinned readout — names WHICH metric it is. */
export type LayerReadout = {
  /** Layer name — the label that disambiguates a stacked, multi-layer readout. */
  label: string;
  /** The value WITH unit ("64,4%" | "1.234"), or null when there is no number. */
  valueText: string | null;
  /** Present only when valueText is null: why there is no number. */
  state?: "suppressed" | "nodata";
  /** Rate layers with a compliance target: "meta 80% · −15,6". */
  metaText?: string;
};

const UNICODE_MINUS = "−";

/** Format a value with its unit. Rate layers read as a percentage ("64,4%");
 * every other type is a plain es-AR-grouped count ("1.234"). */
export function formatValueWithUnit(value: number, dataType: ReadoutDataType): string {
  if (dataType === "rate") {
    return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
  }
  return value.toLocaleString("es-AR");
}

/** Format the compliance meta + signed gap for a rate layer: "meta 80% · −15,6".
 * A negative gap (below target) uses a true Unicode minus so the copy reads clean. */
export function formatMetaGap(value: number, target: number): string {
  const gap = value - target;
  const rounded = Math.round(gap * 10) / 10;
  const sign = rounded < 0 ? UNICODE_MINUS : "+";
  const magnitude = Math.abs(rounded).toLocaleString("es-AR", { maximumFractionDigits: 1 });
  const metaText = target.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return `meta ${metaText}% · ${sign}${magnitude}`;
}

/** Build one layer's readout from its value + k-anon state. `value === null` with
 * `suppressed` renders the protected copy; `value === null` otherwise is no-data. */
export function buildLayerReadout(input: {
  label: string;
  value: number | null;
  suppressed?: boolean;
  dataType?: ReadoutDataType;
  complianceTarget?: number;
}): LayerReadout {
  if (input.suppressed === true) {
    return { label: input.label, valueText: null, state: "suppressed" };
  }
  if (input.value === null) {
    return { label: input.label, valueText: null, state: "nodata" };
  }
  const valueText = formatValueWithUnit(input.value, input.dataType);
  // P2: the isMeta predicate reads the ONE shared registry helper (the gate's
  // encoding.kind source) instead of a local copy of the rate+target check.
  const metaText = isMetaLayer(input)
    ? formatMetaGap(input.value, input.complianceTarget)
    : undefined;
  return { label: input.label, valueText, metaText };
}

/** es-AR copy for a null-value state. */
function stateCopy(state: "suppressed" | "nodata"): string {
  return state === "suppressed" ? "Dato protegido por privacidad (k-anonimato)" : "Sin datos";
}

/**
 * Build the pinned popup's inner HTML: a role="dialog" card with the place name,
 * one labeled row per active layer (the multi-layer readout), the fecha-de-corte
 * context line, and a "Ver detalle →" affordance (data-pano-detail — the wiring
 * attaches the DetailDrawer handler to it). All interpolated text is escaped.
 */
export function buildPinnedPopupHtml(input: {
  place: string;
  readouts: LayerReadout[];
  cutoffLabel?: string | null;
  /** Whether to render the "Ver detalle →" affordance (omit for point pins that
   * have no richer drawer than the popup already shows). Defaults to true. */
  withDetail?: boolean;
}): string {
  const place = escapeHtml(input.place);
  const rows = input.readouts
    .map((r) => {
      const label = `<span class="pano-pin-layer">${escapeHtml(r.label)}</span>`;
      if (r.valueText === null) {
        const copy = escapeHtml(stateCopy(r.state ?? "nodata"));
        return `<div class="pano-pin-row">${label}<span class="pano-pin-muted">${copy}</span></div>`;
      }
      const meta = r.metaText ? `<span class="pano-pin-meta">${escapeHtml(r.metaText)}</span>` : "";
      return `<div class="pano-pin-row">${label}<span class="pano-pin-value">${escapeHtml(
        r.valueText,
      )}</span>${meta}</div>`;
    })
    .join("");
  const context = input.cutoffLabel
    ? `<div class="pano-pin-context">${escapeHtml(input.cutoffLabel)}</div>`
    : "";
  const detail =
    input.withDetail === false
      ? ""
      : `<button type="button" class="pano-pin-detail" data-pano-detail>Ver detalle →</button>`;
  return (
    `<div role="dialog" aria-label="Detalle de ${place}" class="pano-pin">` +
    `<div class="pano-pin-title">${place}</div>` +
    `<div class="pano-pin-readouts">${rows}</div>` +
    `${context}${detail}</div>`
  );
}
