// Unit tests for the pinned situational-map readout formatters.
//
// map-popup.ts exists precisely so this formatting is testable without pulling
// in maplibre-gl — but it had no test, and that gap is what let the drilled-unit
// bug below live: the popup formatted a raw division COUNT as a percentage and
// measured it against a rate's compliance target.

import { describe, expect, it } from "vitest";

import {
  buildLayerReadout,
  divisionReadoutDataType,
  formatValueWithUnit,
} from "@/components/panorama/map-popup";

describe("formatValueWithUnit", () => {
  it("renders a rate with a percent sign, es-AR decimal comma", () => {
    expect(formatValueWithUnit(64.4, "rate")).toBe("64,4%");
  });

  it("renders every other type as a plain es-AR grouped count", () => {
    expect(formatValueWithUnit(11205, "density")).toBe("11.205");
    expect(formatValueWithUnit(11205, undefined)).toBe("11.205");
  });
});

describe("divisionReadoutDataType", () => {
  // The whole point: at division level a "rate" layer's value is a raw count,
  // because a per-division rate would expose both k-anonymised arms. The legend
  // and caption already say so; the popup must agree with them.
  it("demotes a rate layer to a count at division level", () => {
    expect(divisionReadoutDataType("rate")).toBe("density");
  });

  it("leaves non-rate types untouched", () => {
    expect(divisionReadoutDataType("density")).toBe("density");
    expect(divisionReadoutDataType("signal")).toBe("signal");
    expect(divisionReadoutDataType("reference")).toBe("reference");
    expect(divisionReadoutDataType(undefined)).toBeUndefined();
  });

  // QA ronda 5 (2026-07-16) regression. The side panel said "64,4%" while the
  // drilled map held a raw count of 11205; the popup rendered that count as
  // "11.205%", so two adjacent surfaces disagreed and the operator could not
  // tell which one was lying. It was the popup.
  it("a drilled coverage count never renders as a percentage", () => {
    const readout = buildLayerReadout({
      label: "Cobertura antirrábica",
      value: 11205,
      dataType: divisionReadoutDataType("rate"),
      complianceTarget: undefined,
    });
    expect(readout.valueText).toBe("11.205");
    expect(readout.valueText).not.toContain("%");
  });

  // A rate's "meta 80%" is meaningless against a raw count — it must not ride
  // along into the drilled readout.
  it("a drilled coverage count carries no compliance meta", () => {
    const readout = buildLayerReadout({
      label: "Cobertura antirrábica",
      value: 11205,
      dataType: divisionReadoutDataType("rate"),
      complianceTarget: undefined,
    });
    expect(readout.metaText).toBeUndefined();
  });

  // The province-level path is the one place the rate IS a rate — unchanged.
  it("keeps the percentage and the meta at province level", () => {
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
