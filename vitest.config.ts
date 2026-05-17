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
      // server-only throws at import time in non-Next.js environments.
      // In Vitest (Node.js) we stub it as a no-op so server-only modules
      // can be imported and tested without the Next.js runtime.
      "server-only": new URL("./__tests__/__mocks__/server-only.ts", import.meta.url).pathname,
    },
  },
});
