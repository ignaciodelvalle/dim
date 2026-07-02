// Tests for the edge-level behavior in middleware.ts scoped to
// portal-follows-viewer (2026-07-02): the x-portal-base header stamping and
// the /admin/jurisdicciones → /admin/reglas remap (the surface was renamed
// by admin-rules-console R1.6).
//
// updateSession (the Supabase session-refresh call) is mocked to a plain
// pass-through response for the fall-through cases — those don't depend on a
// local Supabase stack being up and reachable.

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async (request: NextRequest) => NextResponse.next({ request })),
}));

const { middleware } = await import("./middleware");

function requestFor(pathname: string, search = "") {
  return new NextRequest(new URL(`https://dim.test${pathname}${search}`));
}

describe("middleware — x-portal-base stamping (portal-follows-viewer)", () => {
  it('stamps "/admin" for any /admin/* path', async () => {
    const request = requestFor("/admin/reglas/AR/_/_");
    await middleware(request);
    expect(request.headers.get("x-portal-base")).toBe("/admin");
  });

  it('stamps "/admin" for the /admin root itself', async () => {
    const request = requestFor("/admin");
    await middleware(request);
    expect(request.headers.get("x-portal-base")).toBe("/admin");
  });

  it('stamps "/gob" for any /gob/* path', async () => {
    const request = requestFor("/gob/reglas/AR/_/_");
    await middleware(request);
    expect(request.headers.get("x-portal-base")).toBe("/gob");
  });

  it('stamps "/gob" for an unrelated path (default)', async () => {
    const request = requestFor("/inicio");
    await middleware(request);
    expect(request.headers.get("x-portal-base")).toBe("/gob");
  });
});

describe("middleware — /admin/jurisdicciones → /admin/reglas remap", () => {
  it("redirects the bare /admin/jurisdicciones index to /admin/reglas with a real 308", async () => {
    const request = requestFor("/admin/jurisdicciones");
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://dim.test/admin/reglas");
  });

  it("redirects a full jurisdiction CRUD path, dropping the trailing /reglas segment", async () => {
    const request = requestFor("/admin/jurisdicciones/AR/Salta/Cafayate/reglas");
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dim.test/admin/reglas/AR/Salta/Cafayate",
    );
  });

  it("preserves a nested rest segment (e.g. /nueva) after the dropped /reglas segment", async () => {
    const request = requestFor("/admin/jurisdicciones/AR/Salta/Cafayate/reglas/nueva");
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dim.test/admin/reglas/AR/Salta/Cafayate/nueva",
    );
  });

  it("does NOT redirect a jurisdicciones path that never reaches the /reglas segment", async () => {
    const request = requestFor("/admin/jurisdicciones/AR/Salta/Cafayate");
    const response = await middleware(request);

    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does NOT redirect /admin/reglas itself (the live surface, not the legacy alias)", async () => {
    const request = requestFor("/admin/reglas");
    const response = await middleware(request);

    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("middleware — the old AC3-era /admin→/gob 308s are gone (portal-follows-viewer)", () => {
  it.each(["/admin/cola", "/admin/usuarios", "/admin/organizaciones", "/admin/servicios"])(
    "does NOT redirect %s — it now serves a real page",
    async (pathname) => {
      const request = requestFor(pathname);
      const response = await middleware(request);

      expect(response.status).not.toBe(308);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});
