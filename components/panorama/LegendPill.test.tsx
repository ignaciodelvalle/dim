// @vitest-environment jsdom
//
// LegendPill — Round-3 QA fix 6: the collapsed strip must convey "what does
// dark mean" (ramp min/max), the bivariate axes, and a graduated size hint —
// WITHOUT opening the panel. Pins the three additions against the plain
// <details><summary> markup (OverlayDisclosure renders both eagerly).

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LegendPill } from "./LegendPill";

afterEach(cleanup);

describe("<LegendPill> — collapsed-strip enrichment (Round-3 QA fix 6)", () => {
  it("shows min/max endpoint labels flanking a sequential/meta ramp", () => {
    render(
      <LegendPill
        baseLabel="Cobertura antirrábica"
        rampColors={["#eee", "#ccc", "#999", "#666", "#333"]}
        rampEndpoints={{ min: "0%", max: "70% meta" }}
        layerDots={[]}
      >
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("70% meta")).toBeInTheDocument();
  });

  it("renders no ramp/endpoints when rampColors is null (e.g. bivariate mode)", () => {
    render(
      <LegendPill
        baseLabel="Riesgo combinado"
        rampColors={null}
        rampEndpoints={null}
        bivariate
        layerDots={[]}
      >
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("cobertura × señal")).toBeInTheDocument();
  });

  it("shows a small/large step hint with real value labels for graduated encodings", () => {
    render(
      <LegendPill
        baseLabel="Eventos por unidad"
        rampColors={null}
        layerDots={[{ color: "#f00", label: "Pérdidas activas" }]}
        graduatedHint={{ small: { r: 5, label: "1" }, large: { r: 30, label: "42" } }}
      >
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("keeps the k-anon pill visible regardless of the other collapsed hints", () => {
    render(
      <LegendPill baseLabel="Cobertura" rampColors={null} layerDots={[]}>
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("⊘ k<5 protegido")).toBeInTheDocument();
  });
});
