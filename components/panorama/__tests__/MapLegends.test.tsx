// Component tests for the "Referencias" rail legend — the META'd rate layers.
//
// PO decision (ratified in live QA): the META'd rate layers (cobertura,
// esterilización, microchip, ppp) render with the 4-class THRESHOLD scale, NOT the
// continuous amber/teal divergent scale. This test pins the legend side of that
// change: a META'd province layer now shows DISCRETE class swatches whose ranges
// equal the painted step breaks (<40% / 40–60% / 60–80% / ≥80% (meta)), and the old
// divergent copy ("bajo meta" / "sobre meta") is gone.
//
// Pattern: renderToStaticMarkup (no jsdom needed — the legend is pure props → DOM).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ActiveLayer } from "@/components/panorama/SituationalMap";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import { MapLegends } from "../MapLegends";

function provinceFC(cells: Array<{ provinceCode: string; value: number }>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      geometry: null,
      properties: { provinceCode: c.provinceCode, province: c.provinceCode, value: c.value },
    })),
  };
}

// A META'd rate province layer (cobertura antirrábica, meta 80%).
function metaLayer(): ActiveLayer {
  return {
    id: "cobertura",
    color: "#59a14f",
    label: "Cobertura antirrábica (perros, 12m)",
    geomType: "choropleth",
    level: "province",
    dataType: "rate",
    complianceTarget: 80,
    features: provinceFC([
      { provinceCode: "AR-B", value: 34 },
      { provinceCode: "AR-X", value: 55 },
      { provinceCode: "AR-S", value: 72 },
      { provinceCode: "AR-M", value: 88 },
    ]),
  } as ActiveLayer;
}

function renderLegend(layer: ActiveLayer, provinceSeqLegend = {}): string {
  return renderToStaticMarkup(
    <MapLegends
      layers={[layer]}
      divisionLegend={null}
      graduatedScale={null}
      provinceSeqLegend={provinceSeqLegend}
    />,
  );
}

describe("MapLegends — META'd rate layer renders the discrete threshold-class legend", () => {
  it("shows discrete class-range swatches at the META breaks (fallback recompute)", () => {
    const html = renderLegend(metaLayer());
    // The 4 threshold classes: <40% / 40–60% / 60–80% / ≥80% (meta). `<` and `≥`
    // are HTML-escaped by renderToStaticMarkup, so assert on the numeric parts.
    expect(html).toContain("40%");
    expect(html).toContain("40 – 60%");
    expect(html).toContain("60 – 80%");
    // The top class is tagged as the compliance target.
    expect(html).toContain("80% (meta)");
  });

  it("no longer renders the continuous divergent legend copy", () => {
    const html = renderLegend(metaLayer());
    expect(html).not.toContain("bajo meta");
    expect(html).not.toContain("sobre meta");
  });

  it("swatch ranges track the LIFTED scale (map/legend parity, e.g. under scrub)", () => {
    // The map lifts the same breaks/colors it paints; the legend must render them.
    const lifted = {
      cobertura: {
        breaks: [40, 60, 80],
        colors: ["#0a0", "#0b0", "#0c0", "#0d0"],
      },
    };
    const html = renderLegend(metaLayer(), lifted);
    expect(html).toContain("40 – 60%");
    expect(html).toContain("60 – 80%");
    expect(html).toContain("80% (meta)");
    // The lifted class colors are the painted swatch backgrounds.
    expect(html).toContain("#0d0");
  });
});
