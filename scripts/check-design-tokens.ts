// Lint guard for Poncho design tokens.
//
// Runs in CI to block re-introduction of:
//   1. Raw Tailwind palette utilities (bg-red-700, text-neutral-500, ring-blue-500,
//      etc.) — should always be a gob-* semantic token (bg-gob-danger,
//      text-gob-text-muted, ring-gob-azul-link, …).
//   2. `dark:` utility prefix — dark mode is disabled at the @variant level
//      in app/globals.css; prefixed classes never apply, so they are
//      visual rot that confuses code review.
//
// Run: pnpm tsx scripts/check-design-tokens.ts
// Or:  pnpm lint:tokens
//
// Exits 1 with file:line:col on each hit. Exits 0 if clean.
//
// Autofix: scripts/codemod-poncho-tokens.ts (palette) +
// scripts/codemod-purge-dark.ts (dark prefix). Add new mappings to those
// scripts when this guard catches a pattern they don't yet cover.
//
// Out of scope:
//   - components/ui/** (shadcn primitives — handled separately if migrated)
//   - app/globals.css is .css, not .ts/.tsx, so it's never globbed in.

import { globSync, readFileSync } from "node:fs";

const FILES = globSync("{app,components}/**/*.{ts,tsx}", {
  exclude: ["**/node_modules/**", "components/ui/**"],
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
  });
}

if (hits > 0) {
  console.error(
    `\n✗ ${hits} design-token violation(s). Autofix: pnpm tsx scripts/codemod-poncho-tokens.ts && pnpm tsx scripts/codemod-purge-dark.ts`,
  );
  process.exit(1);
}
console.log(`✓ Design tokens clean — 0 raw palette, 0 dark: prefix across ${FILES.length} files.`);
