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
