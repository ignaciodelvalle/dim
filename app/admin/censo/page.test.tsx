// @vitest-environment jsdom
//
// /admin/censo — species axis wiring smoke test (Fase B "regalos olvidados"
// twin port, 2026-07-22). /gob/censo already exposes an Especie axis whose
// value narrows registryCounts/registrationTrend/identificationFunnel/
// registryByProvince via opts.species (all four fetchers already accepted
// the param — the domain-axes work only added the control). This test
// proves the ADMIN twin wires the SAME searchParam to the SAME four
// fetchers — the fetcher-level narrowing itself is covered by
// __tests__/census-registry-counts.test.ts (integration) and the species
// predicate is byte-identical code already exercised in production by
// /gob/censo.
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

type SpeciesOpts = { species?: string } | undefined;

// vi.mock factories are hoisted above top-level const declarations — mocks
// referenced inside a factory must be created via vi.hoisted (plain
// top-level consts throw "Cannot access before initialization").
const mocks = vi.hoisted(() => ({
  registryCounts: vi.fn(
    async (_ctx: unknown, _dormantMonths?: number, _opts?: { species?: string }) => ({
      total: 10,
      active: 8,
      dormant: 1,
      incomplete: 1,
      byLocality: { value: [], suppressedCount: 0 },
    }),
  ),
  registrationTrend: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    granularity: "month" as const,
    points: [],
    suppressedCount: 0,
  })),
  identificationFunnel: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => ({
    total: 10,
    chipped: 8,
    isoValid: 6,
    scanned: 4,
  })),
  registryByProvince: vi.fn(async (_ctx: unknown, _opts?: { species?: string }) => []),
}));

vi.mock("@/lib/metrics/census", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metrics/census")>();
  return { ...actual, ...mocks };
});

import AdminCensoPage from "./page";

const { registryCounts, registrationTrend, identificationFunnel, registryByProvince } = mocks;

describe("/admin/censo — species axis wiring", () => {
  it("no ?species param → every fetcher receives species: undefined (no dead default)", async () => {
    registryCounts.mockClear();
    registrationTrend.mockClear();
    identificationFunnel.mockClear();
    registryByProvince.mockClear();

    await AdminCensoPage({ searchParams: Promise.resolve({}) });

    expect(registryCounts.mock.calls[0]?.[2]).toEqual({ species: undefined } as SpeciesOpts);
    expect(registrationTrend.mock.calls[0]?.[1]).toEqual({ species: undefined } as SpeciesOpts);
    expect(identificationFunnel.mock.calls[0]?.[1]).toEqual({ species: undefined } as SpeciesOpts);
    expect(registryByProvince.mock.calls[0]?.[1]).toEqual({ species: undefined } as SpeciesOpts);
  });

  it("?species=dog reaches ALL FOUR fetchers identically — no dead filter", async () => {
    registryCounts.mockClear();
    registrationTrend.mockClear();
    identificationFunnel.mockClear();
    registryByProvince.mockClear();

    const node = await AdminCensoPage({ searchParams: Promise.resolve({ species: "dog" }) });
    renderToStaticMarkup(node);

    expect(registryCounts.mock.calls[0]?.[2]).toEqual({ species: "dog" });
    expect(registrationTrend.mock.calls[0]?.[1]).toEqual({ species: "dog" });
    expect(identificationFunnel.mock.calls[0]?.[1]).toEqual({ species: "dog" });
    expect(registryByProvince.mock.calls[0]?.[1]).toEqual({ species: "dog" });
  });

  it("renders the Especie axis control (twin of /gob/censo's rail)", async () => {
    const node = await AdminCensoPage({ searchParams: Promise.resolve({ species: "cat" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Especie");
  });
});
