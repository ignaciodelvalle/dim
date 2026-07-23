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
    render(
      <RegionRankingTable top={rows} bottom={rows} coverageLabel={LABEL} totalProvinces={5} />,
    );

    // Headings + column header carry the disambiguated label…
    expect(screen.getByText(`Mayor ${LABEL}`)).toBeInTheDocument();
    expect(screen.getByText(`Menor ${LABEL}`)).toBeInTheDocument();
    expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0);
    // …and the bare, ambiguous name is gone.
    expect(screen.queryByText("Cobertura antirrábica (mascotas)")).not.toBeInTheDocument();
  });

  it("states how it differs from the Panorama compliance metric (perros, 12 meses)", () => {
    render(
      <RegionRankingTable top={rows} bottom={rows} coverageLabel={LABEL} totalProvinces={5} />,
    );
    expect(screen.getByText(/perros con dosis en los últimos 12 meses/)).toBeInTheDocument();
  });
});

describe("RegionRankingTable — claim #2 (cursor red-team 2026-07-23): <3 provinces is not a ranking", () => {
  const oneRow: RegionRankingRow[] = [
    { rank: 1, province: "CABA", code: "AR-C", value: 65, count: 100, coveragePct: 65 },
  ];

  it("a 1-province scope (whole-CABA govt) never shows the SAME province as both best and worst", () => {
    render(
      <RegionRankingTable top={oneRow} bottom={oneRow} coverageLabel={LABEL} totalProvinces={1} />,
    );
    expect(screen.queryByText(`Mayor ${LABEL}`)).not.toBeInTheDocument();
    expect(screen.queryByText(`Menor ${LABEL}`)).not.toBeInTheDocument();
    expect(screen.getByText(/CABA/)).toBeInTheDocument();
    expect(screen.getByText(/alcance multi-provincia/)).toBeInTheDocument();
  });

  it("still renders best/worst framing once there are >= 3 provinces", () => {
    const threeRows: RegionRankingRow[] = [
      { rank: 1, province: "Córdoba", code: "AR-X", value: 65, count: 100, coveragePct: 65 },
      { rank: 2, province: "Salta", code: "AR-A", value: 50, count: 100, coveragePct: 50 },
      { rank: 3, province: "CABA", code: "AR-C", value: 34, count: 100, coveragePct: 34 },
    ];
    render(
      <RegionRankingTable
        top={threeRows}
        bottom={threeRows}
        coverageLabel={LABEL}
        totalProvinces={3}
      />,
    );
    expect(screen.getByText(`Mayor ${LABEL}`)).toBeInTheDocument();
    expect(screen.getByText(`Menor ${LABEL}`)).toBeInTheDocument();
  });
});
