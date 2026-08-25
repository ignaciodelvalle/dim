// `/turno-vencido` — the route that ENDS a shift-expired operator's session.
//
// WHY THIS FILE EXISTS AT ALL (pre-push review, 2026-08-25)
// ---------------------------------------------------------------------------
// It was the one piece of the 8-hour-shift work that shipped with no test, and
// it was also the piece carrying the defect. The handler discarded the result of
// `supabase.auth.signOut({ scope: "global" })` and redirected unconditionally —
// which rebuilds the redirect loop its own header claims to have designed away.
//
// The mechanism, read out of the vendored auth-js 2.105.4 rather than assumed
// (GoTrueClient `_signOut`): on an admin sign-out error it returns `{ error }`
// and never reaches `_removeSession()`, UNLESS the GoTrue status is 401, 403,
// 404 or the session was already missing. A 500 or a network failure therefore
// leaves the cookies in place. Redirecting anyway sends a still-authenticated
// operator to `/iniciar-sesion`, which forwards an authenticated visitor onward
// by role, which hits the portal's liveness guard, which answers SHIFT_EXPIRED,
// which sends them back here: ERR_TOO_MANY_REDIRECTS, the 2026-07-04 incident
// rebuilt out of the failure mode of its own fix.
//
// So the two cases below are not symmetric decoration. The first pins the happy
// path (it must still redirect, and with `motivo=turno`, because that is what
// the login page reads to explain itself). The second pins the ONLY thing that
// makes the loop impossible: on a sign-out failure NOTHING is redirected.

import { beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` throws in Next, so everything after it is unreachable. Same
// capture shape as __tests__/auth-guards.test.ts: throw a tagged error and spy
// on the destination.
const mockRedirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

const mockRequireLiveUser = vi.fn();
vi.mock("@/lib/infra/live-user", () => ({
  requireLiveUser: () => mockRequireLiveUser(),
}));

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: mockSignOut } })),
}));

import { GET } from "@/app/(auth)/turno-vencido/route";

function shiftExpired() {
  return {
    ok: false as const,
    supabase: null,
    user: { id: "user-uuid-1" },
    reason: "SHIFT_EXPIRED" as const,
    error: "Tu turno de trabajo terminó.",
  };
}

/** Runs the handler and reports what it did — a redirect, or a real Response. */
async function invoke(): Promise<
  { kind: "redirect"; to: string } | { kind: "response"; response: Response }
> {
  try {
    const response = await GET();
    return { kind: "response", response };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return { kind: "redirect", to: message.slice("NEXT_REDIRECT:".length) };
    }
    throw err;
  }
}

describe("/turno-vencido", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockRequireLiveUser.mockReset();
    mockSignOut.mockReset();
  });

  it("signs the operator out globally and sends them to login with motivo=turno", async () => {
    mockRequireLiveUser.mockResolvedValue(shiftExpired());
    mockSignOut.mockResolvedValue({ error: null });

    const outcome = await invoke();

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
    expect(outcome).toEqual({ kind: "redirect", to: "/iniciar-sesion?motivo=turno" });
  });

  it("does NOT redirect when GoTrue refuses the sign-out — that is the loop", async () => {
    mockRequireLiveUser.mockResolvedValue(shiftExpired());
    // The shape auth-js returns for a 5xx: an error, and the cookies still in
    // place because `_removeSession()` was never reached.
    mockSignOut.mockResolvedValue({ error: { status: 500, message: "upstream unavailable" } });

    const outcome = await invoke();

    // THE ASSERTION THAT MATTERS. One redirect here and the operator's browser
    // starts bouncing between this route and the login page until the browser
    // gives up.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") throw new Error("unreachable");
    expect(outcome.response.status).toBe(503);
    expect(outcome.response.headers.get("cache-control")).toBe("no-store");
  });

  it("tells the operator the session is STILL OPEN rather than implying it closed", async () => {
    mockRequireLiveUser.mockResolvedValue(shiftExpired());
    mockSignOut.mockResolvedValue({ error: { status: 500, message: "upstream unavailable" } });

    const outcome = await invoke();
    if (outcome.kind !== "response") throw new Error("expected a terminal response");
    const body = await outcome.response.text();

    // An operator who walks away from a shared municipal desk believing they
    // signed out is a worse outcome than a page admitting it failed. This is the
    // copy half of the fix and it is not decoration.
    expect(body).toContain("tu sesión sigue abierta");
    expect(body).toContain("Volver a intentar");
  });

  it("leaves a session that is not shift-expired completely alone", async () => {
    // The prefetch, the cross-site auto-navigation, the operator who typed the
    // URL. A GET that ends sessions is only safe because of this branch.
    mockRequireLiveUser.mockResolvedValue({
      ok: true,
      supabase: null,
      user: { id: "user-uuid-1" },
      profile: null,
    });

    const outcome = await invoke();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "redirect", to: "/" });
  });

  it("does not launder MAINTENANCE into 'your shift ended'", async () => {
    mockRequireLiveUser.mockResolvedValue({
      ok: false,
      supabase: null,
      user: null,
      reason: "MAINTENANCE",
      error: "En mantenimiento.",
    });

    const outcome = await invoke();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "redirect", to: "/" });
  });
});
