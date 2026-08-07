// @vitest-environment jsdom
//
// /admin/casos — render smoke test (opfilterbar-sweep-2026-07-21, R1).
// Twin of app/gob/casos/page.test.tsx — see that file's header comment for
// the full root-cause writeup (parseCasoEstado living in a "use client"
// module and being CALLED, not rendered, from this Server Component's
// data-loading path). This page hit the exact same crash and is fixed by the
// same change (components/ui/dashboard/caso-estado.ts).
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(async () => ({
    supabase: {},
    user: { id: "admin-1", email: "admin@dim.test" },
    profile: { id: "admin-1", role: "admin" },
    jurisdictions: [],
  })),
}));

vi.mock("@/lib/infra/case-queries", () => ({
  listCasesForAdmin: vi.fn(async () => []),
  countCasesForAdmin: vi.fn(async () => 0),
}));

import AdminCasosPage from "./page";

describe("/admin/casos — render smoke test", () => {
  it("renders the Estado/Tipo/Provincia bar + universal caption without throwing", async () => {
    const node = await AdminCasosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Casos");
    expect(html).toContain("Estado");
    expect(html).toContain("Abiertos");
    // The empty state must NOT blame filters nobody applied — same class
    // /adoptar solved and /perdidas was fixed for. This asserts the BEHAVIOUR,
    // not the wording: with no query, the copy may not mention filters at all.
    expect(html).not.toMatch(/filtros aplicados/i);
    expect(html).toContain("No hay casos abiertos.");
  });

  it("blames the filters only when filters are actually applied", async () => {
    const node = await AdminCasosPage({
      searchParams: Promise.resolve({ kind: "welfare_denuncia" }),
    });
    const html = renderToStaticMarkup(node);
    // The control group for the test above: the filtered branch is the ONLY
    // one allowed to say it. Without this pair, deleting the ternary and
    // hardcoding the unfiltered copy would still pass.
    expect(html).toContain("Ningún caso coincide con los filtros aplicados.");
  });

  it("renders with an explicit status + kind + province query without throwing", async () => {
    const node = await AdminCasosPage({
      searchParams: Promise.resolve({ status: "closed", kind: "maltrato", province: "Córdoba" }),
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Casos");
  });
});
