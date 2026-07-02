// Tests for the edge-level permanent redirects in middleware.ts.
//
// Coverage here is scoped to the legacy pet-profile lens routes
// (/vacunas, /historial, /libreta) — the QA regression (engram #635) that
// motivated this file: their page-level permanentRedirect() calls stream a
// 200 shell (loading.tsx boundary) instead of a real HTTP 308 in prod. The
// middleware redirect added alongside the AC3 pattern (/admin/cola,
// /admin/usuarios, /admin/organizaciones → /gob/*, see middleware.ts) fixes
// that by returning the 308 before the request ever reaches the page.
//
// The redirect-hit cases below never reach updateSession() (the Supabase
// session-refresh call) — they return early. The two fall-through cases
// (unmatched paths) DO reach it, so updateSession is mocked to a plain
// pass-through response; otherwise those assertions would depend on a local
// Supabase stack being up and reachable.

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async (request: NextRequest) => NextResponse.next({ request })),
}));

const { middleware } = await import("./middleware");

const PUBLIC_TOKEN = "DIM-9HAK-D5Z4";

function requestFor(pathname: string, search = "") {
  return new NextRequest(new URL(`https://dim.test${pathname}${search}`));
}

describe("middleware — legacy pet-profile lens redirects", () => {
  it.each([
    ["vacunas", "vacunas"],
    ["historial", "historial"],
    ["libreta", "libreta"],
  ])("redirects /mis-mascotas/[publicToken]/%s to ?tab=%s with a real 308", async (segment, tab) => {
    const request = requestFor(`/mis-mascotas/${PUBLIC_TOKEN}/${segment}`);
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `https://dim.test/mis-mascotas/${PUBLIC_TOKEN}?tab=${tab}`,
    );
  });

  it("does NOT match a trailing slash — exact segment match only, same as the page.tsx route it replaces", async () => {
    const request = requestFor(`/mis-mascotas/${PUBLIC_TOKEN}/vacunas/`);
    const response = await middleware(request);

    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });

  it("drops any incoming query string — the target is always the fixed ?tab= value, matching the page-level permanentRedirect()", async () => {
    const request = requestFor(`/mis-mascotas/${PUBLIC_TOKEN}/historial`, "?lente=oficial&foo=bar");
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `https://dim.test/mis-mascotas/${PUBLIC_TOKEN}?tab=historial`,
    );
  });

  it("does NOT redirect /vacunas/programar — it's a real page (schedule-a-vaccine form), not a legacy lens route", async () => {
    const request = requestFor(`/mis-mascotas/${PUBLIC_TOKEN}/vacunas/programar`);
    const response = await middleware(request);

    // Falls through to updateSession(), which returns a plain pass-through
    // NextResponse.next() — i.e. NOT a redirect.
    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does NOT redirect an unrelated /mis-mascotas/[publicToken] path (no lens segment)", async () => {
    const request = requestFor(`/mis-mascotas/${PUBLIC_TOKEN}`);
    const response = await middleware(request);

    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });
});
