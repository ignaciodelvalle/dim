import { expect, test } from "@playwright/test";

import { resolveBaseUrl } from "./_base-url";
import { ACCOUNTS, DEMO_PHOTOS, loginAs, pickCard } from "./demo/_helpers";

/**
 * Synthetic monitor — the 4 critical flows, FAST, aimed at the DEPLOYED staging
 * origin (resolveBaseUrl(): STAGING_URL env wins, else the staging_url file,
 * else localhost:3000). Designed to run every N minutes overnight via
 * scripts/qa-monitor.ps1 and go LOUD the instant a critical path breaks.
 *
 * The four flows (target: < 2 min total on a warm deploy):
 *   (a) owner login + credential surface renders
 *   (b) anon public credential /p/DIM-DEMO-0001 → 200, NO owner PII,
 *       Cache-Control: no-store (the revoke/lost-cache privacy invariant)
 *   (c) govt login → /gob/maltrato has actionable rows → /gob/panorama paints
 *   (d) anon denuncia wizard reaches the reference-code screen (submits a real
 *       minimal denuncia clearly marked "PRUEBA SINTÉTICA" so operators ignore)
 *
 * Run:
 *   STAGING_URL=https://<deploy>.vercel.app \
 *     pnpm exec playwright test e2e/synthetic-monitor.spec.ts \
 *     --config=playwright.local3000.config.ts
 *
 * Each flow is its own test so a single broken path is pinpointed, not masked.
 */

const BASE = resolveBaseUrl();

test.use({ baseURL: BASE });

// Remote serverless cold starts (~10s) — give each flow headroom but keep the
// whole battery under ~2 min on a warm deploy.
test.describe.configure({ mode: "parallel", timeout: 90_000 });

const ROCCO_TOKEN = "DIM-DEMO-0001"; // stable demo hero pet (seed-demo).

// Owner PII that must NEVER surface on the public credential of an ACTIVE pet
// (name is never disclosed even when lost; email/DNI never; see
// lib/infra/public-cache-policy.ts + the /p page privacy posture).
const OWNER_DISPLAY_NAME = "Ignacio del Valle";

test.describe(`synthetic monitor @ ${BASE}`, () => {
  // ------------------------------------------------------------------------
  // (a) Owner login + credential renders.
  // ------------------------------------------------------------------------
  test("(a) owner login + credential surface renders", async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner);
    // Landed inside the app (not stranded on /login).
    expect(page.url(), "owner left /login after sign-in").not.toContain("/login");

    await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
    // At least one pet credential card must render for the owner. Anchor on
    // the DIM- token prefix so the "/mis-mascotas/nueva" create-pet CTA can
    // never satisfy this assertion on an empty registry.
    await expect(
      page.locator('a[href^="/mis-mascotas/DIM-"]').first(),
      "owner registry shows at least one pet credential",
    ).toBeVisible({ timeout: 20_000 });

    // No error boundary.
    await expect(page.getByText(/algo salió mal|application error/i)).not.toBeVisible();
  });

  // ------------------------------------------------------------------------
  // (b) Anon public credential — 200, no PII, no-store.
  // ------------------------------------------------------------------------
  test("(b) anon /p credential: 200 + no PII + no-store", async ({ page }) => {
    // Header + status via a raw request (no cookies — a true anon fetch).
    const res = await page.request.get(`${BASE}/p/${ROCCO_TOKEN}`);
    expect(res.status(), `/p/${ROCCO_TOKEN} responded ${res.status()}`).toBe(200);

    const cacheControl = res.headers()["cache-control"] ?? "";
    expect(
      cacheControl,
      `/p/${ROCCO_TOKEN} Cache-Control must forbid shared caching (no-store) — got "${cacheControl}". ` +
        "A stale CDN copy would keep serving a found pet as SE BUSCA + phone, or a revoked share. " +
        "This is the privacy-class fix in middleware.ts + lib/infra/public-cache-policy.ts.",
    ).toMatch(/no-store/i);

    // Body must carry NO owner PII.
    const body = await res.text();
    expect(body, "public credential leaks owner display name").not.toContain(OWNER_DISPLAY_NAME);
    expect(body, "public credential leaks an @dim.test email").not.toMatch(/@dim\.test/i);

    // Render sanity: the page is the credential, not an error/404 boundary.
    await page.goto(`/p/${ROCCO_TOKEN}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/no encontramos esta página|application error/i)).not.toBeVisible();
    await expect(page.locator("main, h1").first()).toBeVisible({ timeout: 20_000 });
  });

  // ------------------------------------------------------------------------
  // (c) Govt login → maltrato actionable → panorama paints.
  // ------------------------------------------------------------------------
  test("(c) govt maltrato rows + panorama canvas paints", async ({ page }) => {
    await loginAs(page, ACCOUNTS.govt);

    // Maltrato queue (all cases) must render actionable rows.
    await page.goto("/gob/maltrato?queue=all", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /denuncias de maltrato/i }),
      "maltrato console heading",
    ).toBeVisible({ timeout: 20_000 });
    // The queue renders ALL tabpanels in the DOM (urgent/mine/all); inactive
    // panels carry [hidden] and precede the active one, so a bare .first() on
    // a global row selector lands on a display:none row (verified against the
    // live staging DOM: div#tabpanel-urgent[hidden] comes first). Match only
    // VISIBLE rows.
    await expect(
      page.locator('a[href^="/gob/maltrato/"]:visible').first(),
      "maltrato queue has at least one actionable (visible) case row",
    ).toBeVisible({ timeout: 20_000 });

    // Panorama map paints a canvas within 60s.
    await page.goto("/gob/panorama", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Panorama" }),
      "panorama console heading",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("canvas").first(), "panorama MapLibre canvas painted").toBeVisible({
      timeout: 60_000,
    });
  });

  // ------------------------------------------------------------------------
  // (d) Anon denuncia wizard reaches the reference-code screen.
  // ------------------------------------------------------------------------
  test("(d) anon denuncia wizard → reference code", async ({ page }) => {
    test.setTimeout(90_000);
    // Clearly-marked synthetic report so operators can ignore it.
    const description =
      "PRUEBA SINTÉTICA - monitoreo automatico QA, ignorar. No hay animal real involucrado.";

    /**
     * Click "Continuar" and assert the NEXT step actually rendered; when the
     * click is silently dropped (hydration race — the recurring task-#39
     * failure mode: handlers not yet attached, especially on serverless cold
     * starts), retry once. Without this, step 1 never advances and the
     * severityCard assertion fails while the app itself works fine.
     */
    async function advanceTo(nextStepMarker: ReturnType<typeof page.locator>): Promise<void> {
      const btn = page.getByRole("button", { name: /continuar/i }).first();
      await expect(btn, "wizard Continuar button").toBeVisible();
      await btn.click();
      try {
        await expect(nextStepMarker).toBeVisible({ timeout: 8_000 });
      } catch {
        await btn.click(); // dropped click — one retry
        await expect(nextStepMarker, "wizard advanced after Continuar retry").toBeVisible({
          timeout: 10_000,
        });
      }
    }

    await page.goto("/denuncias/nueva", { waitUntil: "domcontentloaded" });
    // Let hydration finish before the first interaction — clicks dispatched
    // before React attaches handlers are silently dropped (same wait the
    // shared loginAs helper uses).
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2_000);

    // Step 1 — Qué pasó
    await pickCard(page, "kindCard", "neglect");
    await advanceTo(page.getByRole("heading", { name: /qué tan grave/i }));

    // Step 2 — Gravedad
    await pickCard(page, "severityCard", "moderado");
    await advanceTo(page.locator("textarea#description"));

    // Step 3 — Dónde y cuándo (free-text carries the PRUEBA SINTÉTICA marker)
    await page.locator("textarea#description").fill(description);
    await pickCard(page, "occurredAtOption", "today_yesterday");
    await advanceTo(page.locator('label:has(input[name="subjectKindCard"])').first());

    // Step 4 — Quién (optional): skip fast if a skip control exists, else fill.
    const skip = page.getByRole("button", { name: /saltear este paso/i });
    if (
      await skip
        .count()
        .then((c) => c > 0)
        .catch(() => false)
    ) {
      await skip.click();
      await expect(page.getByRole("button", { name: /enviar an[oó]nima/i })).toBeVisible({
        timeout: 10_000,
      });
    } else {
      await pickCard(page, "subjectKindCard", "unowned_animal");
      await advanceTo(page.getByRole("button", { name: /enviar an[oó]nima/i }));
    }

    // Step 5 — Cerrar: anonymous + evidence photo + submit
    await page.getByRole("button", { name: /enviar an[oó]nima/i }).click();
    await page.locator("#evidenceFiles").setInputFiles(DEMO_PHOTOS[0]);
    const submit = page.getByRole("button", { name: /enviar denuncia/i });
    await expect(submit, "denuncia submit button enabled").toBeEnabled();
    await submit.click();

    // Success: redirect to the comprobante + the reference-code screen.
    await page.waitForURL(/\/denuncias\/codigo\//, { timeout: 40_000 });
    await expect(
      page.getByText(/tu código de seguimiento|denuncia registrada/i),
      "reference-code screen rendered",
    ).toBeVisible({ timeout: 20_000 });
  });
});
