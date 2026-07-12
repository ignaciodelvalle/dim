// Panorama a11y QA harness (task #43) — axe-core + keyboard checks.
//
// Re-runs axe-core 4.11.4 (repo node_modules, NO CDN) across the Panorama
// console states the audit covered, and drives the keyboard paths the audit
// flagged, to confirm the WCAG/Ley 26.653 fixes landed:
//   A1 dangling aria-controls, A3 nested-interactive (map), A4 orphaned
//   listitem (presets), A2/A5/A6 contrast, M1 focus-restore + M2 announce
//   (scope pill), M3 roving dock tablist.
//
// Usage (server must be running on :3000 with the fresh build):
//   pnpm exec tsx scripts/qa-panorama-a11y.ts --email=admin@dim.test
//   pnpm exec tsx scripts/qa-panorama-a11y.ts --email=lucas@dim.test

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, chromium } from "@playwright/test";

const AXE_PATH = resolve("node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js");
const TARGET_RULES = new Set([
  "aria-valid-attr-value", // A1
  "nested-interactive", // A3
  "listitem", // A4
  "color-contrast", // A2/A5/A6
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
const OUT = args.get("out") ?? ".";
const panoramaPath = EMAIL.startsWith("admin@") ? "/admin/panorama" : "/gob/panorama";
const tag = EMAIL.startsWith("admin@") ? "admin" : "lucas";

type AxeViolation = {
  id: string;
  impact: string | null;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

async function runAxe(page: Page, state: string): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const results = (await page.evaluate(async () => {
    // @ts-expect-error injected global
    return await window.axe.run(document, {
      resultTypes: ["violations"],
    });
  })) as { violations: AxeViolation[] };
  const targeted = results.violations.filter((v) => TARGET_RULES.has(v.id));
  const total = results.violations.length;
  const targetedCount = targeted.reduce((n, v) => n + v.nodes.length, 0);
  console.log(`  [${state}] total axe violations: ${total} | TARGET-rule nodes: ${targetedCount}`);
  for (const v of targeted) {
    console.log(
      `    ✗ ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(" ")}`,
    );
  }
  return results.violations;
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/correo electrónico/i).fill(EMAIL);
  await page.getByLabel(/contraseña/i).fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
}

async function waitForMap(page: Page): Promise<void> {
  await page.getByTestId("panorama-dock").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function main() {
  const report: Record<string, unknown> = { email: EMAIL, base: BASE, states: {} };
  const states = report.states as Record<string, AxeViolation[]>;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const kb: Record<string, unknown> = {};

  try {
    await login(page);

    // --- National ---
    await page.goto(`${BASE}${panoramaPath}`, { waitUntil: "domcontentloaded" });
    await waitForMap(page);
    states.national = await runAxe(page, "national");
    await page.screenshot({ path: join(OUT, `panorama-a11y-qa-${tag}-national.png`) });

    // --- A1: dock aria-controls presence by state (collapsed vs expanded) ---
    const collapsedControls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((t) =>
        t.getAttribute("aria-controls"),
      ),
    );
    await page.getByRole("tab", { name: /Estadísticas/ }).click();
    await page.waitForTimeout(400);
    const expandedControls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((t) =>
        t.getAttribute("aria-controls"),
      ),
    );
    const panelExists = await page.evaluate(() => !!document.getElementById("pano-dock-panel"));
    kb.dockAriaControls = {
      collapsed: collapsedControls,
      expanded: expandedControls,
      panelExistsWhenExpanded: panelExists,
    };
    states.dockExpanded = await runAxe(page, "dock-expanded(stats)");
    await page.screenshot({ path: join(OUT, `panorama-a11y-qa-${tag}-dock.png`) });

    // --- M3: dock roving tabindex + ArrowRight ---
    await page.getByRole("tab", { name: /Registros/ }).focus();
    const tabIdxBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.getAttribute("tabindex")),
    );
    await page.keyboard.press("ArrowRight");
    const afterArrow = await page.evaluate(() => ({
      active: document.activeElement?.getAttribute("id"),
      tabindex: Array.from(document.querySelectorAll('[role="tab"]')).map((t) =>
        t.getAttribute("tabindex"),
      ),
    }));
    kb.dockRoving = { tabIdxBefore, afterArrow };

    // Collapse the dock again for the panel scans.
    await page.getByRole("button", { name: /Colapsar/ }).click();
    await page.waitForTimeout(300);

    // --- Rail panels (A4 presets, A5 filtro) ---
    for (const label of ["Vista", "Capas del mapa", "Período", "Exportar", "Acerca"]) {
      const btn = page.getByRole("button", { name: label, exact: true }).first();
      if ((await btn.count()) === 0) continue;
      await btn.click();
      await page.waitForTimeout(400);
      states[`rail-${label}`] = await runAxe(page, `rail-${label}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    // --- Drilled (admin: force province=AR-C; lucas is already CABA-scoped) ---
    const drillUrl = EMAIL.startsWith("admin@")
      ? `${BASE}${panoramaPath}?province=AR-C`
      : `${BASE}${panoramaPath}`;
    await page.goto(drillUrl, { waitUntil: "domcontentloaded" });
    await waitForMap(page);
    states.drilled = await runAxe(page, "drilled");
    await page.screenshot({ path: join(OUT, `panorama-a11y-qa-${tag}-drilled.png`) });

    // --- M1 + M2: scope pill commit → focus restore + announce (admin only) ---
    if (EMAIL.startsWith("admin@")) {
      await page.goto(`${BASE}${panoramaPath}`, { waitUntil: "domcontentloaded" });
      await waitForMap(page);
      const pill = page.getByTestId("panorama-scope-pill");
      await pill.click(); // open the disclosure
      await page.waitForTimeout(300);
      const select = page.locator("select").first();
      if ((await select.count()) > 0) {
        // Commit a province via the native select (the keyboard path).
        const optionValue = await page.evaluate(() => {
          const s = document.querySelector("select");
          if (!s) return null;
          const opt = Array.from(s.options).find(
            (o) => /Córdoba|Buenos Aires|Catamarca/i.test(o.textContent ?? "") && o.value,
          );
          return opt?.value ?? null;
        });
        if (optionValue) {
          await select.selectOption(optionValue);
          await page.waitForTimeout(600);
        }
      }
      const afterCommit = await page.evaluate(() => ({
        activeIsSummary:
          document.activeElement?.getAttribute("data-testid") === "panorama-scope-pill",
        activeTag: document.activeElement?.tagName,
        liveRegionText:
          document.querySelector('[data-testid="panorama-scope-live"]')?.textContent ?? null,
      }));
      kb.scopeCommit = afterCommit;
    }

    report.keyboard = kb;
    const outFile = join(OUT, `panorama-a11y-qa-${tag}.json`);
    writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`\n  wrote ${outFile}`);
    console.log(`  keyboard checks: ${JSON.stringify(kb, null, 2)}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
