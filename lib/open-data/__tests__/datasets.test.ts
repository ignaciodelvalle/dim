// Datasets-level test for buildDataset (Epic B, item 2) — audit fix.
//
// The other open-data tests either exercise province-suppression.ts directly
// (pure, no DB) or mock buildDataset itself at the route boundary. Neither
// proves that a suppressed row, once it flows through the REAL buildDataset
// pipeline, actually emits the marker on every numeric column it publishes —
// a regression there (e.g. only tagging one of the two rate columns) would
// leak a raw value while still "passing" every other suite.
//
// Here only the DB-backed fetcher is mocked; buildDataset, suppressRateProvinces
// and the row-shaping logic all run for real.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRabiesCoverageByProvince } = vi.hoisted(() => ({
  fetchRabiesCoverageByProvince: vi.fn(),
}));

vi.mock("@/lib/analytics/govt-home-kpis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/govt-home-kpis")>();
  return { ...actual, fetchRabiesCoverageByProvince };
});

import { SUPPRESSED_MARKER } from "@/lib/open-data/province-suppression";
import { buildDataset } from "../datasets";

beforeEach(() => {
  fetchRabiesCoverageByProvince.mockReset();
});

describe("buildDataset — suppression end-to-end (real buildDataset, fetcher mocked)", () => {
  it("emits the marker on BOTH numeric columns of a suppressed row", async () => {
    // CABA: numerator (vaccinated) = 2 — a protected small positive — triggers
    // primary suppression via isRateCellProtected even though the population
    // base clears k. Buenos Aires / Córdoba clear every guard and stay visible.
    fetchRabiesCoverageByProvince.mockResolvedValue([
      { province: "CABA", vaccinated: 2, total: 9000, ratePct: 0 },
      { province: "Buenos Aires", vaccinated: 4000, total: 9000, ratePct: 44.4 },
      { province: "Córdoba", vaccinated: 4500, total: 9000, ratePct: 50 },
    ]);

    const built = await buildDataset("cobertura-antirrabica", new Date("2026-07-15T00:00:00.000Z"));

    const caba = built.rows.find((r) => r.provincia === "CABA");
    expect(caba).toBeDefined();
    // Both published numeric columns — the base AND the percentage — must
    // carry the marker. Tagging only one would silently leak the other.
    expect(caba?.perros_registrados).toBe(SUPPRESSED_MARKER);
    expect(caba?.cobertura_antirrabica_pct).toBe(SUPPRESSED_MARKER);

    // The visible rows are untouched.
    const cordoba = built.rows.find((r) => r.provincia === "Córdoba");
    expect(cordoba?.perros_registrados).toBe(9000);
    expect(cordoba?.cobertura_antirrabica_pct).toBe(50);

    expect(built.meta.suppressedCount).toBeGreaterThanOrEqual(1);
  });
});
