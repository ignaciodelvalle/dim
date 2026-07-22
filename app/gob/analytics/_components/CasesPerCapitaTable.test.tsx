// @vitest-environment jsdom
//
// CasesPerCapitaTable — E1 (2026-07-21 facades harvest). fetchCasesPerCapita
// was fully built + unit-tested with zero callers before this pass; this pins
// that the /gob/analytics screen actually renders the metric once wired, and
// that the null-population fallback (no census row → raw count, never a
// silent drop) still shows up.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProvinceCasesPerCapita } from "@/lib/analytics/govt-dashboards";
import { CasesPerCapitaTable } from "./CasesPerCapitaTable";

afterEach(cleanup);

describe("CasesPerCapitaTable", () => {
  it("renders provinces ranked by cases per 10,000 inhabitants, highest first", () => {
    const rows: ProvinceCasesPerCapita[] = [
      { province: "CABA", code: "AR-C", count: 30, ratePer10k: 1.0 },
      { province: "Santa Cruz", code: "AR-Z", count: 5, ratePer10k: 1.5 },
      { province: "Buenos Aires", code: "AR-B", count: 100, ratePer10k: 0.1 },
    ];
    render(<CasesPerCapitaTable rows={rows} />);

    // Highest rate (Santa Cruz, 1.5) ranks #1, not the highest raw count
    // (Buenos Aires) — proves this is genuinely per-capita, not a raw-count
    // table wearing a per-capita label.
    const cells = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const santaCruzRowIndex = cells.findIndex((c) => c.includes("Santa Cruz"));
    const cabaRowIndex = cells.findIndex((c) => c.includes("CABA"));
    const buenosAiresRowIndex = cells.findIndex((c) => c.includes("Buenos Aires"));
    expect(santaCruzRowIndex).toBeGreaterThan(0);
    expect(santaCruzRowIndex).toBeLessThan(cabaRowIndex);
    expect(cabaRowIndex).toBeLessThan(buenosAiresRowIndex);
  });

  it("falls back to the raw count, in a footnote, for provinces with no census row", () => {
    const rows: ProvinceCasesPerCapita[] = [
      { province: "Tierra del Fuego", code: "AR-V", count: 4, ratePer10k: null },
    ];
    render(<CasesPerCapitaTable rows={rows} />);

    expect(screen.getByText(/Sin dato de población censal/)).toBeInTheDocument();
    expect(screen.getByText(/Tierra del Fuego \(4\)/)).toBeInTheDocument();
  });

  it("shows an honest empty state when there are no open cases in scope", () => {
    render(<CasesPerCapitaTable rows={[]} />);
    expect(screen.getByText(/Sin casos abiertos/)).toBeInTheDocument();
  });
});
