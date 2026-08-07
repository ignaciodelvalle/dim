// Anti-loop guard for the two-step signup (FIX #2 / QA 2026-07-10).
//
// Bug: with email confirmation ON, step 1's signUp returns NO session, so step 2
// (completeIdentityAction) found no user and silently redirect("/signup")'d back
// to step 1 — a silent loop that also discarded the typed name.
//
// PO decision (2026-07-10): confirmations stay OFF (single-step signup, no
// verification). Regardless of posture, step 2 must fail HONESTLY when there is
// no session instead of silently looping. These tests pin that contract:
//   - no session  → an honest error state (no redirect), name echoed, no write.
//   - has session → the profile UPDATE runs and the happy path returns ok:true.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  })),
}));

vi.mock("@/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: (...args: unknown[]) => mockWhere(...args) }) }),
  },
  profiles: {},
}));

// Fail the test loudly if the production code ever reaches for a redirect again —
// the honest-failure contract must NOT bounce the user back to step 1.
const mockRedirect = vi.fn((..._args: unknown[]) => {
  throw new Error("redirect() must not be called by completeIdentityAction");
});
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

import { completeIdentityAction } from "@/app/actions/auth";

function identityForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("firstName", "Ana");
  fd.set("lastName", "Pérez");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeIdentityAction — no-session anti-loop guard", () => {
  it("returns an honest error (no redirect, no write) when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await completeIdentityAction({ error: null }, identityForm());

    // Honest, actionable message — never a silent bounce to step 1.
    expect(result.error).toMatch(/sesión no está activa|confirmar tu correo|iniciá sesión/i);
    expect(result.ok).toBeUndefined();
    // The typed name survives (echoed back so the React 19 form reset lands on it).
    expect(result.firstName).toBe("Ana");
    expect(result.lastName).toBe("Pérez");
    // No profile write and no redirect were attempted.
    expect(mockWhere).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("writes the profile and returns ok when a session is present (happy path)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-0001" } } });
    mockWhere.mockResolvedValue(undefined);

    const result = await completeIdentityAction({ error: null }, identityForm());

    expect(result).toEqual({ error: null, ok: true });
    // Step 2 overwrites the provisional (email-derived) display_name with the real one.
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
