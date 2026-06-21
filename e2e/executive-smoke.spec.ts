import { type Page, expect, test } from "@playwright/test";

/**
 * Executive smoke — gate item #18.
 *
 * For every route in GOB_NAV (role=govt) and ADMIN_NAV (role=admin), navigate
 * to the route as the correct operator and assert:
 *   1. HTTP response status < 400 (200 or 3xx redirect that resolves to 2xx).
 *   2. No branded not-found page ("No encontramos esta página").
 *   3. No error boundary ("Algo salió mal" / Next.js "Application error").
 *   4. The operator shell rendered (a <main> or <h1> is visible).
 *
 * This auto-catches dead menu links (like the Campañas 404) on every clean
 * build — the safety-net the gate asks for.
 *
 * Auth: page-level login via /login (same mechanism as auth-bypass.spec.ts
 * and a11y-operator-auth.spec.ts — reused verbatim).
 *
 * Routes: derived from GOB_NAV / ADMIN_NAV (flat arrays) so a new nav item is
 * automatically covered without touching this file.
 *
 * Seeding requirements (same as all other operator specs):
 *   pnpm db:bootstrap → pnpm seed:test
 *   govt@dim.test  → role=govt  (seeded by provisionGovt in seed-test-users.ts)
 *   admin@dim.test → role=admin (seeded by bootstrapAdmin in seed-test-users.ts)
 */

// ---------------------------------------------------------------------------
// Nav presets — source of truth for which routes exist in each portal.
// Imported at module level so the list is static (no async); TypeScript
// type-checks the import. Any new NavItem added to the preset is covered
// automatically by the loop below.
// ---------------------------------------------------------------------------

import { ADMIN_NAV, GOB_NAV } from "@/components/layout/nav-presets";

// ---------------------------------------------------------------------------
// Credentials (seeded by pnpm seed:test — shared password)
// ---------------------------------------------------------------------------

const SHARED_PASSWORD = "Test1234!";

const ROLES = [
  {
    role: "govt",
    email: "govt@dim.test",
    nav: GOB_NAV,
    loginLandingPattern: /\/gob/,
  },
  {
    role: "admin",
    email: "admin@dim.test",
    nav: ADMIN_NAV,
    loginLandingPattern: /\/admin/,
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filters the nav href list to in-app GET routes only.
 * Skips:
 *   - External hrefs (start with http:// or https://)
 *   - Mailto / tel hrefs
 *   - Anchor-only hrefs (#...)
 *   - Query-only hrefs (?...)
 *   - Empty strings
 */
function inAppHrefs(hrefs: readonly string[]): string[] {
  return hrefs.filter((href) => {
    if (!href) return false;
    if (href.startsWith("http://") || href.startsWith("https://")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    if (href.startsWith("#") || href.startsWith("?")) return false;
    return true;
  });
}

/** Log in as an operator and wait for the shell to be ready. */
async function loginAsOperator(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(SHARED_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  // Operators land on their portal root (/gob or /admin) after login.
  // Wait for any URL change away from /login to confirm auth succeeded.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Suites — one per operator role
// ---------------------------------------------------------------------------

for (const { role, email, nav, loginLandingPattern } of ROLES) {
  const hrefs = inAppHrefs(nav.map((item) => item.href));

  test.describe(`executive smoke — ${role} portal (${hrefs.length} routes)`, () => {
    // Sign in once per suite; each test navigates with the same session.
    test.beforeEach(async ({ page }) => {
      await loginAsOperator(page, email);
    });

    for (const href of hrefs) {
      test(`${role}: ${href} → 200 + no error boundary`, async ({ page }) => {
        const response = await page.goto(href);

        // 1. HTTP status must be 2xx (navigation may traverse a 3xx redirect
        //    that Playwright follows automatically; page.goto() resolves to the
        //    final response after redirects).
        expect(
          response?.status(),
          `${href}: expected HTTP < 400, got ${response?.status()}`,
        ).toBeLessThan(400);

        // Allow the page to settle after any client-side redirects.
        await page.waitForLoadState("domcontentloaded");

        // 2. Must NOT be the branded not-found page.
        await expect(
          page.getByText(/no encontramos esta página/i),
          `${href}: rendered branded 404 ("No encontramos esta página")`,
        ).not.toBeVisible();

        // 3. Must NOT be an error boundary.
        //    Next.js production error boundary: "Application error" (English).
        //    App-level boundary: "Algo salió mal" (es-AR copy).
        await expect(
          page.getByText(/application error/i),
          `${href}: Next.js error boundary visible ("Application error")`,
        ).not.toBeVisible();

        await expect(
          page.getByText(/algo salió mal/i),
          `${href}: app error boundary visible ("Algo salió mal")`,
        ).not.toBeVisible();

        // 4. Operator shell rendered — at least one of: a <main> landmark,
        //    a <h1>, or the side-rail nav is present.
        //    We use a broad locator so layout variations (full sidebar vs
        //    collapsed mobile drawer) all pass.
        await expect(
          page.locator("main, h1, [data-testid='op-shell'], nav").first(),
          `${href}: no shell landmark rendered (main/h1/nav absent)`,
        ).toBeVisible({ timeout: 10_000 });
      });
    }

    // Bonus: assert the CSV export endpoint responds text/csv when the role is
    // govt (it lives under /gob/analytics/export and is a GET endpoint).
    // We use page.request to avoid a full navigation and check Content-Type.
    // Skips cleanly when not running under the govt role.
    if (role === "govt") {
      test(`${role}: /gob/analytics/export → text/csv response`, async ({ page }) => {
        // Ensure we are authenticated (beforeEach already ran loginAsOperator).
        const exportUrl = "/gob/analytics/export";

        // Use page.request (inherits the session cookies from the browser context).
        const response = await page.request.get(exportUrl);

        // Must not be a 4xx / 5xx.
        expect(
          response.status(),
          `/gob/analytics/export: expected HTTP < 400, got ${response.status()}`,
        ).toBeLessThan(400);

        // Content-Type must be text/csv (or start with it; servers may append charset).
        const contentType = response.headers()["content-type"] ?? "";
        expect(
          contentType,
          `/gob/analytics/export: expected text/csv Content-Type, got "${contentType}"`,
        ).toMatch(/text\/csv/i);
      });
    }
  });
}
