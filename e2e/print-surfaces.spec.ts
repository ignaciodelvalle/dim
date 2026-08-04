import { expect, test } from "@playwright/test";

/**
 * Print-surface regression armor (print-surfaces audit, 2026-08-04).
 *
 * WHY THIS FILE EXISTS. Before it, `emulateMedia` appeared ZERO times in the
 * repo: nothing anywhere asserted how this product looks on paper. That is why
 * the poster defect survived — the lost-pet poster printed its headline
 * "PERDIDO" as white text on a colour block, and browsers default to
 * `print-color-adjust: economy` (Chrome's "Background graphics" checkbox is OFF
 * by default), so the background dropped and the single most important word on
 * the page printed white-on-white. Nobody saw it, because nobody sees a print
 * surface on screen.
 *
 * WHAT THESE TESTS CAN AND CANNOT DO. `emulateMedia({ media: "print" })` makes
 * the browser apply `@media print` rules, so we CAN assert which rules won. We
 * CANNOT observe the actual ink dropout: `print-color-adjust` does not change
 * `getComputedStyle().backgroundColor` — it changes what the print pipeline
 * does with it. So these tests assert the MECHANISM (is the opt-out declared on
 * the elements whose meaning depends on colour?) rather than the pixels. That
 * is the right fence anyway: the mechanism is what regressed.
 *
 * Conventions per e2e/README.md — tokens discovered at runtime, never
 * hardcoded; `test.skip` (not fail) when CI's fresh-seed DB lacks a fixture.
 */

/** Elements carrying light text on a solid colour must opt out of ink saving. */
async function printColorAdjustOf(page: import("@playwright/test").Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      // Chromium exposes the unprefixed property; keep the prefixed read as a
      // fallback so this does not silently return "" on other engines.
      return (
        cs.getPropertyValue("print-color-adjust") ||
        cs.getPropertyValue("-webkit-print-color-adjust")
      );
    });
}

test.describe("print surfaces keep the meaning that lives in colour", () => {
  test("the public credential opts out of ink saving under print media", async ({ page }) => {
    // Discover a real token from the public adoption listing (same convention
    // as crisis-public.spec.ts — never a hardcoded DB id).
    await page.goto("/adoptar");
    await page.waitForLoadState("networkidle").catch(() => {});
    const petLink = page.locator('a[href^="/adoptar/DIM"]').first();
    test.skip((await petLink.count()) === 0, "No adoptable pets seeded — no credential to print.");

    const href = await petLink.getAttribute("href");
    const token = (href ?? "").split("/").filter(Boolean).pop();
    test.skip(!token, "Could not derive a public token from the adoption listing.");

    await page.goto(`/p/${token}`);
    await expect(page.locator(".pc-cred")).toBeVisible();

    await page.emulateMedia({ media: "print" });

    // The situation chip is the SINGLE textual carrier of the pet's state since
    // the pet-state standardization (PO 2026-07-16) — the `.ln-sit` status line
    // was deliberately removed. For a lost pet the chip is white-on-red, so
    // without this opt-out a printed credential says nowhere that the pet is
    // lost. Asserted on the credential root, which is where the rule is scoped.
    expect(await printColorAdjustOf(page, ".pc-cred")).toBe("exact");
  });

  test("the sticky action bar does not print over the credential", async ({ page }) => {
    await page.goto("/adoptar");
    await page.waitForLoadState("networkidle").catch(() => {});
    const petLink = page.locator('a[href^="/adoptar/DIM"]').first();
    test.skip((await petLink.count()) === 0, "No adoptable pets seeded — no credential to print.");

    const href = await petLink.getAttribute("href");
    const token = (href ?? "").split("/").filter(Boolean).pop();
    test.skip(!token, "Could not derive a public token from the adoption listing.");

    await page.goto(`/p/${token}`);
    // The bar is mobile-only (`sm:hidden`), so give it a viewport where it
    // renders at all — otherwise this test would pass for the wrong reason.
    await page.setViewportSize({ width: 390, height: 780 });
    const bar = page.locator('[data-section="sticky-action-bar"]');
    test.skip((await bar.count()) === 0, "Action bar not rendered for this pet's state.");

    await page.emulateMedia({ media: "print" });

    // `position: fixed` + `bottom: 0` reprints the bar on top of the credential
    // on every page. credential-print.css hides `.no-print` under print media.
    await expect(bar.first()).toBeHidden();
  });
});

test.describe("print surfaces are not clipped by the operator shell", () => {
  // PRN-3, CONFIRMED by the PO on 2026-08-04: printing /gob/maltrato/<id> from
  // a full page tab produces a PDF cut off at roughly one page. The mechanism:
  // expediente-print.css escapes the shell with `position: absolute`, but its
  // nearest POSITIONED ancestor is AppShell's `fixed inset-0 … overflow-hidden`
  // wrapper, so the print root never leaves that viewport-height clipping box —
  // `visibility: hidden` on siblings does not remove an ancestor's overflow.
  //
  // Written now and skipped on purpose: the fix is a shell restructuring, not a
  // stylesheet tweak, and a spec that fails is a red CI rather than a fence.
  // Flip `.fixme` to a live test in the same commit that lands the fix — the
  // assertion below is the one that would have caught it.
  test.fixme("the expediente print root has no clipping ancestor", async ({ page }) => {
    await page.goto("/gob/denuncias?etapa=triage");
    const row = page.locator('a[href^="/gob/maltrato/"]').first();
    test.skip((await row.count()) === 0, "No welfare reports seeded — nothing to print.");

    const href = await row.getAttribute("href");
    await page.goto(href ?? "");
    await page.emulateMedia({ media: "print" });

    const clipped = await page
      .locator("[data-print-root]")
      .first()
      .evaluate((el) => {
        let node: HTMLElement | null = el.parentElement;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          const hidesOverflow = cs.overflow === "hidden" || cs.overflowY === "hidden";
          const boundsHeight = cs.position === "fixed" || cs.height.endsWith("vh");
          if (hidesOverflow && boundsHeight) return true;
          node = node.parentElement;
        }
        return false;
      });

    expect(clipped, "an ancestor clips the print root to viewport height").toBe(false);
  });
});
