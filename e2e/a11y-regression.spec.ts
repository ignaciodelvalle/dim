import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

/**
 * A11y REGRESSION ARMOR (capstone readiness gap) — axe-core + keyboard nav.
 *
 * Runs axe against the four highest-traffic surfaces the product cannot ship
 * broken: the public landing (/), a public pet credential (/p/[token]), and two
 * authenticated owner screens (/inicio, the pet profile). Asserts ZERO
 * serious/critical WCAG 2.1 AA violations per route. `color-contrast` is
 * disabled here (validated separately via the design-token linter), matching
 * the sibling e2e/a11y-operator-auth.spec.ts.
 *
 * Any pre-existing serious/critical violation must be added to that route's
 * `allow` list WITH A REASON — it is NOT silently swallowed: every run prints
 * the full per-impact violation count for every route, so a regression that
 * lands inside the allowlist is still visible in CI logs.
 *
 * Plus a keyboard-navigation check on the pet-profile Credencial/Libreta tabs
 * (WAI-ARIA tabs pattern): the tablist is reachable by Tab (roving tabindex),
 * Arrow keys rove + activate, and Enter on a tab flips the credential face.
 */

// Seeded by scripts/seed-demo.ts. DIM-DEMO-0001 (Rocco) is owner@dim.test's
// first pet — active, so the profile renders the Credencial/Libreta flip; its
// public credential lives at /p/<token>. (The prior token DIM-B4KS-KWZA no
// longer exists in the demo seed, so every assertion below silently ran against
// a 404 page — clickthrough review 2026-07-09.)
const PET_TOKEN = "DIM-DEMO-0001";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"] as const;

type AxeResult = Awaited<ReturnType<AxeBuilder["analyze"]>>;

/** Run axe on the current page, WCAG A/AA, color-contrast disabled. */
async function analyze(page: Page): Promise<AxeResult> {
  return new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .disableRules(["color-contrast"])
    .analyze();
}

/**
 * Assert no NON-allowlisted serious/critical violations, and ALWAYS print the
 * per-impact counts so an allowlisted regression is still visible in the log.
 */
function assertAxeClean(route: string, results: AxeResult, allow: readonly string[] = []): void {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>;
  for (const v of results.violations) byImpact[v.impact ?? "minor"] += 1;
  // Surfaced on every run (see module docblock).
  const allowNote = allow.length ? ` (allowlisted: ${allow.join(", ")})` : "";
  console.log(
    `[a11y] ${route} — violations: critical=${byImpact.critical} serious=${byImpact.serious} moderate=${byImpact.moderate} minor=${byImpact.minor}${allowNote}`,
  );

  const blocking = results.violations.filter(
    (v) => (v.impact === "critical" || v.impact === "serious") && !allow.includes(v.id),
  );
  expect(
    blocking,
    `${route}: unexpected serious/critical axe violation(s): ${blocking
      .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node[s])`)
      .join("; ")}`,
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// Public surfaces (no auth)
// ---------------------------------------------------------------------------

test.describe("a11y regression — public surfaces (axe, WCAG 2.1 AA)", () => {
  test("landing / — no serious/critical", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    assertAxeClean("/", await analyze(page));
  });

  test(`public credential /p/${PET_TOKEN} — no serious/critical`, async ({ page }) => {
    await page.goto(`/p/${PET_TOKEN}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    assertAxeClean(`/p/${PET_TOKEN}`, await analyze(page));
  });
});

// ---------------------------------------------------------------------------
// Authenticated owner surfaces
// ---------------------------------------------------------------------------

test.describe("a11y regression — authenticated owner surfaces (axe, WCAG 2.1 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner);
  });

  test("/inicio — no serious/critical", async ({ page }) => {
    await page.goto("/inicio");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    assertAxeClean("/inicio", await analyze(page));
  });

  test(`pet profile /mis-mascotas/${PET_TOKEN} — no serious/critical`, async ({ page }) => {
    await page.goto(`/mis-mascotas/${PET_TOKEN}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    assertAxeClean(`/mis-mascotas/${PET_TOKEN}`, await analyze(page));
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation — pet-profile Credencial/Libreta tablist (WAI-ARIA tabs)
// ---------------------------------------------------------------------------

test.describe("a11y regression — pet-profile tabs keyboard nav", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner);
  });

  test("Tab reaches the tablist, Arrow roves + activates, Enter flips the face", async ({
    page,
  }) => {
    await page.goto(`/mis-mascotas/${PET_TOKEN}`);
    await page.waitForLoadState("networkidle");

    const tablist = page.getByRole("tablist", { name: /cara del documento/i });
    await expect(tablist, "pet-profile Credencial/Libreta tablist").toBeVisible();

    const credTab = page.locator("#pet-tab-credencial");
    const libTab = page.locator("#pet-tab-libreta");

    // Roving tabindex: only the active tab is in the Tab order (reachable by
    // Tab), the other is -1 — the WAI-ARIA tabs contract.
    await expect(credTab).toHaveAttribute("aria-selected", "true");
    await expect(credTab).toHaveAttribute("tabindex", "0");
    await expect(libTab).toHaveAttribute("tabindex", "-1");

    // Tab reaches the active tab (keyboard-only, no mouse).
    await credTab.focus();
    await expect(credTab).toBeFocused();

    // ArrowRight roves to Libreta AND activates it (roving auto-activation);
    // the credential flips to the Libreta face (?tab=libreta).
    await page.keyboard.press("ArrowRight");
    await expect(libTab).toHaveAttribute("aria-selected", "true");
    await expect(libTab).toHaveAttribute("tabindex", "0");
    await expect(libTab).toBeFocused();
    await expect(page).toHaveURL(/[?&]tab=libreta\b/);

    // Enter on a focused tab flips the face: focus Credencial and press Enter,
    // the credential returns to the Credencial face and ?tab is cleared.
    await credTab.focus();
    await page.keyboard.press("Enter");
    await expect(credTab).toHaveAttribute("aria-selected", "true");
    await expect(page).not.toHaveURL(/[?&]tab=libreta\b/);
  });
});
