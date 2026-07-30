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
        suppressedInFrame={false}
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
        suppressedInFrame={false}
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
        suppressedInFrame={false}
      >
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  // LIVE PIXEL VERIFICATION 2026-07-30. This case used to read "keeps the k-anon
  // pill visible regardless of the other collapsed hints" and rendered the pill
  // with NO suppression in the frame — it pinned the defect as if it were the
  // contract. Measured on the live console: a 113x25 px "k<5 protegido" chip with
  // a Ley 25.326 tooltip over a canvas with zero hatched units, while MapLegends
  // (same frame) correctly said "Por ahora no hay escalas que decodificar".
  it("shows the k-anon pill when the frame paints a hatch, whatever else is collapsed", () => {
    render(
      <LegendPill baseLabel="Cobertura" rampColors={null} layerDots={[]} suppressedInFrame={true}>
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.getByText("⊘ k<5 protegido")).toBeInTheDocument();
  });

  it("renders NO k-anon pill when the frame paints no hatch", () => {
    render(
      <LegendPill
        baseLabel="Cobertura"
        rampColors={["#eee", "#333"]}
        layerDots={[{ color: "#f00", label: "Zoonosis / señales" }]}
        suppressedInFrame={false}
      >
        <div>panel</div>
      </LegendPill>,
    );

    expect(screen.queryByText("⊘ k<5 protegido")).not.toBeInTheDocument();
    // And the claim is gone in every form: no orphan Ley 25.326 tooltip left
    // announcing a mark the canvas does not paint.
    expect(
      screen.queryByTitle(
        "Unidades con menos de 5 casos: valor suprimido por k-anonimato (Ley 25.326)",
      ),
    ).not.toBeInTheDocument();
    // The rest of the strip is untouched.
    expect(screen.getByText("Cobertura")).toBeInTheDocument();
  });

  it("suppresses a layer dot whose label duplicates the pill title (visual review 2026-07-23 #2)", () => {
    // A graduated point-only view titles the pill with the caption label AND
    // used to repeat the same label as a dot chip ("Denuncias de bienestar •
    // Denuncias de bienestar"). The title is the naming — the duplicate chip
    // must not render (collapsed strip nor expanded repeat); distinct dots stay.
    render(
      <LegendPill
        baseLabel="Denuncias de bienestar"
        rampColors={null}
        layerDots={[
          { color: "#f00", label: "Denuncias de bienestar" },
          { color: "#0f0", label: "Zoonosis / señales" },
        ]}
        suppressedInFrame={false}
      >
        <div>panel</div>
      </LegendPill>,
    );

    // Exactly ONE "Denuncias de bienestar" — the bold title (the dot chip and
    // the expanded repeat would each add another occurrence).
    expect(screen.getAllByText("Denuncias de bienestar")).toHaveLength(1);
    // The non-duplicate dot renders twice: collapsed chip + expanded repeat.
    expect(screen.getAllByText("Zoonosis / señales")).toHaveLength(2);
  });
});
