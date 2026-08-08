// Fitness test — every text token clears WCAG AA on every surface it can land on.
//
// PURPOSE:
//   The palette has been contrast-fixed three separate times, and each fix was
//   verified against ONE background. The tokens still carry the receipts:
//     --color-ln-mute   "5.02:1 on ln-paper"
//     --color-ln-faint  "4.60:1 on ln-paper"
//     --color-ln-warn   "5.28:1 on white"
//   ln-faint was then measured at 4.37:1 on ln-stripe — the cream the credential
//   card uses (adversarial review 2026-08-08, S7-F03). The colour was never the
//   problem; the unchecked PAIR was.
//
// WHY HERE AND NOT IN THE AXE SCANS:
//   The enforcing a11y checks are the Playwright axe specs, which catch this at
//   runtime — but only on the pages a spec actually visits, and e2e is its own
//   gate outside `pnpm verify`. A token that fails on a surface no spec opens
//   ships. This runs on every verify, reads the REAL values out of globals.css,
//   and costs milliseconds.
//
// WHAT THIS TEST DOES NOT DO:
//   It does not know which pairs the app actually renders. The matrix below is
//   written by hand for that reason: a blind cross-product would flag legitimate
//   pairings (white on ln-azul is correct and would look like a failure against
//   a light surface). Adding a token means deciding where it may sit.
//
// HOW TO MAINTAIN:
//   A failure is a real WCAG AA failure. Darken the token until it clears the
//   WORST surface in its row — and re-run, because ln-faint must also stay
//   lighter than ln-mute or the visual hierarchy inverts.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** Reads a token's hex straight from globals.css — never a copy of the value. */
function token(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return match[1].toLowerCase();
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [0, 2, 4]
    .map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal-size text. Nothing in these rows is "large text". */
const AA_NORMAL = 4.5;

// The light surfaces a body-text token can legitimately sit on.
const LIGHT_SURFACES = ["ln-card", "ln-paper", "ln-stripe"] as const;

// Tokens used as TEXT on those surfaces. Fills and borders are excluded — the
// 4.5:1 floor is a text rule, and ln-celeste is a brand fill that only ever
// failed when it was used as small text (S7-F02).
const TEXT_ON_LIGHT = [
  "ln-ink",
  "ln-ink-2",
  "ln-mute",
  "ln-faint",
  "ln-ok",
  "ln-warn",
  "ln-err",
  "ln-azul",
] as const;

// Solid chips print white on a saturated fill — the inverse pairing, same floor.
const WHITE_ON_FILL = ["ln-ok", "ln-azul", "ln-err"] as const;

// A status token's OWN tint. This is where those tokens actually live — the
// provenance stamp (.ln-prov, 8.5px uppercase mono) and .lp-ph-ok (13px bold,
// which is NOT WCAG "large text") both print ln-ok on ln-ok-bg.
//
// The first version of this file checked only the three page surfaces above and
// was therefore GREEN over a live 4.44:1 failure on exactly this pair — the same
// "the colour was never the problem, the unchecked PAIR was" mistake its own
// header claims to close, reproduced one tier down. Found in adversarial review
// 2026-08-08, not by this fence.
const TEXT_ON_OWN_TINT = [
  { text: "ln-ok", tints: ["ln-ok-bg", "ln-ok-050"] },
  { text: "ln-warn", tints: ["ln-warn-050"] },
  { text: "ln-err", tints: ["ln-err-bg", "ln-err-050"] },
] as const;

describe("token contrast — text on light surfaces", () => {
  for (const text of TEXT_ON_LIGHT) {
    for (const surface of LIGHT_SURFACES) {
      it(`${text} on ${surface} clears AA`, () => {
        const ratio = contrast(token(text), token(surface));
        expect(
          Number(ratio.toFixed(2)),
          `--color-${text} on --color-${surface} is ${ratio.toFixed(2)}:1, below the ${AA_NORMAL}:1 WCAG AA floor for normal text`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

describe("token contrast — status text on its own tint", () => {
  for (const { text, tints } of TEXT_ON_OWN_TINT) {
    for (const tint of tints) {
      it(`${text} on ${tint} clears AA`, () => {
        const ratio = contrast(token(text), token(tint));
        expect(
          Number(ratio.toFixed(2)),
          `--color-${text} on --color-${tint} is ${ratio.toFixed(2)}:1, below the ${AA_NORMAL}:1 WCAG AA floor. The status tokens live on these tinted backgrounds, not only on the page surfaces.`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

describe("token contrast — white on solid fills", () => {
  for (const fill of WHITE_ON_FILL) {
    it(`white on ${fill} clears AA`, () => {
      const ratio = contrast("#ffffff", token(fill));
      expect(
        Number(ratio.toFixed(2)),
        `white on --color-${fill} is ${ratio.toFixed(2)}:1, below ${AA_NORMAL}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  it("ln-celeste is NOT in that list, because white on it fails", () => {
    // Guards the reason, not just the result. ln-celeste is a legitimate brand
    // FILL; what failed was printing 12px white on it (S7-F02, /adoptar card)
    // and 12px ln-celeste text on white (/perdidas). If someone later "fixes"
    // ln-celeste by darkening it into an accessible text colour, this test
    // fails and asks them to reconsider — the brand blue is not a text token.
    expect(contrast("#ffffff", token("ln-celeste"))).toBeLessThan(AA_NORMAL);
  });
});

describe("token contrast — the hierarchy survives the fix", () => {
  it("ln-faint stays lighter than ln-mute on the worst surface", () => {
    // Non-vacuity in the other direction: the cheap way to pass every test
    // above is to darken the greys until they are all nearly ln-ink, which
    // would satisfy WCAG and destroy the visual hierarchy. ln-faint is the
    // faintest text in the system and must remain so.
    const stripe = token("ln-stripe");
    expect(contrast(token("ln-faint"), stripe)).toBeLessThan(contrast(token("ln-mute"), stripe));
  });
});
