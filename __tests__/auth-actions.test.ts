// Action-level tests for loginAction + logoutAction (app/actions/auth.ts).
// V1-9 coverage gap: signupAction / completeIdentityAction validation gates are
// already covered by signup-validation.test.ts; this file fills loginAction
// (Supabase signIn happy/fail + role-based landing) and logoutAction.
//
// Strategy: mock `@/lib/supabase/server` so the action's signInWithPassword /
// signOut are controllable, and mock `next/navigation` so the redirect target
// is captured instead of throwing out of the test. The role lookup hits the
// REAL local DB against a seeded ephemeral owner, so the landing-path logic is
// exercised for real (owner with no org-admin membership → /inicio).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// loginAction now reads request headers (callerIp) for its per-IP + per-email
// rate-limit budgets. Provide a trusted edge IP so callerIp resolves cleanly.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "10.0.0.1" : null),
  })),
}));

// Rate limiter: allow by default (enforceRateLimit resolves), overridable per
// test. Keep the REAL RateLimitError / callerIp / emailRateLimitKey so the
// action's `instanceof RateLimitError` branch and key derivation work.
const { mockEnforceRateLimit } = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  };
});

// redirect() normally throws NEXT_REDIRECT; capture the target instead.
const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    // Mirror Next's control-flow: redirect never returns.
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

import { loginAction, logoutAction } from "@/app/actions/auth";
import { db, notifications, profiles } from "@/db";
import { RateLimitError } from "@/lib/infra/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const OWNER_EMAIL = "authact-owner@dim-test.local";
const DEACT_ADMIN_EMAIL = "authact-deact-admin@dim-test.local";
const PASS = "AuthAct_2026!";

let ownerUserId: string;
let deactAdminUserId: string;

const signInMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue({ error: null });

function mockSupabaseClient() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  } as never);
}

function loginForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", OWNER_EMAIL);
  fd.set("password", PASS);
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

async function purgeUserByEmail(email: string) {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  await withMutationOverride(async (tx) => {
    for (const uid of ids) {
      await tx.delete(notifications).where(eq(notifications.userId, uid));
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }
  });
  if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
}

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  const r = await supabaseAdmin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser owner: ${r.error?.message}`);
  ownerUserId = r.data.user.id;

  // Deactivated institutional admin (task #39 loop guard).
  await purgeUserByEmail(DEACT_ADMIN_EMAIL);
  const d = await supabaseAdmin.auth.admin.createUser({
    email: DEACT_ADMIN_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (d.error || !d.data.user) throw new Error(`createUser deact admin: ${d.error?.message}`);
  deactAdminUserId = d.data.user.id;
  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional", deactivatedAt: new Date() })
    .where(eq(profiles.id, deactAdminUserId));
}, 60_000);

afterAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(DEACT_ADMIN_EMAIL);
});

beforeEach(() => {
  mockRedirect.mockReset();
  signInMock.mockReset();
  signOutMock.mockClear();
  mockEnforceRateLimit.mockReset();
  mockEnforceRateLimit.mockResolvedValue(undefined);
  mockSupabaseClient();
});

// ---------------------------------------------------------------------------
// loginAction
// ---------------------------------------------------------------------------

describe("loginAction", () => {
  it("returns an error when email or password is missing (no Supabase call)", async () => {
    const fd = loginForm({ email: "" });
    const result = await loginAction({ error: null }, fd);
    // The action echoes the submitted email back so the form can restore it
    // across React 19's post-action reset (here it is the empty string).
    expect(result).toEqual({ error: "Faltan datos.", email: "" });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns a generic error when Supabase rejects the credentials", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await loginAction({ error: null }, loginForm({ password: "wrong" }));

    // Echoes the submitted email back so the form restores it after the reset.
    expect(result).toEqual({ error: "Correo o contraseña incorrectos.", email: OWNER_EMAIL });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects an owner with no org-admin membership to /inicio on success", async () => {
    signInMock.mockResolvedValue({
      data: { user: { id: ownerUserId } },
      error: null,
    });

    // The action redirects, which our mock turns into a throw.
    await expect(loginAction({ error: null }, loginForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signInMock).toHaveBeenCalledWith({ email: OWNER_EMAIL, password: PASS });
    expect(mockRedirect).toHaveBeenCalledWith("/inicio");
  });

  it("honors a safe returnTo for non-admin/govt roles", async () => {
    signInMock.mockResolvedValue({
      data: { user: { id: ownerUserId } },
      error: null,
    });

    await expect(
      loginAction({ error: null }, loginForm({ returnTo: "/mis-mascotas/abc" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/mis-mascotas/abc");
  });

  // Task #39: a deactivated institutional account must never come out of
  // login holding a session — the portal guards bounce it to `/`, whose
  // role-redirect sends it back: an infinite 307 loop ending in a browser
  // error page (no feedback, no logout surface). The action signs the fresh
  // session back out and returns a visible form error instead.
  it("signs a deactivated institutional account back out with an explanatory error", async () => {
    signInMock.mockResolvedValue({
      data: { user: { id: deactAdminUserId } },
      error: null,
    });

    const result = await loginAction({ error: null }, loginForm({ email: DEACT_ADMIN_EMAIL }));

    expect(result).toEqual({
      error: "Tu cuenta institucional está desactivada. Contactá al equipo de MiMAR.",
      email: DEACT_ADMIN_EMAIL,
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns a friendly error and never calls Supabase when rate-limited", async () => {
    // First budget check (per-IP) trips: enforceRateLimit throws RateLimitError.
    mockEnforceRateLimit.mockRejectedValueOnce(
      new RateLimitError(new Date(Date.now() + 60_000), "auth_login_ip"),
    );

    const result = await loginAction({ error: null }, loginForm());

    expect(result.error).toMatch(/demasiados intentos/i);
    // Fail closed: the credential check must not run once the budget is spent.
    expect(signInMock).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("enforces both a per-IP and a per-email login budget", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: ownerUserId } }, error: null });

    await expect(loginAction({ error: null }, loginForm())).rejects.toThrow(/NEXT_REDIRECT/);

    // Two independent budgets are consumed: per-IP and per-email.
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_login_ip",
      "10.0.0.1",
      expect.objectContaining({ maxPerMinute: expect.any(Number) }),
    );
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_login_email",
      expect.any(String),
      expect.objectContaining({ maxPerMinute: expect.any(Number) }),
    );
  });

  it("ignores an unsafe (off-origin) returnTo and falls back to role landing", async () => {
    signInMock.mockResolvedValue({
      data: { user: { id: ownerUserId } },
      error: null,
    });

    await expect(
      loginAction({ error: null }, loginForm({ returnTo: "//evil.com/phish" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    // Unsafe returnTo is dropped; owner lands on /inicio.
    expect(mockRedirect).toHaveBeenCalledWith("/inicio");
  });
});

// ---------------------------------------------------------------------------
// logoutAction
// ---------------------------------------------------------------------------

describe("logoutAction", () => {
  it("signs out and redirects home", async () => {
    await expect(logoutAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
