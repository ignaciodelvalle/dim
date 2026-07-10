// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RankedUnit } from "@/src/modules/panorama/domain/ranking";
import { RankedUnitsPanel } from "../RankedUnitsPanel";

afterEach(cleanup);

const RATE_ROWS: RankedUnit[] = [
  { key: "AR-F", label: "Formosa", value: 31, gap: 49 },
  { key: "AR-H", label: "Chaco", value: 38, gap: 42 },
];

describe("RankedUnitsPanel", () => {
  it("renders the Worst-N rows with value and gap", () => {
    render(<RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="cobertura" />);
    expect(screen.getByText("Formosa")).toBeInTheDocument();
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.getByText("−49")).toBeInTheDocument();
  });

  it("shows the below-meta empty state for a rate layer with no rows", () => {
    render(<RankedUnitsPanel rows={[]} kind="rate" measureLabel="cobertura" />);
    expect(screen.getByText("Sin jurisdicciones bajo meta en este alcance.")).toBeInTheDocument();
  });

  it("dataUnavailable: replaces the below-meta all-clear with an explicit failure state (trust/safety)", () => {
    // No base-layer data loaded → an empty ranking must NOT read as "sin
    // jurisdicciones bajo meta" (a reassuring all-clear).
    render(<RankedUnitsPanel rows={[]} kind="rate" measureLabel="cobertura" dataUnavailable />);
    expect(screen.getByText("No pudimos calcular el ranking en este momento.")).toBeInTheDocument();
    expect(
      screen.queryByText("Sin jurisdicciones bajo meta en este alcance."),
    ).not.toBeInTheDocument();
  });

  it("bubbles the unit key on hover and clears it on leave (map sync)", () => {
    const onHover = vi.fn();
    render(
      <RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="cobertura" onHover={onHover} />,
    );
    const row = screen.getByRole("button", { name: /Formosa/ });
    fireEvent.mouseEnter(row);
    expect(onHover).toHaveBeenCalledWith("AR-F");
    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("fires onSelect with the unit key on click", () => {
    const onSelect = vi.fn();
    render(
      <RankedUnitsPanel
        rows={RATE_ROWS}
        kind="rate"
        measureLabel="cobertura"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Chaco/ }));
    expect(onSelect).toHaveBeenCalledWith("AR-H");
  });

  it("marks the highlighted row with aria-current (map→row sync)", () => {
    render(
      <RankedUnitsPanel
        rows={RATE_ROWS}
        kind="rate"
        measureLabel="cobertura"
        highlightedKey="AR-H"
      />,
    );
    expect(screen.getByRole("button", { name: /Chaco/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Formosa/ })).not.toHaveAttribute("aria-current");
  });
});
