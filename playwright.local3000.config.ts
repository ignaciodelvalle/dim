import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config that runs the e2e suite against the ALREADY-RUNNING
 * production server on http://localhost:3000 (the QA server started by
 * `pwsh scripts/qa-up.ps1`).
 *
 * Unlike playwright.config.ts, there is NO `webServer` block: this config
 * never builds or starts its own server, so it can't clobber the live :3000
 * build (the ".next clobber under running server" failure mode) and never
 * spins the default self-built server on :3333 (which caused false
 * alta-hang failures when the fresh build was slow to warm up).
 *
 * Reuse the existing server — start it once with qa-up.ps1, then:
 *   pnpm exec playwright test --config=playwright.local3000.config.ts
 *
 * Runs serially (workers: 1). The crisis seams are multi-actor journeys that
 * relogin the shared `page` across roles and mutate shared demo fixtures
 * (mark-lost, adoption custody), so parallel workers would collide on the
 * same seed rows.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Bound individual actions so a selector that drifted from the current UI
    // (a renamed button, a data-state branch the recording didn't anticipate)
    // FAILS FAST with its own screenshot instead of silently waiting out the
    // whole 18-25 min test budget. Playwright's default actionTimeout is 0
    // (unbounded → inherits the test timeout), which turned every diverged
    // click into an 18-minute hang. 20s is generous for a warm local server.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
