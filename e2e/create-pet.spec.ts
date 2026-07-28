import { expect, test } from "@playwright/test";

/**
 * Create-pet happy-path e2e.
 *
 * Logs in as the seeded OWNER, navigates to /mis-mascotas/nueva, drives the
 * 2-step MinimalNewPetForm wizard (commit f94ad6ff), and asserts the new pet
 * appears in /mis-mascotas.
 *
 * This flow regressed before (create-pet broke silently in staging) and again
 * changed shape twice since the original test was written:
 *   - 38fb1f44 introduced the province-first cascade: LocationFields mode="l1"
 *     cascade renders a "Provincia" <select> that GATES a province-scoped
 *     "Localidad o barrio" autocomplete (disabled until a province is picked).
 *   - f94ad6ff split the alta into two steps: paso 1 (identidad) with a
 *     "Continuar" button, then paso 2 (foto y más) with the final "Crear
 *     mascota" submit. Both steps stay mounted so all fields are in the single
 *     final FormData.
 *
 * Fields driven here (app/(app)/mis-mascotas/nueva/MinimalNewPetForm.tsx):
 *   - name     → text input labelled "Nombre"
 *   - species  → chip button "Perro/a" sets hidden input name="species"
 *   - sex      → radio group, value "male"/"female"/"unknown"
 *   - province → <select> labelled "Provincia" (ISO 3166-2:AR value)
 *   - locality → LocalityPickerAcross labelled "Localidad o barrio", scoped to
 *                the chosen province → hidden input name="localityName"
 */

const OWNER_EMAIL = "owner@dim.test";
const OWNER_PASSWORD = "Test1234!";

// Unique name to assert in the list afterwards (also keeps the soft same-owner
// dedupe gate P2 from firing on repeated runs).
const PET_NAME = `E2EPet-${Date.now()}`;

// Palermo is a CABA barrio; the cascade needs its province picked first.
const PROVINCE_CODE = "AR-C"; // Ciudad Autónoma de Buenos Aires (CABA)

test("owner creates a pet with location and it appears in /mis-mascotas", async ({ page }) => {
  // Alta is a multi-step flow (login → wizard → dual-write → list); with the
  // 45s submit budget below, the 30s default test timeout is too tight.
  test.setTimeout(90_000);

  // -- Log in -----------------------------------------------------------
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(OWNER_EMAIL);
  await page.getByLabel(/contraseña/i).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/inicio/, { timeout: 15_000 });

  // -- Navigate to new-pet form -----------------------------------------
  await page.goto("/mis-mascotas/nueva");
  await expect(
    page.getByRole("heading", { name: /registrar (tu primera )?mascota/i }),
  ).toBeVisible();

  // ── Paso 1 — Identidad ───────────────────────────────────────────────
  // -- Name -------------------------------------------------------------
  await page.getByLabel(/^nombre/i).fill(PET_NAME);

  // -- Species: click the "Perro/a" chip --------------------------------
  await page.getByRole("button", { name: /perro\/a/i }).click();

  // -- Sex: pick "Macho" radio ------------------------------------------
  await page.getByRole("radio", { name: /macho/i }).check();

  // -- Location (cascade): pick the province, THEN the scoped locality ---
  // The locality autocomplete is disabled until a province is chosen, so the
  // province <select> must come first.
  await page.getByLabel(/provincia/i).selectOption(PROVINCE_CODE);

  const localityInput = page.getByLabel(/localidad o barrio/i);
  await expect(localityInput).toBeEnabled();
  await localityInput.fill("Palermo");

  // Wait for the debounced (200ms) province-scoped search to render its
  // options, then select the first Palermo match. Selection fires on
  // mousedown / Enter; the component's key handler preventDefaults Enter so
  // it never submits the form.
  //
  // Matched by ROLE, not by markup. This used to be `li button`, which stopped
  // matching when LnCombobox put role="option" on the <li> itself — there is no
  // button in the list any more. The picker was fine; the selector had drifted,
  // and nothing noticed because the e2e suite had not run in CI since
  // 2026-06-12. The role is the contract a screen reader sees, so it does not
  // rot the next time the markup moves.
  const firstOption = page.getByRole("option", { name: /Palermo/i }).first();
  await expect(firstOption).toBeVisible({ timeout: 15_000 });
  await localityInput.press("Enter");

  // Confirm the picker captured a locality before advancing (paso 1 has a
  // required-locality guard); fails here with a clear message if selection
  // didn't take, instead of a confusing bounce-back later.
  await expect(page.locator('input[name="localityName"]')).toHaveValue(/.+/);

  // -- Advance to paso 2 ------------------------------------------------
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 2 revealed: prominent photo field + the final submit button.
  await expect(page.getByText(/tomar o elegir una foto/i)).toBeVisible();

  // ── Paso 2 — submit (foto is optional; skip it) ──────────────────────
  //
  // The click is fired but NOT awaited. Its promise never resolves here, and
  // the app is not why.
  //
  // createPetAction returns `redirectTo` and MinimalNewPetForm pushes it
  // client-side — the N3 contract, adopted because Next 15.5 drops a
  // redirect() issued from a server action in production. Playwright's
  // post-click wait sits on that App Router transition and never sees it
  // settle, so click() hangs until the test budget dies. Measured at 90s and
  // again at 300s: not a slow test, a wait that cannot finish. `noWaitAfter`
  // is a no-op on click in Playwright 1.60, so it is not the lever either.
  //
  // What the same instrumented run measured about the ALTA itself:
  //   reached /credencial          300 ms
  //   requests still open at +15s  0
  //   credential h1                "<name> ya tiene su credencial"
  // The flow is fast, complete and correct. Only the harness's promise is
  // stuck, so the navigation below is the assertion that matters — and it is
  // the real contract regardless.
  void page
    .getByRole("button", { name: /crear mascota/i })
    .click()
    .catch(() => {
      // Swallowed on purpose: this promise is expected never to settle, and a
      // late rejection at teardown must not fail an otherwise-green test.
    });

  // Creation must LEAVE the wizard. On success the action redirects to the
  // credential screen (/mis-mascotas/nueva/{token}/credencial) — that path
  // starts with /mis-mascotas and does not end with "/nueva", so the predicate
  // passes while a failed create that stays on the form (…/nueva) does not.
  // Alta can take a while on a cold build (event-first dual-write + RSC
  // revalidate), so allow ≥45s before declaring the create hung.
  await page.waitForURL(
    (url) => url.pathname.startsWith("/mis-mascotas") && !url.pathname.endsWith("/nueva"),
    { timeout: 45_000 },
  );

  // -- Assert pet is visible in the list --------------------------------
  // Navigate to the list explicitly (we landed on the credential screen).
  // Reload once if the freshly-created pet isn't immediately listed, to defeat
  // any RSC/router-cache staleness right after the write.
  await page.goto("/mis-mascotas");
  const petCell = page.getByText(PET_NAME);
  if (!(await petCell.isVisible().catch(() => false))) {
    await page.reload();
  }
  await expect(petCell).toBeVisible({ timeout: 15_000 });
});
