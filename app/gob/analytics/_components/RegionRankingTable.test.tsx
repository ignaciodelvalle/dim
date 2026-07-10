// @vitest-environment jsdom
//
// RegionRankingTable — metric-disambiguation guard (2026-07-10).
//
// The /gob/analytics ranking measures the ALL-SPECIES, no-window rabies
// coverage ("todas las mascotas, histórico"), a DIFFERENT metric from the
// Panorama compliance figure ("perros, últimos 12 meses"). They used to share
// the bare name "Cobertura antirrábica" and could never be reconciled. Pin that
// every label here carries the species + window, and that the surface states
// how it differs from the compliance metric.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RegionRankingRow } from "@/lib/analytics/analytics-ranking";
import { RegionRankingTable } from "./RegionRankingTable";

afterEach(cleanup);

// The exact es-AR label the page threads (RABIES_VACCINATION_RATE_LABEL_ES).
const LABEL = "Cobertura antirrábica — todas las mascotas (histórico)";

const rows: RegionRankingRow[] = [
  { rank: 1, province: "Córdoba", code: "AR-X", value: 65, count: 100, coveragePct: 65 },
  { rank: 2, province: "Salta", code: "AR-A", value: 34, count: 100, coveragePct: 34 },
];

describe("RegionRankingTable — metric disambiguation", () => {
  it("labels every heading/column with the species + window (never the bare name)", () => {
    render(<RegionRankingTable top={rows} bottom={rows} coverageLabel={LABEL} />);

    // Headings + column header carry the disambiguated label…
    expect(screen.getByText(`Mayor ${LABEL}`)).toBeInTheDocument();
    expect(screen.getByText(`Menor ${LABEL}`)).toBeInTheDocument();
    expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0);
    // …and the bare, ambiguous name is gone.
    expect(screen.queryByText("Cobertura antirrábica (mascotas)")).not.toBeInTheDocument();
  });

  it("states how it differs from the Panorama compliance metric (perros, 12 meses)", () => {
    render(<RegionRankingTable top={rows} bottom={rows} coverageLabel={LABEL} />);
    expect(screen.getByText(/perros con dosis en los últimos 12 meses/)).toBeInTheDocument();
  });
});
