// Unit tests for the pinned situational-map popup builders (pure, no maplibre).

import { describe, expect, it } from "vitest";

import {
  buildLayerReadout,
  buildPinnedPopupHtml,
  divisionReadoutDataType,
  formatMetaGap,
  formatValueWithUnit,
} from "../map-popup";

// A "rate" layer is only a rate at PROVINCE level. Drilled to a division the
// repository swaps the metric to a raw count-density (a per-division rate would
// expose both k-anonymised arms), and the legend and caption already say so.
// The pinned popup did not: it passed the layer's STATIC dataType through, so a
// drilled count of 11205 rendered "11.205%" and got measured against "meta 80%"
// while the drawer beside it showed the same value unit-less. QA ronda 5
// (2026-07-16) read that as the map contradicting the panel — the panel was
// right and the popup was inventing a unit.
describe("divisionReadoutDataType", () => {
  it("demotes a rate layer to a count at division level", () => {
    expect(divisionReadoutDataType("rate")).toBe("density");
  });

  it("leaves non-rate types untouched", () => {
    expect(divisionReadoutDataType("density")).toBe("density");
    expect(divisionReadoutDataType("signal")).toBe("signal");
    expect(divisionReadoutDataType("reference")).toBe("reference");
    expect(divisionReadoutDataType(undefined)).toBeUndefined();
  });

  it("a drilled coverage count renders with no percent and no compliance meta", () => {
    const readout = buildLayerReadout({
      label: "Cobertura antirrábica",
      value: 11205,
      dataType: divisionReadoutDataType("rate"),
      complianceTarget: undefined,
    });
    expect(readout.valueText).toBe("11.205");
    expect(readout.valueText).not.toContain("%");
    expect(readout.metaText).toBeUndefined();
  });

  it("province level keeps the percentage and the meta — the rate IS a rate there", () => {
    const readout = buildLayerReadout({
      label: "Cobertura antirrábica",
      value: 64.4,
      dataType: "rate",
      complianceTarget: 80,
    });
    expect(readout.valueText).toBe("64,4%");
    expect(readout.metaText).toBe("meta 80% · −15,6");
  });
});

describe("formatValueWithUnit", () => {
  it("renders a rate value as an es-AR percentage", () => {
    expect(formatValueWithUnit(64.4, "rate")).toBe("64,4%");
    expect(formatValueWithUnit(80, "rate")).toBe("80%");
  });

  it("renders a count value as a grouped es-AR number with no unit", () => {
    expect(formatValueWithUnit(1234, "density")).toBe("1.234");
    expect(formatValueWithUnit(5, undefined)).toBe("5");
  });
});

describe("formatMetaGap", () => {
  it("formats a below-target gap with a unicode minus", () => {
    // 64,4 against meta 80 → −15,6.
    expect(formatMetaGap(64.4, 80)).toBe("meta 80% · −15,6");
  });

  it("formats an above-target gap with a plus", () => {
    expect(formatMetaGap(92, 80)).toBe("meta 80% · +12");
  });
});

describe("buildLayerReadout", () => {
  it("carries the value WITH unit and the meta+gap for a rate layer", () => {
    const r = buildLayerReadout({
      label: "Cobertura antirrábica",
      value: 64.4,
      dataType: "rate",
      complianceTarget: 80,
    });
    expect(r.valueText).toBe("64,4%");
    expect(r.metaText).toBe("meta 80% · −15,6");
    expect(r.state).toBeUndefined();
  });

  it("marks a suppressed cell as protected (no number)", () => {
    const r = buildLayerReadout({ label: "Zoonosis", value: null, suppressed: true });
    expect(r.valueText).toBeNull();
    expect(r.state).toBe("suppressed");
  });

  it("marks a null non-suppressed cell as no-data", () => {
    const r = buildLayerReadout({ label: "Zoonosis", value: null });
    expect(r.valueText).toBeNull();
    expect(r.state).toBe("nodata");
  });
});

describe("buildPinnedPopupHtml", () => {
  it("names EVERY active layer in a multi-layer readout", () => {
    const html = buildPinnedPopupHtml({
      place: "Buenos Aires",
      readouts: [
        buildLayerReadout({
          label: "Cobertura",
          value: 64.4,
          dataType: "rate",
          complianceTarget: 80,
        }),
        buildLayerReadout({ label: "Zoonosis", value: 1234, dataType: "density" }),
      ],
    });
    // Both layers are labeled with their own value (not one shared metric).
    expect(html).toContain("Cobertura");
    expect(html).toContain("64,4%");
    expect(html).toContain("meta 80% · −15,6");
    expect(html).toContain("Zoonosis");
    expect(html).toContain("1.234");
  });

  it("renders dialog semantics, the place title, and the Ver detalle affordance", () => {
    const html = buildPinnedPopupHtml({
      place: "Palermo",
      readouts: [buildLayerReadout({ label: "Zoonosis", value: 3, dataType: "density" })],
      cutoffLabel: "Al 30/6/2026",
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Detalle de Palermo"');
    expect(html).toContain("Al 30/6/2026");
    expect(html).toContain("data-pano-detail");
    expect(html).toContain("Ver detalle");
  });

  it("omits the Ver detalle affordance when withDetail is false", () => {
    const html = buildPinnedPopupHtml({
      place: "Palermo",
      readouts: [],
      withDetail: false,
    });
    expect(html).not.toContain("data-pano-detail");
  });

  it("escapes untrusted place + layer names", () => {
    const html = buildPinnedPopupHtml({
      place: "<img src=x onerror=alert(1)>",
      readouts: [buildLayerReadout({ label: "<b>x</b>", value: 1, dataType: "density" })],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img");
  });

  it("shows the protected copy for a suppressed readout, never a number", () => {
    const html = buildPinnedPopupHtml({
      place: "Comuna 1",
      readouts: [buildLayerReadout({ label: "Zoonosis", value: null, suppressed: true })],
    });
    expect(html).toContain("k-anonimato");
    expect(html).not.toMatch(/pano-pin-value/);
  });
});
