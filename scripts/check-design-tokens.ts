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
//   4. Arbitrary text-[Npx] sizes — use --text-xs…2xl scale tokens instead
//      (text-[var(--text-sm)], text-[var(--text-md)], …).
//   5. Arbitrary spacing p/m/gap/space-[Npx|rem] — prefer Tailwind's default
//      spacing scale or --space-* custom tokens.
//   6. Arbitrary rounded-[Npx] radius — use --radius-xs/sm/md/lg tokens instead.
//   7. Arbitrary shadow-[...] — use --shadow-sm/md/lg tokens instead.
//   8. Hex literals in style=/inline CSS props — replace with CSS vars.
//
// Rules 4-8 use a RATCHET baseline (scripts/design-tokens-baseline.json):
//   - Existing violations in baselined files are grandfathered (pass today).
//   - Any NEW violation (new file or count above baseline) FAILS.
//   - To clear debt: migrate a file, lower its count in the baseline, or
//     remove it entirely once fully migrated.
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
// Note: app/globals.css is .css, not .ts/.tsx, so it's never globbed in.
// components/ui/** is now INCLUDED — the exclusion was removed per Wave-3 audit
// (§6.5) because 90% of arbitrary values live there.

import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sep } from "node:path";

// ---------------------------------------------------------------------------
// File set — no components/ui/ exclusion (removed per Wave-3 audit §6.5)
// ---------------------------------------------------------------------------

const EXCLUDE_PATH_PREFIXES = ["node_modules/"];
const FILES = globSync("{app,components}/**/*.{ts,tsx}").filter((f) => {
  const p = f.replaceAll("\\", "/");
  return !EXCLUDE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`));
});

// ---------------------------------------------------------------------------
// Rules 1–3 (pre-existing hard rules — no ratchet, always fail on any hit)
// ---------------------------------------------------------------------------

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
const ARBITRARY_HEX_ALLOWLIST = new Set<string>([
  // components/ui/Sheet.tsx — #fcfbf7 is a warm paper tone used in the bottom
  // sheet handle; grandfathered from the pre-Wave-3 components/ui/ exclusion.
  // Migration: add --color-ln-paper-warm token when the Sheet is refactored.
  "bg-[#fcfbf7]",

  // components/ui/dashboard/OpRail.tsx — gradient from navy-active to violeta.
  // Grandfathered; these values have no direct ln-* token yet.
  "from-[#3a6cb3]",
  "to-[#6a4c93]",
]);

// Status components that render the canonical open/escalated/closed/merged grammar.
// They must source status tones from the semantic st-* layer so the color
// auto-remaps per skin (operator → ln-op-*, citizen → ln-*). CaseBadge is included
// because it was the F2 holdout: it shipped raw citizen ln-ok (green "Abierto")
// before the st-* migration. OpStatusPill is the shared primitive.
export const STATUS_COMPONENTS = new Set(
  [
    "components/CaseBadge.tsx",
    "components/ui/dashboard/OpPill.tsx",
    "components/ui/dashboard/OpStateBadge.tsx",
    "components/ui/dashboard/OpStatusPill.tsx",
    "components/ui/dashboard/CaseStatusBadge.tsx",
    "components/ui/dashboard/OpKpi.tsx",
  ].map((p) => p.replaceAll("/", sep)),
);

// Matches raw ln-op-ok/warn/danger/viol token utilities that the st-* layer replaces.
// Does NOT match ln-op-ok-bg / ln-op-ok-bd companions (those are covered transitively).
// WARN-level: still valid CSS, just nudges toward st-*.
export const RAW_OP_STATUS = /\b(?:bg|text|border)-ln-op-(?:ok|warn|danger|viol)(?:-bg|-bd)?\b/g;

// Matches raw CITIZEN status tones (ln-ok/warn/err/danger/violeta) — both the class
// utility form (text-ln-ok, ring-ln-warn) and the arbitrary CSS-var form
// (bg-[var(--color-ln-ok-050)]). This is the exact CaseBadge regression: a status
// pill hardcoding a citizen tone instead of st-*, so "Abierto" rendered green on
// operator surfaces. HARD-ERROR inside STATUS_COMPONENTS. Structural ln-* tokens
// (ln-card/ink/line/mute/stripe) and ln-op-* are intentionally NOT matched.
export const RAW_CITIZEN_STATUS =
  /\b(?:bg|text|border|ring)-(?:\[var\(--color-)?ln-(?:ok|warn|err|danger|violeta)(?:-\d+)?/g;

// ---------------------------------------------------------------------------
// Undefined operator-token guard (silent-invisible class)
//
// In Tailwind v4 an undefined utility emits NO CSS — the element renders
// transparent/invisible with no error. `ln-op-verde` / `ln-op-rojo` /
// `ln-op-amarillo` (Spanish color names that were never defined tokens) shipped
// this way across ~11 gob/admin screens: adoption/health bars that rendered
// blank. This guard FAILS on any `<util>-ln-op-<name>` whose <name> is not a
// defined `--color-ln-op-*` token. The allowlist is PARSED from app/globals.css
// (parseDefinedOpTokens) so it stays in sync with the theme automatically.
// ---------------------------------------------------------------------------

// Path to the theme file that declares the --color-ln-op-* tokens. It is a .css
// file, so it is never in the ts/tsx FILES glob — read explicitly for the allowlist.
const OP_TOKENS_CSS_PATH = "app/globals.css";

/**
 * Parse the set of DEFINED operator token names from theme CSS, e.g.
 * `--color-ln-op-ok: …` → "ok", `--color-ln-op-danger-bd: …` → "danger-bd".
 * Exported for unit tests.
 */
export function parseDefinedOpTokens(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/--color-ln-op-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g)) {
    out.add(m[1]);
  }
  return out;
}

// Matches an operator token utility `<util>-ln-op-<name>`, after any variant
// prefix (hover:, focus:) and before any opacity suffix (/40). Capture group 1
// is <name> (may be compound: ok-bg, danger-bd, azul-700, celeste-050). Checked
// against the parsed allowlist; any <name> not present is a hard error.
export const OP_TOKEN_UTILITY =
  /\b(?:bg|text|border|ring|divide|from|to|via|outline|fill|stroke|placeholder|caret|decoration|accent)-ln-op-([a-z0-9]+(?:-[a-z0-9]+)*)/g;

// ---------------------------------------------------------------------------
// Rules 4–8 (new ratchet rules — fail only on NEW violations above baseline)
// ---------------------------------------------------------------------------

// Rule 4: Arbitrary text sizes — text-[Npx] or text-[N.Npx].
// Note: text-[var(--text-*)] is intentionally NOT matched (correct token form).
export const ARBITRARY_TEXT_PX = /\btext-\[\d+\.?\d*px\]/g;

// Rule 5: Arbitrary spacing — p/m/gap/space etc. with [Npx] or [Nrem].
// Note: p-[var(--space-*)] etc. are intentionally NOT matched (correct token form).
export const ARBITRARY_SPACING_PX =
  /\b(?:p|m|gap|space|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap-x|gap-y)-\[\d+\.?\d*(?:px|rem)\]/g;

// Rule 6: Arbitrary radius — rounded-[Npx].
// Note: rounded-[var(--radius-*)] is intentionally NOT matched (correct token form).
export const ARBITRARY_RADIUS_PX = /\brounded-\[\d+\.?\d*px\]/g;

// Rule 7: Arbitrary shadow — shadow-[...] (any arbitrary shadow value).
// Exempts shadow-[var(--shadow-*)] which IS the correct token form.
// Only flags raw value literals like shadow-[0_1px_2px_rgba(0,0,0,0.1)].
export const ARBITRARY_SHADOW = /\bshadow-\[(?!var\(--)[^\]]+\]/g;

// Rule 8: Hex literals in style= / inline CSS props
// Catches: style={{ color: '#abc' }}, fill="#123456", backgroundColor="#fff"
export const HEX_IN_STYLE =
  /(?:style|fill|color|stroke|background|backgroundColor)=\{[^}]*#[0-9a-fA-F]{3,8}/g;

// ---------------------------------------------------------------------------
// Baseline loader — reads scripts/design-tokens-baseline.json
//
// Format: { files: { "relative/path.tsx": { text, space, rounded, shadow, hexStyle } } }
// Any file absent from the baseline has an implicit baseline of 0 for all counts.
// A file present in the baseline is grandfathered up to that count per category.
// New violations (count > baseline OR new file not in baseline) FAIL.
// ---------------------------------------------------------------------------

type BaselineCounts = {
  text: number;
  space: number;
  rounded: number;
  shadow: number;
  hexStyle: number;
};

type BaselineFile = {
  _meta: { totalViolations: number };
  files: Record<string, BaselineCounts>;
};

function loadBaseline(): BaselineFile["files"] {
  try {
    const req = createRequire(import.meta.url);
    const data = req("./design-tokens-baseline.json") as BaselineFile;
    return data.files;
  } catch {
    console.warn(
      "[warn] scripts/design-tokens-baseline.json not found — all ratchet rules will be strict (no grandfather). Run: node scripts/generate-design-tokens-baseline.mjs to regenerate.",
    );
    return {};
  }
}

// ---------------------------------------------------------------------------
// Ratchet counter — counts per-file hits for rules 4–8, compares to baseline
// ---------------------------------------------------------------------------

function countMatches(src: string, re: RegExp): number {
  return [...src.matchAll(re)].length;
}

function runChecks(): void {
  const baseline = loadBaseline();

  // Parse the defined --color-ln-op-* allowlist from theme CSS. If the file is
  // unreadable, disable the undefined-token guard rather than flag every token.
  let definedOpTokens = new Set<string>();
  try {
    definedOpTokens = parseDefinedOpTokens(readFileSync(OP_TOKENS_CSS_PATH, "utf8"));
  } catch {
    console.warn(
      `[warn] ${OP_TOKENS_CSS_PATH} not readable — undefined ln-op-* token guard skipped.`,
    );
  }
  const opGuardActive = definedOpTokens.size > 0;

  let hits = 0;

  // Ratchet per-file totals for rules 4–8
  const ratchetResults: Array<{
    file: string;
    category: keyof BaselineCounts;
    actual: number;
    allowed: number;
  }> = [];

  for (const file of FILES) {
    const relPath = file.replaceAll("\\", "/");
    const src = readFileSync(file, "utf8");
    const lines = src.split(/\r?\n/);
    const baselineCounts: BaselineCounts = baseline[relPath] ?? {
      text: 0,
      space: 0,
      rounded: 0,
      shadow: 0,
      hexStyle: 0,
    };

    // --- Rules 1–3 (line-level, no ratchet) ---
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
      if (opGuardActive) {
        for (const match of line.matchAll(OP_TOKEN_UTILITY)) {
          const name = match[1];
          if (!definedOpTokens.has(name)) {
            console.error(
              `${file}:${i + 1}:${(match.index ?? 0) + 1}: undefined operator token "ln-op-${name}" (in "${match[0]}") — not a defined --color-ln-op-* token. Tailwind v4 emits no CSS for it, so the element renders invisible. Use a defined token from ${OP_TOKENS_CSS_PATH}.`,
            );
            hits += 1;
          }
        }
      }
      if (STATUS_COMPONENTS.has(file)) {
        // Skip comment lines (TSX single-line comments // …) for both status rules.
        const isComment = line.trimStart().startsWith("//");
        // Hard-error: raw citizen status tone in a status component (CaseBadge regression).
        if (!isComment) {
          for (const match of line.matchAll(RAW_CITIZEN_STATUS)) {
            console.error(
              `${file}:${i + 1}:${(match.index ?? 0) + 1}: raw citizen status tone "${match[0]}" in a status component — use the st-* layer (e.g. text-[var(--color-st-warn)]) so the tone auto-remaps per skin.`,
            );
            hits += 1;
          }
        }
        // Warn-level: raw ln-op-ok/warn/danger/viol — nudge toward st-*.
        if (!isComment) {
          for (const match of line.matchAll(RAW_OP_STATUS)) {
            console.warn(
              `[warn] ${file}:${i + 1}:${(match.index ?? 0) + 1}: "${match[0]}" in operator status component — prefer st-* token (e.g. text-[var(--color-st-ok)]). See globals.css .op-surface block.`,
            );
          }
        }
      }
    });

    // --- Rules 4–8 (file-level ratchet) ---
    const actual = {
      text: countMatches(src, ARBITRARY_TEXT_PX),
      space: countMatches(src, ARBITRARY_SPACING_PX),
      rounded: countMatches(src, ARBITRARY_RADIUS_PX),
      shadow: countMatches(src, ARBITRARY_SHADOW),
      hexStyle: countMatches(src, HEX_IN_STYLE),
    };

    const categories: Array<[keyof BaselineCounts, string, string]> = [
      ["text", "text-[Npx]", "use a --text-* token (e.g. text-[var(--text-sm)])"],
      [
        "space",
        "spacing-[Npx|rem]",
        "use Tailwind spacing scale or --space-* tokens (e.g. p-3 instead of p-[12px])",
      ],
      ["rounded", "rounded-[Npx]", "use a --radius-* token (e.g. rounded-[var(--radius-sm)])"],
      ["shadow", "shadow-[...]", "use a --shadow-* token (e.g. shadow-[var(--shadow-md)])"],
      ["hexStyle", "hex in style=", "use a CSS var (e.g. var(--color-ln-ok)) in style props"],
    ];

    for (const [key, label, hint] of categories) {
      const allowed = baselineCounts[key];
      const seen = actual[key];
      if (seen > allowed) {
        ratchetResults.push({ file: relPath, category: key, actual: seen, allowed });
        console.error(
          `${file}: ratchet — ${seen} ${label} violation(s) (baseline allows ${allowed}). ${hint}. To grandfather, run: node scripts/generate-design-tokens-baseline.mjs`,
        );
        hits += 1;
      }
    }
  }

  if (hits > 0) {
    console.error(
      `\n✗ ${hits} design-token violation(s). Autofix: pnpm tsx scripts/codemod-poncho-tokens.ts && pnpm tsx scripts/codemod-purge-dark.ts && node scripts/codemod-status-tints.cjs`,
    );
    process.exit(1);
  }

  const totalBaselined = Object.values(baseline).reduce(
    (sum, c) => sum + c.text + c.space + c.rounded + c.shadow + c.hexStyle,
    0,
  );
  console.log(
    `✓ Design tokens clean — 0 raw palette, 0 dark: prefix, 0 arbitrary hex across ${FILES.length} files.`,
  );
  console.log(
    `  Ratchet: ${totalBaselined} grandfathered arbitrary values across ${Object.keys(baseline).length} files (rules 4–8). New violations will fail.`,
  );
}

// Only scan the repo when invoked as a CLI (pnpm lint:tokens / tsx). Importing
// this module from unit tests must not trigger the scan or process.exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-design-tokens.ts") ||
    process.argv[1].endsWith("check-design-tokens.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runChecks();
}
