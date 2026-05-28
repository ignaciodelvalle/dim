import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // @vitejs/plugin-react transforms .tsx with the automatic JSX runtime even
  // though the repo's tsconfig sets `jsx: "preserve"` (which Next.js needs).
  // Required by component-level tests introduced in Poncho PR-A.
  plugins: [react()],
  test: {
    // Tests touch the local Postgres via Drizzle; run serially to avoid
    // cross-test pollution. Per-file isolation is fine; the helper itself
    // is idempotent enough that the dedupe test does its own teardown.
    fileParallelism: false,
    setupFiles: ["./__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["lib/**", "app/**"],
      exclude: [
        "components/**",
        "__tests__/**",
        "node_modules/**",
        ".next/**",
        "db/migrations/**",
        "**/*.d.ts",
      ],
      // Branch-coverage targets per docs/testing/PLAN.md D2. The 75%
      // target on app/actions is also enforced socially in review:
      // each server action must ship with at least one happy-path and
      // two negative tests.
      thresholds: {
        "lib/business-rules-**": { branches: 90 },
        "lib/**-rules/**": { branches: 90 },
        "lib/case-lifecycles/**": { branches: 90 },
        "lib/**": { branches: 70 },
        "app/actions/**": { branches: 75 },
        "app/api/**": { branches: 60 },
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
      // server-only throws at import time in non-Next.js environments.
      // In Vitest (Node.js) we stub it as a no-op so server-only modules
      // can be imported and tested without the Next.js runtime.
      "server-only": new URL("./__tests__/__mocks__/server-only.ts", import.meta.url).pathname,
    },
  },
});
