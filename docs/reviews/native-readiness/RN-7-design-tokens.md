# RN-7 — Design tokens & the visual system

> Adversarial read-only review, 2026-08-19. Builds on RN-1..RN-6 (not repeated).
> Verdict: **EXPENSIVE**.

## Headline

There is **no tokens.ts, no tailwind.config** (Tailwind v4, CSS-first). The
whole system is CSS custom properties in one @theme block (globals.css:25-468)
plus **~4,400 lines of hand-authored `.ln-*`/`.lp-*`/`.op-*` component CSS**
below it. The only importable-TS parts today: viz-scales.ts, pet-situation.ts,
the Icon ICON_MAP, branding.ts. The naive "export the hex values" captures the
palette and misses that **the identity is a CSS cascade, not a value table.**

## Findings (extractable / trapped-in-CSS / trapped-in-components)

### F1 — The credential/libreta LOOK is hand-written CSS with RAW px (trapped in CSS, highest cost)
AsientoCard.tsx is a clean semantic component but renders only class hooks; the
actual look is globals.css:4270-4436 in **raw px off the token scale**
(border-radius 11px, padding 13px 15px, font-size 8.5px, width 36px). The
asiento card, the .ln-doc paper document, the .ln-band masthead, the
per-situation credential skins — all this idiom. A native team gets the
component SHAPE but ZERO pixel values, and the ratchet's own CSS baseline admits
globals.css ignored the scale in 96% of its font-size declarations. The visual
identity is welded to a stylesheet React Native cannot load.

### F2 — Theming is a CSS-var cascade with no JS equivalent (trapped in CSS)
Three skins (.op-surface remap, [data-theme=situation-room] full dark operator
palette, the st-*/sk-* semantic indirection layer — the good part) all work by
redeclaring CSS vars on an ancestor and letting var() re-resolve. React Native
has no CSS vars and no cascade — each must be re-expressed as a JS theme object
+ Context provider, and the "redeclare because substitution already happened on
the ancestor" subtlety becomes explicit prop-drilling. Dark mode proper is
disabled, so citizen native is light-only (at least simple).

### F3 — The token VALUES are extractable, but they're the cheap ~35% (partial)
Everything in @theme is a literal (~90 colors, radii, type/leading/tracking
scale, motion, shadows, z-index) — a codemod lifts them mechanically. But that's
the color/scale layer ONLY; it carries neither F1 (component CSS) nor F2 (skin
remap logic). Honest estimate: a value export captures ~35% of the visual
system; the semantic system stays behind.

### F4 — viz-scales.ts is the one genuinely portable, validated token module (exemplary)
COLOR_DIVERGENT_ABOVE with the CVD ΔE rationale inline, as const, framework-free,
pinned against real ΔE00. Ports to native with ZERO changes — the template for
what the rest should become. (Note: its header falsely claims values are
"resolved at build time from the CSS variable layer" — they're inline literals;
map/chart palette and UI palette are two disconnected worlds. Doc lie worth
fixing.)

### F5 — Semantic operator atoms good; citizen atoms thinner (mixed)
OpStatusPill resolves tone → var(--color-st-*): genuinely semantic, delegated to
by OpPill/CaseStatusBadge. pet-situation.ts is excellent — pure
{key,tone,label,icon} with "tone is never the only signal" (WCAG), portable
as-is. But TONE_CLASSES outputs Tailwind class strings (web-coupled), and the
tone→color binding for citizen credential skins lives in CSS attribute
selectors, not TS. So pet-situation.ts ports, but the RENDERING of its tones is
re-implemented per platform.

### F6 — Fonts are next/font/google, files not committed (extractable with legwork)
IBM Plex Serif/Sans/Mono + Caveat + Encode Sans via next/font/google; .ttf NOT
in the repo (Next fetches + self-hosts at build). Native needs the actual files
bundled (all OFL, sourceable) plus the exact weight contract
(font-weight-contract.test.ts) or font-bold silently falls back.

### F7 — Iconography ports cleanly (extractable)
Icon.tsx is a curated ICON_MAP (~200 Spanish names → lucide-react); lucide ships
lucide-react-native. The map is the portable asset; the wrapper re-implements in
~20 lines. Cheap.

### F8 — A11y invariants enforced by tests/CI, not convention (spec extractable, enforcement web-coupled)
Strong and well-fenced: 44px touch floor (check-ui-invariants Rule 1), op-hit-24
24px extension (WCAG 2.5.8, hit-area-utility.test with non-vacuity), contrast
matrix (token-contrast.test reads real hex), CVD margins, font weights. The
INVARIANTS (44px=Apple HIG, 4.5:1, ΔE floors) are values a native theme
re-asserts — but every enforcement mechanism scans CSS/TSX and gives native
nothing automatically.

## Ranked improvements (native cheaper AND web better today)

1. **Create packages/contract/tokens (on RN-6 B40); generate globals.css @theme
   FROM it.** Codemod the ~90 colors + scales into a typed object, emit the
   @theme block at build. Web gets a SoT the ratchet points at without parsing
   CSS; native imports the object. Keystone (captures ~35%).
2. **Move viz-scales.ts into the package unchanged; make it the template.** Pure,
   tested, as const. Fix the false header claim. Zero risk, proof-of-shape.
3. **Tokenize the credential CSS off raw px (F1) — start with .ln-asiento.**
   Replace magic px with existing --radius/--space/--text tokens; lower the CSS
   ratchet baseline as you go. Web gets the scale it declared but doesn't use;
   native gets values that trace to named tokens. Highest effort AND payoff.
4. **Extract the skin remap (F2) into a JS theme descriptor** — express
   citizen/op-surface/situation-room as three entries in a themes object; have
   globals.css generate the var blocks from it. Web keeps the cascade; native
   gets three palettes as plain objects.
5. **Promote pet-situation.ts tone→visual binding into TS** (TONE_TOKENS map
   referencing token names) so web skins and native read the identical map;
   keeps "one tone/label/icon everywhere" honest across platforms.
6. **Bundle the fonts as real files in the package** (OFL .ttf ×5 + a fonts.json
   encoding the weight contract). Web stops depending on Google's CDN at build.
7. **Publish the a11y invariants as a platform-neutral spec** (tokens/invariants.ts:
   MIN_TOUCH_TARGET=44, MIN_HIT_EXTENSION=24, CONTRAST_AA=4.5, CVD_DELTA_E_FLOOR)
   — constants today buried in scanner regexes and test bodies.
8. **Point Icon ICON_MAP at a shared name list** — move name→lucide keying into
   the package as data; native writes a 20-line lucide-react-native wrapper.

## Verdict: EXPENSIVE

Not a BLOCKER — the palette, radii, type/leading/tracking scales, motion and
shadows are literals in one @theme block a codemod lifts in an afternoon;
viz-scales, pet-situation, branding and the icon map port essentially as-is; the
a11y invariants are already testable numbers (44px is a HIG value they'd use
anyway). But "just export the colors" is the trap: the SEMANTIC system does not
survive the platform jump as values. The credential/libreta identity — asiento
cards, paper document, per-situation skins, operator dark "situation room" —
lives as ~4,400 lines of hand-authored CSS with raw px, and the theming that
makes st-*/sk-*/.op-surface elegant is a CSS-variable cascade with no RN
equivalent, so it must be RE-ARCHITECTED as JS theme objects, not copied. A
value export captures ~a third; the other two-thirds is re-deriving the look by
hand — the exact "native team re-deriving by eye" outcome R7 exists to prevent.
Tractable, clean seams, EXPENSIVE not CHEAP — calling it CHEAP would be
believing the hex values are the design system.
