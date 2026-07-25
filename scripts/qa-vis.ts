/**
 * Generic visual QA driver for MiMAR — a scriptable browser the agent can "see" through.
 *
 * Unlike the route-level harnesses (qa-routes.ts) which only assert on HTML, this
 * drives a real chromium page, runs an arbitrary step list, and writes PNGs the
 * caller reads back. It replaces an interactive browser tool for headless runs.
 *
 * Two ways to use it:
 *
 *   1. Quick single-route capture
 *      pnpm exec tsx scripts/qa-vis.ts --email=admin@dim.test --route=/admin/panorama \
 *        --wait=panorama-dock --name=entry --text
 *
 *   2. Step script (multi-step interactions: hover, click, drill, replay, …)
 *      pnpm exec tsx scripts/qa-vis.ts --steps=path/to/steps.json
 *
 * Step file shape (all fields optional except `steps`):
 *   {
 *     "email": "admin@dim.test",
 *     "viewport": [1920, 1080],
 *     "steps": [
 *       { "do": "goto",   "url": "/admin/panorama?preset=zoonosis" },
 *       { "do": "wait",   "testid": "panorama-dock" },
 *       { "do": "shot",   "name": "entry" },
 *       { "do": "hover",  "testid": "ranked-row-0" },
 *       { "do": "shot",   "name": "hover-preview", "clip": "viewport" },
 *       { "do": "click",  "text": "Buenos Aires" },
 *       { "do": "sleep",  "ms": 1500 },
 *       { "do": "shot",   "name": "after-drill" },
 *       { "do": "text",   "selector": "main" },
 *       { "do": "eval",   "expr": "document.querySelectorAll('[data-testid]').length" }
 *     ]
 *   }
 *
 * Console errors and uncaught page errors are always collected and printed at the
 * end — a clean screenshot over a broken console is not a passing state.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type BrowserContext, type Page, chromium } from "@playwright/test";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);

const DEFAULT_OUT = resolve(
  "C:/Users/ignac/AppData/Local/Temp/claude/C--dev-dim/fbc69ed4-726f-4750-ac0d-3b5c4c5de034/scratchpad/vis",
);

type Step =
  | { do: "goto"; url: string }
  | { do: "wait"; testid?: string; selector?: string; text?: string; timeout?: number }
  | { do: "shot"; name: string; clip?: "viewport" | "full" }
  | { do: "click"; testid?: string; selector?: string; text?: string; role?: string }
  | { do: "hover"; testid?: string; selector?: string; text?: string }
  | { do: "fill"; selector: string; value: string }
  | { do: "press"; key: string }
  | { do: "sleep"; ms: number }
  | { do: "text"; selector?: string; limit?: number }
  | { do: "eval"; expr: string };

type StepFile = {
  email?: string;
  password?: string;
  base?: string;
  viewport?: [number, number];
  out?: string;
  tag?: string;
  steps: Step[];
};

function loadConfig(): Required<Omit<StepFile, "steps">> & { steps: Step[] } {
  const stepsPath = args.get("steps");
  const file: StepFile = stepsPath
    ? (JSON.parse(readFileSync(stepsPath, "utf8")) as StepFile)
    : { steps: [] };

  // Quick mode: --route builds a minimal step list.
  if (!stepsPath) {
    const route = args.get("route");
    if (!route) {
      console.error("Need either --steps=<file.json> or --route=<path>");
      process.exit(1);
    }
    const waitTestId = args.get("wait");
    const name = args.get("name") ?? "shot";
    file.steps = [
      { do: "goto", url: route },
      ...(waitTestId ? ([{ do: "wait", testid: waitTestId }] as Step[]) : []),
      { do: "sleep", ms: Number(args.get("settle") ?? 2000) },
      { do: "shot", name, clip: args.get("full") ? "full" : "viewport" },
      ...(args.get("text") ? ([{ do: "text", selector: "main" }] as Step[]) : []),
    ];
  }

  const viewportArg = args.get("viewport");
  const viewport: [number, number] = viewportArg
    ? (viewportArg.split("x").map(Number) as [number, number])
    : (file.viewport ?? [1440, 900]);

  return {
    email: args.get("email") ?? file.email ?? "admin@dim.test",
    password: args.get("password") ?? file.password ?? "Test1234!",
    base: args.get("base") ?? file.base ?? "http://localhost:3000",
    viewport,
    out: args.get("out") ?? file.out ?? DEFAULT_OUT,
    tag: args.get("tag") ?? file.tag ?? "vis",
    steps: file.steps,
  };
}

const cfg = loadConfig();

// ---------------------------------------------------------------------------
// Auth — storage state is cached per email so long capture runs skip re-login.
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 20 * 60 * 1000;

function statePath(email: string): string {
  return resolve(cfg.out, `.state-${email.replace(/[^a-z0-9]/gi, "_")}.json`);
}

function freshStateFor(email: string): string | undefined {
  if (args.get("fresh")) return undefined;
  const p = statePath(email);
  if (!existsSync(p)) return undefined;
  if (Date.now() - statSync(p).mtimeMs > STATE_TTL_MS) return undefined;
  return p;
}

async function login(page: Page): Promise<void> {
  await page.goto(`${cfg.base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/correo electrónico/i).fill(cfg.email);
  await page.getByLabel(/contraseña/i).fill(cfg.password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

/**
 * Git Bash on Windows rewrites any argv entry starting with "/" into a Windows
 * path (MSYS path conversion), so `--route=/admin/panorama` arrives as
 * `C:/Program Files/Git/admin/panorama`. Undo that, and accept routes passed
 * without a leading slash (the mangle-proof way to call this from bash).
 */
function normalizeUrl(raw: string): string {
  if (raw.startsWith("http")) return raw;
  const demangled = raw.replace(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/]/, "/").replace(/\\/g, "/");
  return demangled.startsWith("/") ? demangled : `/${demangled}`;
}

function locate(page: Page, s: { testid?: string; selector?: string; text?: string }) {
  if (s.testid) return page.getByTestId(s.testid);
  if (s.selector) return page.locator(s.selector);
  if (s.text) return page.getByText(s.text, { exact: false }).first();
  throw new Error("step needs one of: testid | selector | text");
}

async function runStep(page: Page, step: Step, shots: string[]): Promise<void> {
  switch (step.do) {
    case "goto": {
      const path = normalizeUrl(step.url);
      const url = path.startsWith("http") ? path : `${cfg.base}${path}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      console.log(`  goto ${path}`);
      break;
    }
    case "wait": {
      await locate(page, step)
        .first()
        .waitFor({ state: "visible", timeout: step.timeout ?? 20_000 });
      console.log(`  wait ok (${step.testid ?? step.selector ?? step.text})`);
      break;
    }
    case "shot": {
      const path = resolve(cfg.out, `${cfg.tag}-${step.name}.png`);
      await page.screenshot({ path, fullPage: step.clip === "full" });
      shots.push(path);
      console.log(`  shot -> ${path}`);
      break;
    }
    case "click": {
      const target = step.role
        ? page.getByRole(step.role as "button", { name: new RegExp(step.text ?? "", "i") })
        : locate(page, step);
      await target.first().click({ timeout: 15_000 });
      console.log(`  click (${step.testid ?? step.selector ?? step.text})`);
      break;
    }
    case "hover": {
      await locate(page, step).first().hover({ timeout: 15_000 });
      console.log(`  hover (${step.testid ?? step.selector ?? step.text})`);
      break;
    }
    case "fill": {
      await page.locator(step.selector).first().fill(step.value);
      console.log(`  fill ${step.selector}`);
      break;
    }
    case "press": {
      await page.keyboard.press(step.key);
      console.log(`  press ${step.key}`);
      break;
    }
    case "sleep": {
      await page.waitForTimeout(step.ms);
      break;
    }
    case "text": {
      const sel = step.selector ?? "body";
      const txt = await page.locator(sel).first().innerText();
      const limit = step.limit ?? 4000;
      console.log(`\n----- TEXT ${sel} -----\n${txt.slice(0, limit)}\n----- /TEXT -----\n`);
      break;
    }
    case "eval": {
      const value = await page.evaluate((e) => {
        // biome-ignore lint/security/noGlobalEval: QA-only driver, expression comes from the local step file
        return eval(e);
      }, step.expr);
      console.log(`  eval ${step.expr} => ${JSON.stringify(value)}`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(cfg.out, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const storageState = freshStateFor(cfg.email);
  const context: BrowserContext = await browser.newContext({
    viewport: { width: cfg.viewport[0], height: cfg.viewport[1] },
    deviceScaleFactor: 1,
    storageState,
    // --reduced emulates `prefers-reduced-motion: reduce`. Beyond auditing the
    // accessibility floor, it is the clean DISCRIMINATOR for animation work:
    // capture the same interaction with and without it, and only a real
    // transition changes its mid-frame between the two runs.
    reducedMotion: args.get("reduced") ? "reduce" : "no-preference",
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

  console.log(
    `[qa-vis] ${cfg.email} @ ${cfg.viewport[0]}x${cfg.viewport[1]} -> ${cfg.base} (session: ${storageState ? "cached" : "fresh login"})`,
  );

  if (!storageState) {
    await login(page);
    await context.storageState({ path: statePath(cfg.email) });
  }

  const shots: string[] = [];
  for (const step of cfg.steps) {
    try {
      await runStep(page, step, shots);
    } catch (e) {
      console.log(`  STEP FAILED (${step.do}): ${String(e).split("\n")[0]}`);
      const failShot = resolve(cfg.out, `${cfg.tag}-FAIL-${step.do}.png`);
      await page.screenshot({ path: failShot }).catch(() => {});
      console.log(`  fail shot -> ${failShot}`);
    }
  }

  console.log(`\n=== CONSOLE ERRORS (${consoleErrors.length}) ===`);
  for (const e of [...new Set(consoleErrors)].slice(0, 25)) console.log(`  ${e}`);

  console.log(`\n=== SHOTS (${shots.length}) ===`);
  for (const s of shots) console.log(`  ${s}`);

  // Machine-readable index so a caller can pick the files up without parsing logs.
  writeFileSync(
    resolve(cfg.out, `${cfg.tag}-index.json`),
    JSON.stringify({ shots, consoleErrors: [...new Set(consoleErrors)] }, null, 2),
  );

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[qa-vis] fatal:", e);
  process.exit(1);
});
