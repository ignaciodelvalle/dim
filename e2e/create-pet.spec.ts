import { expect, test } from "@playwright/test";

/**
 * Create-pet happy-path e2e.
 *
 * Logs in as the seeded OWNER, navigates to /mis-mascotas/nueva, fills the
 * MinimalNewPetForm (name + species chip + sex radio + location), submits,
 * and asserts the new pet appears in /mis-mascotas.
 *
 * This flow regressed before (create-pet broke silently in staging). This
 * test would have caught it at the browser-rendering layer.
 *
 * Fields driven by MinimalNewPetForm (components/MinimalNewPetForm.tsx):
 *   - name       → text input labelled "Nombre"
 *   - species    → chip button "Perro/a" sets hidden input name="species"
 *   - sex        → radio group, value "male"/"female"/"unknown"
 *   - location   → LocalityPickerAcross autocomplete → hidden localityName
 *
 * The location step is the previously-broken piece: the form validates that
 * localityName is filled before submitting. We type a well-known locality and
 * pick the first autocomplete suggestion.
 */

const OWNER_EMAIL = "owner@dim.test";
const OWNER_PASSWORD = "Test1234!";

// Unique name to assert in the list afterwards.
const PET_NAME = `E2EPet-${Date.now()}`;

// Re-enabled after stabilizing the locality step (previously test.fixme): the
// old version clicked the dropdown button, but LocalityPickerAcross selects on
// mousedown and immediately unmounts the list (setOpen(false)), so Playwright's
// click raced against the element detaching. We now wait for the debounced
// search results to render, then select with the keyboard (Enter), which the
// component's key handler turns into a selection without a click/detach race.
test("owner creates a pet with location and it appears in /mis-mascotas", async ({ page }) => {
  // -- Log in -----------------------------------------------------------
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(OWNER_EMAIL);
  await page.getByLabel(/contraseña/i).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/inicio/, { timeout: 15_000 });

  // -- Navigate to new-pet form -----------------------------------------
  await page.goto("/mis-mascotas/nueva");
  await expect(page.getByRole("heading", { name: /nueva mascota/i })).toBeVisible();

  // -- Name -------------------------------------------------------------
  await page.getByLabel(/nombre/i).fill(PET_NAME);

  // -- Species: click the "Perro/a" chip --------------------------------
  await page.getByRole("button", { name: /perro\/a/i }).click();

  // -- Sex: pick "Macho" radio ------------------------------------------
  await page.getByRole("radio", { name: /macho/i }).check();

  // -- Location: type a locality and pick the first autocomplete result --
  // LocalityPickerAcross (components/LocalityPickerAcross.tsx) debounces 200ms,
  // calls searchLocalitiesAction, and renders results as <ul><li><button>.
  // Selection fires on mousedown (to beat the input's onBlur).
  const localityInput = page.getByPlaceholder(/Palermo/i);
  await localityInput.fill("Palermo");

  // Wait for the debounced search to resolve and the option to render. This
  // also guarantees the dropdown is open, so Enter is captured by the
  // component's key handler (which preventDefaults) instead of submitting.
  const firstOption = page
    .locator("li button")
    .filter({ hasText: /Palermo/i })
    .first();
  await expect(firstOption).toBeVisible({ timeout: 15_000 });

  // Select the first suggestion via the keyboard — no mouse, so no race with
  // the mousedown handler that unmounts the dropdown.
  await localityInput.press("Enter");

  // Confirm the picker captured a locality before submitting (the form has a
  // required-locality guard); fails here with a clear message if selection
  // didn't take, instead of a confusing redirect timeout later.
  await expect(page.locator('input[name="localityName"]')).toHaveValue(/.+/);

  // -- Submit -----------------------------------------------------------
  await page.getByRole("button", { name: /crear mascota/i }).click();

  // Creation must LEAVE the new-pet form (redirect to the list or the new
  // pet's profile). Use a predicate rather than a loose /mis-mascotas/ regex —
  // that regex also matches /mis-mascotas/nueva, so a failed create that stays
  // on the form would slip through and fail confusingly at the list assertion.
  // This way a create failure surfaces here, at the submit step.
  await page.waitForURL(
    (url) => url.pathname.startsWith("/mis-mascotas") && !url.pathname.endsWith("/nueva"),
    { timeout: 20_000 },
  );

  // -- Assert pet is visible in the list --------------------------------
  // Navigate to the list explicitly (we may have landed on the pet profile).
  // Reload once if the freshly-created pet isn't immediately listed, to defeat
  // any RSC/router-cache staleness right after the write.
  await page.goto("/mis-mascotas");
  const petCell = page.getByText(PET_NAME);
  if (!(await petCell.isVisible().catch(() => false))) {
    await page.reload();
  }
  await expect(petCell).toBeVisible({ timeout: 15_000 });
});
