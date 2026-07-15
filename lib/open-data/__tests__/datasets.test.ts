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
const { fetchSterilizationCoverage } = vi.hoisted(() => ({
  fetchSterilizationCoverage: vi.fn(),
}));
const { fetchMicrochipPenetrationByProvince } = vi.hoisted(() => ({
  fetchMicrochipPenetrationByProvince: vi.fn(),
}));

vi.mock("@/lib/analytics/govt-home-kpis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/govt-home-kpis")>();
  return { ...actual, fetchRabiesCoverageByProvince };
});
vi.mock("@/lib/metrics/population-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metrics/population-control")>();
  return { ...actual, fetchSterilizationCoverage };
});
vi.mock("@/lib/analytics/compliance-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/compliance-metrics")>();
  return { ...actual, fetchMicrochipPenetrationByProvince };
});

import { SUPPRESSED_MARKER } from "@/lib/open-data/province-suppression";
import { datasetToCsv, datasetToJson } from "@/lib/open-data/serialize";
import { buildDataset } from "../datasets";

beforeEach(() => {
  fetchRabiesCoverageByProvince.mockReset();
  fetchSterilizationCoverage.mockReset();
  fetchMicrochipPenetrationByProvince.mockReset();
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

describe("buildDataset — joint suppression of the shared mascotas_activas base", () => {
  // The attack the adversarial review confirmed: cobertura-esterilizacion and
  // cobertura-microchip publish the SAME base column (mascotas_activas) from the
  // same denominator. If a province is suppressed in microchip but CLEAR in
  // esterilizacion, per-dataset suppression would still publish the base in
  // esterilizacion — an attacker joins the two files on codigo_iso and recovers
  // exactly the base microchip withheld. The JOINT rule closes this: a province
  // suppressed in EITHER file has its base marked in BOTH.
  //
  // Scenario: CABA (and Tierra del Fuego, a second suppression so complementary
  // suppression stays inert) are suppressed in microchip via a protected small
  // numerator; all provinces clear their own guards in esterilizacion.
  function mockUnderlyingCounts() {
    // esterilizacion: every province clears k on its own → visible per-dataset.
    fetchSterilizationCoverage.mockResolvedValue({
      rate: 0,
      sterilized: 0,
      total: 0,
      byProvince: [
        { province: "CABA", sterilized: 4500, total: 9000, ratePct: 50 },
        { province: "Tierra del Fuego", sterilized: 4000, total: 8000, ratePct: 50 },
        { province: "Buenos Aires", sterilized: 4000, total: 9000, ratePct: 44.4 },
        { province: "Córdoba", sterilized: 4500, total: 9000, ratePct: 50 },
      ],
    });
    // microchip: CABA + Tierra del Fuego suppressed (numerator 1-4 is protected).
    fetchMicrochipPenetrationByProvince.mockResolvedValue([
      { province: "CABA", chipped: 2, active: 9000, ratePct: 0 },
      { province: "Tierra del Fuego", chipped: 1, active: 8000, ratePct: 0 },
      { province: "Buenos Aires", chipped: 4000, active: 9000, ratePct: 44.4 },
      { province: "Córdoba", chipped: 4500, active: 9000, ratePct: 50 },
    ]);
  }

  it("marks esterilizacion's base for a province suppressed only in microchip, while keeping its own pct visible", async () => {
    mockUnderlyingCounts();

    const est = await buildDataset(
      "cobertura-esterilizacion",
      new Date("2026-07-15T00:00:00.000Z"),
    );

    const caba = est.rows.find((r) => r.provincia === "CABA");
    expect(caba).toBeDefined();
    // THE FIX: the shared base is withheld even though esterilizacion cleared k
    // on its own — because microchip suppressed CABA.
    expect(caba?.mascotas_activas).toBe(SUPPRESSED_MARKER);
    // The dataset-specific pct keeps its own (clear) per-dataset suppression: it
    // is safe to publish (numerator, base and complement are all ≥ k here) and
    // a bare percentage without its base recovers no count.
    expect(caba?.cobertura_esterilizacion_pct).toBe(50);

    // Second joint-suppressed province behaves identically.
    const tdf = est.rows.find((r) => r.provincia === "Tierra del Fuego");
    expect(tdf?.mascotas_activas).toBe(SUPPRESSED_MARKER);
    expect(tdf?.cobertura_esterilizacion_pct).toBe(50);

    // Provinces visible in BOTH files keep their real base.
    const cordoba = est.rows.find((r) => r.provincia === "Córdoba");
    expect(cordoba?.mascotas_activas).toBe(9000);
    expect(cordoba?.cobertura_esterilizacion_pct).toBe(50);
  });

  it("keeps the base joint-suppressed symmetrically in microchip too", async () => {
    mockUnderlyingCounts();

    const chip = await buildDataset("cobertura-microchip", new Date("2026-07-15T00:00:00.000Z"));

    // CABA is suppressed in microchip on its own → base + pct both marked.
    const caba = chip.rows.find((r) => r.provincia === "CABA");
    expect(caba?.mascotas_activas).toBe(SUPPRESSED_MARKER);
    expect(caba?.cobertura_microchip_pct).toBe(SUPPRESSED_MARKER);
  });

  it("preserves the joint-suppressed base across CSV/JSON serialization (parity)", async () => {
    mockUnderlyingCounts();

    const est = await buildDataset(
      "cobertura-esterilizacion",
      new Date("2026-07-15T00:00:00.000Z"),
    );

    // JSON: the CABA base is the marker string, the pct is the real number.
    const json = JSON.parse(datasetToJson(est)) as {
      data: {
        provincia: string;
        mascotas_activas: unknown;
        cobertura_esterilizacion_pct: unknown;
      }[];
    };
    const cabaJson = json.data.find((r) => r.provincia === "CABA");
    expect(cabaJson?.mascotas_activas).toBe(SUPPRESSED_MARKER);
    expect(cabaJson?.cobertura_esterilizacion_pct).toBe(50);

    // CSV: the marker is present and quoted for CABA; the visible pct is not the
    // marker. The row order is province-sorted, so match the CABA data line.
    const csv = datasetToCsv(est);
    const cabaLine = csv.split("\r\n").find((l) => l.startsWith("CABA,"));
    expect(cabaLine).toBeDefined();
    expect(cabaLine).toContain(`"${SUPPRESSED_MARKER}"`);
    // The pct cell (50) survives as a real value alongside the suppressed base.
    expect(cabaLine).toMatch(/,50$/);
  });
});
