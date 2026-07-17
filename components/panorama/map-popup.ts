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

/**
 * The readout dataType for a value read at DIVISION level (department/barrio).
 *
 * A "rate" layer is only a rate at PROVINCE level. Drilled to a division, the
 * repository swaps the metric to raw count-density — a per-division rate would
 * expose both k-anonymised arms (numerator AND denominator) and leak the cells
 * suppression is protecting (the "V1 LIMITATION" in
 * src/modules/panorama/infrastructure/repository.ts). The legend and the caption
 * already state that swap ("conteos por departamento" / "conteo por unidad (no
 * porcentaje)") — this is the same rule as
 * src/modules/panorama/domain/caption.ts, which reads
 * `dataType === "rate" && level !== "province"`.
 *
 * The pinned popup used to pass the layer's STATIC dataType straight through, so
 * a drilled count rendered as "11.205%" and got measured against the rate's
 * "meta 80%". QA ronda 5 (2026-07-16) read that as the map contradicting the
 * side panel — the panel was right and the popup was inventing a unit.
 */
export function divisionReadoutDataType(dataType: ReadoutDataType): ReadoutDataType {
  return dataType === "rate" ? "density" : dataType;
}

/** es-AR qualifier appended to a readout label once its value is a raw COUNT that
 *  a same-named scope-level readout shows as a percentage. */
export const COUNT_READOUT_SUFFIX = " (conteo)";

/**
 * Label for a readout whose value has been DEMOTED to a raw count at division grain
 * (the divisionReadoutDataType swap). The SINGLE choke point for the demoted label:
 * render sites pass the demotion flag they already compute; the label transform lives
 * here so it is unit-testable and can never drift between the division popup and the
 * point-circle popup.
 *
 * WHY (QA ronda, 2026-07-16): a drilled department popup shows the rate layer's raw
 * count ("Cobertura antirrábica: 72") while the scope-level side panel shows the same
 * layer's province/scope percentage ("Cobertura antirrábica · 64,3%"). SAME label,
 * DIFFERENT unit, not comparable — both testers flagged it. The PO fix differentiates
 * the LABELS, not the data: the demoted count keeps its layer name but gains the
 * "(conteo)" qualifier so the reader sees it is a count, while the scope panel keeps
 * the "%" label untouched. A non-demoted readout keeps its label verbatim.
 */
export function countReadoutLabel(label: string, demotedToCount: boolean): string {
  return demotedToCount ? `${label}${COUNT_READOUT_SUFFIX}` : label;
}

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
  /**
   * True when this readout is a rate layer DEMOTED to a raw count at division grain
   * (its `dataType` was already run through divisionReadoutDataType). The label gains
   * the "(conteo)" qualifier so it never reads as the scope-level percentage under the
   * SAME name (QA ronda 2026-07-16). Applies to every value state (value/suppressed/
   * nodata) so the demoted layer's name is consistent across the readout.
   */
  demotedToCount?: boolean;
}): LayerReadout {
  const label = countReadoutLabel(input.label, input.demotedToCount === true);
  if (input.suppressed === true) {
    return { label, valueText: null, state: "suppressed" };
  }
  if (input.value === null) {
    return { label, valueText: null, state: "nodata" };
  }
  const valueText = formatValueWithUnit(input.value, input.dataType);
  // P2: the isMeta predicate reads the ONE shared registry helper (the gate's
  // encoding.kind source) instead of a local copy of the rate+target check.
  const metaText = isMetaLayer(input)
    ? formatMetaGap(input.value, input.complianceTarget)
    : undefined;
  return { label, valueText, metaText };
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
