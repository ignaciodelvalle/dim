// Fitness test — a card-style radio must show focus on the card, not on its
// 1×1 hidden input (S7-F01).
//
// PURPOSE:
//   Several surfaces build a "pick one" card by hiding a real <input
//   type="radio"> with .sr-only and letting the <label> carry the whole visual.
//   globals.css has a global :focus-visible outline, so everyone assumed focus
//   was handled — but the focused element IS the clipped 1×1 input, so the ring
//   is painted where nobody can see it. Measured on /denuncias/nueva step 1:
//   outline, box-shadow and border all byte-identical before and after focus.
//
// WHY A FENCE:
//   Cowork reported ONE screen. The pattern is in five files, and the next card
//   list someone writes will inherit the same hole. The rule now lives in
//   globals.css; this test asserts the rule exists and that nobody deletes it
//   while the pattern is still in use.
//
// HOW TO MAINTAIN:
//   If the last card-style radio disappears, this test tells you the rule is
//   now dead weight. Until then, the rule stays.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

/** `<label> … <input type="radio" … sr-only`, the card-radio shape. */
const CARD_RADIO = /<label[\s\S]{0,600}?type="radio"[\s\S]{0,400}?sr-only/;

function componentsUsingCardRadios(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (extname(full) !== ".tsx") continue;
      if (/\.(test|spec)\.tsx$/.test(full)) continue;
      if (CARD_RADIO.test(readFileSync(full, "utf8"))) {
        hits.push(relative(ROOT, full).replace(/\\/g, "/"));
      }
    }
  };
  for (const dir of ["app", "components"]) walk(join(ROOT, dir));
  return hits.sort();
}

describe("card-style radios — the focus ring reaches the card", () => {
  it("globals.css propagates :focus-visible from the hidden input to its label", () => {
    expect(
      CSS,
      "globals.css lost the `label:has(input.sr-only:focus-visible)` rule — every card-style radio is back to showing no keyboard focus at all (WCAG 2.4.7, Ley 26.653)",
    ).toMatch(/label:has\(input\.sr-only:focus-visible\)/);
  });

  it("the rule draws an actual ring, not an empty block", () => {
    // Non-vacuity: the selector could survive with its body gutted and this
    // suite would still be green while the cards showed nothing.
    const rule = CSS.match(/label:has\(input\.sr-only:focus-visible\)\s*\{([^}]*)\}/);
    expect(rule, "the rule exists but has no body").not.toBeNull();
    expect(rule?.[1]).toMatch(/outline:\s*var\(--focus-ring-width\)/);
  });

  it("is still needed — the pattern is in use", () => {
    // If this ever drops to zero, the rule above is dead weight and should go.
    // It also documents the real blast radius: the finding named one screen.
    const users = componentsUsingCardRadios();
    expect(
      users.length,
      "no card-style radios left; the globals.css rule can be removed",
    ).toBeGreaterThan(0);
  });
});
