import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

// Task #50 verification: /cuenta must render its content (not stay on the
// "Cargando…" loading skeleton), and "Cerrar sesión" must be reachable from the
// global chrome (avatar menu) — independent of /cuenta rendering.

test("owner /cuenta renders content, not the Cargando… skeleton", async ({ page }) => {
  await loginAs(page, ACCOUNTS.owner);
  await page.goto("/cuenta");

  // The page heading proves the RSC resolved (loading.tsx renders no <h1>).
  await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible({
    timeout: 6_000,
  });
  await expect(page.getByText("Datos de la cuenta")).toBeVisible();

  // The loading skeleton's sr-only "Cargando…" text must be gone.
  await expect(page.locator('output[aria-label="Cargando…"]')).toHaveCount(0);
});

test("vet org-admin (alejo) /cuenta renders after the org-selector path", async ({ page }) => {
  await loginAs(page, ACCOUNTS.vetOrgAdmin);
  // Reproduce the reported recovery path: enter via /org then land on /cuenta.
  await page.goto("/org").catch(() => {});
  await page.goto("/cuenta");
  await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible({
    timeout: 6_000,
  });
});

test("Cerrar sesión is reachable from the masthead avatar menu", async ({ page }) => {
  await loginAs(page, ACCOUNTS.owner);
  await page.goto("/inicio");

  // Open the avatar menu in the global chrome (not /cuenta).
  await page.getByRole("button", { name: "Menú de cuenta" }).click();
  const logout = page.getByRole("menuitem", { name: "Cerrar sesión" });
  await expect(logout).toBeVisible();

  // Actually sign out and confirm we leave the authenticated area.
  await logout.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/inicio"), { timeout: 15_000 });
});
