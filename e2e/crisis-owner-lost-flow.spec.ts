import { expect, test } from "@playwright/test";
import { ACCOUNTS, loginAs } from "./demo/_helpers";

/**
 * Crisis path — AUTHENTICATED owner flow.
 *
 * Drives the real "Marcar como perdida" wizard as owner@dim.test, then
 * verifies — from a FRESH browser context with no session (a real stranger)
 * — that the public credential flips to the lost state and only discloses
 * what the owner explicitly opted into.
 *
 * The pet + token are discovered at runtime from /mis-mascotas — never
 * hardcoded. seed-test-users.ts seeds Firulais/Michi/Atún, but that seed
 * only runs its `seedOwnerPets` step when the owner has NO pets yet, so a
 * local dev DB layered with other seed/demo scripts can give owner@dim.test
 * a completely different pet set. We pick the first pet whose registry row
 * shows the REGISTRADO/REGISTRADA status flag (i.e. not already lost or
 * deceased). The flag agrees with the animal's sex, so the locator must be
 * sex-agnostic — matching only /registrada/i would silently skip every male
 * and every unknown-sex pet, and "skipped" reads as "passed" in CI.
 * the LnRegRow badge rendered by app/(app)/mis-mascotas/page.tsx.
 *
 * The wizard is driven ADAPTIVELY: the "enriched details" step only exists
 * when the picked pet has neither a microchip nor a tattoo (MarkLostWizard's
 * `showDetailsStep`), so the flow checks for it instead of assuming a fixed
 * step count.
 *
 * Location is left empty on purpose: setPetLostAction
 * (src/modules/events/actions.ts) treats location as optional server-side.
 * Skipping it keeps the run fast and avoids depending on the live Nominatim
 * geocoder that LocationFields mode="l2" calls out to.
 *
 * Cleanup: the pet is reverted to "found" (?sheet=marcar-encontrada →
 * Confirmar) in a `finally` block regardless of pass/fail, so the local dev
 * DB is left as it started for other suites / manual QA.
 */

test("owner marks a pet lost — public credential flips to lost state for a stranger", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);

  await loginAs(page, ACCOUNTS.owner);

  // Discover an active (non-lost, non-deceased) pet from the owner's own
  // registry — any will do, we just need one currently NOT lost.
  await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // `:has(img)` because the name is read from the photo's alt below, and a pet
  // without a photo renders a placeholder instead of an <img> — the locator
  // then waits out the whole test budget on an element that will never exist.
  // Hit while running this suite repeatedly: e2e/create-pet.spec.ts adds a
  // photo-less pet to THIS SAME owner on every run and never cleans it up, so
  // the newest card is progressively more likely to be one of those. A fresh CI
  // database happens not to show it; a developer's does, quickly.
  const petLink = page
    .locator('a[href^="/mis-mascotas/"]:has(img)', { hasText: /registrad[ao]/i })
    .first();
  test.skip(
    (await petLink.count()) === 0,
    "owner@dim.test has no active (non-lost) pet — skipping mark-lost flow.",
  );
  const href = await petLink.getAttribute("href");
  const token = (href ?? "").split("/mis-mascotas/")[1];
  expect(token, "publicToken parsed from registry link").toBeTruthy();
  const petName = (await petLink.locator("img").getAttribute("alt")) ?? "";
  expect(petName, "pet name parsed from registry photo alt").toBeTruthy();

  try {
    await page.goto(`/mis-mascotas/${token}/perdida`, { waitUntil: "domcontentloaded" });
    await expect(
      // Sex-flexed since the ciclo-perdido sweep — tolerate all forms.
      page.getByRole("heading", { name: /^Marcar como perdid(?:o|a|o\/a)$/ }),
    ).toBeVisible();

    // Step 1 — ¿Dónde la viste? Location is optional — skip straight through.
    await page.getByRole("button", { name: /^continuar →$/i }).click();

    // Step 2 — Datos para reconocerla — ONLY present when the pet has no
    // microchip and no tattoo (MarkLostWizard's `showDetailsStep`). Detect
    // it instead of assuming a fixed step count.
    const hasDetailsStep = await page
      .getByText(/sin chip ni tatuaje, estos detalles son clave/i)
      .isVisible()
      .catch(() => false);
    if (hasDetailsStep) {
      await page.getByRole("button", { name: /^continuar →$/i }).click();
    }

    // Final step — Qué se muestra al público (affirmative-consent disclosure).
    // Enable ONLY the phone channel; leave name + last-seen location off.
    await expect(page.getByText(/qué se muestra al público/i)).toBeVisible();
    await page.getByRole("switch", { name: "Tu teléfono" }).click();
    await page.getByRole("button", { name: /^marcar como perdid(?:o|a|o\/a)$/i }).click();

    await expect(
      page.getByText(new RegExp(`activamos la búsqueda de ${petName}`, "i")),
    ).toBeVisible({
      timeout: 15_000,
    });

    // ---- Verify as a STRANGER — brand-new context, zero cookies/session. ----
    const strangerContext = await browser.newContext();
    try {
      const strangerPage = await strangerContext.newPage();
      const response = await strangerPage.goto(`/p/${token}`);
      expect(response?.status()).toBeLessThan(400);

      const banner = strangerPage.locator('[data-section="lost-urgent-strip"]');
      await expect(banner).toBeVisible();
      // Headline is sex-dependent (lostBannerHeadline): "ESTÁ PERDIDO" (male),
      // "ESTÁ PERDIDA" (female) or "SE PERDIÓ" (unknown) — match any variant.
      await expect(banner).toContainText(/perdid[oa]|se perdió/i);
      await expect(strangerPage.getByText(new RegExp(`soy ${petName}`, "i"))).toBeVisible();

      // Disclosed channel: the call CTA is present (phone was enabled).
      await expect(strangerPage.getByRole("link", { name: /llamar/i })).toBeVisible();

      // NOT disclosed: no last-seen location section renders (both the
      // location field and its disclosure toggle were left off).
      await expect(strangerPage.getByText(/última vez vista/i)).not.toBeVisible();
    } finally {
      await strangerContext.close();
    }
  } finally {
    // Revert the pet to "found" so re-runs and other suites see it active again.
    await page
      .goto(`/mis-mascotas/${token}?sheet=marcar-encontrada`, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    const confirmBtn = page.getByRole("button", { name: /^confirmar$/i });
    if (await confirmBtn.count().catch(() => 0)) {
      await confirmBtn.click().catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }
});
