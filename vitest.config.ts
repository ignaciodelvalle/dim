import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests touch the local Postgres via Drizzle; run serially to avoid
    // cross-test pollution. Per-file isolation is fine; the helper itself
    // is idempotent enough that the dedupe test does its own teardown.
    fileParallelism: false,
    setupFiles: ["./__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
