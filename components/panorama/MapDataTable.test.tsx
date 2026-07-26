// @vitest-environment jsdom
//
// MapDataTable — Round-2 review #3a: the "Capa" column repeats the SAME
// value on every row when a single layer is active — zero information, pure
// noise. Pins: the column hides when exactly one layer produced rows, and
// stays (to disambiguate) when 2+ layers are active. The CSV export is
// unaffected (buildMapTableCsv always keeps Capa — a self-contained file has
// no adjacent "1 capa" context to lean on).

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MapDataTable, type MapTableRow, buildMapTableCsv } from "./MapDataTable";

afterEach(cleanup);

const ONE_LAYER: MapTableRow[] = [
  { layer: "Cobertura antirrábica", unit: "Salta", value: "64,4 %" },
  { layer: "Cobertura antirrábica", unit: "Jujuy", value: "58,1 %" },
];

const TWO_LAYERS: MapTableRow[] = [
  { layer: "Cobertura antirrábica", unit: "Salta", value: "64,4 %" },
  { layer: "Mordeduras", unit: "Salta", value: "12" },
];

describe("MapDataTable — Capa column gated on active-layer count (Round-2 review #3a)", () => {
  it("hides the Capa column and cells when exactly one layer produced rows", () => {
    render(<MapDataTable rows={ONE_LAYER} caption="cap" filename="f" />);

    expect(screen.queryByRole("columnheader", { name: "Capa" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cobertura antirrábica")).not.toBeInTheDocument();
    // The other columns are unaffected.
    expect(screen.getByRole("columnheader", { name: "Unidad" })).toBeInTheDocument();
    expect(screen.getByText("Salta")).toBeInTheDocument();
  });

  it("keeps the Capa column when 2+ layers produced rows (disambiguates)", () => {
    render(<MapDataTable rows={TWO_LAYERS} caption="cap" filename="f" />);

    expect(screen.getByRole("columnheader", { name: "Capa" })).toBeInTheDocument();
    expect(screen.getAllByText("Cobertura antirrábica").length).toBeGreaterThan(0);
    expect(screen.getByText("Mordeduras")).toBeInTheDocument();
  });

  it("CSV export keeps the Capa column regardless of on-screen visibility", () => {
    const csv = buildMapTableCsv(ONE_LAYER);
    expect(csv.split("\r\n")[0]).toBe("Capa,Unidad,Valor,Brecha vs meta");
    expect(csv).toContain("Cobertura antirrábica,Salta,");
  });
});

describe("MapDataTable — Valor column names the metric (cowork QA ronda 3 §3)", () => {
  it("names the Valor column '(conteo)' for a single locality-rate metric", () => {
    render(
      <MapDataTable
        rows={ONE_LAYER}
        caption="cap"
        filename="f"
        metrics={[{ label: "Cobertura antirrábica", dataType: "rate", level: "locality" }]}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Cobertura antirrábica (conteo)" }),
    ).toBeInTheDocument();
    // The bare, mislabeled "Valor" header is gone.
    expect(screen.queryByRole("columnheader", { name: "Valor" })).not.toBeInTheDocument();
  });

  it("keeps a generic 'Valor' header when metrics are not provided", () => {
    render(<MapDataTable rows={ONE_LAYER} caption="cap" filename="f" />);
    expect(screen.getByRole("columnheader", { name: "Valor" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// UX audit 2026-07-26 (finding 2) — the zero-row state told ONE story for
// several opposite causes.
//
// Live repro (CABA · vista Bienestar): the CABA inset drill lands the camera at
// z=11, which flips denuncias into the near-zoom POINTS band. Points are
// individual records, not per-unit cells, so this table gets zero rows and
// printed "Sin datos por unidad para las capas activas en este alcance." —
// while the KPI read 39 denuncias, the map painted ~20 bubbles and the
// Estadísticas ranking said "20 comunas SÍ reportaron". Zooming out one step
// (z=9) restored 21 rows from the SAME scope and period.
//
// "Sin datos" is a claim about the WORLD; this was a fact about the ZOOM. Same
// class of defect as the ranking's suppression-vs-no-signal collapse.
// ---------------------------------------------------------------------------

describe("MapDataTable — the empty state names WHY it is empty (UX audit 2026-07-26)", () => {
  it("says the layers are drawing individual records at this zoom, not that there is no data", () => {
    render(
      <MapDataTable
        rows={[]}
        caption="cap"
        filename="f"
        pointModeLayers={["Denuncias de bienestar"]}
      />,
    );

    expect(screen.getByText(/registros individuales/i)).toBeInTheDocument();
    expect(screen.getByText(/Denuncias de bienestar/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin datos por unidad/i)).not.toBeInTheDocument();
  });

  it("names k-anonymity when every in-scope unit reported but was withheld", () => {
    render(<MapDataTable rows={[]} caption="cap" filename="f" suppressedUnits={20} />);

    expect(screen.getByText(/20 unidades/)).toBeInTheDocument();
    expect(screen.getByText(/identificaría casos/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sin datos por unidad/i)).not.toBeInTheDocument();
  });

  it("keeps the plain no-signal copy when nothing reported and no view mode explains it", () => {
    render(<MapDataTable rows={[]} caption="cap" filename="f" />);

    expect(screen.getByText(/Sin datos por unidad/i)).toBeInTheDocument();
  });
});
