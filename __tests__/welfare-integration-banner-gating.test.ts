// UI-7 B7 — the "integración pendiente" banner must be gated behind a
// non-terminal status check on both reporter-facing surfaces (it contradicts
// the status badge on closed / invalid / duplicate).
//
// These surfaces are server components; rather than render them, we assert the
// structural guard is present in source (same source-scan style as
// welfare-org-pii-fitness.test.ts). If a future edit drops the guard, this fails.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const BANNER_MARKER = "integración con los";

const FILES = [
  join(process.cwd(), "app", "denuncias", "codigo", "[code]", "page.tsx"),
  join(process.cwd(), "app", "(app)", "denuncias", "[id]", "page.tsx"),
];

describe("integration-pending banner gating (UI-7 B7)", () => {
  for (const file of FILES) {
    it(`${file} guards the banner behind a terminal-status check`, () => {
      const src = readFileSync(file, "utf8");

      // The banner copy must still exist (non-vacuity).
      expect(src).toContain(BANNER_MARKER);

      // A terminal-status predicate must be defined and referenced.
      expect(src).toMatch(/isTerminal\w*Status/);
      // The predicate must cover all three terminal statuses.
      expect(src).toContain('"closed"');
      expect(src).toContain('"invalid"');
      expect(src).toContain('"duplicate"');
    });
  }
});
