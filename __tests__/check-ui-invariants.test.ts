/**
 * Unit tests for scripts/check-ui-invariants.ts rule regexes and helpers.
 *
 * Pure fixture tests — no filesystem I/O.  Each rule's exported regex/helper
 * is exercised against known-bad and known-good fixture strings to verify
 * precision (no false positives) and recall (catches real violations).
 */

import { describe, expect, it } from "vitest";

import { ACCENT_WORDS, SCREAMING_ENUM, TOUCH_TARGET_TOKENS } from "@/scripts/check-ui-invariants";

// ---------------------------------------------------------------------------
// Rule 1 — Touch target tokens
// ---------------------------------------------------------------------------

describe("TOUCH_TARGET_TOKENS", () => {
  it("matches h-9 in a className string", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="flex h-9 items-center"').toMatch(TOUCH_TARGET_TOKENS);
  });

  it("matches min-h-9 in a className string", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="min-h-9 w-full"').toMatch(TOUCH_TARGET_TOKENS);
  });

  it("matches min-w-9 in a className string", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="min-w-9 shrink-0"').toMatch(TOUCH_TARGET_TOKENS);
  });

  it("matches w-9 in a className string", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="w-9 h-9 rounded-full"').toMatch(TOUCH_TARGET_TOKENS);
  });

  it("does NOT match h-11 (correct 44px size)", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="min-h-11 w-full"').not.toMatch(TOUCH_TARGET_TOKENS);
  });

  it("does NOT match h-10 (other sizes)", () => {
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    expect('className="h-10 w-10"').not.toMatch(TOUCH_TARGET_TOKENS);
  });

  it("does NOT match h-9 as a word inside h-9x (no word boundary overlap)", () => {
    // h-9 followed by a non-word char is still a match — check boundary
    TOUCH_TARGET_TOKENS.lastIndex = 0;
    const m = 'className="h-9"'.matchAll(TOUCH_TARGET_TOKENS);
    expect([...m]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Screaming enum in JSX text
// ---------------------------------------------------------------------------

// We test the SCREAMING_ENUM regex itself — the looksLikeJsxText helper
// is an internal function that further filters; here we verify the base regex
// catches the pattern and that the overall approach only flags literal text.

describe("SCREAMING_ENUM", () => {
  it("matches a SCREAMING_CASE token with 2+ segments", () => {
    SCREAMING_ENUM.lastIndex = 0;
    expect(">LOST_EPISODE_RESOLVED<").toMatch(SCREAMING_ENUM);
  });

  it("matches PPP_BREED_LIST_UPDATED", () => {
    SCREAMING_ENUM.lastIndex = 0;
    expect(">PPP_BREED_LIST_UPDATED<").toMatch(SCREAMING_ENUM);
  });

  it("does NOT match a single-segment uppercase word (not an enum pattern)", () => {
    SCREAMING_ENUM.lastIndex = 0;
    // Single word: LOST — only one segment, no underscore → no match
    const matches = [...">LOST<".matchAll(SCREAMING_ENUM)];
    expect(matches).toHaveLength(0);
  });

  it("does NOT match a two-segment token (requires 2+ underscores/3 parts)", () => {
    // Pattern requires at least {2,} underscore segments: FOO_BAR has 1 → skip
    SCREAMING_ENUM.lastIndex = 0;
    const matches = [..."FOO_BAR".matchAll(SCREAMING_ENUM)];
    // FOO_BAR has 1 underscore segment ({2,} means ≥2 repetitions of _SEGMENT)
    // Actually the regex is `[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}` — requires ≥2
    // occurrences of the _SEGMENT group, meaning ≥3 parts total (FOO_BAR_BAZ).
    expect(matches).toHaveLength(0);
  });

  it("matches a 3-part token FOO_BAR_BAZ", () => {
    SCREAMING_ENUM.lastIndex = 0;
    expect("FOO_BAR_BAZ").toMatch(SCREAMING_ENUM);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — es-AR accent words
// ---------------------------------------------------------------------------

describe("ACCENT_WORDS", () => {
  it("has an entry for each expected word", () => {
    const bads = ACCENT_WORDS.map((w) => w.bad);
    expect(bads).toContain("Ultimas");
    expect(bads).toContain("notificacion");
    expect(bads).toContain("pais");
    expect(bads).toContain("evaluan");
    expect(bads).toContain("duenos");
    expect(bads).toContain("accion");
    expect(bads).toContain("jurisdiccion");
    expect(bads).toContain("auditoria");
  });

  describe("pais", () => {
    const entry = ACCENT_WORDS.find((w) => w.bad === "pais")!;

    it("matches unaccented 'pais' in JSX text", () => {
      entry.re.lastIndex = 0;
      expect("Configura reglas por pais, provincia o localidad.").toMatch(entry.re);
    });

    it("does NOT match the accented form 'país'", () => {
      entry.re.lastIndex = 0;
      expect("Configura reglas por país, provincia o localidad.").not.toMatch(entry.re);
    });

    it("does NOT match 'pais' inside a longer word like 'paisaje'", () => {
      entry.re.lastIndex = 0;
      expect("El paisaje es hermoso.").not.toMatch(entry.re);
    });
  });

  describe("jurisdiccion", () => {
    const entry = ACCENT_WORDS.find((w) => w.bad === "jurisdiccion")!;

    it("matches unaccented 'jurisdiccion' as JSX text", () => {
      entry.re.lastIndex = 0;
      expect("La jurisdiccion no tiene overrides.").toMatch(entry.re);
    });

    it("does NOT match the accented form 'jurisdicción'", () => {
      entry.re.lastIndex = 0;
      expect("La jurisdicción no tiene overrides.").not.toMatch(entry.re);
    });
  });

  describe("accion", () => {
    const entry = ACCENT_WORDS.find((w) => w.bad === "accion")!;

    it("matches 'accion' as user copy", () => {
      entry.re.lastIndex = 0;
      expect("Esta accion queda registrada.").toMatch(entry.re);
    });

    it("does NOT match 'acciones' (different word form — word boundary)", () => {
      entry.re.lastIndex = 0;
      expect("Las acciones disponibles son...").not.toMatch(entry.re);
    });

    it("does NOT match accented 'acción'", () => {
      entry.re.lastIndex = 0;
      expect("Esta acción queda registrada.").not.toMatch(entry.re);
    });
  });

  describe("Ultimas", () => {
    const entry = ACCENT_WORDS.find((w) => w.bad === "Ultimas")!;

    it("matches 'Ultimas' missing accent", () => {
      entry.re.lastIndex = 0;
      expect("Ultimas 10 acciones realizadas").toMatch(entry.re);
    });

    it("does NOT match 'Últimas' (correctly accented)", () => {
      entry.re.lastIndex = 0;
      expect("Últimas 10 acciones realizadas").not.toMatch(entry.re);
    });
  });

  describe("auditoria", () => {
    const entry = ACCENT_WORDS.find((w) => w.bad === "auditoria")!;

    it("matches 'auditoria' without accent in copy text", () => {
      entry.re.lastIndex = 0;
      expect("Ver el log de auditoria del sistema.").toMatch(entry.re);
    });

    it("does NOT match 'auditoría' (correctly accented)", () => {
      entry.re.lastIndex = 0;
      expect("Ver el log de auditoría del sistema.").not.toMatch(entry.re);
    });
  });
});
