import { randomInt } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config that runs the e2e suite against the DEPLOYED staging
 * origin (https://dim-staging.vercel.app by default, STAGING_URL to override).
 * Used by the nightly workflow (.github/workflows/e2e-nightly.yml) and for
 * ad-hoc staging passes.
 *
 * Differences from playwright.config.ts (the local :3333 self-built config):
 *   - NO webServer block — the target is already deployed; nothing to build
 *     or start (and no risk of the ".next clobber under running server"
 *     failure mode).
 *   - Serial (workers: 1). Several suites are multi-actor journeys that
 *     mutate shared seed fixtures (mark-lost, adoption custody); parallel
 *     workers would collide on the same staging rows.
 *   - Remote timeouts — cold serverless starts on Vercel need more headroom
 *     than a warm local server (same rationale as playwright.local3000).
 *   - demo/ (narrated 15-18 min recordings) and perf/ are excluded; they are
 *     not regression tests.
 *
 * Rate-limit workaround (login limiter trusts x-real-ip): a whole suite
 * hammering staging from one CI egress IP trips the per-IP login buckets.
 * Every context in this run carries a random RFC-5737 documentation IP so
 * consecutive nightly runs land in fresh buckets. Suites that need per-context
 * uniqueness (e.g. authz-ab-isolation) already override this header per
 * context with their own uniqueIp() — this default only covers the rest.
 */

const BASE_URL = (process.env.STAGING_URL?.trim() || "https://dim-staging.vercel.app").replace(
  /\/+$/,
  "",
);

// One random documentation-range IP per run (TEST-NET-3, RFC 5737).
const RUN_IP = `203.0.113.${randomInt(1, 255)}`;

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["demo/**", "perf/**"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    // Fail fast on drifted selectors instead of waiting out the full test
    // budget (rationale documented in playwright.local3000.config.ts).
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    extraHTTPHeaders: { "x-real-ip": RUN_IP },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
