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

import {
  DEAD_FONT_VAR,
  DEAD_TEXT_VAR,
  OP_TOKEN_UTILITY,
  RAW_CITIZEN_STATUS,
  STATUS_COMPONENTS,
  parseDefinedOpTokens,
} from "@/scripts/check-design-tokens";

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

// Rule 10 (SC-7). `font-` is the prefix for font-family, font-weight AND
// font-style, so Tailwind v4 cannot type a bare CSS variable and resolves it to
// font-WEIGHT: `.font-\[var\(--font-ln-mono\)\]{font-weight:var(--font-ln-mono)}`.
// A font stack is not a valid <font-weight>, the declaration is dropped, and the
// element silently keeps its INHERITED family. 520 of these across 143 files
// went unguarded because DEAD_TEXT_VAR is anchored on the `text-` prefix.
describe("DEAD_FONT_VAR — recall (catches the dead font-family form)", () => {
  const BAD = [
    "font-[var(--font-ln-mono)]",
    "font-[var(--font-ln-serif)]",
    "font-[var(--font-ln-sans)]",
    // Must not be limited to the three families that exist today — a token
    // added later has to be caught by the same rule.
    "font-[var(--font-ln-display)]",
    // Variant-prefixed forms are still dead.
    "sm:font-[var(--font-ln-mono)]",
    "hover:font-[var(--font-ln-serif)]",
    // Real-world shape: one class among many.
    "m-0 font-[var(--font-ln-serif)] text-3xl font-semibold",
  ];
  for (const cls of BAD) {
    it(`flags "${cls}"`, () => {
      DEAD_FONT_VAR.lastIndex = 0;
      expect(cls).toMatch(DEAD_FONT_VAR);
    });
  }
});

describe("DEAD_FONT_VAR — precision (no false positives)", () => {
  const GOOD = [
    // The correct, working form — compiles to a real font-family.
    "font-ln-mono",
    "font-ln-serif",
    "font-ln-sans",
    // Weight and style utilities share the prefix but are unambiguous.
    "font-semibold",
    "font-medium",
    "font-bold",
    "font-italic",
    // Rule 9's territory, not rule 10's.
    "text-[var(--text-sm)]",
    // Other arbitrary token forms that are correct and must stay untouched.
    "bg-[var(--color-ln-card)]",
    "rounded-[var(--radius-sm)]",
    "shadow-[var(--shadow-md)]",
  ];
  for (const cls of GOOD) {
    it(`does NOT flag "${cls}"`, () => {
      DEAD_FONT_VAR.lastIndex = 0;
      expect(cls).not.toMatch(DEAD_FONT_VAR);
    });
  }
});

describe("DEAD_FONT_VAR and DEAD_TEXT_VAR do not overlap", () => {
  it("each rule owns exactly its own prefix", () => {
    DEAD_FONT_VAR.lastIndex = 0;
    DEAD_TEXT_VAR.lastIndex = 0;
    expect("font-[var(--font-ln-mono)]").not.toMatch(DEAD_TEXT_VAR);
    DEAD_TEXT_VAR.lastIndex = 0;
    DEAD_FONT_VAR.lastIndex = 0;
    expect("text-[var(--text-sm)]").not.toMatch(DEAD_FONT_VAR);
  });
});

describe("STATUS_COMPONENTS — guarded set includes the CaseBadge holdout", () => {
  it("includes components/CaseBadge.tsx (the 5th status component)", () => {
    const hasCaseBadge = [...STATUS_COMPONENTS].some((p) => p.includes("CaseBadge.tsx"));
    expect(hasCaseBadge).toBe(true);
  });
});

// A tiny theme fixture standing in for app/globals.css. The guard parses the
// real file at runtime; the test pins the parse + detection logic.
const THEME_CSS = `
  :root {
    --color-ln-op-ok: #1e7a3e;
    --color-ln-op-ok-bg: #e5f4eb;
    --color-ln-op-warn: #96600e;
    --color-ln-op-danger: #b71c1c;
    --color-ln-op-azul-700: #0a4576;
    --color-ln-op-stripe: #f7f9fb;
  }
`;

/** Return the undefined <name>s the guard would flag on a className string. */
function undefinedOpTokens(cls: string, allowlist: Set<string>): string[] {
  OP_TOKEN_UTILITY.lastIndex = 0;
  return [...cls.matchAll(OP_TOKEN_UTILITY)].map((m) => m[1]).filter((n) => !allowlist.has(n));
}

describe("parseDefinedOpTokens — builds the allowlist from theme CSS", () => {
  it("extracts simple and compound token names", () => {
    const tokens = parseDefinedOpTokens(THEME_CSS);
    expect(tokens.has("ok")).toBe(true);
    expect(tokens.has("ok-bg")).toBe(true);
    expect(tokens.has("azul-700")).toBe(true);
    expect(tokens.has("stripe")).toBe(true);
    // Never-defined Spanish color names must be absent.
    expect(tokens.has("verde")).toBe(false);
    expect(tokens.has("rojo")).toBe(false);
    expect(tokens.has("amarillo")).toBe(false);
  });
});

describe("undefined ln-op-* token guard — silent-invisible class", () => {
  const allowlist = parseDefinedOpTokens(THEME_CSS);

  it("flags the undefined Spanish color tokens", () => {
    expect(undefinedOpTokens("text-ln-op-verde", allowlist)).toEqual(["verde"]);
    expect(undefinedOpTokens("bg-ln-op-rojo", allowlist)).toEqual(["rojo"]);
    expect(undefinedOpTokens("text-ln-op-amarillo", allowlist)).toEqual(["amarillo"]);
    expect(undefinedOpTokens("hover:bg-ln-op-hover", allowlist)).toEqual(["hover"]);
    expect(undefinedOpTokens("bg-ln-op-fake", allowlist)).toEqual(["fake"]);
  });

  it("does NOT flag defined tokens (incl. compound + opacity + variant forms)", () => {
    expect(undefinedOpTokens("bg-ln-op-ok", allowlist)).toEqual([]);
    expect(undefinedOpTokens("bg-ln-op-ok-bg", allowlist)).toEqual([]);
    expect(undefinedOpTokens("hover:bg-ln-op-stripe/50", allowlist)).toEqual([]);
    expect(undefinedOpTokens("focus:ring-ln-op-azul-700", allowlist)).toEqual([]);
    expect(undefinedOpTokens("text-ln-op-danger text-ln-op-warn bg-ln-op-ok", allowlist)).toEqual(
      [],
    );
  });

  it("flags only the undefined token in a mixed className", () => {
    expect(
      undefinedOpTokens("text-ln-op-ok bg-ln-op-verde border-ln-op-danger", allowlist),
    ).toEqual(["verde"]);
  });
});
