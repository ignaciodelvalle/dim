// @vitest-environment jsdom
//
// PanoramaReading (panorama-redesign Fase 1) — the one-line auto-reading above
// the map. Thin presentational wrapper over buildPanoramaReading:
//   - renders a polite live region with the derived sentence,
//   - renders NOTHING while the KPIs are stale (the kpisStale warning already
//     covers that state — a reading over stale numbers would mislead),
//   - shows the fixed fallback when no delta qualifies.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanoramaReading } from "@/components/panorama/PanoramaReading";

afterEach(cleanup);

const KPIS_WITH_DELTAS = [
  { id: "cobertura", delta: { pct: 5, direction: "up" as const } },
  { id: "mordeduras", delta: { pct: 12, direction: "up" as const } },
  { id: "zoonosis", delta: { pct: -3, direction: "down" as const } },
];

describe("PanoramaReading", () => {
  it("renders the derived sentence from the KPI deltas", () => {
    render(<PanoramaReading kpis={KPIS_WITH_DELTAS} stale={false} />);
    expect(
      screen.getByText("Mordeduras empeora 12% vs período anterior; 2 de 3 indicadores mejoran."),
    ).toBeInTheDocument();
  });

  it("announces updates politely (aria-live)", () => {
    render(<PanoramaReading kpis={KPIS_WITH_DELTAS} stale={false} />);
    const sentence = screen.getByText(/Mordeduras empeora 12%/);
    expect(sentence).toHaveAttribute("aria-live", "polite");
  });

  it("renders nothing when the KPIs are stale", () => {
    const { container } = render(<PanoramaReading kpis={KPIS_WITH_DELTAS} stale={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the fixed fallback when no KPI carries a delta", () => {
    render(<PanoramaReading kpis={[{ id: "mascotas" }, { id: "perdidas" }]} stale={false} />);
    expect(
      screen.getByText("Sin variación destacable frente al período anterior."),
    ).toBeInTheDocument();
  });

  it("appends the absolute anchor when a compliance KPI headlines with its strip % value", () => {
    // design-QA 2026-07-04 nit 3: PanoramaKpi.value ("42%") flows structurally
    // into ReadingKpi.value — the sentence gains one actionable absolute.
    render(
      <PanoramaReading
        kpis={[{ id: "cobertura", delta: { pct: -20, direction: "down" }, value: "42%" }]}
        stale={false}
      />,
    );
    expect(
      screen.getByText(
        "Cobertura antirrábica empeora 20% vs período anterior; 0 de 1 indicadores mejoran; cobertura actual 42%.",
      ),
    ).toBeInTheDocument();
  });
});
