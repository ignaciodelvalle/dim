// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RankedUnit } from "@/src/modules/panorama/domain/ranking";
import { PanoramaDataTable } from "../PanoramaDataTable";

afterEach(cleanup);

const RATE_ROWS: RankedUnit[] = [
  { key: "AR-F", label: "Formosa", value: 31, gap: 49 },
  { key: "AR-H", label: "Chaco", value: 38, gap: 42 },
  { key: "AR-Y", label: "Santiago", value: 40, gap: 40 },
];

describe("PanoramaDataTable — accessible view (Ley 26.653)", () => {
  it("renders a real table with role=table and column headers", () => {
    render(<PanoramaDataTable rows={RATE_ROWS} kind="rate" measureLabel="cobertura" />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Jurisdicción/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Brecha vs meta/ })).toBeInTheDocument();
  });

  it("defaults to worst-first (gap descending) and exposes aria-sort", () => {
    render(<PanoramaDataTable rows={RATE_ROWS} kind="rate" measureLabel="cobertura" />);
    const gapHeader = screen.getByRole("columnheader", { name: /Brecha vs meta/ });
    expect(gapHeader).toHaveAttribute("aria-sort", "descending");
    // First data row is the worst gap (Formosa, gap 49).
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders[0]).toHaveTextContent("Formosa");
  });

  it("toggles the sort direction when a header is clicked", () => {
    render(<PanoramaDataTable rows={RATE_ROWS} kind="rate" measureLabel="cobertura" />);
    fireEvent.click(screen.getByRole("button", { name: /Brecha vs meta/ }));
    const gapHeader = screen.getByRole("columnheader", { name: /Brecha vs meta/ });
    expect(gapHeader).toHaveAttribute("aria-sort", "ascending");
    // Ascending gap → smallest gap first (Santiago, gap 40).
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders[0]).toHaveTextContent("Santiago");
  });

  it("fires onSelect from a jurisdiction cell", () => {
    const onSelect = vi.fn();
    render(
      <PanoramaDataTable
        rows={RATE_ROWS}
        kind="rate"
        measureLabel="cobertura"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chaco" }));
    expect(onSelect).toHaveBeenCalledWith("AR-H");
  });

  it("shows the empty state when there are no rows", () => {
    render(<PanoramaDataTable rows={[]} kind="rate" measureLabel="cobertura" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Sin jurisdicciones bajo meta en este alcance.")).toBeInTheDocument();
  });

  it("dataUnavailable: no rows + no data shows an explicit failure state, not the all-clear (trust/safety)", () => {
    render(<PanoramaDataTable rows={[]} kind="rate" measureLabel="cobertura" dataUnavailable />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No pudimos calcular el ranking en este momento.")).toBeInTheDocument();
    expect(
      screen.queryByText("Sin jurisdicciones bajo meta en este alcance."),
    ).not.toBeInTheDocument();
  });
});
