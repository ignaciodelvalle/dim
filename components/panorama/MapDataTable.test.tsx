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
    expect(csv.split("\r\n")[0]).toBe("Capa,Unidad,Valor");
    expect(csv).toContain("Cobertura antirrábica,Salta,");
  });
});
