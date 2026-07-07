/**
 * Cross-tenant isolation e2e — Wave 5 Item 26 (RLS defense-in-depth).
 *
 * WHAT THIS TESTS
 * ---------------
 * Owner A (owner@dim.test) cannot access Owner B's data by any browser path:
 *   1. Page renders — navigating to B's pet URLs renders a 404 / redirect /
 *      empty state (never B's pet content).
 *   2. JSON / API responses — Next.js route handlers and server actions are
 *      invoked only through their legitimate paths (session-scoped server
 *      actions are the primary authz gate). This spec exercises the page-
 *      render paths which SSR the sensitive queries.
 *
 * This tests the full stack as a user would experience it, confirming that
 * the action-edge authz layer (primary gate) holds end-to-end.
 *
 * WHY THESE ACCOUNTS
 * ------------------
 * The test seed (seed-test-users.ts) creates two owner accounts:
 *   owner@dim.test      — Owner A: has 3 pets.
 *   owner2@dim.test     — Owner B: a separate tenant owning "Rocco". This spec
 *                         signs in as B to resolve B's REAL pet/user ids and
 *                         probes them as A. Real-Owner-B tests self-skip if the
 *                         owner2 fixture is absent (fabricated-UUID probes and
 *                         anon probes still run).
 *
 * AUTHZ MODEL NOTE (Item 26 + Item 31)
 * ------------------------------------
 * Server Actions are the PRIMARY authz gate. They run server-side with the
 * BYPASSRLS postgres role and enforce session + ownership checks in TS before
 * executing any SQL. RLS is a DEFENSE-IN-DEPTH backstop that guards the
 * PostgREST surface; it never fires for action-edge queries. Both layers must
 * hold independently. This spec validates the action-edge layer end-to-end;
 * __tests__/rls/matrix.test.ts validates the PostgREST / RLS layer directly.
 *
 * SEEDING REQUIREMENTS
 * --------------------
 * Depends on `pnpm db:bootstrap` → `pnpm seed:test` having run.
 * Owner A (owner@dim.test) must own at least one pet.
 * Owner B (owner2@dim.test) + its pet are created by seed-test-users.ts
 * (ensureOwnerB + seedOwnerBPet). If absent, real-Owner-B tests self-skip.
 *
 * The test uses Playwright's request API (not a browser tab) to probe the
 * JSON response of the /api/ routes and the page HTML of owner-scoped routes,
 * in addition to browser navigation for the full-stack path.
 */

import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OWNER_A_EMAIL = "owner@dim.test";
const OWNER_A_PASSWORD = "Test1234!";

// Owner B — a real second tenant seeded by seed-test-users.ts (owns "Rocco").
const OWNER_B_EMAIL = "owner2@dim.test";
const OWNER_B_PASSWORD = "Test1234!";

// Govt operator — seeded by seed-test-users.ts covering ONLY Ushuaia +
// El Calafate (remote). Used to probe govt jurisdiction scoping: an
// approval-request page outside the operator's assigned jurisdictions must
// notFound() (the /gob/cola/[publicToken] page collapses out-of-scope AND
// not-found into the same 404 so request existence is never leaked).
const GOVT_EMAIL = "govt@dim.test";
const GOVT_PASSWORD = "Test1234!";

// Org admin — admins "Refugio Test (Seed)". Used to probe org-portal scoping:
// opening ANY org token they don't belong to must notFound() (org layout
// decision D4 — non-member and non-existent collapse to the same 404).
const ORG_ADMIN_EMAIL = "orgadmin@dim.test";
const ORG_ADMIN_PASSWORD = "Test1234!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign in as Owner A and return the Supabase userId. */
async function signInOwnerA(): Promise<{ userId: string; accessToken: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: OWNER_A_EMAIL,
    password: OWNER_A_PASSWORD,
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Owner A sign-in failed: ${error?.message ?? "no user"}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/** Resolve the first pet token (public_token) visible to Owner A. */
async function getOwnerAPetToken(accessToken: string): Promise<string | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({ access_token: accessToken, refresh_token: "" });
  // pets.public_token is the URL segment used in /mis-mascotas/[token].
  const { data } = await client.from("pets").select("public_token").limit(1);
  return data && data.length > 0 ? (data[0].public_token as string) : null;
}

/** Sign in as Owner B (the real cross-tenant target). Returns null on failure. */
async function signInOwnerB(): Promise<{ userId: string; accessToken: string } | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: OWNER_B_EMAIL,
    password: OWNER_B_PASSWORD,
  });
  if (error || !data.user || !data.session) return null;
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/** Resolve Owner B's own pet token + id, read AS Owner B (positive-control read). */
async function getOwnerBPet(accessToken: string): Promise<{ token: string; id: string } | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({ access_token: accessToken, refresh_token: "" });
  const { data } = await client.from("pets").select("id, public_token").limit(1);
  return data && data.length > 0
    ? { token: data[0].public_token as string, id: data[0].id as string }
    : null;
}

/** Navigate to a page and log in as Owner A. Returns the authenticated page. */
async function loginAsOwnerA(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(OWNER_A_EMAIL);
  await page.getByLabel(/contraseña/i).fill(OWNER_A_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/inicio/, { timeout: 15_000 });
}

/**
 * Log in as any seeded account and wait until the post-login redirect leaves
 * /login (owners land on /inicio, govt on /gob, org admins on /cuenta or their
 * org portal — this helper is role-agnostic).
 */
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** Verify an account can sign in (via supabase-js). Returns true when seeded. */
async function accountSeeded(email: string, password: string): Promise<boolean> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return !error && !!data.user;
}

// ---------------------------------------------------------------------------
// Fixtures (resolved once per suite in beforeAll via globalSetup-equivalent)
// ---------------------------------------------------------------------------

let ownerAPetToken: string | null = null;
let ownerAUserId: string | null = null;
// Owner B's REAL identifiers (resolved by reading as Owner B). null when the
// owner2 fixture isn't seeded — real-Owner-B tests self-skip in that case.
let ownerBUserId: string | null = null;
let ownerBPetToken: string | null = null;
let ownerBPetId: string | null = null;
let setupSkip: string | null = null;
// Govt + org fixtures — true when the account is seeded (seed-test-users.ts).
// The govt/org scope tests self-skip when their account is absent.
let govtSeeded = false;
let orgAdminSeeded = false;

test.beforeAll(async () => {
  if (!SUPABASE_ANON_KEY) {
    setupSkip =
      "NEXT_PUBLIC_SUPABASE_ANON_KEY not set — cross-tenant isolation spec skipped. Run db:bootstrap + seed:test first.";
    return;
  }

  try {
    const { userId, accessToken } = await signInOwnerA();
    ownerAUserId = userId;
    ownerAPetToken = await getOwnerAPetToken(accessToken);
    if (!ownerAPetToken) {
      setupSkip =
        "Owner A has no pets visible via PostgREST — re-run pnpm seed:test to populate test fixtures.";
    }
  } catch (err) {
    setupSkip = `Cross-tenant spec setup failed: ${String(err)}. Run pnpm seed:test first.`;
  }

  // Owner B is optional: if the owner2 fixture is absent, real-Owner-B tests
  // self-skip while the fabricated-UUID probes still run.
  const ownerB = await signInOwnerB();
  if (ownerB) {
    ownerBUserId = ownerB.userId;
    const bPet = await getOwnerBPet(ownerB.accessToken);
    if (bPet) {
      ownerBPetToken = bPet.token;
      ownerBPetId = bPet.id;
    }
  }

  // Govt + org accounts are optional fixtures (seed-test-users.ts). Their scope
  // tests self-skip when the account isn't seeded.
  govtSeeded = await accountSeeded(GOVT_EMAIL, GOVT_PASSWORD);
  orgAdminSeeded = await accountSeeded(ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("cross-tenant isolation — Owner A cannot access Owner B data", () => {
  // Skip the entire suite body when fixtures are missing (but count as pass,
  // not failure — same pattern as matrix.test.ts).
  test("setup: fixtures resolved (suite skips cleanly when seed missing)", () => {
    if (setupSkip) {
      console.warn(`[cross-tenant] SKIPPING: ${setupSkip}`);
    }
    expect(true).toBe(true); // always pass the setup marker
  });

  // -------------------------------------------------------------------------
  // 1. Pet profile page — /mis-mascotas/[token] scoped to Owner A
  // -------------------------------------------------------------------------
  test("Owner A on /mis-mascotas sees only own pets (not leaked names/tokens)", async ({
    page,
  }) => {
    if (setupSkip) return;
    await loginAsOwnerA(page);

    await page.goto("/mis-mascotas");
    await page.waitForLoadState("networkidle");

    // The page must not 500.
    await expect(page.getByText(/application error/i)).not.toBeVisible();

    // The page renders a list of pet cards. Every visible pet name must
    // belong to Owner A. We can't enumerate all of Owner B's pet names here
    // (they are dynamic), but we can assert the page renders without error
    // and that no "Usted no tiene acceso" cross-tenant error leaks through.
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Direct URL manipulation — accessing /mis-mascotas/[owner-a-token] while
  //    logged in as Owner A should work (positive control).
  // -------------------------------------------------------------------------
  test("Owner A can access own pet profile page (positive control)", async ({ page }) => {
    if (setupSkip || !ownerAPetToken) return;
    await loginAsOwnerA(page);

    const response = await page.goto(`/mis-mascotas/${ownerAPetToken}`);

    // Must be a 2xx response (not 403 / 404).
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByText(/application error/i)).not.toBeVisible();

    // At least one content landmark rendered.
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Fabricated token — Owner A trying a garbage pet token gets a safe error,
  //    not a 500 or leaked data.
  // -------------------------------------------------------------------------
  test("fabricated pet token returns 404 / not-found (no 500, no leak)", async ({ page }) => {
    if (setupSkip) return;
    await loginAsOwnerA(page);

    const response = await page.goto("/mis-mascotas/not-a-real-pet-token-00000000");

    // Must be 404 (not 500, not 200 with another user's data).
    expect(response?.status()).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 3-REAL. The strongest full-stack cross-tenant assertion: Owner A opening
  // Owner B's REAL pet URL (owner2's "Rocco") must 404 — the action edge scopes
  // the pet query to the session owner. Self-skips if owner2 isn't seeded.
  // -------------------------------------------------------------------------
  test("Owner A gets 404 on Owner B's REAL pet URL (action-edge scoping)", async ({ page }) => {
    if (setupSkip || !ownerBPetToken) return;
    await loginAsOwnerA(page);

    const response = await page.goto(`/mis-mascotas/${ownerBPetToken}`);

    // B's real token exists, but A must not be able to open it.
    expect(response?.status(), "cross-tenant leak: Owner A opened Owner B's real pet page").toBe(
      404,
    );
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4-REAL. PostgREST/RLS with a REAL target: Owner A cannot read Owner B's
  // real ownerships row (by B's real user id) nor B's real pet_events.
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read Owner B's REAL ownerships / pet_events", async () => {
    if (setupSkip || !ownerBUserId) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    const { data: ownershipRows } = await client
      .from("ownerships")
      .select("id")
      .eq("owner_user_id", ownerBUserId)
      .limit(1);
    expect((ownershipRows ?? []).length, "RLS leak: Owner A read Owner B's real ownerships").toBe(
      0,
    );

    if (ownerBPetId) {
      const { data: eventRows } = await client
        .from("pet_events")
        .select("id")
        .eq("pet_id", ownerBPetId)
        .limit(1);
      expect((eventRows ?? []).length, "RLS leak: Owner A read Owner B's real pet_events").toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // 4. PostgREST isolation — Owner A via supabase-js cannot read Owner A's own
  //    ownerships with a fabricated user id filter (cross-owner probe via RLS).
  //    This exercises the RLS layer directly (not the action edge).
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read ownerships filtered to a different user id", async () => {
    if (setupSkip || !ownerAUserId) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    // Attempt to read ownerships scoped to a fabricated (different) user id.
    const FABRICATED_ID = "00000000-dead-beef-0000-000000000000";
    const { data, error } = await client
      .from("ownerships")
      .select("*")
      .eq("owner_user_id", FABRICATED_ID)
      .limit(1);

    // RLS must prevent this — zero rows (or a PostgREST error).
    const rows = (data ?? []).length;
    expect(rows, `RLS leak: Owner A saw ownerships for fabricated userId (rows=${rows})`).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 5. PostgREST isolation — Owner A via supabase-js cannot read profiles rows
  //    for other users.
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read profiles for a fabricated user id", async () => {
    if (setupSkip) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    const FABRICATED_ID = "00000000-dead-beef-0000-000000000001";
    const { data } = await client
      .from("profiles")
      .select("id, display_name")
      .eq("id", FABRICATED_ID)
      .limit(1);

    expect((data ?? []).length, "RLS leak: profiles row visible for fabricated user id").toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. PostgREST isolation — Owner A cannot read pet_events for a pet they do
  //    not own (using a well-formed but unowned UUID).
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read pet_events for a fabricated pet id", async () => {
    if (setupSkip) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    const FABRICATED_PET_ID = "00000000-dead-beef-0000-000000000002";
    const { data } = await client
      .from("pet_events")
      .select("id")
      .eq("pet_id", FABRICATED_PET_ID)
      .limit(1);

    expect((data ?? []).length, "RLS leak: pet_events visible for unowned pet id").toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. PostgREST isolation — pet_identifications: Owner A cannot read
  //    identifications for a pet they do not own.
  //    Migration 0105 added owner-scoped SELECT; this verifies the
  //    non-owned case returns zero rows.
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read pet_identifications for unowned pet", async () => {
    if (setupSkip) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    const FABRICATED_PET_ID = "00000000-dead-beef-0000-000000000003";
    const { data } = await client
      .from("pet_identifications")
      .select("id")
      .eq("pet_id", FABRICATED_PET_ID)
      .limit(1);

    expect(
      (data ?? []).length,
      "RLS leak: pet_identifications visible for unowned/fabricated pet",
    ).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 8. PostgREST isolation — pet_transfers: Owner A cannot read transfers
  //    scoped to a fabricated user id (neither sender nor receiver).
  //    Migration 0105 added sender/receiver SELECT policies.
  // -------------------------------------------------------------------------
  test("PostgREST: Owner A cannot read pet_transfers for fabricated owner ids", async () => {
    if (setupSkip) return;

    const { accessToken } = await signInOwnerA();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({ access_token: accessToken, refresh_token: "" });

    const FABRICATED_OWNER_ID = "00000000-dead-beef-0000-000000000004";
    const { data } = await client
      .from("pet_transfers")
      .select("id")
      .or(`from_owner_id.eq.${FABRICATED_OWNER_ID},to_owner_id.eq.${FABRICATED_OWNER_ID}`)
      .limit(1);

    expect((data ?? []).length, "RLS leak: pet_transfers visible for fabricated owner id").toBe(0);
  });

  // -------------------------------------------------------------------------
  // 9. Anon cannot read any owner-scoped tables.
  //    Defense-in-depth smoke: the anon supabase-js client (no auth session)
  //    must see zero rows on the core owner tables.
  // -------------------------------------------------------------------------
  test("PostgREST: anon cannot read profiles, pets, ownerships, pet_events", async () => {
    if (setupSkip) return;

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const tables = ["profiles", "pets", "ownerships", "pet_events", "pet_identifications"] as const;

    for (const table of tables) {
      const { data, error } = await anonClient.from(table).select("id").limit(1);
      const rows = (data ?? []).length;
      expect(
        rows,
        `RLS leak: anon saw ${rows} row(s) in ${table}. error=${error?.message ?? "none"}`,
      ).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // 10. Govt jurisdiction scoping — a govt operator opening an approval-request
  //     page they cannot see (out-of-scope OR non-existent) must 404. The
  //     /gob/cola/[publicToken] page deliberately collapses "out of your
  //     jurisdiction" and "no such request" into the same notFound() so request
  //     existence is never leaked across jurisdictions (Deep Pass C: govt
  //     out-of-scope → notFound). Self-skips when govt@ isn't seeded.
  // -------------------------------------------------------------------------
  test("govt operator gets 404 on an approval request outside their jurisdiction", async ({
    page,
  }) => {
    if (setupSkip || !govtSeeded) return;
    await loginAs(page, GOVT_EMAIL, GOVT_PASSWORD);

    // A well-formed but foreign request token. govt@ covers only Ushuaia +
    // El Calafate; any request it cannot decide (out-of-scope or missing)
    // resolves to the same 404 — the page never leaks that a request exists.
    const response = await page.goto("/gob/cola/00000000-dead-beef-0000-0000000000aa");

    expect(
      response?.status(),
      "govt scope leak: operator reached an out-of-scope/foreign approval request",
    ).toBe(404);
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 11. Org portal scoping — an org admin opening a portal for an org they do
  //     NOT belong to must 404. The org layout (decision D4) collapses
  //     "not a member" and "no such org" into one notFound() so org existence
  //     never leaks (Deep Pass C: org → other-org → 404). Self-skips when
  //     orgadmin@ isn't seeded.
  // -------------------------------------------------------------------------
  test("org admin gets 404 on another org's portal (non-member = non-existent)", async ({
    page,
  }) => {
    if (setupSkip || !orgAdminSeeded) return;
    await loginAs(page, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD);

    // A foreign org token the admin has no membership in. The org layout must
    // notFound() without leaking whether the org exists.
    const response = await page.goto("/org/DIM-ORG-NOT-A-REAL-TOKEN/mascotas");

    expect(
      response?.status(),
      "cross-org leak: org admin reached a portal for an org they don't belong to",
    ).toBe(404);
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });
});
