import { defineConfig, devices } from "@playwright/test";

/**
 * final-seams against the ALREADY-RUNNING QA server. No `webServer` — see the
 * header of playwright.local3000.config.ts for why that matters.
 *
 * Same port contract as that config: `QA_PORT` (default 3000), matching
 * `qa-up.ps1 -Port`.
 */
const QA_PORT = Number(process.env.QA_PORT?.trim() || 3000);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "final-seams.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${QA_PORT}`,
    ...devices["Desktop Chrome"],
  },
});
