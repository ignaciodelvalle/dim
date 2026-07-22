// @vitest-environment jsdom
//
// /admin/poblacion — species axis wiring smoke test (Fase B "regalos
// olvidados" twin port, 2026-07-22). /gob/poblacion already exposes an
// Especie axis whose value narrows fetchSterilizationCoverage/
// fetchActivePregnancies/fetchReproductiveOutcomes/fetchNetGrowth/
// fetchSterilizationNatalidadRatio/fetchSterilizationTrend/
// fetchPrevRegisteredBirths via opts.species (all seven fetchers already
// accepted the param). This test proves the ADMIN twin wires the SAME
// searchParam to the SAME seven fetchers — the fetcher-level narrowing
// itself is byte-identical code already exercised in production by
// /gob/poblacion.
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrRedirect: vi.fn(async () => ({
    profile: { id: "admin-1", role: "admin" },
  })),
}));

// DashboardFreshnessFooter is an async Server Component (fetches its own
// freshness timestamp) — renderToStaticMarkup can't resolve an async
// component synchronously ("component suspended while responding to
// synchronous input"). Same stub used by app/gob/usuarios/page.test.tsx.
vi.mock("@/components/ui/dashboard/DashboardFreshnessFooter", () => ({
  DashboardFreshnessFooter: () => null,
}));

// vi.mock factories are hoisted above top-level const declarations — mocks
// referenced inside a factory must be created via vi.hoisted (plain
// top-level consts throw "Cannot access before initialization").
const mocks = vi.hoisted(() => ({
  fetchSterilizationCoverage: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    rate: 50,
    sterilized: 5,
    total: 10,
    byProvince: [],
  })),
  fetchActivePregnancies: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => 2),
  fetchReproductiveOutcomes: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    byClinicalOutcome: { live_birth: 1, stillbirth: 0, miscarriage: 0, unknown: 0 },
    registeredBirths: 1,
  })),
  fetchNetGrowth: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    altas: 3,
    registeredBirths: 1,
    deaths: 1,
    net: 3,
  })),
  fetchSterilizationNatalidadRatio: vi.fn(
    async (_ctx: unknown, _opts?: { species?: string }) => 1.5,
  ),
  fetchSterilizationTrend: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    granularity: "month" as const,
    points: [],
    suppressedCount: 0,
  })),
  fetchPrevRegisteredBirths: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => 0),
}));

vi.mock("@/lib/metrics/population-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metrics/population-control")>();
  return { ...actual, ...mocks };
});

import AdminPoblacionPage from "./page";

const {
  fetchSterilizationCoverage,
  fetchActivePregnancies,
  fetchReproductiveOutcomes,
  fetchNetGrowth,
  fetchSterilizationNatalidadRatio,
  fetchSterilizationTrend,
  fetchPrevRegisteredBirths,
} = mocks;

function clearAll() {
  for (const fn of [
    fetchSterilizationCoverage,
    fetchActivePregnancies,
    fetchReproductiveOutcomes,
    fetchNetGrowth,
    fetchSterilizationNatalidadRatio,
    fetchSterilizationTrend,
    fetchPrevRegisteredBirths,
  ]) {
    fn.mockClear();
  }
}

describe("/admin/poblacion — species axis wiring", () => {
  it("no ?species param → every fetcher receives species: undefined", async () => {
    clearAll();
    await AdminPoblacionPage({ searchParams: Promise.resolve({}) });

    expect(fetchSterilizationCoverage.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchActivePregnancies.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchReproductiveOutcomes.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchNetGrowth.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchSterilizationNatalidadRatio.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchSterilizationTrend.mock.calls[0]?.[1]).toEqual({ species: undefined });
    expect(fetchPrevRegisteredBirths.mock.calls[0]?.[1]).toEqual({ species: undefined });
  });

  it("?species=cat reaches ALL SEVEN fetchers identically — no dead filter", async () => {
    clearAll();
    const node = await AdminPoblacionPage({ searchParams: Promise.resolve({ species: "cat" }) });
    renderToStaticMarkup(node);

    expect(fetchSterilizationCoverage.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchActivePregnancies.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchReproductiveOutcomes.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchNetGrowth.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchSterilizationNatalidadRatio.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchSterilizationTrend.mock.calls[0]?.[1]).toEqual({ species: "cat" });
    expect(fetchPrevRegisteredBirths.mock.calls[0]?.[1]).toEqual({ species: "cat" });
  });

  it("renders the Especie axis control (twin of /gob/poblacion's rail)", async () => {
    const node = await AdminPoblacionPage({ searchParams: Promise.resolve({ species: "dog" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Especie");
  });
});
