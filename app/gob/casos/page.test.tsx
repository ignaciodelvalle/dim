// @vitest-environment jsdom
//
// /gob/casos — render smoke test (opfilterbar-sweep-2026-07-21, R1).
//
// THE BUG this was ADDED to catch: /gob/casos and /admin/casos crashed at
// runtime ("Algo salió mal", digest attached) even though `tsc --noEmit` was
// clean and every existing unit test passed. Root cause: `parseCasoEstado`
// was defined and exported from CasoEstadoFilter.tsx, a "use client" module.
// Next's RSC bundler treats EVERY export of a "use client" module as a
// client reference — including a plain, hook-free function — so calling it
// (not rendering it) from this Server Component's data-loading function threw:
// "Attempted to call parseCasoEstado() from the server but parseCasoEstado is
// on the client." That boundary is enforced by Next's actual webpack/turbopack
// build (react-server-dom-webpack), which this project's Vitest config does
// NOT replicate (see vitest.config.ts — plain @vitejs/plugin-react, no
// `react-server` condition) — so calling parseCasoEstado() here does NOT, by
// itself, reproduce the exact throw. This test instead pins the OTHER half
// of the contract: the page must actually render its real JSX tree (Estado
// control, KIND/Provincia axes, CaseQueue) end to end with realistic props,
// so any FUTURE break in that render path — a thrown exception, a bad prop,
// an undefined access — fails here instead of only on the running server.
// The module-boundary invariant itself (parseCasoEstado must NOT live in a
// "use client" file) is pinned separately in
// components/ui/dashboard/caso-estado.test.ts, and was verified against the
// real Next dev server (the only thing that actually enforces the RSC
// boundary) as part of the same fix.
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(async () => ({
    supabase: {},
    user: { id: "user-1", email: "govt@dim.test" },
    profile: { id: "user-1", role: "govt" },
    jurisdictions: [
      { province: "Buenos Aires", locality: "La Plata" },
      { province: "Buenos Aires", locality: "Quilmes" },
    ],
  })),
}));

vi.mock("@/lib/infra/case-queries", () => ({
  listCasesForGovt: vi.fn(async () => []),
  countCasesForGovt: vi.fn(async () => 0),
  listCasesForAdmin: vi.fn(async () => []),
  countCasesForAdmin: vi.fn(async () => 0),
}));

import GovtCasosPage from "./page";

describe("/gob/casos — render smoke test", () => {
  it("renders the govt viewer's Estado control + queue caption without throwing", async () => {
    const node = await GovtCasosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Casos");
    expect(html).toContain("Estado");
    expect(html).toContain("Abiertos");
    expect(html).toContain("No hay casos abiertos en tu jurisdicción.");
  });

  it("renders with an explicit status + kind + province query without throwing", async () => {
    const node = await GovtCasosPage({
      searchParams: Promise.resolve({ status: "all", kind: "maltrato", province: "Buenos Aires" }),
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Casos");
  });

  it("renders the admin-universal branch (role=admin viewing /gob/casos) without throwing", async () => {
    const { requireAdminOrGovtOrRedirect } = await import("@/lib/infra/auth-guards");
    const adminSession: Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>> = {
      supabase: {} as Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>>["supabase"],
      user: { id: "admin-1", email: "admin@dim.test" },
      profile: { id: "admin-1", role: "admin" },
      jurisdictions: [],
    };
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValueOnce(adminSession);
    const node = await GovtCasosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Vista universal admin.");
  });
});
