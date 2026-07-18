/**
 * Unit tests for scripts/check-brand-casing.ts — the miMAR brand-casing lint
 * fence (recase sweep 2026-07-18: canonical brand casing is "miMAR").
 *
 * Pure fixture tests (no filesystem I/O): exercise the exported regex and the
 * findBrandHits helper against known-bad and known-good fixture strings,
 * mirroring __tests__/check-professionalism.test.ts.
 */

import { describe, expect, it } from "vitest";

import { WRONG_CASE_BRAND, findBrandHits } from "@/scripts/check-brand-casing";

// ---------------------------------------------------------------------------
// WRONG_CASE_BRAND — recall
// ---------------------------------------------------------------------------

describe("WRONG_CASE_BRAND — recall (the wrong-cased forms)", () => {
  const BAD = ["MiMAR", "Mimar", "MIMAR"];
  for (const word of BAD) {
    it(`matches "${word}"`, () => {
      WRONG_CASE_BRAND.lastIndex = 0;
      expect(word).toMatch(WRONG_CASE_BRAND);
    });
  }
});

// ---------------------------------------------------------------------------
// WRONG_CASE_BRAND — precision
// ---------------------------------------------------------------------------

describe("WRONG_CASE_BRAND — precision (correct casing, technical lowercase, identifiers, DIM)", () => {
  const GOOD = [
    "miMAR", // canonical casing — must never self-flag
    "mimar.ar", // email domain — technical, lowercase
    "logo-mimar.svg", // asset path — technical, lowercase
    "MiMARBadge", // hypothetical identifier — "MiMAR" is a prefix, not a standalone word
    "isMiMARFeature", // hypothetical identifier — no word boundary either side
    "DIM-1234-5678", // internal codename token — unrelated
    "hola mundo",
  ];
  for (const text of GOOD) {
    it(`does NOT match "${text}"`, () => {
      WRONG_CASE_BRAND.lastIndex = 0;
      expect(text).not.toMatch(WRONG_CASE_BRAND);
    });
  }
});

// ---------------------------------------------------------------------------
// findBrandHits — comment-awareness + CRLF safety
// ---------------------------------------------------------------------------

describe("findBrandHits", () => {
  it("flags a wrong-cased literal in real JSX text", () => {
    const src = ["export function Foo() {", "  return <p>Bienvenido a MiMAR</p>;", "}"].join("\n");
    const hits = findBrandHits(src);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({ line: 2, text: "MiMAR" });
  });

  it("does NOT flag a wrong-cased mention inside a // comment", () => {
    const src = ["// legacy note: MiMAR brand header", 'const x = "miMAR";'].join("\n");
    expect(findBrandHits(src)).toHaveLength(0);
  });

  it("does NOT flag a wrong-cased mention inside a {/* ... */} JSX comment, including continuation lines", () => {
    const src = [
      "{/* Mobile dim area — used to say MiMAR here, now",
      "    correctly cased miMAR below. */}",
      'const label = "miMAR";',
    ].join("\n");
    expect(findBrandHits(src)).toHaveLength(0);
  });

  it("flags multiple wrong-cased forms on different lines", () => {
    const src = ['const a = "MiMAR";', 'const b = "Mimar";', 'const c = "MIMAR";'].join("\n");
    const hits = findBrandHits(src);
    expect(hits.map((h) => h.text)).toEqual(["MiMAR", "Mimar", "MIMAR"]);
  });

  it("is CRLF-safe (Windows line endings)", () => {
    const src = ['const a = "MiMAR";', 'const b = "miMAR";'].join("\r\n");
    const hits = findBrandHits(src);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(1);
  });

  it("never flags the canonical miMAR casing", () => {
    const src = ['export const BRANDING = { appName: "miMAR" };'].join("\n");
    expect(findBrandHits(src)).toHaveLength(0);
  });
});
