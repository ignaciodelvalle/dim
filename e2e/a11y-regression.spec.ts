import AxeBuilder from "@axe-core/playwright";
import { type Browser, type Page, expect, test } from "@playwright/test";

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

// The pet under test is READ FROM owner@dim.test's OWN REGISTRY, never
// hardcoded.
//
// This is the third time a literal token has rotted here. DIM-B4KS-KWZA went
// first (clickthrough review 2026-07-09); its replacement DIM-DEMO-0001 comes
// from scripts/seed-owner-demo.ts, which CI does not run — `pnpm db:bootstrap`
// stops at scripts/seed-test-users.ts — so on a freshly bootstrapped database
// the token resolves to nothing.
//
// The failure mode is worse than a red test: a not-found page is a SMALL, CLEAN
// page, so axe finds zero violations on it and the two scans below reported
// "critical=0 serious=0" while scanning nothing at all. CI printed exactly that
// for /p/DIM-DEMO-0001 and /mis-mascotas/DIM-DEMO-0001 on 2026-07-30 — a green
// a11y gate over a 404. Only the keyboard test failed, because it is the one
// that reaches for a real control.
//
// Hence both changes here: resolve the token at runtime AND assert the page is
// not the not-found boundary before handing it to axe.
let cachedPetToken: string | null = null;

async function petToken(browser: Browser): Promise<string> {
  if (cachedPetToken) return cachedPetToken;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginAs(page, ACCOUNTS.owner);
    await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    // Anchored on the `DIM-` prefix so this cannot pick up the registry's
    // sibling routes (/nueva, /reclamar, /postulaciones). The token shape is
    // invariant #1 — see lib/domain/dim-token.ts.
    const link = page.locator('a[href^="/mis-mascotas/DIM-"]').first();
    await expect(link, "owner@dim.test must own at least one pet").toBeVisible();
    const token = ((await link.getAttribute("href")) ?? "").split("/mis-mascotas/")[1] ?? "";
    expect(token, "pet token parsed from the owner registry link").toBeTruthy();
    cachedPetToken = token.split(/[?#]/)[0];
    return cachedPetToken;
  } finally {
    await context.close();
  }
}

/**
 * Refuse to scan a page that is not the page under test.
 *
 * axe on a not-found (or crashed) route returns a clean bill of health, so
 * without this every token drift downgrades an assertion into a decoration.
 */
async function assertRealPage(page: Page, route: string): Promise<void> {
  await expect(page.getByText(/application error/i), `${route}: app crashed`).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: /no encontramos esta página/i }),
    `${route}: rendered the not-found boundary — axe would scan a 404 and pass vacuously`,
  ).toHaveCount(0);
}

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

  test("public credential /p/[token] — no serious/critical", async ({ page, browser }) => {
    const token = await petToken(browser);
    await page.goto(`/p/${token}`);
    await page.waitForLoadState("networkidle");
    await assertRealPage(page, `/p/${token}`);
    assertAxeClean(`/p/${token}`, await analyze(page));
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
    await assertRealPage(page, "/inicio");
    assertAxeClean("/inicio", await analyze(page));
  });

  test("pet profile /mis-mascotas/[token] — no serious/critical", async ({ page, browser }) => {
    const token = await petToken(browser);
    await page.goto(`/mis-mascotas/${token}`);
    await page.waitForLoadState("networkidle");
    await assertRealPage(page, `/mis-mascotas/${token}`);
    assertAxeClean(`/mis-mascotas/${token}`, await analyze(page));
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation — pet-profile single flip control (tarjeta-todo: the
// Credencial/Libreta tablist is gone; the band "Girar" button is the ONLY
// switcher and must carry the full keyboard contract).
// ---------------------------------------------------------------------------

test.describe("a11y regression — pet-profile flip keyboard nav", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner);
  });

  test("the band Girar button is keyboard-operable, toggles aria-pressed, and moves focus to the shown face", async ({
    page,
    browser,
  }) => {
    const token = await petToken(browser);
    await page.goto(`/mis-mascotas/${token}`);
    await page.waitForLoadState("networkidle");
    await assertRealPage(page, `/mis-mascotas/${token}`);

    // No tablist remains — the band button is the single switcher (history:
    // removed by decision #645, restored by the July redesign, removed again).
    await expect(page.getByRole("tablist", { name: /cara del documento/i })).toHaveCount(0);

    const turnToLibreta = page.getByRole("button", { name: "Girar a Libreta" });
    await expect(turnToLibreta, "band turn button present").toBeVisible();
    await expect(turnToLibreta).toHaveAttribute("aria-pressed", "false");

    // Keyboard-only activation: focus the button and press Enter — the card
    // flips (?tab=libreta) and focus lands on the newly-shown back face.
    await turnToLibreta.focus();
    await expect(turnToLibreta).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]tab=libreta\b/);
    await expect(page.locator("#pet-face-libreta")).toBeFocused();

    // The back-face button announces the toggled state and flips back.
    const turnToCredencial = page.getByRole("button", { name: "Girar a Credencial" });
    await expect(turnToCredencial).toHaveAttribute("aria-pressed", "true");
    await turnToCredencial.focus();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/[?&]tab=libreta\b/);
    await expect(page.locator("#pet-face-credencial")).toBeFocused();
  });
});
