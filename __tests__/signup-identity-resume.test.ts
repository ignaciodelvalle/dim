// Route test — /signup, the authenticated-visitor guard.
//
// THE BUG (staging, 2026-08-01): 15 of 25 owner profiles were stuck on the
// handle_new_user trigger's provisional, email-derived display_name, the newest
// created that same morning. The reported symptom was "our new accounts went
// straight to /mis-mascotas after email and password".
//
// The two-step form was already correct. This page was not:
//
//     if (user) redirect(returnTo ?? "/mis-mascotas");
//
// Signup step 1 is a Server Action ON THIS ROUTE. supabase.auth.signUp writes
// the session cookie, Next.js re-renders the page as part of the same action
// response, getUser() now returns the new user, and this guard fired — the
// client router left for /mis-mascotas before the form's step-2 effect could
// paint. Email confirmation was never involved (enable_confirmations = false,
// supabase/config.toml — accounts are auto-confirmed at creation, which is why
// all 15 read as "confirmed").
//
// The contract pinned here:
//   - authenticated + identity COMPLETE   → redirect away (unchanged)
//   - authenticated + identity PROVISIONAL → stay, render step 2 (the fix)
//   - anonymous                            → stay, render step 1 (unchanged)
//
// Note on assertion style: `rejects.toThrow(/REDIRECT/)` alone proves nothing —
// it passes for any throw from anywhere in the page. Every redirect case below
// also asserts the captured TARGET, and every stay case asserts redirect was
// never called at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const { mockGetUser, mockGetProfileCached } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetProfileCached: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: (userId: string) => mockGetProfileCached(userId),
}));

import SignupPage from "@/app/(auth)/registro/page";

const EMAIL = "ignaciodelvalle2014+cursor-owner2@gmail.com";
const PROVISIONAL = "ignaciodelvalle2014+cursor-owner2";
const USER_ID = "user-0001";

function anonymous() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function authenticatedWith(displayName: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
  mockGetProfileCached.mockResolvedValue({ id: USER_ID, displayName, role: "owner" });
}

/** Render the page and return its element tree, failing loudly on a redirect. */
async function renderPage(searchParams: Record<string, string> = {}) {
  return SignupPage({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  mockRedirect.mockClear();
  mockGetUser.mockReset();
  mockGetProfileCached.mockReset();
});

describe("/signup — authenticated visitor guard", () => {
  it("keeps an authenticated user whose display_name is still the email local part", async () => {
    authenticatedWith(PROVISIONAL);

    await renderPage();

    // The whole bug in one assertion: this user must NOT be bounced out.
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("mounts the form at step 2 for that user, not step 1", async () => {
    authenticatedWith(PROVISIONAL);

    const tree = await renderPage();
    const form = findSignupForm(tree);

    expect(form.props.initialStep).toBe("identity");
  });

  it("keeps an authenticated user whose display_name is blank", async () => {
    authenticatedWith("");

    const tree = await renderPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(findSignupForm(tree).props.initialStep).toBe("identity");
  });

  it("still bounces an authenticated user who already has a real name", async () => {
    authenticatedWith("Ignacio Del Valle");

    await expect(renderPage()).rejects.toThrow(/REDIRECT/);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/mis-mascotas");
  });

  it("honours returnTo when bouncing a user who already has a real name", async () => {
    authenticatedWith("Ignacio Del Valle");

    await expect(renderPage({ returnTo: "/adoptar" })).rejects.toThrow(/REDIRECT/);

    expect(mockRedirect).toHaveBeenCalledWith("/adoptar");
  });

  it("leaves an anonymous visitor on step 1 and never reads a profile", async () => {
    anonymous();

    const tree = await renderPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockGetProfileCached).not.toHaveBeenCalled();
    expect(findSignupForm(tree).props.initialStep).toBe("account");
  });

  it("swaps the headline to resume copy instead of telling an existing user to 'Crear cuenta'", async () => {
    authenticatedWith(PROVISIONAL);

    const text = renderedText(await renderPage());

    expect(text).toContain("Completá tu perfil");
    expect(text).not.toContain("Crear cuenta");
    // "¿Ya tenés cuenta? Iniciar sesión" is nonsense for someone already signed in.
    expect(text).not.toContain("Iniciar sesión");
  });

  it("keeps the normal signup headline for an anonymous visitor", async () => {
    anonymous();

    const text = renderedText(await renderPage());

    expect(text).toContain("Crear cuenta");
    expect(text).not.toContain("Completá tu perfil");
  });
});

// ---------------------------------------------------------------------------
// Tiny element-tree helpers. The page is a Server Component returning plain
// React elements — no renderer needed, and walking the tree lets us assert on
// the props actually handed to SignupForm.
// ---------------------------------------------------------------------------

type Node = { type?: unknown; props?: { children?: unknown; [k: string]: unknown } };

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== "object") return;
  const n = node as Node;
  visit(n);
  walk(n.props?.children, visit);
}

function findSignupForm(tree: unknown): { props: Record<string, unknown> } {
  let found: { props: Record<string, unknown> } | null = null;
  walk(tree, (n) => {
    if (typeof n.type === "function" && (n.type as { name?: string }).name === "SignupForm") {
      found = { props: (n.props ?? {}) as Record<string, unknown> };
    }
  });
  if (!found) throw new Error("SignupForm was not rendered");
  return found;
}

function renderedText(tree: unknown): string {
  const parts: string[] = [];
  const collect = (node: unknown): void => {
    if (typeof node === "string") {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const c of node) collect(c);
      return;
    }
    if (!node || typeof node !== "object") return;
    collect((node as Node).props?.children);
  };
  collect(tree);
  return parts.join(" ");
}
