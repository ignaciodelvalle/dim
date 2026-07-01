import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  DEMO_PHOTOS,
  fullScroll,
  loginAs,
  pickLocality,
  showScreen,
  visit,
} from "./_helpers";

// SEGMENT 02 — DUEÑO (owner@dim.test). Real flows end to end:
// new pet → QR credential → vaccine (with photo) → history → booking → denuncias.
test("segmento 02 — dueno", async ({ page }) => {
  test.setTimeout(18 * 60_000);
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await loginAs(page, ACCOUNTS.owner);

  // 1. Home
  await showScreen(page, "/inicio");

  // 2. ALTA DE MASCOTA — single-step form (MinimalNewPetForm), ends on the QR credential.
  await showScreen(page, "/mis-mascotas");
  await visit(page, "/mis-mascotas/nueva");
  await page.locator('input[name="name"]').fill("Luna");
  await page.getByRole("button", { name: /perro/i }).click();
  await page.locator('label:has(input[name="sex"][value="male"])').click();
  await pickLocality(page, "#localityName-input", "Palermo");
  await fullScroll(page);
  await page.getByRole("button", { name: /crear mascota/i }).click();
  await page.waitForURL(/\/credencial/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page); // "aha" screen: issued QR credential

  const token = page.url().match(/\/nueva\/([^/]+)\/credencial/)?.[1];
  expect(token, "pet publicToken parsed from credential URL").toBeTruthy();

  // 3. Pet profile (vacunas tab comes AFTER registering the vaccine, so the
  // recording shows the result — not an empty tab).
  await showScreen(page, `/mis-mascotas/${token}`);
  await showScreen(page, `/mis-mascotas/${token}?tab=libreta`);

  // 4. VACUNA — event capture end to end, with attachment photo.
  await showScreen(page, `/mis-mascotas/${token}/anotar`);
  await page.getByRole("link", { name: "Registrar vacuna" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);
  await page.locator('input[name="vaccineName"]').fill("Antirrábica");
  const nextDue = new Date();
  nextDue.setFullYear(nextDue.getFullYear() + 1);
  await page.locator('input[name="nextDueAt"]').fill(nextDue.toISOString().split("T")[0]);
  await page.locator('input[name="brand"]').fill("Zoetis");
  await page.locator('input[name="batch"]').fill("L-2231");
  await page.locator('input[name="administeredBy"]').fill("Dra. Paz — Clínica Recoleta");
  await page
    .locator('textarea[name="notes"]')
    .fill("Sin reacciones adversas. Refuerzo anual programado.");
  await page.locator('input[name="attachment"]').setInputFiles(DEMO_PHOTOS[1]);
  await page.waitForTimeout(800);
  await fullScroll(page);
  await page.getByRole("button", { name: /registrar vacuna/i }).click();
  // Fail loud: createVaccinationAction redirects to the pet profile on success.
  await page.waitForURL((url) => !url.pathname.endsWith("/vacuna"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);

  // 5. Proof on camera: vacunas tab + history now show the registered vaccine
  await showScreen(page, `/mis-mascotas/${token}?tab=vacunas`);
  await showScreen(page, `/mis-mascotas/${token}/historial`);

  // 6. TURNOS — search → offering → slot → confirm booking (fail loud: needs seeded slots).
  // Drive the real filter form: seed-coverage's castración campaign lives in Palermo.
  await visit(page, "/turnos/buscar");
  await fullScroll(page); // service-kind picker
  await page.getByRole("link", { name: "Castración perro macho" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await pickLocality(page, "#locality_picker-input", "Palermo");
  await page.getByRole("button", { name: /^buscar$/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);
  const offering = page.locator('a[href^="/turnos/buscar/"]:not([href*="service_kind"])').first();
  await expect(offering, "an offering in /turnos/buscar (seed: materialize:slots)").toBeVisible();
  await offering.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);
  const slot = page.locator('a[href*="/reservar/"]').first();
  await expect(slot, "an open slot on the offering").toBeVisible();
  await slot.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);
  const petSelect = page.locator('select[name="petId"]');
  await expect(petSelect, "booking form pet selector").toBeVisible();
  await petSelect.selectOption({ label: "Luna" }).catch(() => petSelect.selectOption({ index: 1 }));
  await page.getByRole("button", { name: /confirmar reserva/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/reservar/"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);

  // 7. My bookings
  await showScreen(page, "/mis-turnos");

  // 8. Denuncias (citizen view) — list + first detail if any
  await showScreen(page, "/denuncias/mias");
  const report = page.locator('a[href^="/denuncias/"]:not([href*="nueva"])').first();
  if (await report.count()) {
    await report.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await fullScroll(page);
  }

  // 9. Notifications + account
  await showScreen(page, "/notificaciones");
  await showScreen(page, "/cuenta");

  await expect(page.locator("body")).toBeVisible();
});
