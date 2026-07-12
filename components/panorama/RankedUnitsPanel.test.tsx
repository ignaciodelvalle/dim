// @vitest-environment jsdom
//
// RankedUnitsPanel — Round-2 review #2: the coverage % and the gap (target −
// value) used to render as bare numbers; the gap carried only an aria-label,
// invisible to sighted users. Pins the visible caption fix (reflecting the
// ACTIVE layer's measure, not a hardcoded word) and the hardened aria-label
// that now includes the actual figure.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RankedUnit } from "@/src/modules/panorama/domain/ranking";
import { RankedUnitsPanel } from "./RankedUnitsPanel";

const RATE_ROWS: RankedUnit[] = [
  { key: "salta", label: "Salta", value: 21, gap: 49 },
  { key: "jujuy", label: "Jujuy", value: 30, gap: 40 },
];

afterEach(cleanup);

describe("RankedUnitsPanel — visible column labels (Round-2 review #2)", () => {
  it("shows a visible caption naming the active layer's measure and the gap column", () => {
    render(<RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="cobertura antirrábica" />);

    // The measure label reflects the ACTIVE layer, not a hardcoded word. It now
    // appears BOTH in the header ("Peores N · {métrica}", P2.5) and the column
    // caption, so assert at least one visible occurrence.
    expect(screen.getAllByText(/cobertura antirrábica/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/pts vs objetivo/i)).toBeInTheDocument();
  });

  it("names the ranking metric in the header so 'peores en qué' is answerable (P2.5)", () => {
    render(<RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="señales de zoonosis" />);

    // Header reads "Peores N · {métrica}", not a bare "Peores N jurisdicciones".
    expect(
      screen.getByRole("heading", { name: /peores 2 · señales de zoonosis/i }),
    ).toBeInTheDocument();
  });

  it("reframes the header for a small scope ('Tus N …') instead of 'Peores' (P2.5)", () => {
    render(
      <RankedUnitsPanel
        rows={RATE_ROWS}
        kind="rate"
        measureLabel="cobertura antirrábica"
        scopeFallback
        unitNoun="comunas"
      />,
    );

    expect(
      screen.getByRole("heading", { name: /tus 2 comunas · cobertura antirrábica/i }),
    ).toBeInTheDocument();
  });

  it("reflects a DIFFERENT active layer's measure instead of a hardcoded word", () => {
    render(
      <RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="cobertura de esterilización" />,
    );

    expect(screen.getAllByText(/cobertura de esterilización/i).length).toBeGreaterThan(0);
  });

  it("the gap's aria-label carries the actual figure, not just the relationship name", () => {
    render(<RankedUnitsPanel rows={RATE_ROWS} kind="rate" measureLabel="cobertura antirrábica" />);

    // Salta: gap 49 → aria-label must include "49", not just "brecha"/"objetivo"
    // with no number (the previous aria-label replaced the accessible name
    // with text that never announced the figure to screen readers).
    expect(screen.getByLabelText(/pts vs objetivo.*49/i)).toBeInTheDocument();
  });

  it("density kind shows the measure caption but no gap caption (no target concept)", () => {
    const densityRows: RankedUnit[] = [{ key: "salta", label: "Salta", value: 12, gap: null }];
    render(<RankedUnitsPanel rows={densityRows} kind="density" measureLabel="mordeduras" />);

    expect(screen.getByText(/^mordeduras$/i)).toBeInTheDocument();
    expect(screen.queryByText(/pts vs objetivo/i)).not.toBeInTheDocument();
  });

  it("renders no caption when there are no rows", () => {
    render(<RankedUnitsPanel rows={[]} kind="rate" measureLabel="cobertura antirrábica" />);
    expect(screen.queryByText(/pts vs objetivo/i)).not.toBeInTheDocument();
  });
});
