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
import { createClient } from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const OWNER_EMAIL = "authact-owner@dim-test.local";
const PASS = "AuthAct_2026!";

let ownerUserId: string;

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
}, 60_000);

afterAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
});

beforeEach(() => {
  mockRedirect.mockReset();
  signInMock.mockReset();
  signOutMock.mockClear();
  mockSupabaseClient();
});

// ---------------------------------------------------------------------------
// loginAction
// ---------------------------------------------------------------------------

describe("loginAction", () => {
  it("returns an error when email or password is missing (no Supabase call)", async () => {
    const fd = loginForm({ email: "" });
    const result = await loginAction({ error: null }, fd);
    expect(result).toEqual({ error: "Faltan datos." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns a generic error when Supabase rejects the credentials", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await loginAction({ error: null }, loginForm({ password: "wrong" }));

    expect(result).toEqual({ error: "Correo o contraseña incorrectos." });
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
