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
import { PROVINCES } from "@/lib/reference/ar-provincias";
import type { BivariateCell } from "@/src/modules/panorama/domain/bivariate";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import { MapLegends } from "../MapLegends";

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

  // ⚠️ REWRITTEN (#40). This test used to read "never renders the k-anon line
  // for a province legend (QA fix — provinces are never suppressed)". That
  // premise died: a province cell is suppressed when its DENOMINATOR is sub-k.
  // The rule is now CONDITIONAL, not absent — the row appears exactly when this
  // frame has a suppressed province, so the key never announces a mark the map
  // is not painting, and never omits one it is.
  it("omits the k-anon row when NO province in this frame is suppressed", () => {
    const html = renderLegend(metaLayer());
    expect(html).not.toContain("Protegido por privacidad");
  });

  it("renders the k-anon row when a province IS suppressed (#40)", () => {
    // An unexplained hatch on a province is worse than none: the reader's only
    // available guess is "sin datos", which is the one thing it does not mean.
    const layer = metaLayer();
    layer.features = provinceFC([
      { provinceCode: "AR-B", value: 34 },
      { provinceCode: "AR-Z", value: null, suppressed: true },
    ]);
    const html = renderLegend(layer);
    expect(html).toContain("Protegido por privacidad");
    expect(html).toContain("k&lt;5");
  });

  it("keeps the k-anon row DISTINCT from the 'Sin datos' row (three states, three marks)", () => {
    // Two of 24 jurisdictions accounted for, so the stipple IS painted on the
    // other 22 and both keys are legitimately present.
    const layer = metaLayer();
    layer.features = provinceFC([
      { provinceCode: "AR-B", value: 34 },
      { provinceCode: "AR-Z", value: null, suppressed: true },
    ]);
    const html = renderLegend(layer);
    expect(html).toContain("Sin datos");
    expect(html).toContain("Protegido por privacidad");
  });

  // RA-7 F9 (2026-07-31) — the "Sin datos" key had never learned the discipline
  // the k-anon key beside it learned twice (#40, then 2026-07-30 for the pill /
  // bivariate / graduated rows): it rendered on EVERY province legend. A legend
  // that names a mark the canvas does not paint teaches the operator that the
  // legend is decoration — and the row they then stop reading is the privacy one.
  it("omits the 'Sin datos' key when EVERY jurisdiction reports (no stipple on the canvas)", () => {
    const layer = metaLayer();
    layer.features = provinceFC(PROVINCES.map((p, i) => ({ provinceCode: p.code, value: 30 + i })));
    const html = renderLegend(layer);
    expect(html).not.toContain("Sin datos");
    // The ramp itself is untouched — only the absent-mark key is gone.
    expect(html).toContain("80% (meta)");
  });

  it("keeps the 'Sin datos' key when even ONE jurisdiction is unaccounted for", () => {
    // 23 of 24 → one province is stippled, so the key describes a real mark.
    const layer = metaLayer();
    layer.features = provinceFC(
      PROVINCES.slice(0, PROVINCES.length - 1).map((p, i) => ({
        provinceCode: p.code,
        value: 30 + i,
      })),
    );
    expect(renderLegend(layer)).toContain("Sin datos");
  });

  it("counts a SUPPRESSED province as accounted-for, exactly like provinceNoDataFilter does", () => {
    // The trap the filter documents: a suppressed cell carries value null, so a
    // naive complement stipples it — rendering "nadie reportó acá" over the one
    // province whose count is sub-k. The key must make the same exclusion, or it
    // announces a stipple the canvas withholds.
    const layer = metaLayer();
    layer.features = provinceFC(
      PROVINCES.map((p, i) =>
        i === 0
          ? { provinceCode: p.code, value: null, suppressed: true }
          : { provinceCode: p.code, value: 30 + i },
      ),
    );
    const html = renderLegend(layer);
    expect(html).not.toContain("Sin datos");
    expect(html).toContain("Protegido por privacidad");
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

  // -------------------------------------------------------------------------
  // RA-7 F10 — the bivariate grey was PAINTED and never DECLARED.
  //
  // `bivariateFillColorExpr` defaults every province the cross cannot classify
  // to COLOR_NO_DATA. The 3×3 legend decoded nine colours and the hatch, and
  // offered no reading for that grey at all — so an operator saw a colour on the
  // map with nothing anywhere telling them what it meant. Worse, the grey covers
  // TWO situations that are opposite conclusions for a municipality: "falta un
  // eje" (we have half the data and cannot cross it) and "no reportó ninguna de
  // las dos". One hue cannot separate them, so the key says which of them THIS
  // frame contains and points at the popup, which does resolve it per unit.
  // -------------------------------------------------------------------------
  function bivLayer(cells: BivariateCell[]): ActiveLayer {
    return {
      id: "cobertura",
      color: "#59a14f",
      label: "Riesgo de brotes",
      geomType: "choropleth",
      level: "province",
      dataType: "rate",
      features: provinceFC([]),
      bivariateCells: cells,
    } as unknown as ActiveLayer;
  }

  function cell(over: Partial<BivariateCell>): BivariateCell {
    return {
      provinceCode: "AR-B",
      place: "Buenos Aires",
      coverageValue: 50,
      signalValue: 4,
      coverageClass: 1,
      signalClass: 1,
      suppressed: false,
      ...over,
    } as BivariateCell;
  }

  it("says NOTHING about grey when every bivariate cell is classified", () => {
    const html = renderLegend(bivLayer([cell({}), cell({ provinceCode: "AR-X" })]));
    expect(html).not.toContain("Gris:");
  });

  it("declares the MISSING-AXIS grey, and insists it is not an absence of cases", () => {
    // Coverage known, signal absent: there IS something in this jurisdiction, we
    // just cannot place it on the matrix. Reading that grey as "no pasa nada" is
    // the decision error this key exists to prevent.
    const html = renderLegend(
      bivLayer([cell({}), cell({ provinceCode: "AR-X", signalValue: null, signalClass: null })]),
    );
    expect(html).toContain("falta una de las dos capas");
    expect(html).toContain("No significa que no haya casos");
  });

  it("declares the BOTH-AXES-MISSING grey with its own, different sentence", () => {
    const html = renderLegend(
      bivLayer([
        cell({}),
        cell({
          provinceCode: "AR-X",
          coverageValue: null,
          coverageClass: null,
          signalValue: null,
          signalClass: null,
        }),
      ]),
    );
    expect(html).toContain("ninguna de las dos capas reportó");
    expect(html).not.toContain("No significa que no haya casos");
  });

  it("says BOTH are present when the frame mixes them, instead of picking one", () => {
    const html = renderLegend(
      bivLayer([
        cell({ provinceCode: "AR-X", signalValue: null, signalClass: null }),
        cell({
          provinceCode: "AR-S",
          coverageValue: null,
          coverageClass: null,
          signalValue: null,
          signalClass: null,
        }),
      ]),
    );
    expect(html).toContain("en otras faltan las dos");
  });

  it("does NOT re-declare a SUPPRESSED cell as grey — the hatch key already owns it", () => {
    // A suppressed cell is also colourless, but it carries its own mark and its
    // own key. Counting it here would publish two readings for one polygon —
    // and would leak the sub-k unit into a key that describes ABSENCE.
    //
    // ⚠️ FIXTURE CORRECTED after a surviving mutant (2026-08-01). This case first
    // used `cell({ suppressed: true })`, which inherits the helper's classified
    // defaults. bivariate.ts is explicit that "`suppressed: true` NEVER carries
    // classes" — its colour is withheld, so no tercile is ever assigned — so the
    // old fixture was data production cannot emit, and the cell exited
    // bivariateGreyStates through the "fully classified" branch instead of the
    // suppression guard. Deleting the guard therefore left this test GREEN. The
    // assertion was right; the input never reached the line it was guarding.
    const html = renderLegend(
      bivLayer([
        cell({}),
        cell({
          provinceCode: "AR-X",
          suppressed: true,
          coverageValue: null,
          coverageClass: null,
          signalValue: null,
          signalClass: null,
        }),
      ]),
    );
    expect(html).not.toContain("Gris:");
    expect(html).toContain("Protegido por privacidad");
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

  // RA-7 F9, division half. Same defect as the province "Sin datos" key: the
  // "Sin datos (solo contorno)" row rendered on every drilled frame.
  function divisionOnly(noData: boolean | undefined) {
    return renderToStaticMarkup(
      <MapLegends
        layers={[]}
        divisionLegend={{
          label: "Cobertura antirrábica (perros, 12m)",
          unitNoun: "departamento",
          min: 48,
          max: 172,
          hasRamp: true,
          breaks: [48, 89, 131, 172],
          colors: ["#0a0", "#0b0", "#0c0", "#0d0", "#0e0"],
          suppressed: false,
          ...(noData === undefined ? {} : { noData }),
        }}
        graduatedScale={null}
        provinceSeqLegend={{}}
      />,
    );
  }

  it("omits 'Sin datos (solo contorno)' when every division in the scope is filled", () => {
    expect(divisionOnly(false)).not.toContain("Sin datos (solo contorno)");
  });

  it("keeps it when the stipple IS painted on at least one division", () => {
    expect(divisionOnly(true)).toContain("Sin datos (solo contorno)");
  });

  it("keeps it when the descriptor predates the flag — unknown must not hide a real mark", () => {
    // `noData` is optional so an older/serialized descriptor still renders. For a
    // key that has always OVER-rendered, the safe direction of an unknown is to
    // keep showing it, never to start silently hiding a mark that is on screen.
    expect(divisionOnly(undefined)).toContain("Sin datos (solo contorno)");
  });
});
