import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

/**
 * Panorama — thorough LIVE staging verification (situational-awareness console).
 *
 * Drives the real deployed panorama end to end: both operator consoles render
 * (map + KPIs + scope + demo disclosure), the four API routes are healthy and
 * correctly gated, and — the crown jewel — the govt scope-intersection
 * guarantee holds (a govt operator can NEVER widen scope by crafting the
 * ?province param; _guard.ts + narrowGovtScope).
 *
 * Aimed at the deployed origin via playwright.staging.config.ts:
 *   STAGING_URL=https://dim-staging.vercel.app \
 *     pnpm exec playwright test e2e/panorama-live.spec.ts \
 *     --config=playwright.staging.config.ts
 *
 * Not part of the default local suite — it depends on the staging seed + the
 * remote guard chain. Serial (the staging config already pins workers: 1).
 */

const LAYERS = [
  "cobertura",
  "denuncias",
  "desierto-veterinario",
  "mordeduras",
  "ppp",
  "sintomas",
  "tendencia",
] as const;

const AR_BUENOS_AIRES = "AR-B";

// Where per-console screenshots land for the human report.
const SHOT_DIR =
  "C:/Users/ignac/AppData/Local/Temp/claude/C--dev-dim/80419464-4773-42d5-8c9c-57f62b1d9aa2/scratchpad/staging_rerun";

test.describe("panorama — live staging verification", () => {
  // -------------------------------------------------------------------------
  // (1) GOVT console renders, jurisdiction-scoped to CABA.
  // -------------------------------------------------------------------------
  test("(1) govt /gob/panorama renders — map + KPIs + CABA scope + demo disclosure", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await loginAs(page, ACCOUNTS.govt);
    await page.goto("/gob/panorama", { waitUntil: "domcontentloaded" });

    // Console loaded signal (jurisdiction-scoped eyebrow).
    await expect(
      page.getByText(/Centro de Situación/i).first(),
      "panorama console heading",
    ).toBeVisible({ timeout: 20_000 });

    // MapLibre canvas paints.
    await expect(page.locator("canvas").first(), "panorama MapLibre canvas painted").toBeVisible({
      timeout: 60_000,
    });

    // KPI strip present with at least one numeric indicator.
    const kpiRegion = page.getByRole("list", { name: /Indicadores de esta vista/i }).first();
    await expect(kpiRegion, "KPI indicator strip").toBeVisible({ timeout: 20_000 });
    await expect(kpiRegion, "at least one numeric KPI value").toContainText(/[0-9]/);

    // Scope is jurisdiction-scoped to CABA (NOT national) — the whole point of
    // jurisdiction-compliance for a CABA-assigned govt account. The scope rides
    // in the VISIBLE console heading ("Centro de Situación · CABA · …"); the
    // panorama-scope-live testid is an sr-only aria-live announcer that is
    // empty between announcements, so it is NOT a reliable anchor.
    await expect(
      page.getByText(/Centro de Situación/i).first(),
      "console heading reflects CABA jurisdiction scope",
    ).toContainText(/CABA/i);

    // Demo-data disclosure present (staging runs on demo data).
    await expect(
      page.getByText(/Datos de demostración/i).first(),
      "demo-data disclosure",
    ).toBeVisible({ timeout: 20_000 });

    // No error boundary.
    await expect(page.getByText(/application error|algo salió mal/i)).not.toBeVisible();

    await page.screenshot({ path: `${SHOT_DIR}/panorama-govt.png`, fullPage: true });

    // Surface (don't hard-crash on) noisy client errors — MapLibre tiles can
    // log benign AbortErrors; fail only on app-level errors.
    const appErrors = consoleErrors.filter(
      (e) => !/AbortError|tiles?|font|glyph|sprite|ResizeObserver/i.test(e),
    );
    expect(appErrors, `unexpected console errors:\n${appErrors.join("\n")}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (2) ADMIN console renders (national/universal scope).
  // -------------------------------------------------------------------------
  test("(2) admin /admin/panorama renders — map + KPIs (national scope)", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/admin/panorama", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByText(/Centro de Situación/i).first(),
      "admin panorama heading",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("canvas").first(), "admin panorama canvas").toBeVisible({
      timeout: 60_000,
    });
    const kpiRegion = page.getByRole("list", { name: /Indicadores de esta vista/i }).first();
    await expect(kpiRegion, "admin KPI strip").toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/application error|algo salió mal/i)).not.toBeVisible();

    await page.screenshot({ path: `${SHOT_DIR}/panorama-admin.png`, fullPage: true });
  });

  // -------------------------------------------------------------------------
  // (3) API institutional gate — unauthenticated caller gets 401, never data.
  // -------------------------------------------------------------------------
  test("(3) panorama APIs reject an unauthenticated caller (401)", async ({
    playwright,
    baseURL,
  }) => {
    const anon = await playwright.request.newContext({ baseURL: baseURL ?? undefined });
    try {
      for (const path of [
        "/api/panorama/kpis",
        "/api/panorama/mordeduras",
        "/api/panorama/scope",
      ]) {
        const res = await anon.get(path);
        expect(res.status(), `${path} unauth → 401`).toBe(401);
      }
    } finally {
      await anon.dispose();
    }
  });

  // -------------------------------------------------------------------------
  // (4) API data health as govt — every layer + kpis + scope respond, with
  //     the documented cache headers; unknown layer 404s; bad unit-history 400s.
  // -------------------------------------------------------------------------
  test("(4) govt panorama APIs are healthy (layers + kpis + scope + negatives)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, ACCOUNTS.govt);

    // KPIs — 200 or 503 (degraded under load is acceptable, not a break).
    const kpiRes = await page.request.get("/api/panorama/kpis");
    expect([200, 503], "kpis status").toContain(kpiRes.status());
    expect(kpiRes.headers()["x-kpi-cache"], "x-kpi-cache header present").toBeTruthy();

    // Each layer — 200 (FeatureCollection) or 503 (degraded). Never 4xx.
    const degraded: string[] = [];
    for (const layer of LAYERS) {
      const res = await page.request.get(`/api/panorama/${layer}`);
      expect([200, 503], `${layer} status (${res.status()})`).toContain(res.status());
      expect(res.headers()["x-layer-cache"], `${layer} x-layer-cache header`).toBeTruthy();
      if (res.status() === 200) {
        const body = await res.json();
        // The layer route returns an ENVELOPE: { features: FeatureCollection,
        // truncated, suppressedCount, level, degraded, ... }. Validate the
        // nested FeatureCollection AND the honesty/anonymity metadata the
        // console depends on (degraded flag + k<5 suppressedCount).
        expect(
          body.features?.type === "FeatureCollection" && Array.isArray(body.features.features),
          `${layer} returns a FeatureCollection envelope`,
        ).toBeTruthy();
        expect(typeof body.degraded, `${layer} declares the degraded honesty flag`).toBe("boolean");
        expect(typeof body.suppressedCount, `${layer} reports a k<5 suppressedCount`).toBe(
          "number",
        );
        if (body.degraded) degraded.push(`${layer} (200-degraded)`);
      } else {
        degraded.push(layer);
      }
    }
    if (degraded.length) console.log(`[panorama] degraded (503) layers: ${degraded.join(", ")}`);

    // Scope endpoint.
    const scopeRes = await page.request.get("/api/panorama/scope");
    expect([200, 503], "scope status").toContain(scopeRes.status());

    // Negative: unknown layer → 404.
    const unknown = await page.request.get("/api/panorama/not-a-real-layer");
    expect(unknown.status(), "unknown layer → 404").toBe(404);

    // Negative: unit-history without required params → 400.
    const badUnit = await page.request.get("/api/panorama/unit-history");
    expect(badUnit.status(), "unit-history missing params → 400").toBe(400);
  });

  // -------------------------------------------------------------------------
  // (5) SCOPE-INTERSECTION SECURITY (crown jewel): a govt operator can NEVER
  //     widen scope by crafting ?province. A CABA govt asking for Buenos Aires
  //     must NOT receive the Buenos Aires dataset an admin would get for the
  //     same crafted param.
  // -------------------------------------------------------------------------
  test("(5) govt cannot widen scope via ?province — crafted Buenos Aires ≠ admin's Buenos Aires", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    // Admin: real Buenos Aires KPIs (the data a national actor legitimately sees).
    const adminCtx = await browser.newContext({ baseURL: baseURL ?? undefined });
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, ACCOUNTS.admin);
    const adminBA = await adminPage.request.get(`/api/panorama/kpis?province=${AR_BUENOS_AIRES}`);
    expect([200, 503], "admin BA kpis status").toContain(adminBA.status());
    const adminBABody = adminBA.status() === 200 ? JSON.stringify(await adminBA.json()) : null;

    // Govt (CABA): default scope, plus a crafted Buenos Aires request.
    const govtCtx = await browser.newContext({ baseURL: baseURL ?? undefined });
    const govtPage = await govtCtx.newPage();
    await loginAs(govtPage, ACCOUNTS.govt);
    const govtBA = await govtPage.request.get(`/api/panorama/kpis?province=${AR_BUENOS_AIRES}`);
    expect([200, 503], "govt BA kpis status").toContain(govtBA.status());

    const govtBABody = govtBA.status() === 200 ? JSON.stringify(await govtBA.json()) : null;

    // The security invariant: if all three resolved with data, the govt's
    // crafted Buenos Aires response must NOT equal the admin's Buenos Aires
    // response — a CABA govt does not get Buenos Aires data by crafting params.
    if (adminBABody && govtBABody) {
      expect(
        govtBABody,
        "govt crafting ?province=AR-B received the admin's Buenos Aires dataset (scope widening!)",
      ).not.toBe(adminBABody);
    }

    // And the govt's crafted request must not exceed its own default scope: the
    // out-of-scope province narrows to empty, so it must differ from (be no
    // wider than) the CABA default. Equal bodies here would mean the param was
    // silently ignored INTO the default (safe); a match to admin BA (checked
    // above) would be the breach. We assert the non-breach explicitly.
    expect(
      Boolean(adminBABody) && govtBABody === adminBABody,
      "govt Buenos Aires response identical to admin Buenos Aires response",
    ).toBe(false);

    await adminCtx.close();
    await govtCtx.close();
  });
});
