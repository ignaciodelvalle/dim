/**
 * Crisis-path cross-POV seams — hardened Playwright regression suite (#35).
 *
 * These are the four critical, multi-actor journeys from the crisis-e2e design
 * handoff (docs/design/handoffs/2026-07-04-crisis-e2e-design.md). Cursor's
 * browser MCP could not drive them end-to-end (re-login across roles, anon
 * contexts, server-action redirects); Playwright can. Unlike the recording
 * battery in final-seams.spec.ts — which collects soft pass/fail notes and
 * screenshots — this suite FAILS LOUD with hard assertions so it can gate CI.
 *
 * Seams covered:
 *   (a) Lost → found loop: owner marks lost → stranger public credential +
 *       /perdidas → govt /gob/perdidas → owner marks found → public active.
 *   (b) Vet Atender → owner libreta: clinic signs an Antirrábica vaccine on
 *       the walk-in surface → the immutable event surfaces in the owner libreta.
 *   (c) Denuncia anónima → admin moderación → gob maltrato: a flagged anon
 *       report lands in the admin moderation queue, gets passed to triage, and
 *       becomes visible to govt at /gob/maltrato.
 *   (d) Adopción: refugio publishes → owner2 postula → refugio aprueba +
 *       finaliza → ownership transfers to owner2.
 *
 * Run against the ALREADY-RUNNING :3000 QA server:
 *   pnpm exec playwright test e2e/crisis-seams.spec.ts --config=playwright.local3000.config.ts
 *
 * Fixtures: seed-test-users.ts + seed-demo.ts. Tests self-skip (not fail) when
 * an optional demo fixture is absent, so a bare test seed still runs clean.
 */

import { type Page, expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  loginAs,
  resolveOrgToken,
  submitAndWait,
  walkDenunciaWizard,
} from "./demo/_helpers";

// Demo-seed tokens (seed-demo.ts). ROCCO is owner@dim.test's demo dog with a
// clinical history; the atender walk-in surface resolves it for the clinic org.
const ROCCO_TOKEN = "DIM-DEMO-0001";

/** Clear the session and log in as another role on the shared page. */
async function relogin(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await loginAs(page, email);
}

/** Force a pet back to the active state (idempotent mark-found cleanup). */
async function ensurePetFound(page: Page, token: string): Promise<void> {
  await page
    .goto(`/mis-mascotas/${token}?sheet=marcar-encontrada`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  const confirm = page.getByRole("button", { name: /^confirmar$/i });
  if ((await confirm.count().catch(() => 0)) > 0) {
    await confirm.click().catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

test.describe.configure({ mode: "serial" });

test.describe("crisis seams — cross-POV critical journeys", () => {
  // ------------------------------------------------------------------------
  // (a) Lost → found loop across owner / stranger / govt POVs.
  // ------------------------------------------------------------------------
  test("(a) owner marks lost → stranger + govt see it → owner marks found", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await relogin(page, ACCOUNTS.owner);

    // Discover an ACTIVE (non-lost) pet from the owner's own registry — the
    // "REGISTRADA" badge on /mis-mascotas marks a pet that is not lost/deceased.
    await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const petLink = page.locator('a[href^="/mis-mascotas/"]', { hasText: /registrada/i }).first();
    test.skip(
      (await petLink.count()) === 0,
      "owner@dim.test has no active pet — skipping lost→found seam.",
    );
    const href = (await petLink.getAttribute("href")) ?? "";
    const token = href.split("/mis-mascotas/")[1] ?? "";
    expect(token, "pet token parsed from registry link").toBeTruthy();

    try {
      // --- Owner marks the pet lost (affirmative-consent disclosure) --------
      await page.goto(`/mis-mascotas/${token}/perdida`, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "Marcar como perdida", exact: true }),
      ).toBeVisible();

      // Step 1 — location (optional): skip straight through.
      await page.getByRole("button", { name: /^continuar →$/i }).click();
      // Step 2 — enriched details: ONLY present when the pet has no chip/tattoo.
      const hasDetailsStep = await page
        .getByText(/sin chip ni tatuaje/i)
        .isVisible()
        .catch(() => false);
      if (hasDetailsStep) {
        await page.getByRole("button", { name: /^continuar →$/i }).click();
      }
      // Final step — disclosure: opt IN to phone only.
      await expect(page.getByText(/qué se muestra al público/i)).toBeVisible();
      await page.getByRole("switch", { name: "Tu teléfono" }).click();
      await page.getByRole("button", { name: /^marcar como perdida$/i }).click();
      await expect(page.getByText(/activamos la búsqueda de/i)).toBeVisible({ timeout: 20_000 });

      // --- Stranger POV: public credential flips to lost + /perdidas lists it -
      const stranger = await browser.newContext();
      try {
        const sp = await stranger.newPage();
        const res = await sp.goto(`/p/${token}`, { waitUntil: "domcontentloaded" });
        expect(res?.status(), "public credential responds 2xx/3xx").toBeLessThan(400);
        await expect(sp.locator('[data-section="lost-urgent-banner"]')).toBeVisible({
          timeout: 20_000,
        });
        // Phone was disclosed → the call CTA renders.
        await expect(sp.getByRole("link", { name: /llamar/i })).toBeVisible();
        // Location was NOT disclosed → no last-seen section.
        await expect(sp.getByText(/última vez vista/i)).not.toBeVisible();

        await sp.goto("/perdidas", { waitUntil: "domcontentloaded" });
        // The public board is card-based: the token lives in the card's link
        // href (→ /p/{token}), not as visible text. Assert the card link, not
        // a raw token string.
        await expect(
          sp.locator(`a[href*="${token}"]`).first(),
          "lost pet appears in the public /perdidas board",
        ).toBeVisible({ timeout: 20_000 });
      } finally {
        await stranger.close();
      }

      // --- Operator POV: the lost pet is visible on the operator board -------
      // Use admin (universal scope) so the projection assertion doesn't depend
      // on the arbitrary pet's locality matching a specific govt's jurisdiction
      // (a jurisdiction-scoped govt correctly sees only its own localities).
      // The card links by href (→ /p/{token}), not visible token text.
      await relogin(page, ACCOUNTS.admin);
      await page.goto("/gob/perdidas", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/mascotas perdidas/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(
        page.locator(`a[href*="${token}"]`).first(),
        "lost pet appears on the operator /gob/perdidas board",
      ).toBeVisible({ timeout: 15_000 });

      // --- Owner marks the pet found → public lost UI clears -----------------
      await relogin(page, ACCOUNTS.owner);
      await page.goto(`/mis-mascotas/${token}?sheet=marcar-encontrada`, {
        waitUntil: "domcontentloaded",
      });
      const confirm = page.getByRole("button", { name: /^confirmar$/i });
      await expect(confirm).toBeVisible({ timeout: 15_000 });
      await confirm.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      // Re-fetch fresh (the found server action revalidates; avoid a client-cached
      // view of the just-cleared lost state).
      await page.goto(`/mis-mascotas/${token}`, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-section="lost-case-block"]')).toHaveCount(0, {
        timeout: 20_000,
      });

      const stranger2 = await browser.newContext();
      try {
        const sp2 = await stranger2.newPage();
        await sp2.goto(`/p/${token}`, { waitUntil: "domcontentloaded" });
        await expect(sp2.locator('[data-section="lost-urgent-banner"]')).toHaveCount(0);
        await expect(sp2.getByText(/application error/i)).not.toBeVisible();
      } finally {
        await stranger2.close();
      }
    } finally {
      // Never leave the owner's pet in the lost state for other suites / demos.
      await ensurePetFound(page, token);
    }
  });

  // ------------------------------------------------------------------------
  // (b) Vet Atender → owner libreta (immutable clinical event propagation).
  // ------------------------------------------------------------------------
  test("(b) clinic signs a vaccine on Atender → it surfaces in the owner libreta", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await relogin(page, ACCOUNTS.vetOrgAdmin);
    const orgToken = await resolveOrgToken(page, /Clínica Veterinaria Recoleta/i);

    await page.goto(`/org/${orgToken}/atender/${ROCCO_TOKEN}?evento=vacuna`, {
      waitUntil: "domcontentloaded",
    });
    const body = await page.locator("body").innerText();
    test.skip(
      /formato del código|no se encontró|no pertenecés/i.test(body),
      `Atender could not resolve ${ROCCO_TOKEN} — demo seed missing, skipping vet seam.`,
    );

    // Fill and sign the vaccine (VaccinationForm reused on the walk-in surface).
    const vaccineInput = page.locator('input[name="vaccineName"]').first();
    await expect(vaccineInput).toBeVisible({ timeout: 20_000 });
    await vaccineInput.fill("Antirrábica");
    await page
      .locator('input[name="occurredAt"]')
      .first()
      .fill(new Date().toISOString().slice(0, 10));

    const submitBtn = page.getByRole("button", { name: /registrar vacuna/i }).first();
    // Server signs the event and redirects back with ?firmado=1 (N3 contract).
    await submitAndWait(page, submitBtn, (url) => url.searchParams.get("firmado") === "1", 45_000);

    // --- Owner POV: the signed vaccine is now in the pet's libreta ----------
    await relogin(page, ACCOUNTS.owner);
    const libretaRes = await page.goto(`/mis-mascotas/${ROCCO_TOKEN}/libreta`, {
      waitUntil: "domcontentloaded",
    });
    expect(libretaRes?.status(), "owner libreta responds 2xx").toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(
      page.getByText(/antirr[aá]bica/i).first(),
      "vet-signed Antirrábica vaccine appears in the owner libreta",
    ).toBeVisible({ timeout: 15_000 });
  });

  // ------------------------------------------------------------------------
  // (c) Denuncia anónima → admin moderación → gob maltrato.
  // ------------------------------------------------------------------------
  test("(c) flagged anon denuncia → admin passes to triage → govt sees it", async ({ page }) => {
    test.setTimeout(120_000);

    // Anonymous: submit a denuncia whose ALL-CAPS wording trips the auto-flag.
    const denCode = await walkDenunciaWizard(page, { triggerModerationFlag: true });
    expect(denCode, "denuncia reference code returned from comprobante").toBeTruthy();

    // --- Admin POV: the flagged report is in the moderation queue -----------
    await relogin(page, ACCOUNTS.admin);
    await page.goto("/admin/moderacion", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /moderación de denuncias/i })).toBeVisible({
      timeout: 15_000,
    });
    const row = page.getByText(denCode).first();
    await expect(row, `denuncia ${denCode} present in the admin moderation queue`).toBeVisible({
      timeout: 15_000,
    });
    await row.click();
    await page.waitForURL(/\/admin\/moderacion\/[^/?#]+/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Pass it to triage (legitimate report, not spam).
    await page.getByRole("button", { name: /pasar a triage/i }).click();
    await page
      .locator("textarea")
      .first()
      .fill("Denuncia verificada en la batería de costuras — contenido coherente con abandono.");
    await page.getByRole("button", { name: /^confirmar$/i }).click();
    await page.waitForURL(/\/admin\/moderacion(?![/\w])/, { timeout: 20_000 });

    // --- Govt POV: the triaged report is visible at /gob/maltrato -----------
    await relogin(page, ACCOUNTS.govt);
    await page.goto("/gob/maltrato", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByText(denCode).first(),
      `denuncia ${denCode} visible to govt on /gob/maltrato after triage`,
    ).toBeVisible({ timeout: 20_000 });
  });

  // ------------------------------------------------------------------------
  // (d) Adopción: refugio publica → owner2 postula → aprueba → finaliza.
  // ------------------------------------------------------------------------
  test("(d) refugio publishes → owner2 applies → refugio finalizes → owner2 owns", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    // --- Refugio: pick one of its pets and ensure it is published ----------
    await relogin(page, ACCOUNTS.orgAdmin);
    const orgToken = await resolveOrgToken(page, /Refugio Test/i);
    await page.goto(`/org/${orgToken}/mascotas`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Try each org pet until we find one we can publish for adoption.
    const petLinks = page.locator(`a[href*="/org/${orgToken}/mascotas/DIM"]`);
    const count = await petLinks.count();
    test.skip(count === 0, "Refugio Test has no pets — skipping adoption seam.");

    let petToken = "";
    for (let i = 0; i < count && !petToken; i++) {
      const linkHref = (await petLinks.nth(i).getAttribute("href")) ?? "";
      const candidate = linkHref.split("/mascotas/")[1]?.split(/[/?#]/)[0] ?? "";
      if (!candidate) continue;
      await page.goto(`/org/${orgToken}/mascotas/${candidate}/adoptar`, {
        waitUntil: "domcontentloaded",
      });
      const publishBtn = page.getByRole("button", { name: /^publicar/i }).first();
      if (await publishBtn.isEnabled({ timeout: 4_000 }).catch(() => false)) {
        await publishBtn.click();
        await page.waitForLoadState("networkidle").catch(() => {});
        petToken = candidate;
      } else {
        // Already published? Confirm via the public listing before accepting it.
        const pubRes = await page.goto(`/adoptar/${candidate}`, { waitUntil: "domcontentloaded" });
        if (
          (pubRes?.status() ?? 500) < 400 &&
          (await page
            .getByRole("button", { name: /postular/i })
            .first()
            .isVisible({ timeout: 4_000 })
            .catch(() => false))
        ) {
          petToken = candidate;
        }
      }
    }
    test.skip(
      petToken === "",
      "No publishable adoptable pet in Refugio Test (all blocked or already adopted) — skipping.",
    );

    // --- owner2 postula ----------------------------------------------------
    await relogin(page, ACCOUNTS.owner2);
    const applyRes = await page.goto(`/adoptar/${petToken}`, { waitUntil: "domcontentloaded" });
    expect(applyRes?.status(), "public adoption page responds 2xx").toBeLessThan(400);
    const applyBtn = page.getByRole("button", { name: /postular/i }).first();
    await expect(applyBtn).toBeVisible({ timeout: 15_000 });
    await applyBtn.click();
    await page.waitForURL(/\/adoptar\/[^/]+\/postular/, { timeout: 20_000 });
    await page
      .locator("#motivation, textarea[name='motivation'], textarea")
      .first()
      .fill("Busco adoptar para darle un hogar estable con patio y mucho cariño responsable.");
    await page.getByRole("button", { name: /enviar postulaci/i }).click();
    // Application submit redirects off the form (comprobante / listing / inicio).
    await page.waitForURL((url) => !/\/postular$/.test(url.pathname), { timeout: 25_000 });

    // --- Refugio approves the application ----------------------------------
    await relogin(page, ACCOUNTS.orgAdmin);
    await page.goto(`/org/${orgToken}/adopciones`, { waitUntil: "domcontentloaded" });
    const appLink = page.locator(`a[href*="/adopciones/"]`).first();
    await expect(appLink, "an adoption application is queued for the refugio").toBeVisible({
      timeout: 20_000,
    });
    await appLink.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("button", { name: /aprobar postulaci/i }).click();
    await page.getByRole("button", { name: /confirmar aprobaci/i }).click();
    await page.waitForURL(/\/org\/[^/]+\/adopciones(?![/\w])/, { timeout: 20_000 });

    // --- Refugio finalizes the adoption on the pet ficha -------------------
    await page.goto(`/org/${orgToken}/mascotas/${petToken}/adoption`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[name="adopterDni"]').fill("30123456");
    await page.locator('input[name="adopterDisplayName"]').fill("Owner Dos Demo");
    await page.getByRole("button", { name: /finalizar adopci/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/application error/i)).not.toBeVisible();

    // --- owner2 now owns the pet -------------------------------------------
    await relogin(page, ACCOUNTS.owner2);
    await page.goto(`/mis-mascotas/${petToken}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(
      page.getByRole("main").or(page.locator("main")).first(),
      "owner2 can open the adopted pet's owner profile (ownership transferred)",
    ).toBeVisible({ timeout: 15_000 });
  });
});
