import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * A11y e2e tests for operator + authenticated surfaces (Wave 2 Item 11).
 *
 * Scope:
 *   - /gob, /admin, /org/*  — require institutional role (govt/admin) or
 *     org membership. The seeded test DB only has `owner@dim.test` (personal
 *     role=owner), so these routes redirect to / or /mis-mascotas. We axe-test
 *     the REDIRECT TARGET because the browser always lands on that page, and
 *     that page must be axe-clean.
 *   - /anotar — accessible to any authenticated owner.
 *
 * WS-C (2026-07-01): authenticated axe passes for /admin and /gob added below,
 * using the seeded admin@dim.test and govt@dim.test accounts. They assert no
 * critical/serious WCAG 2.1 AA violations (the WS-C acceptance bar). These run
 * in the Playwright CI job (not `pnpm verify`); if they surface violations, that
 * is the operator-a11y fix worklist (June U1: table semantics + color-only
 * status). /org/[orgToken] authenticated coverage still needs org-token
 * resolution — tracked as a follow-up.
 */

const OWNER_EMAIL = "owner@dim.test";
const OWNER_PASSWORD = "Test1234!";

// Institutional accounts seeded by scripts/seed-test-users.ts.
const ADMIN_EMAIL = "admin@dim.test";
const GOVT_EMAIL = "govt@dim.test";
const SHARED_PASSWORD = "Test1234!";

// Authenticated operator landings + their login account. axe asserts no
// critical/serious violations (WS-C bar); color-contrast is validated via tokens.
const AUTHED_OPERATOR_ROUTES = [
  { path: "/admin", email: ADMIN_EMAIL, landing: /\/admin/ },
  { path: "/gob", email: GOVT_EMAIL, landing: /\/gob/ },
] as const;

test.describe("authenticated operator surfaces — axe-clean (WCAG 2.1 AA, WS-C)", () => {
  for (const { path, email, landing } of AUTHED_OPERATOR_ROUTES) {
    test(`a11y(axe) ${path} authenticated — no critical/serious`, async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/correo electrónico/i).fill(email);
      await page.getByLabel(/contraseña/i).fill(SHARED_PASSWORD);
      await page.getByRole("button", { name: /iniciar sesión/i }).click();
      // Institutional accounts land on their portal (not /inicio).
      await page.waitForURL(landing, { timeout: 15_000 }).catch(() => {});

      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/application error/i)).not.toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .disableRules(["color-contrast"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, `${path}: ${blocking.map((v) => v.id).join(", ")}`).toEqual([]);
    });
  }
});

// These operator routes redirect non-privileged owners. The redirect destination
// (/ for admin, /mis-mascotas for gob) must be axe-clean.
const OPERATOR_REDIRECT_SOURCES = [
  { path: "/admin", redirectPattern: /^\/$/ },
  { path: "/gob", redirectPattern: /\/mis-mascotas/ },
] as const;

test.describe("operator routes — redirect targets are axe-clean (WCAG 2.1 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill(OWNER_EMAIL);
    await page.getByLabel(/contraseña/i).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/inicio/, { timeout: 15_000 });
  });

  for (const { path, redirectPattern } of OPERATOR_REDIRECT_SOURCES) {
    test(`a11y(axe) ${path} redirect target — WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(path);

      // Wait for the redirect to settle.
      await page.waitForURL(
        (url) => redirectPattern.test(url.pathname) || !url.pathname.startsWith(path),
        { timeout: 10_000 },
      );
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .disableRules(["color-contrast"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

// /anotar is accessible to any authenticated owner (no institutional role needed).
test.describe("owner route /anotar — axe-clean (WCAG 2.1 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo electrónico/i).fill(OWNER_EMAIL);
    await page.getByLabel(/contraseña/i).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/inicio/, { timeout: 15_000 });
  });

  test("a11y(axe) /anotar — WCAG 2.1 AA (no critical violations)", async ({ page }) => {
    // /anotar requires a petToken — without one it may redirect or show a picker.
    // Navigate and let the page settle.
    await page.goto("/anotar");
    await page.waitForLoadState("networkidle");

    // The page must load without a 500.
    await expect(page.getByText(/application error/i)).not.toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
