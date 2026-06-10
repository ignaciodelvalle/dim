// Lint guard for Poncho design tokens.
//
// Runs in CI to block re-introduction of:
//   1. Raw Tailwind palette utilities (bg-red-700, text-neutral-500, ring-blue-500,
//      etc.) — should always be a gob-* semantic token (bg-gob-danger,
//      text-gob-text-muted, ring-gob-azul-link, …).
//   2. `dark:` utility prefix — dark mode is disabled at the @variant level
//      in app/globals.css; prefixed classes never apply, so they are
//      visual rot that confuses code review.
//   3. Arbitrary hex values inside Tailwind arbitrary-value classnames
//      (e.g. bg-[#eef6f0], border-[#c8e2d2]) — use ln-* token utilities instead
//      (e.g. bg-[var(--color-ln-ok-050)], border-[var(--color-ln-ok-100)]).
//
// Run: pnpm tsx scripts/check-design-tokens.ts
// Or:  pnpm lint:tokens
//
// Exits 1 with file:line:col on each hit. Exits 0 if clean.
//
// Autofix: scripts/codemod-poncho-tokens.ts (palette) +
// scripts/codemod-purge-dark.ts (dark prefix) +
// scripts/codemod-status-tints.cjs (hex tints → ln-* tokens).
// Add new mappings to those scripts when this guard catches a pattern they don't yet cover.
//
// Out of scope:
//   - components/ui/** (shadcn primitives — handled separately if migrated)
//   - app/globals.css is .css, not .ts/.tsx, so it's never globbed in.

import { globSync, readFileSync } from "node:fs";

// Post-filter approach: glob all files then filter by path.
// Note: Node 22 globSync `exclude` callback receives bare filenames (not full paths),
// so directory exclusion must be done as a post-filter on the returned paths.
const EXCLUDE_PATH_PREFIXES = ["node_modules/", "components/ui/"];
const FILES = globSync("{app,components}/**/*.{ts,tsx}").filter((f) => {
  const p = f.replaceAll("\\", "/");
  return !EXCLUDE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`));
});

const RAW_PALETTE_FAMILIES =
  "neutral|zinc|slate|stone|gray|amber|emerald|sky|indigo|rose|red|blue|yellow|pink|purple|orange|teal|cyan|lime|fuchsia|violet|green";
const RAW_PALETTE_UTILITIES =
  "bg|text|border|ring|divide|from|to|via|outline|shadow|placeholder|fill|stroke|caret|decoration|accent";
const RAW_PALETTE = new RegExp(
  `\\b(${RAW_PALETTE_UTILITIES})-(${RAW_PALETTE_FAMILIES})-\\d+(?:\\/\\d+)?\\b`,
  "g",
);
const DARK_PREFIX = /\bdark:[\w\-/[\]()%.:]+/g;

// Arbitrary hex values in Tailwind arbitrary-value classnames.
// Matches patterns like: bg-[#abc], border-[#f1c6bf], text-[#123456ff]
// Use ln-* token utilities instead (e.g. bg-[var(--color-ln-ok-050)]).
const ARBITRARY_HEX =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g;

// Allowlist: hex values with no direct token equivalent that are intentionally left as-is.
// Each entry must include a justification comment.
const ARBITRARY_HEX_ALLOWLIST = new Set([
  // #5d5240 — warm sepia brown used for memorial section text in mis-mascotas.
  // Falls between ln-ink-2 (#3c4b55, cooler) and ln-mute (#6e7b84, neutral).
  // No ln-* token covers warm-brown text; needs a dedicated token (future PR).
  "text-[#5d5240]",
]);

let hits = 0;
for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const match of line.matchAll(RAW_PALETTE)) {
      console.error(
        `${file}:${i + 1}:${(match.index ?? 0) + 1}: raw Tailwind palette "${match[0]}" — use a gob-* semantic token`,
      );
      hits += 1;
    }
    for (const match of line.matchAll(DARK_PREFIX)) {
      console.error(
        `${file}:${i + 1}:${(match.index ?? 0) + 1}: "${match[0]}" — dark mode is disabled, remove the prefix`,
      );
      hits += 1;
    }
    for (const match of line.matchAll(ARBITRARY_HEX)) {
      if (ARBITRARY_HEX_ALLOWLIST.has(match[0])) continue;
      console.error(
        `${file}:${i + 1}:${(match.index ?? 0) + 1}: arbitrary hex "${match[0]}" — use a ln-* token utility (e.g. bg-[var(--color-ln-ok-050)]). Autofix: pnpm tsx scripts/codemod-status-tints.cjs`,
      );
      hits += 1;
    }
  });
}

if (hits > 0) {
  console.error(
    `\n✗ ${hits} design-token violation(s). Autofix: pnpm tsx scripts/codemod-poncho-tokens.ts && pnpm tsx scripts/codemod-purge-dark.ts && node scripts/codemod-status-tints.cjs`,
  );
  process.exit(1);
}
console.log(
  `✓ Design tokens clean — 0 raw palette, 0 dark: prefix, 0 arbitrary hex across ${FILES.length} files.`,
);
