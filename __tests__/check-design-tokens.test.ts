/**
 * Unit tests for scripts/check-design-tokens.ts — the citizen-status-tone guard.
 *
 * Pure fixture tests (no filesystem I/O): exercise the exported RAW_CITIZEN_STATUS
 * regex against known-bad and known-good className fragments to verify recall
 * (it catches the CaseBadge regression — a status pill hardcoding a citizen tone)
 * and precision (no false positives on structural ln-* tokens, ln-op-* tokens,
 * or the correct st-* form).
 */

import { describe, expect, it } from "vitest";

import { RAW_CITIZEN_STATUS, STATUS_COMPONENTS } from "@/scripts/check-design-tokens";

describe("RAW_CITIZEN_STATUS — recall (catches the CaseBadge regression)", () => {
  const BAD = [
    "text-ln-ok", // the exact green "Abierto" holdout
    "ring-ln-ok",
    "text-ln-warn",
    "border-ln-err",
    "bg-ln-danger",
    "text-ln-violeta",
    "bg-[var(--color-ln-ok-050)]", // arbitrary CSS-var form
    "bg-[var(--color-ln-warn-050)]",
  ];
  for (const cls of BAD) {
    it(`flags "${cls}"`, () => {
      RAW_CITIZEN_STATUS.lastIndex = 0;
      expect(cls).toMatch(RAW_CITIZEN_STATUS);
    });
  }
});

describe("RAW_CITIZEN_STATUS — precision (no false positives)", () => {
  const GOOD = [
    // Structural citizen tokens — surface/ink/line, not status tones.
    "bg-ln-card",
    "text-ln-ink",
    "ring-ln-line",
    "text-ln-mute",
    "bg-ln-stripe",
    // Operator-skin tones use the ln-op- prefix — covered by RAW_OP_STATUS (warn).
    "text-ln-op-warn",
    "bg-ln-op-ok-bg",
    // The correct, canonical st-* form must never be flagged.
    "text-[var(--color-st-warn)]",
    "bg-[var(--color-st-ok-bg)]",
  ];
  for (const cls of GOOD) {
    it(`does NOT flag "${cls}"`, () => {
      RAW_CITIZEN_STATUS.lastIndex = 0;
      expect(cls).not.toMatch(RAW_CITIZEN_STATUS);
    });
  }
});

describe("STATUS_COMPONENTS — guarded set includes the CaseBadge holdout", () => {
  it("includes components/CaseBadge.tsx (the 5th status component)", () => {
    const hasCaseBadge = [...STATUS_COMPONENTS].some((p) => p.includes("CaseBadge.tsx"));
    expect(hasCaseBadge).toBe(true);
  });
});
