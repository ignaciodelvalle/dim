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

import { type Page, expect, test } from "@playwright/test";

const CTA_NAME = /^Continuar a la próxima sección: /;

/** The scroll-settle bookkeeping the two helpers below share on `window`. */
type SettleState = { ended: boolean; lastY: number; stable: number };
type SettleWindow = Window & { __mnSettle?: SettleState };

/**
 * `window.scrollY` unchanged across this many consecutive animation frames =
 * the page is not moving. Only consulted when `scrollend` never arrives (see
 * `waitForScrollToSettle`), so it is a fallback threshold, not a delay budget:
 * one frame of motion resets it to zero.
 */
const SETTLE_FRAMES = 10;

/**
 * Arm the scroll-settle watcher. Call this BEFORE the action that scrolls —
 * an instant jump can be over before a listener registered afterwards exists,
 * and then nothing would ever report it.
 */
async function armScrollWatcher(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as SettleWindow;
    const state: SettleState = { ended: false, lastY: window.scrollY, stable: 0 };
    w.__mnSettle = state;
    window.addEventListener(
      "scrollend",
      () => {
        state.ended = true;
      },
      { once: true },
    );
  });
}

/**
 * Resolve once the page has provably STOPPED scrolling — the fix for this
 * spec's CI flake (2026-08-05).
 *
 * The click starts a SMOOTH scroll, and `MilestoneNav`'s scroll-spy relabels
 * the CTA from whatever section currently sits above 45% of the viewport. So
 * for the whole flight the accessible name is a moving target that legitimately
 * reads as a NEIGHBOURING milestone; asserting into that window is asserting on
 * an intermediate frame. Nothing about the milestone list changed — this is
 * pure scroll timing.
 *
 * Two independent signals, whichever lands first, both conditions on real page
 * state (no sleeps — `polling: "raf"` samples once per animation frame):
 *   · `scrollend` — the platform's own end-of-scroll event (Chromium 114+),
 *     armed before the click. Two quiet frames after it let the final `scroll`
 *     listener's state update render.
 *   · rAF STABILITY — `scrollY` unchanged across SETTLE_FRAMES consecutive
 *     frames. This carries engines without `scrollend`, and the case where the
 *     click produces NO scroll at all: `scrollToMilestone` jumps instantly when
 *     motion is reduced or the document lacks focus (headless CI), and a jump
 *     that lands where the page already was fires no scroll event to end.
 */
async function waitForScrollToSettle(page: Page): Promise<void> {
  await page.waitForFunction(
    (needed: number) => {
      const s = (window as SettleWindow).__mnSettle;
      if (!s) return false;
      const y = window.scrollY;
      if (y === s.lastY) {
        s.stable += 1;
      } else {
        s.lastY = y;
        s.stable = 0;
      }
      return s.ended ? s.stable >= 2 : s.stable >= needed;
    },
    SETTLE_FRAMES,
    { polling: "raf" },
  );
}

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

/**
 * MilestoneNav.MILESTONES display names, in order. Duplicated (not imported —
 * the module is a "use client" .tsx and this file runs in Playwright's Node
 * runner) so the spec can say "the CTA moved FORWARD" instead of naming one
 * specific milestone. A drift between the two lists fails the lookup below
 * loudly rather than silently weakening the assertion.
 */
const MILESTONE_NAMES = [
  "La credencial",
  "Emergencias, sin cuenta",
  "El vínculo",
  "Una mascota, muchas manos",
  "Cuando no es un buen día",
  "Empezar",
];

/** Position of the milestone a CTA label offers, or -1 if the name is unknown. */
function milestoneIndex(ariaLabel: string | null): number {
  return MILESTONE_NAMES.findIndex((name) => ariaLabel?.endsWith(name));
}

// ⚠ THIS ASSERTION WAS REWRITTEN (2026-08-05) — do not "restore" it to
// `/El vínculo/`.
//
// The old test clicked the CTA and expected the label to become "El vínculo"
// within 5s. It flaked in CI, and measuring the settled page says why: that
// value is NEVER the resting state at 1440×800. Sampled every 50ms through the
// smooth scroll (scrollY 0 → 739):
//
//     y=0    "Emergencias, sin cuenta"
//     y=624  "El vínculo"                ← the only frames the old test passed on
//     y=710  "Una mascota, muchas manos"
//     y=739  "Una mascota, muchas manos" ← settled, and stays there
//
// The click lands #crisis exactly where it aims (top = 84 = the sticky-nav
// offset), but the crisis band is only 163px tall, so #vinculo's top (247) is
// already above the scroll-spy's 45%-of-viewport line (360) — active becomes
// `vinculo` and the CTA offers `idea`. The CTA skips one milestone. That is a
// PRODUCT question about the 45% rule against a short section, raised with the
// PO separately; it is emphatically not something a test should hide by
// asserting an intermediate frame of the animation.
//
// So the contract asserted here is the one the CTA actually owns and that no
// section height can invalidate: the page goes where the button said it would,
// and the affordance moves FORWARD.
test("milestone CTA scrolls to the milestone it names and advances past it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const cta = page.getByRole("button", { name: CTA_NAME });
  await expect(cta).toHaveAccessibleName(/Emergencias, sin cuenta/);
  const from = milestoneIndex(await cta.getAttribute("aria-label"));
  expect(from, "the CTA opens on a milestone this spec knows by name").toBeGreaterThanOrEqual(0);

  await armScrollWatcher(page);
  await cta.click();
  await waitForScrollToSettle(page);

  // (1) The click did what it named: the crisis band is parked under the
  // sticky nav (NAV_OFFSET_PX = 84 in MilestoneNav; bounded loosely so a nav
  // height tweak is not a false failure).
  const crisisTop = await page
    .locator("#crisis")
    .evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(crisisTop, "the CTA did not park #crisis under the sticky nav").toBeGreaterThanOrEqual(0);
  expect(crisisTop, "the CTA did not park #crisis under the sticky nav").toBeLessThanOrEqual(120);

  // (2) The affordance advanced. `expect.poll` covers the React render tick
  // after the final scroll event — the scroll itself is already settled.
  await expect
    .poll(async () => milestoneIndex(await cta.getAttribute("aria-label")), { timeout: 5_000 })
    .toBeGreaterThan(from);
});
