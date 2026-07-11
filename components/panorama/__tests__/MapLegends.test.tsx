// Component tests for the "Referencias" rail legend — the META'd rate layers.
//
// PO decision (ratified in live QA): the META'd rate layers (cobertura,
// esterilización, microchip, ppp) render with the 4-class THRESHOLD scale, NOT the
// continuous amber/teal divergent scale. This test pins the legend side of that
// change: a META'd province layer now shows DISCRETE class swatches whose ranges
// equal the painted step breaks (<40% / 40–<60% / 60–<80% / ≥80% (meta)), and the
// old divergent copy ("bajo meta" / "sobre meta") is gone. The "lo – <hi" interior
// format (QA fix) disambiguates the half-open boundary: a value AT a break belongs
// to the class that STARTS there, never the one that labels up to it.
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
    // Half-open disambiguation (QA fix): "lo – <hi" makes the exclusive upper
    // bound explicit, so a value AT the break (e.g. 60) unambiguously reads as
    // belonging to the class that starts there, not the one that ends there.
    expect(html).toContain("40 – &lt;60%");
    expect(html).toContain("60 – &lt;80%");
    // The top class is tagged as the compliance target.
    expect(html).toContain("80% (meta)");
  });

  it("no longer renders the continuous divergent legend copy", () => {
    const html = renderLegend(metaLayer());
    expect(html).not.toContain("bajo meta");
    expect(html).not.toContain("sobre meta");
  });

  it("never renders the k-anon 'Dato protegido' line for a province legend (QA fix — provinces are never suppressed)", () => {
    const html = renderLegend(metaLayer());
    expect(html).not.toContain("Dato protegido");
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
    expect(html).toContain("40 – &lt;60%");
    expect(html).toContain("60 – &lt;80%");
    expect(html).toContain("80% (meta)");
    // The lifted class colors are the painted swatch backgrounds.
    expect(html).toContain("#0d0");
  });

  it("MAP-3 honesty: the DRILLED division legend names its encoding as counts, while the province legend stays rate-labeled", () => {
    // Live-QA MAP-3 (2026-07-11): at province level the cobertura fill encodes a
    // RATE ("<40%…≥80% (meta)"); drilled, the division fill encodes raw COUNTS
    // (48/89/131/172, Río Negro) while the KPI headline stays a rate — an
    // operator could misread the drilled map as % coverage. The deliberate v1
    // count encoding stays; the legend must SAY the unit. Render both legends
    // side by side and pin that the division title states "conteos por <unit>"
    // and the province legend keeps its % / (meta) rate labels.
    const divisionLegend = {
      label: "Cobertura antirrábica (perros, 12m)",
      unitNoun: "departamento",
      min: 48,
      max: 172,
      hasRamp: true,
      breaks: [48, 89, 131, 172],
      colors: ["#0a0", "#0b0", "#0c0", "#0d0", "#0e0"],
      suppressed: false,
    };
    const html = renderToStaticMarkup(
      <MapLegends
        layers={[metaLayer()]}
        divisionLegend={divisionLegend}
        graduatedScale={null}
        provinceSeqLegend={{}}
      />,
    );
    // Drilled division legend: the count encoding is named explicitly.
    expect(html).toContain("conteos por departamento");
    // Province legend (same render): rate semantics intact, not relabeled.
    expect(html).toContain("80% (meta)");
  });
});
