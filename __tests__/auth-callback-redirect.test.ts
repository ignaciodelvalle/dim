// Open-redirect defense tests for app/auth/callback/route.ts (audit 28-#LOW-7).
//
// The OAuth / magic-link callback exchanges the one-time `code` for a session,
// then redirects the user onward. The `next` query param is attacker-reachable
// (it rides in the URL), so it MUST be sanitized through safeReturnTo() — the
// same guard login/logout use — before it becomes the redirect target. This
// suite asserts that malicious values (protocol-relative, backslash, absolute)
// are dropped and the user falls through to org-aware landing resolution, while
// a legitimate same-origin path is still honored.
//
// Strategy: mock @/lib/supabase/server so exchangeCodeForSession always
// succeeds, and mock ONLY resolveUserLanding in @/lib/infra/role-landing while
// keeping the REAL safeReturnTo (that's the code under test).

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user: { id: "user-uuid-1" } },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/infra/role-landing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/role-landing")>();
  return {
    ...actual,
    // Keep the real safeReturnTo (under test); stub only the DB-backed resolver.
    resolveUserLanding: vi.fn(async () => "/inicio"),
  };
});

import { GET } from "@/app/auth/callback/route";
import { createClient } from "@/lib/supabase/server";

const ORIGIN = "http://localhost:3000";

function callbackRequest(params: Record<string, string>): Request {
  const url = new URL(`${ORIGIN}/auth/callback`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

async function locationFor(params: Record<string, string>): Promise<string> {
  const res = await GET(callbackRequest(params));
  return res.headers.get("location") ?? "";
}

describe("auth/callback open-redirect defense", () => {
  it("rejects a protocol-relative next (//evil.com) and falls back to role landing", async () => {
    const location = await locationFor({ code: "abc", next: "//evil.com/phish" });
    expect(location).toBe(`${ORIGIN}/inicio`);
    expect(location).not.toContain("evil.com");
  });

  it("rejects a backslash-trick next and falls back to role landing", async () => {
    const location = await locationFor({ code: "abc", next: "/\\evil.com" });
    expect(location).toBe(`${ORIGIN}/inicio`);
    expect(location).not.toContain("evil.com");
  });

  it("rejects an absolute-URL next and falls back to role landing", async () => {
    const location = await locationFor({ code: "abc", next: "https://evil.com/phish" });
    expect(location).toBe(`${ORIGIN}/inicio`);
    expect(location).not.toContain("evil.com");
  });

  it("honors a safe same-origin next", async () => {
    const location = await locationFor({ code: "abc", next: "/mis-mascotas/DIM-1234-5678" });
    expect(location).toBe(`${ORIGIN}/mis-mascotas/DIM-1234-5678`);
  });

  it("treats a bare '/' next as absent and resolves org-aware landing", async () => {
    const location = await locationFor({ code: "abc", next: "/" });
    expect(location).toBe(`${ORIGIN}/inicio`);
  });

  it("resolves org-aware landing when no next is provided", async () => {
    const location = await locationFor({ code: "abc" });
    expect(location).toBe(`${ORIGIN}/inicio`);
  });
});

describe("auth/callback failed exchange lands on recovery, not a flag nobody reads (RN-2 F2)", () => {
  it("no code → /recuperar with the enlace_invalido error the page renders", async () => {
    const location = await locationFor({});
    expect(location).toBe(`${ORIGIN}/recuperar?error=enlace_invalido`);
    // The old dead-end (a flag nothing reads) is gone.
    expect(location).not.toContain("auth_error");
  });

  it("code present but exchange FAILS (cross-device PKCE) → same recovery landing", async () => {
    // The motivating case: a recovery link opened on a different device than
    // the one that requested it. The code IS present but exchangeCodeForSession
    // rejects it. Override the mock for this one call.
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: null },
          error: { message: "code verifier not found" },
        })),
      },
    } as any);
    const location = await locationFor({ code: "stale-cross-device-code" });
    expect(location).toBe(`${ORIGIN}/recuperar?error=enlace_invalido`);
    expect(location).not.toContain("auth_error");
  });
});
