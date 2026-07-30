import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for DIM e2e tests.
 *
 * Runs against the built Next.js app (`next build && next start`) on a fixed
 * port so tests hit the same code path that staging/production use — not the
 * hot-reload dev server.
 *
 * In CI, Supabase must be started and `pnpm db:bootstrap` run before this
 * suite. See .github/workflows/ci.yml (e2e job).
 *
 * Local usage when the stack is up:
 *   pnpm e2e
 *
 * ─── ⚠ DO NOT USE THIS CONFIG AGAINST A LIVE QA SERVER ────────────────────
 * This is the DEFAULT config (`pnpm e2e` / a bare `playwright test` picks it
 * up), and it owns a `webServer` block that runs `pnpm build && pnpm start`.
 * Running it while `scripts/qa-up.ps1` has a server up REWRITES `.next` under
 * that live process — the served JS chunks 404 and the QA session dies
 * mid-run. It has burned this project more than once.
 *
 * To drive an already-running QA server, use the no-webServer configs:
 *   pnpm exec playwright test --config=playwright.local3000.config.ts
 *   (port via QA_PORT, matching `qa-up.ps1 -Port`)
 *
 * The 3333 below is deliberate: it must never collide with the QA server's
 * port so a mistake here cannot bind over a live one. Do not "unify" it with
 * QA_PORT — the separation IS the guard.
 */

const PORT = 3333;
const BASE_URL = `http://localhost:${PORT}`;

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : [["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Serve the built Next.js app. In CI the "Build Next.js app" step runs
  // first, so we only need `pnpm start`. Locally we build + start together.
  // Set NEXT_BUILT=1 in the environment to skip the build step (CI does this).
  webServer: {
    command: process.env.NEXT_BUILT
      ? `pnpm start --port ${PORT}`
      : `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
    },
  },
});
