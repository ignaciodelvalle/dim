// @vitest-environment jsdom
//
// AdminReglasLens — search filter test (opfilterbar-sweep2-2026-07-21, item 3).
//
// This screen (the /admin+/gob "reglas" console index) had NO filter at all —
// a scroll-and-scan-only list of the 24 AR provincias. This test pins that the
// new `query` prop genuinely NARROWS the rendered provincia list (accent/case
// -insensitive, matches on province name OR a locality-with-a-rule under it),
// not just that the search input renders.
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable @/db mock — both queries AdminReglasLens issues
// (province-wide rows, locality-level rows) terminate on .groupBy(), FIFO.
const { chain, dbState } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[][] };
  const terminal = () => Promise.resolve(dbState.results.shift() ?? []);
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    groupBy: () => terminal(),
  };
  return { chain, dbState };
});

vi.mock("@/db", () => ({
  db: chain,
  govtBusinessRules: {
    jurisdictionCountry: "jurisdiction_country",
    jurisdictionProvince: "jurisdiction_province",
    jurisdictionLocality: "jurisdiction_locality",
  },
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrRedirect: vi.fn(async () => ({
    user: { id: "admin-1", email: "admin@dim.test" },
    profile: { id: "admin-1", role: "admin" },
  })),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { AdminReglasLens } from "./AdminReglasLens";

function queue(...rows: unknown[][]) {
  dbState.results = rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.results = [];
});

describe("AdminReglasLens — search", () => {
  it("with no query, renders every provincia (unfiltered)", async () => {
    queue([], []); // no province-wide rows, no locality rows
    const node = await AdminReglasLens({ base: "/admin" });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Córdoba");
    expect(html).toContain("Buenos Aires");
    expect(html).toContain("Chubut");
  });

  it("filters OUT non-matching provincias when a query matches a province name", async () => {
    queue([], []);
    const node = await AdminReglasLens({ base: "/admin", query: "cordoba" });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Córdoba");
    // Buenos Aires and Chubut do not match "cordoba" and no locality under
    // them matches either — they must be filtered OUT, not just present
    // alongside Córdoba.
    expect(html).not.toContain("Buenos Aires");
    expect(html).not.toContain("Chubut");
  });

  it("is accent/case-insensitive (normalizeText)", async () => {
    queue([], []);
    const node = await AdminReglasLens({ base: "/admin", query: "CÓRDOBA" });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Córdoba");
    expect(html).not.toContain("Buenos Aires");
  });

  it("surfaces a province via a MATCHING LOCALITY name, not just the province name", async () => {
    // Locality-level row: San Isidro, under Buenos Aires, has 1 rule override.
    queue(
      [], // province-wide rows
      [
        {
          country: "AR",
          province: "Buenos Aires",
          locality: "San Isidro",
          count: 1,
        },
      ],
    );
    const node = await AdminReglasLens({ base: "/admin", query: "san isidro" });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Buenos Aires");
    expect(html).toContain("San Isidro");
    expect(html).not.toContain("Córdoba");
    expect(html).not.toContain("Chubut");
  });

  it("renders 'Sin resultados.' when nothing matches", async () => {
    queue([], []);
    const node = await AdminReglasLens({ base: "/admin", query: "not-a-real-place-xyz" });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Sin resultados.");
    expect(html).not.toContain("Córdoba");
  });
});
