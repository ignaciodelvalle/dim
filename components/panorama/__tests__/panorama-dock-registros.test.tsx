// The dock's Registros pane — extracted from PanoramaConsole under the
// file-size fence (RA-7 truth pass, 2026-08-01).
//
// What is worth testing here is not the table (MapDataTable has its own tests)
// but the DISCLOSURES: each one exists because two honest numbers on this board
// measure different universes, and an unnamed smaller number reads as a
// contradiction rather than a narrower claim.
//
// Pattern: renderToStaticMarkup — the pane is pure props → DOM.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DockRecordSummary } from "@/components/panorama/panorama-map-table";

import { PanoramaDockRegistros } from "../PanoramaDockRegistros";

function summary(over: Partial<DockRecordSummary> = {}): DockRecordSummary {
  return {
    hasCountLayer: true,
    total: 3026,
    suppressed: 0,
    unitsWithEvents: 18,
    anyPeriodLayer: true,
    ...over,
  };
}

function render(over: { summary?: DockRecordSummary } = {}): string {
  return renderToStaticMarkup(
    <PanoramaDockRegistros
      summary={over.summary ?? summary()}
      referenceLayerLabels={[]}
      localityRateInView={false}
      percapitaActive={false}
      rows={[]}
      caption="Datos del mapa por unidad — Nacional, últimos 90 días."
      metrics={[]}
      truncatedLayers={[]}
      pointModeLayerLabels={[]}
      suppressedUnits={0}
      viewScope={null}
    />,
  );
}

describe("PanoramaDockRegistros — the event total names what it counts", () => {
  it("labels a period-flow total as events in the period", () => {
    expect(render()).toContain("Eventos en el período");
  });

  it("labels a current-state stock as 'Registros (estado actual)', never as period events", () => {
    expect(render({ summary: summary({ anyPeriodLayer: false }) })).toContain(
      "Registros (estado actual)",
    );
  });

  // RA-7 F6 — the console answered "cuántas celdas están protegidas" in four
  // places at once. Two of them were one claim computed twice (fixed by
  // `activeSuppressedCells`); the other two, including this one, are genuinely
  // NARROWER universes. A narrower number is fine — a narrower number that does
  // not say what it counts is a contradiction of the legend pill's view-wide
  // total sitting a few centimetres away.
  it("says the protected units are EXCLUDED FROM THIS TOTAL, not that they are the view's", () => {
    const html = render({ summary: summary({ suppressed: 4 }) });
    expect(html).toContain("4 unidades protegidas por k-anonimato, no incluidas en este total");
  });

  it("keeps the singular honest too", () => {
    const html = render({ summary: summary({ suppressed: 1 }) });
    expect(html).toContain("1 unidad protegida por k-anonimato, no incluida en este total");
  });

  it("says nothing about protection when nothing was withheld", () => {
    expect(render()).not.toContain("k-anonimato");
  });
});
