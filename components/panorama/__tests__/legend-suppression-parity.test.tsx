// The two legend surfaces must agree with the CANVAS about the k-anon mark.
//
// LIVE PIXEL VERIFICATION 2026-07-30 (a2-05-FINDING-legendpill-announces-
// unpainted-mark.png). In one measured frame:
//   · LegendPill  → rendered «⊘ k<5 protegido» (113×25 px, tooltip citing
//                   Ley 25.326) with ZERO hatched marks on the canvas.
//   · MapLegends  → correctly omitted its k-anon rows and said "Por ahora no
//                   hay escalas que decodificar".
// Two surfaces, one frame, opposite claims. The pill was unconditional by
// design ("NEVER hidden"), which reads as privacy diligence but is the mirror
// of the disclosure bug it looks like: announcing a mark the map does not paint
// teaches the operator that the legend does not describe the canvas — and the
// notice they learn to skip is the privacy one.
//
// This file pins the COUPLING, not one component: for the same frame, both
// surfaces are driven by the same `frameHasSuppressedMark` / `layerPaintsHatch`
// atoms, so they cannot drift apart again. A per-component test could not have
// caught the original defect — each one was internally consistent.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LegendPill } from "@/components/panorama/LegendPill";
import { MapLegends } from "@/components/panorama/MapLegends";
import type { ActiveLayer, DivisionLegendDescriptor } from "@/components/panorama/SituationalMap";
import { frameHasSuppressedMark, layerPaintsHatch } from "@/components/panorama/hatch-pattern";
import type { BivariateCell } from "@/src/modules/panorama/domain/bivariate";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

const K_ANON_ROW = "Protegido por privacidad";
const PILL_CHIP = "k&lt;5 protegido";

function provinceFC(
  cells: Array<{ provinceCode: string; value: number | null; suppressed?: boolean }>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      geometry: null,
      properties: {
        provinceCode: c.provinceCode,
        province: c.provinceCode,
        value: c.value,
        suppressed: c.suppressed === true,
      },
    })),
  };
}

function provinceLayer(
  cells: Array<{ provinceCode: string; value: number | null; suppressed?: boolean }>,
): ActiveLayer {
  return {
    id: "cobertura",
    color: "#59a14f",
    label: "Cobertura antirrábica (perros, 12m)",
    geomType: "choropleth",
    level: "province",
    dataType: "rate",
    complianceTarget: 80,
    features: provinceFC(cells),
  } as ActiveLayer;
}

function bivariateCell(provinceCode: string, suppressed: boolean): BivariateCell {
  return {
    provinceCode,
    place: provinceCode,
    coverageValue: suppressed ? null : 55,
    signalValue: suppressed ? null : 12,
    coverageClass: suppressed ? null : 2,
    signalClass: suppressed ? null : 2,
    suppressed,
  };
}

function bivariateLayer(cells: BivariateCell[]): ActiveLayer {
  return {
    id: "brotes",
    color: "#e15759",
    label: "Brotes activos",
    geomType: "choropleth",
    level: "province",
    features: provinceFC(cells.map((c) => ({ provinceCode: c.provinceCode, value: null }))),
    bivariateCells: cells,
  } as unknown as ActiveLayer;
}

function divisionLegend(suppressed: boolean): DivisionLegendDescriptor {
  return {
    label: "Cobertura antirrábica (perros, 12m)",
    unitNoun: "departamento",
    min: 1,
    max: 40,
    hasRamp: true,
    breaks: [10, 20, 30],
    colors: ["#eef", "#ccd", "#99a", "#667"],
    suppressed,
  };
}

/** Render BOTH surfaces over ONE frame, exactly as PanoramaConsole wires them:
 *  the pill's gate is `frameHasSuppressedMark` over the same layers + lifted
 *  division legend MapLegends receives. */
function renderFrame(layers: ActiveLayer[], division: DivisionLegendDescriptor | null) {
  const suppressedInFrame = frameHasSuppressedMark(layers, division);
  const pill = renderToStaticMarkup(
    <LegendPill
      baseLabel="Cobertura antirrábica (perros, 12m)"
      rampColors={["#eef", "#667"]}
      layerDots={[]}
      suppressedInFrame={suppressedInFrame}
    >
      <div>panel</div>
    </LegendPill>,
  );
  const legends = renderToStaticMarkup(
    <MapLegends
      layers={layers}
      divisionLegend={division}
      graduatedScale={null}
      provinceSeqLegend={{}}
    />,
  );
  return {
    suppressedInFrame,
    pillClaims: pill.includes(PILL_CHIP),
    legendsClaim: legends.includes(K_ANON_ROW),
  };
}

describe("a frame with ZERO suppressed features names the k-anon mark NOWHERE", () => {
  it("province choropleth, every cell visible — neither surface claims a hatch", () => {
    const frame = renderFrame(
      [
        provinceLayer([
          { provinceCode: "AR-B", value: 61 },
          { provinceCode: "AR-X", value: 44 },
        ]),
      ],
      null,
    );
    expect(frame.suppressedInFrame).toBe(false);
    expect(frame.pillClaims).toBe(false);
    expect(frame.legendsClaim).toBe(false);
  });

  it("division fill with no suppressed unit — neither surface claims a hatch", () => {
    const frame = renderFrame([provinceLayer([{ provinceCode: "AR-B", value: 61 }])], {
      ...divisionLegend(false),
    });
    expect(frame.suppressedInFrame).toBe(false);
    expect(frame.pillClaims).toBe(false);
    expect(frame.legendsClaim).toBe(false);
  });

  it("bivariate frame with no suppressed cell — neither surface claims a hatch", () => {
    // The bivariate k-anon row in MapLegends was the LAST unconditional one in
    // that file; before this fix it printed the hatch key on every bivariate
    // frame, suppressed or not.
    const frame = renderFrame(
      [bivariateLayer([bivariateCell("AR-B", false), bivariateCell("AR-X", false)])],
      null,
    );
    expect(frame.suppressedInFrame).toBe(false);
    expect(frame.pillClaims).toBe(false);
    expect(frame.legendsClaim).toBe(false);
  });

  it("empty frame (nothing painting at all) — neither surface claims a hatch", () => {
    const frame = renderFrame([], null);
    expect(frame.suppressedInFrame).toBe(false);
    expect(frame.pillClaims).toBe(false);
    expect(frame.legendsClaim).toBe(false);
  });
});

describe("a frame that DOES paint a hatch names it on BOTH surfaces", () => {
  it("a suppressed province cell", () => {
    const frame = renderFrame(
      [
        provinceLayer([
          { provinceCode: "AR-B", value: 61 },
          { provinceCode: "AR-Z", value: null, suppressed: true },
        ]),
      ],
      null,
    );
    expect(frame.suppressedInFrame).toBe(true);
    expect(frame.pillClaims).toBe(true);
    expect(frame.legendsClaim).toBe(true);
  });

  it("a suppressed division unit (locality grain — no province cell to read)", () => {
    const frame = renderFrame([], divisionLegend(true));
    expect(frame.suppressedInFrame).toBe(true);
    expect(frame.pillClaims).toBe(true);
    expect(frame.legendsClaim).toBe(true);
  });

  it("a suppressed bivariate cell", () => {
    const frame = renderFrame(
      [bivariateLayer([bivariateCell("AR-B", false), bivariateCell("AR-Z", true)])],
      null,
    );
    expect(frame.suppressedInFrame).toBe(true);
    expect(frame.pillClaims).toBe(true);
    expect(frame.legendsClaim).toBe(true);
  });
});

describe("layerPaintsHatch reads each surface's OWN carrier", () => {
  // The two carriers are genuinely different and a single generic rule would be
  // wrong: a bivariate layer's `features` have no `suppressed` flag (the k-anon
  // propagation lives on `bivariateCells`), and an ordinary province layer has
  // no cells. Reading the wrong one silently answers false.
  it("bivariate suppression is read off bivariateCells, not features", () => {
    const layer = bivariateLayer([bivariateCell("AR-Z", true)]);
    expect(
      layer.features.features.every(
        (f) => (f.properties as { suppressed?: boolean }).suppressed !== true,
      ),
      "fixture: the bivariate layer's features carry no suppressed flag",
    ).toBe(true);
    expect(layerPaintsHatch(layer)).toBe(true);
  });

  it("province suppression is read off the feature flag", () => {
    expect(layerPaintsHatch(provinceLayer([{ provinceCode: "AR-B", value: 61 }]))).toBe(false);
    expect(
      layerPaintsHatch(provinceLayer([{ provinceCode: "AR-Z", value: null, suppressed: true }])),
    ).toBe(true);
  });
});
