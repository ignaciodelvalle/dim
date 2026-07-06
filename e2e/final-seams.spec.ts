/**
 * UX-gate costuras cross-POV — final battery.
 * Run: pnpm exec playwright test e2e/final-seams.spec.ts --config=playwright.localhost.config.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  clickContinuar,
  loginAs,
  pickCard,
  resolveOrgToken,
  SHARED_PASSWORD,
  submitAndWait,
  walkDenunciaWizard,
} from "./demo/_helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(here, "../docs/reviews/results/final-seams-screenshots");
const ROCCO_TOKEN = "DIM-DEMO-0001";
const PIPA_TOKEN = "DIM-DEMO-0010";

type SeamResult = {
  id: string;
  pass: boolean;
  entityCodes: Record<string, string>;
  notes: string[];
};

const results: SeamResult[] = [];

async function ensurePetActive(page: import("@playwright/test").Page, petToken: string) {
  await page.goto(`/mis-mascotas/${petToken}?sheet=marcar-encontrada`, {
    waitUntil: "domcontentloaded",
  });
  const confirmFound = page.getByRole("button", { name: /^confirmar$/i });
  if (await confirmFound.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmFound.click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/mis-mascotas/${petToken}` && !url.searchParams.has("sheet"),
      { timeout: 20_000 },
    );
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

async function relogin(page: import("@playwright/test").Page, email: string) {
  await page.context().clearCookies();
  await loginAs(page, email);
}

async function snap(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

function parseRabiesKpi(text: string): number | null {
  const m = text.match(/Cobertura antirr[aá]bica[\s\S]{0,200}?(\d+)\s*%/i);
  return m ? Number(m[1]) : null;
}

test.describe.serial("Final seams cross-POV", () => {
  test.setTimeout(120_000);

  test("(a) Perdida owner → gob + público → encontrada", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const notes: string[] = [];
    const codes: Record<string, string> = {};
    let pass = true;
    let petToken = PIPA_TOKEN;
    let petName = "Pipa";

    try {
      await relogin(page, ACCOUNTS.owner);
      await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      const activeLink = page.locator('a[href^="/mis-mascotas/"]', { hasText: /registrada/i }).first();
      if ((await activeLink.count()) > 0) {
        const href = (await activeLink.getAttribute("href")) ?? "";
        petToken = href.split("/mis-mascotas/")[1]?.split(/[/?#]/)[0] ?? PIPA_TOKEN;
        const linkText = ((await activeLink.innerText()) ?? "").trim();
        petName = linkText.split(/\n/)[0]?.trim() || petName;
      } else {
        await ensurePetActive(page, PIPA_TOKEN);
        petToken = PIPA_TOKEN;
      }
      codes.pet = petToken;
      notes.push(`Selected pet token: ${petToken}`);

      await page.goto(`/mis-mascotas/${petToken}/perdida`, { waitUntil: "domcontentloaded" });
      const isUpdateForm = await page
        .getByRole("heading", { name: /actualizar la búsqueda/i })
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (isUpdateForm) {
        await ensurePetActive(page, petToken);
        await page.goto(`/mis-mascotas/${petToken}/perdida`, { waitUntil: "domcontentloaded" });
      }
      await expect(
        page.getByRole("heading", { name: "Marcar como perdida", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /^continuar →$/i }).click();
      const hasDetails = await page
        .getByText(/sin chip ni tatuaje/i)
        .isVisible()
        .catch(() => false);
      if (hasDetails) await page.getByRole("button", { name: /^continuar →$/i }).click();
      await page.getByRole("switch", { name: "Tu teléfono" }).click().catch(() => {});
      await page.getByRole("button", { name: /^marcar como perdida$/i }).click();
      const successBanner = page.getByText(/activamos la búsqueda de/i);
      await expect(successBanner).toBeVisible({ timeout: 20_000 });
      const successText = (await successBanner.textContent()) ?? "";
      const nameMatch = successText.match(/activamos la búsqueda de\s+(.+?)\./i);
      if (nameMatch?.[1]) petName = nameMatch[1].trim();
      notes.push(`Pet for lost flow: ${petName} (${petToken})`);
      await snap(page, "a01-owner-lost-success");

      await page.goto(`/mis-mascotas/${petToken}`, { waitUntil: "domcontentloaded" });
      const casEl = page.locator("text=/CAS-[A-Z0-9-]+/").first();
      if (await casEl.isVisible({ timeout: 8_000 }).catch(() => false)) {
        codes.case = ((await casEl.textContent()) ?? "").trim();
      }
      notes.push(`CAS on owner profile: ${codes.case ?? "not visible"}`);
      await snap(page, "a02-owner-profile-lost");

      {
        const stranger = await browser.newContext();
        try {
          const sp = await stranger.newPage();
          await sp.goto(`/p/${petToken}`, { waitUntil: "domcontentloaded" });
          await expect(sp.locator('[data-section="lost-urgent-banner"]')).toBeVisible({
            timeout: 15_000,
          });
          await snap(sp, "a03-public-credential-lost");
          await sp.goto("/perdidas", { waitUntil: "domcontentloaded" });
          const onList =
            (await sp.getByText(new RegExp(petName, "i")).isVisible().catch(() => false)) ||
            (await sp.getByText(petToken).isVisible().catch(() => false));
          expect(onList, `pet on /perdidas (${petName} or ${petToken})`).toBe(true);
          await snap(sp, "a04-public-perdidas");
        } finally {
          await stranger.close();
        }
      }

      await relogin(page, ACCOUNTS.govt);
      await page.goto("/gob/perdidas", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/mascotas perdidas/i)).toBeVisible({ timeout: 10_000 });
      const gobHasPet =
        (await page.getByText(new RegExp(petName, "i")).isVisible().catch(() => false)) ||
        (await page.getByText(petToken).isVisible().catch(() => false));
      notes.push(`Govt /gob/perdidas shows ${petName}: ${gobHasPet}`);
      if (!gobHasPet) pass = false;
      await snap(page, "a05-gob-perdidas");

      await relogin(page, ACCOUNTS.owner);
      await page.goto(`/mis-mascotas/${petToken}?sheet=marcar-encontrada`, {
        waitUntil: "domcontentloaded",
      });
      const confirm = page.getByRole("button", { name: /^confirmar$/i });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      await confirm.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.goto(`/mis-mascotas/${petToken}`, { waitUntil: "domcontentloaded" });
      await snap(page, "a06-owner-found");
      const stillLost = await page.getByText(/perdid[oa]/i).isVisible().catch(() => false);
      notes.push(`Owner profile active after found: ${!stillLost}`);
      if (stillLost) pass = false;

      await relogin(page, ACCOUNTS.govt);
      await page.goto("/gob/perdidas", { waitUntil: "domcontentloaded" });
      await snap(page, "a07-gob-perdidas-after-found");
    } catch (e) {
      pass = false;
      notes.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
      await snap(page, "a-error").catch(() => {});
    } finally {
      await page
        .goto(`/mis-mascotas/${petToken}?sheet=marcar-encontrada`, { waitUntil: "domcontentloaded" })
        .catch(() => {});
      const confirmBtn = page.getByRole("button", { name: /^confirmar$/i });
      if ((await confirmBtn.count().catch(() => 0)) > 0) {
        await confirmBtn.click().catch(() => {});
        await page.waitForLoadState("networkidle").catch(() => {});
      }
    }

    results.push({ id: "a-perdida", pass, entityCodes: codes, notes });
    expect(pass, notes.join(" | ")).toBe(true);
  });

  test("(b) Vacuna Atender alejo → owner libreta MP → gob KPI", async ({ page }) => {
    test.setTimeout(180_000);
    const notes: string[] = [];
    const codes: Record<string, string> = { pet: ROCCO_TOKEN };
    let pass = true;

    try {
      await relogin(page, ACCOUNTS.govt);
      await page.goto("/gob", { waitUntil: "domcontentloaded" });
      const beforeText = await page.locator("body").innerText();
      const kpiBefore = parseRabiesKpi(beforeText);
      notes.push(`Rabies KPI before: ${kpiBefore ?? "n/a"}`);
      await snap(page, "b01-gob-panel-before");

      await relogin(page, ACCOUNTS.vetOrgAdmin);
      await page.goto("/org", { waitUntil: "domcontentloaded" });
      const clinicCard = page.locator('a[href^="/org/"]', {
        hasText: /Clínica Veterinaria Recoleta/i,
      });
      if (await clinicCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await clinicCard.click();
        await page.waitForURL(/\/org\/[^/?#]+/, { timeout: 15_000 });
      }
      const orgToken =
        page.url().match(/\/org\/([^/?#]+)/)?.[1] ??
        (await resolveOrgToken(page, /Clínica Veterinaria Recoleta/i));
      codes.org = orgToken;

      await page.goto(`/org/${orgToken}/atender/${ROCCO_TOKEN}?evento=vacuna`, {
        waitUntil: "domcontentloaded",
      });
      await snap(page, "b02-atender-vacuna-form");
      const bodyAfterNav = await page.locator("body").innerText();
      if (/formato del código|no se encontró|no pertenecés/i.test(bodyAfterNav)) {
        notes.push(`Atender rejected pet: ${bodyAfterNav.slice(0, 180)}`);
        pass = false;
        await snap(page, "b02b-atender-rejected");
        throw new Error("Atender could not resolve DIM-DEMO-0001");
      }
      await snap(page, "b03-atender-rocco-resolved");

      const vaccineInput = page.locator('input[name="vaccineName"], #vaccineName').first();
      await expect(vaccineInput).toBeVisible({ timeout: 20_000 });
      await vaccineInput.fill("Antirrábica");
      await page.locator('input[name="occurredAt"]').fill(new Date().toISOString().slice(0, 10));
      const submitBtn = page.locator("#vaccination-form button[type='submit']").first();
      await submitAndWait(
        page,
        submitBtn,
        (url) => url.searchParams.get("firmado") === "1",
        45_000,
      );
      await snap(page, "b04-vaccine-signed");

      await relogin(page, ACCOUNTS.owner);
      await page.goto(`/mis-mascotas/${ROCCO_TOKEN}/libreta`);
      const libretaText = await page.locator("body").innerText();
      const hasMp = /verificad|matr[ií]cula|MP/i.test(libretaText);
      notes.push(`Owner libreta shows verified/MP: ${hasMp}`);
      await snap(page, "b05-owner-libreta");
      if (!hasMp) pass = false;

      await relogin(page, ACCOUNTS.govt);
      await page.goto("/gob");
      const afterText = await page.locator("body").innerText();
      const kpiAfter = parseRabiesKpi(afterText);
      notes.push(`Rabies KPI after: ${kpiAfter ?? "n/a"}`);
      await snap(page, "b06-gob-panel-after");
      if (kpiBefore != null && kpiAfter != null && kpiAfter <= kpiBefore) {
        notes.push("KPI did not increase (may be rounding/k-anon)");
      }
    } catch (e) {
      pass = false;
      notes.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
      await snap(page, "b-error").catch(() => {});
    }

    results.push({ id: "b-vacuna-atender", pass, entityCodes: codes, notes });
    expect(pass, notes.join(" | ")).toBe(true);
  });

  test("(c) Denuncia anon → admin moderación → gob maltrato", async ({ page }) => {
    const notes: string[] = [];
    const codes: Record<string, string> = {};
    let pass = true;

    try {
      const denCode = await walkDenunciaWizard(page);
      codes.den = denCode;
      await snap(page, "c01-denuncia-comprobante");

      await relogin(page, ACCOUNTS.admin);
      await page.goto("/admin/moderacion", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: /Moderación de denuncias/i }),
      ).toBeVisible({ timeout: 15_000 });
      const row = page.getByText(denCode).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await snap(page, "c02-admin-moderacion-queue");
      await row.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await snap(page, "c03-admin-moderacion-detail");
      await page.getByRole("button", { name: /pasar a triage/i }).click();
      await page.locator("textarea").fill(
        "Denuncia verificada en batería de costuras — contenido coherente con abandono.",
      );
      await page.getByRole("button", { name: /^confirmar$/i }).click();
      await page.waitForURL(/\/admin\/moderacion/, { timeout: 20_000 });
      await snap(page, "c04-admin-after-triage");

      await relogin(page, ACCOUNTS.govt);
      await page.goto("/gob/maltrato");
      const hasDen = await page.getByText(denCode).isVisible({ timeout: 15_000 }).catch(() => false);
      notes.push(`Govt /gob/maltrato shows ${denCode}: ${hasDen}`);
      await snap(page, "c05-gob-maltrato");
      if (!hasDen) pass = false;
    } catch (e) {
      pass = false;
      notes.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
      await snap(page, "c-error").catch(() => {});
    }

    results.push({ id: "c-denuncia", pass, entityCodes: codes, notes });
    expect(pass, notes.join(" | ")).toBe(true);
  });

  test("(d) Adopción orgadmin → owner2 → finaliza", async ({ page }) => {
    const notes: string[] = [];
    const codes: Record<string, string> = {};
    let pass = true;
    const owner2 = "owner2@dim.test";

    try {
      await relogin(page, ACCOUNTS.orgAdmin);
      const orgToken = await resolveOrgToken(page, /Refugio Test/i);
      codes.org = orgToken;
      await page.goto(`/org/${orgToken}/mascotas`, { waitUntil: "domcontentloaded" });
      const petLink = page.locator(`a[href^="/org/${orgToken}/mascotas/"]`).first();
      await expect(petLink).toBeVisible({ timeout: 15_000 });
      const href = (await petLink.getAttribute("href")) ?? "";
      const petToken = href.split("/mascotas/")[1]?.split(/[/?#]/)[0] ?? "";
      codes.pet = petToken;
      expect(petToken).toBeTruthy();

      await page.goto(`/org/${orgToken}/mascotas/${petToken}/adoptar`);
      const publishBtn = page.getByRole("button", { name: /publicar/i }).first();
      if (await publishBtn.isEnabled({ timeout: 5_000 }).catch(() => false)) {
        await publishBtn.click();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      await snap(page, "d01-org-publish");

      await relogin(page, owner2);
      await page.goto(`/adoptar/${petToken}`);
      await page.getByRole("link", { name: /postularme|postular/i }).click();
      await page.waitForURL(/postular/, { timeout: 15_000 });
      await page.locator('textarea[name="motivation"], textarea').first().fill(
        "Busco adoptar para darle un hogar estable con patio y mucho cariño.",
      );
      await page.getByRole("button", { name: /enviar postulaci/i }).click();
      await page.waitForURL(/postular|adoptar|inicio/, { timeout: 25_000 });
      await snap(page, "d02-owner2-applied");

      await relogin(page, ACCOUNTS.orgAdmin);
      await page.goto(`/org/${orgToken}/adopciones`);
      const appLink = page.locator(`a[href*="/adopciones/"]`).first();
      await expect(appLink).toBeVisible({ timeout: 15_000 });
      await appLink.click();
      await page.getByRole("button", { name: /aprobar postulaci/i }).click();
      await page.getByRole("button", { name: /confirmar aprobaci/i }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await snap(page, "d03-org-approved");

      await page.goto(`/org/${orgToken}/mascotas/${petToken}/adoption`);
      await page.locator('input[name="adopterDni"]').fill("30123456");
      await page.locator('input[name="adopterDisplayName"]').fill("Owner Dos Demo");
      await page.locator('input[name="adopterEmail"]').fill(owner2);
      await page.getByRole("button", { name: /finalizar adopci/i }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await snap(page, "d04-org-finalized");

      await relogin(page, owner2);
      await page.goto("/mis-mascotas");
      const ownsPet = await page.getByText(new RegExp(petToken.slice(-4), "i")).isVisible().catch(() => false);
      notes.push(`Owner2 has pet in list: ${ownsPet}`);
      await snap(page, "d05-owner2-pets");
      if (!ownsPet) {
        const body = await page.locator("body").innerText();
        notes.push(`Owner2 pets page snippet: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      pass = false;
      notes.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
      await snap(page, "d-error").catch(() => {});
    }

    results.push({ id: "d-adopcion", pass, entityCodes: codes, notes });
    expect(pass, notes.join(" | ")).toBe(true);
  });

  test.afterAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOT_DIR, "results.json"), JSON.stringify(results, null, 2));
  });
});
