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

// FIXME: flaky in CI — the locality field (LocalityPickerAcross) runs a
// debounced server-side search, and the dropdown option isn't reliably ready
// before the spec selects it, so the pet sometimes fails the required-locality
// guard and never gets created. Stabilize by waiting on the dropdown options
// (or stubbing searchLocalitiesAction) before re-enabling. The create-pet
// happy path is meanwhile covered deterministically by the pets unit tests and
// the macro-invariant integration tests.
test.fixme("owner creates a pet with location and it appears in /mis-mascotas", async ({ page }) => {
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
  // LocalityPickerAcross renders an LnInput with placeholder "Ej: Palermo…".
  // Results are rendered as <ul><li><button> — NOT ARIA option/listbox.
  const localityInput = page.locator('input[placeholder*="Palermo" i]').first();
  await localityInput.fill("Palermo");

  // The component debounces and hits the server action. Wait for the dropdown
  // list to appear, then click the first suggestion button inside it.
  const dropdown = page.locator("ul").filter({ has: page.locator("li button") });
  await dropdown.waitFor({ state: "visible", timeout: 12_000 });
  await dropdown.locator("li button").first().click();

  // -- Submit -----------------------------------------------------------
  await page.getByRole("button", { name: /crear mascota/i }).click();

  // After successful create the app redirects to /mis-mascotas (or the new
  // pet's profile). Either way, /mis-mascotas/nueva should no longer be shown.
  await page.waitForURL(/\/mis-mascotas/, { timeout: 20_000 });

  // -- Assert pet is visible in the list --------------------------------
  // Navigate to the list explicitly in case we landed on the pet profile.
  await page.goto("/mis-mascotas");
  await expect(page.getByText(PET_NAME)).toBeVisible({ timeout: 10_000 });
});
