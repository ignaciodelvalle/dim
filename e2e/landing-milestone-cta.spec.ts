// Milestone "Continuar ↓" CTA — landing progressive-reveal choreography
// (PO-approved design 2026-08-02).
//
// ⚠ INTEGRATION-RUN SPEC: written in the worktree, EXECUTED AT INTEGRATION
// against the running production server (same harness as
// landing-signin-reachable.spec.ts / public-smoke.spec.ts) — an isolated
// worktree has no server to point playwright at.
//
// What it guards, and why these exact assertions:
//   1. The CTA is VISIBLE at 390px (the most common width in Argentina) and
//      at 1440px, and carries a proper accessible name (role=button +
//      aria-label that CONTAINS the visible "Continuar" — WCAG 2.5.3).
//   2. It NEVER intersects the sticky nav's /login and /signup CTAs. The
//      landing's hardest-won guarantee is the 320–561px sign-in entry point
//      (e2e/landing-signin-reachable.spec.ts, defect D.7) — a new floating
//      control must be provably incapable of sitting on top of it. The CTA is
//      fixed BOTTOM-right precisely because the nav owns the TOP of the
//      viewport at every width.
//   3. It introduces no horizontal scroll (same clause the sign-in spec
//      enforces — a fixed right-anchored pill must not widen the document).
//   4. It disappears past the last milestone (Empezar), leaving the FAQ and
//      footer unobstructed.

import { expect, test } from "@playwright/test";

const CTA_NAME = /^Continuar a la próxima sección: /;

// 390 = most common width in Argentina; 1440 = common desktop.
for (const width of [390, 1440]) {
  test(`milestone CTA is visible, named, and clear of the nav CTAs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const cta = page.getByRole("button", { name: CTA_NAME });
    await expect(cta, `milestone CTA missing or unnamed at ${width}px`).toBeVisible();

    const ctaBox = await cta.boundingBox();
    expect(ctaBox, "milestone CTA has no bounding box").not.toBeNull();
    expect(
      ctaBox?.height ?? 0,
      `milestone CTA is only ${Math.round(ctaBox?.height ?? 0)}px tall`,
    ).toBeGreaterThanOrEqual(44);

    // Never on top of the nav's sign-in / signup CTAs (the D.7 guarantee).
    for (const sel of ['header a[href="/login"]', 'header a[href="/signup"]']) {
      const navBox = await page.locator(sel).first().boundingBox();
      expect(navBox, `${sel} has no bounding box at ${width}px`).not.toBeNull();
      if (!ctaBox || !navBox) continue;
      const intersects = !(
        ctaBox.x >= navBox.x + navBox.width ||
        navBox.x >= ctaBox.x + ctaBox.width ||
        ctaBox.y >= navBox.y + navBox.height ||
        navBox.y >= ctaBox.y + ctaBox.height
      );
      expect(intersects, `milestone CTA overlaps ${sel} at ${width}px`).toBe(false);
    }

    // No sideways scroll (1px slack for sub-pixel rounding, as in D.7's spec).
    const scrollsSideways = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth > 1;
    });
    expect(scrollsSideways, `the landing scrolls horizontally at ${width}px`).toBe(false);
  });
}

test("milestone CTA hides at the last milestone; FAQ and footer stay unobstructed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: CTA_NAME })).toBeVisible();

  await page.locator("#empezar").scrollIntoViewIfNeeded();
  // Playwright treats "not attached" as hidden — the component unmounts it.
  await expect(page.getByRole("button", { name: CTA_NAME })).toBeHidden();

  // The out-of-sequence tail is still plain scroll territory.
  await expect(page.locator("#faq")).toBeAttached();
  await expect(page.locator("footer").first()).toBeAttached();
});

test("milestone CTA advances to the next milestone on click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const cta = page.getByRole("button", { name: CTA_NAME });
  await expect(cta).toHaveAccessibleName(/Emergencias, sin cuenta/);

  await cta.click();
  // The crisis band ends up at/near the sticky-nav offset; the CTA relabels to
  // the milestone after it once the scroll settles.
  await expect(cta).toHaveAccessibleName(/El vínculo/, { timeout: 5_000 });
});
