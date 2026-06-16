import { expect, test } from "@playwright/test";

/**
 * Authentication e2e tests.
 *
 * Uses the OWNER account seeded by `pnpm db:bootstrap` → `pnpm seed:test`.
 * Credentials are the fixed test-data values from scripts/seed-test-users.ts:
 *   email:    owner@dim.test
 *   password: Test1234!
 *
 * The suite uses Playwright's storageState to avoid re-logging in on every
 * test in downstream specs. The saved state file lives in e2e/.auth/ and is
 * git-ignored.
 */

const OWNER_EMAIL = "owner@dim.test";
const OWNER_PASSWORD = "Test1234!";

test.describe("login flow", () => {
  test("owner can log in and lands on /inicio", async ({ page }) => {
    await page.goto("/login");

    // Fill credentials.
    await page.getByLabel(/correo electrónico/i).fill(OWNER_EMAIL);
    await page.getByLabel(/contraseña/i).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    // After successful login the app redirects to /inicio.
    await page.waitForURL(/\/inicio/, { timeout: 15_000 });
    expect(page.url()).toContain("/inicio");

    // No error visible.
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(page.getByText(/correo o contraseña incorrectos/i)).not.toBeVisible();
  });
});
