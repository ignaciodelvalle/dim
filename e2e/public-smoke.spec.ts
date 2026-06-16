import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Public smoke tests — no auth required.
 *
 * Each test navigates to a public route and asserts:
 *   1. The page returns 200 (navigation succeeds, no 500).
 *   2. No React error boundary / unhandled error is rendered.
 *   3. A meaningful landmark element is visible (page actually rendered).
 *
 * This suite would have caught:
 *   - The /denuncias 404 (route missing).
 *   - A /p-style 500 (server crash before SSR completes).
 *
 * A11y check (WCAG 2.1 AA):
 *   - /denuncias and /denuncias/buscar are checked with axe-core.
 *   - /p/[token] is skipped because it requires a live database token;
 *     testing that route with axe would require seeded data in CI and could
 *     become flaky — test it manually or add a dedicated fixture-based spec.
 */

const PUBLIC_ROUTES = [
  { path: "/", landmark: "main" },
  { path: "/adoptar", landmark: "main" },
  { path: "/perdidas", landmark: "main" },
  { path: "/refugios", landmark: "main" },
  { path: "/denuncias", landmark: "main" },
  { path: "/login", landmark: "main" },
  { path: "/signup", landmark: "main" },
] as const;

for (const { path, landmark } of PUBLIC_ROUTES) {
  test(`${path} → 200 and no error boundary`, async ({ page }) => {
    const response = await page.goto(path);

    // 1. HTTP status must be 2xx (or 3xx redirect that resolves to 2xx).
    expect(response?.status()).toBeLessThan(400);

    // 2. No error boundary visible. Next.js renders a <h2> or <p> with
    //    "Application error" on unhandled server errors in production builds.
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(page.getByText(/internal server error/i)).not.toBeVisible();
    await expect(page.getByText(/this page isn't working/i)).not.toBeVisible();

    // 3. Page rendered a content landmark.
    await expect(page.locator(landmark).first()).toBeVisible();
  });
}

// A11y checks on static public pages (no auth / no dynamic token required).
// Scoped to WCAG 2.1 AA; color-contrast is excluded because design-token
// contrast ratios are validated separately (P-1 in the a11y audit).
const A11Y_ROUTES = ["/denuncias", "/denuncias/buscar"] as const;

for (const path of A11Y_ROUTES) {
  test(`a11y(axe) ${path} — WCAG 2.1 AA (no critical violations)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .disableRules(["color-contrast"]) // contrast validated via design tokens separately
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
