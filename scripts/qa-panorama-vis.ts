// Panorama VISUALS/CHROME QA harness (task #49) — screenshots + axe re-check.
//
// Drives the panorama console across the states the #49 visual round touches and
// captures panorama-vis-qa-*.png in the repo root, plus an axe-core pass to
// confirm the chrome-contrast / a11y round kept 0 targeted violations.
//
// Usage (server must be running on :3000 with the fresh build):
//   pnpm exec tsx scripts/qa-panorama-vis.ts --email=admin@dim.test
//   pnpm exec tsx scripts/qa-panorama-vis.ts --email=lucas@dim.test

import { resolve } from "node:path";

import { type Page, chromium } from "@playwright/test";

const AXE_PATH = resolve("node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js");
const TARGET_RULES = new Set([
  "aria-valid-attr-value",
  "nested-interactive",
  "listitem",
  "color-contrast",
]);

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const EMAIL = args.get("email") ?? "admin@dim.test";
const PASSWORD = args.get("password") ?? "Test1234!";
const BASE = args.get("base") ?? "http://localhost:3000";
const panoramaPath = EMAIL.startsWith("admin@") ? "/admin/panorama" : "/gob/panorama";
const tag = EMAIL.startsWith("admin@") ? "admin" : "lucas";

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1366, h: 768 },
];

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/correo electrónico/i).fill(EMAIL);
  // getByLabel(/contraseña/i) is AMBIGUOUS: the field grew a "Mostrar
  // contraseña" toggle whose aria-label matches the same regex, so Playwright
  // fails on strict mode and these four QA drivers could not log in AT ALL.
  // Found 2026-08-10 by smoke-testing the driver before depending on it —
  // nobody had run them since the toggle landed. getByRole pins the input.
  await page.getByRole("textbox", { name: /contraseña/i }).fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
}

async function waitForMap(page: Page): Promise<void> {
  await page.getByTestId("panorama-dock").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(2200);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `panorama-vis-qa-${name}.png` });
  console.log(`  shot -> panorama-vis-qa-${name}.png`);
}

type AxeViolation = { id: string; impact: string; nodes: unknown[] };

async function axe(page: Page, state: string): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const results = (await page.evaluate(async () => {
    // @ts-expect-error injected global
    return await window.axe.run(document, { resultTypes: ["violations"] });
  })) as { violations: AxeViolation[] };
  const targeted = results.violations.filter((v) => TARGET_RULES.has(v.id));
  const nodeCount = targeted.reduce((n, v) => n + v.nodes.length, 0);
  console.log(`  [${state}] axe total=${results.violations.length} targeted=${nodeCount}`);
  for (const v of targeted) console.log(`    x ${v.id} (${v.impact}) x ${v.nodes.length}`);
  return targeted;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await login(page);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const wtag = `${vp.w}`;

    // National view: floating chrome over the map, control cluster, home icon.
    await page.goto(`${BASE}${panoramaPath}`, { waitUntil: "domcontentloaded" });
    await waitForMap(page);
    await shot(page, `${tag}-national-${wtag}`);
    if (vp.w === 1920) await axe(page, `${tag}-national`);

    // Legend pill expanded in place (item 9).
    try {
      await page.getByTestId("panorama-scope-pill").waitFor({ timeout: 3000 });
    } catch {}
    // Drill into CABA (province=AR-C): NO double CABA inset (item 6).
    await page.goto(`${BASE}${panoramaPath}?province=AR-C`, { waitUntil: "domcontentloaded" });
    await waitForMap(page);
    await shot(page, `${tag}-caba-drill-${wtag}`);

    // Drill into PBA (province=AR-B): CABA inset KEPT (item 6 control).
    await page.goto(`${BASE}${panoramaPath}?province=AR-B`, { waitUntil: "domcontentloaded" });
    await waitForMap(page);
    await shot(page, `${tag}-pba-drill-${wtag}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
