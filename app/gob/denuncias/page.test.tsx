// @vitest-environment jsdom
//
// /gob/denuncias — the Denuncias hub (C6a). Render smoke test: the hub must
// show all three pipeline stages (Moderación → Triage → Caso), each with its
// live count and a CTA into the existing screen. Mirrors the /gob/cola
// render-test pattern (mock auth-guards + @/db, render via renderToStaticMarkup,
// assert on the resulting HTML).
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(async () => ({
    user: { id: "govt-1", email: "govt@dim.test" },
    profile: { id: "govt-1", role: "govt" },
    jurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
  })),
}));

vi.mock("@/lib/infra/case-queries", () => ({
  countCasesForAdmin: vi.fn(async () => 7),
  countCasesForGovt: vi.fn(async () => 7),
}));

vi.mock("@/db", async () => {
  const actual = await vi.importActual<typeof import("@/db")>("@/db");
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async () => [{ n: 3 }],
        }),
      }),
    },
  };
});

import GobDenunciasPage from "./page";

describe("/gob/denuncias — the hub", () => {
  it("renders the pipeline explainer and all 3 stage panels with counts + CTAs", async () => {
    const node = await GobDenunciasPage();
    const html = renderToStaticMarkup(node);

    // Header explains the pipeline in one line.
    expect(html).toContain("El recorrido de una denuncia");
    expect(html).toContain("moderación");
    expect(html).toContain("Ley 14.346");

    // Stage 1 — Moderación.
    expect(html).toContain("Moderación");
    expect(html).toContain("/gob/moderacion");
    expect(html).toContain("Ir a moderación");

    // Stage 2 — Triage (Maltrato).
    expect(html).toContain("Triage (Maltrato)");
    expect(html).toContain("/gob/maltrato");
    expect(html).toContain("Ir al triage");

    // Stage 3 — Caso.
    expect(html).toContain("Caso");
    expect(html).toContain("/gob/casos");
    expect(html).toContain("Ver casos");

    // Counts (mocked to 3 for moderación/triage, 7 for casos) are present.
    expect(html).toContain("7");
  });

  it("shows the no-scope warning for a govt viewer with no jurisdiction assignments", async () => {
    const { requireAdminOrGovtOrRedirect } = await import("@/lib/infra/auth-guards");
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValueOnce({
      user: { id: "govt-2", email: "govt2@dim.test" },
      profile: { id: "govt-2", role: "govt" },
      jurisdictions: [],
    } as never);

    const node = await GobDenunciasPage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("no tiene localidades asignadas");
  });

  it("does not show the no-scope warning for an admin viewer (universal scope)", async () => {
    const { requireAdminOrGovtOrRedirect } = await import("@/lib/infra/auth-guards");
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValueOnce({
      user: { id: "admin-1", email: "admin@dim.test" },
      profile: { id: "admin-1", role: "admin" },
      jurisdictions: [],
    } as never);

    const node = await GobDenunciasPage();
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("no tiene localidades asignadas");
  });
});
