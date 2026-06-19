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
    // globalSetup runs once in the main process (not per-file). Used to
    // gracefully close the postgres.js pool after the full suite completes,
    // preventing "Worker exited unexpectedly" errors that occur when open
    // sockets are forcibly torn down by the process exit handler instead.
    globalSetup: ["./__tests__/global-setup.ts"],
    exclude: ["node_modules/**", ".claude/worktrees/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["lib/**", "app/**", "src/**"],
      exclude: [
        "components/**",
        "__tests__/**",
        "node_modules/**",
        ".next/**",
        "db/migrations/**",
        "**/*.d.ts",
        "e2e/**",
      ],
      // Branch-coverage thresholds are RATCHET FLOORS, not aspirational targets
      // (V1-9). The original targets (business-rules 90 / lib 70 / app/actions 75
      // / app/api 60 / src/modules 70 / domain 90) were never enforced and the
      // codebase is well below several of them. These floors are set a couple of
      // points UNDER the current measured coverage so CI prevents REGRESSION
      // without failing today. Raise them incrementally post-launch as coverage
      // improves — never lower a floor below what's achieved.
      thresholds: {
        "lib/business-rules-**": { branches: 80 },
        "lib/**-rules/**": { branches: 80 },
        "lib/**": { branches: 55 },
        "app/actions/**": { branches: 30 },
        "app/api/**": { branches: 8 },
        "src/modules/**/domain/**": { branches: 88 },
        "src/modules/**": { branches: 55 },
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
