// router.refresh() ban linter — CI guardrail for the nav burn-down (N2,
// 2026-07-04, docs/design/handoffs/2026-07-04-router-refresh-tiers.md).
//
// WHY: Next.js 15.5.x's App Router has a production-mode defect where a
// client-router transition (router.push / router.replace / router.refresh)
// can silently drop — the fetch resolves, but no history update and no
// re-render ever happen (engram #621/#622, verify-report #650 WARNING-1).
// Post-mutation UI truth therefore comes from either:
//   a) a FULL document navigation — navigateAfterActionSuccess() /
//      closeSheetNavWithFullReload() (lib/ui/full-page-action-nav.ts,
//      lib/ui/sheet-nav.ts), or
//   b) Tier B optimistic local state with revert-on-error.
// router.refresh() is NEVER a safe substitute. This linter blocks any new
// runtime call site from landing.
//
// Mechanics: scans production .ts/.tsx under app/, components/, src/ (tests
// excluded), strips comments, and flags `router.refresh(` /
// `.refresh()` on a useRouter() result. Comment mentions (e.g. the Tier C
// files documenting the ban: SheetMounter.tsx, MisTurnosSheetMounter.tsx,
// JurisdictionSwitcher.tsx) are fine — only runtime code is flagged.
//
// Run: pnpm tsx scripts/check-router-refresh.ts   (or: pnpm lint:nav)
// Exits 1 with file:line on each hit. Exits 0 if clean.

import { globSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Allowlist — relative paths (forward slashes) permitted to call
// router.refresh() at runtime. Empty by design: every call site was burned
// down in the 2026-07-04 N2 pass. Add an entry ONLY with a written
// justification for why neither a full document navigation nor optimistic
// local state can work, and link the discussion.
// ---------------------------------------------------------------------------
export const ROUTER_REFRESH_ALLOWLIST = new Set<string>([]);

const REFRESH_CALL = /\brouter\s*\.\s*refresh\s*\(|\buseRouter\s*\(\s*\)\s*\.\s*refresh\s*\(/;

/**
 * Strips // line comments and /* ... *\/ block comments so documentation of
 * the ban itself never trips the linter. Deliberately naive about template
 * literals — a stripped URL tail can't produce a `router.refresh(` token,
 * so false positives are not possible from that shortcut.
 */
export function stripComments(source: string): string {
  let out = "";
  let inBlock = false;
  for (const rawLine of source.split("\n")) {
    let line = rawLine;
    let kept = "";
    while (line.length > 0) {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end === -1) {
          line = "";
        } else {
          line = line.slice(end + 2);
          inBlock = false;
        }
        continue;
      }
      const lineComment = line.indexOf("//");
      const blockStart = line.indexOf("/*");
      if (lineComment !== -1 && (blockStart === -1 || lineComment < blockStart)) {
        kept += line.slice(0, lineComment);
        line = "";
      } else if (blockStart !== -1) {
        kept += line.slice(0, blockStart);
        line = line.slice(blockStart + 2);
        inBlock = true;
      } else {
        kept += line;
        line = "";
      }
    }
    out += `${kept}\n`;
  }
  return out;
}

export function findOffenders(
  relativePath: string,
  source: string,
): Array<{ file: string; line: number; text: string }> {
  if (ROUTER_REFRESH_ALLOWLIST.has(relativePath)) return [];
  const offenders: Array<{ file: string; line: number; text: string }> = [];
  const lines = stripComments(source).split("\n");
  lines.forEach((line, idx) => {
    if (REFRESH_CALL.test(line)) {
      offenders.push({ file: relativePath, line: idx + 1, text: line.trim() });
    }
  });
  return offenders;
}

function isProductionSource(path: string): boolean {
  if (path.includes("__tests__")) return false;
  if (/\.test\.[jt]sx?$/.test(path)) return false;
  if (path.endsWith(".d.ts")) return false;
  return true;
}

function main(): void {
  const files = [
    ...globSync("app/**/*.{ts,tsx}"),
    ...globSync("components/**/*.{ts,tsx}"),
    ...globSync("src/**/*.{ts,tsx}"),
  ]
    .map((p) => p.replaceAll("\\", "/"))
    .filter(isProductionSource);

  const offenders = files.flatMap((file) => findOffenders(file, readFileSync(file, "utf8")));

  if (offenders.length > 0) {
    console.error("router.refresh() is banned in production code (nav burn-down N2).");
    console.error("Use navigateAfterActionSuccess() / closeSheetNavWithFullReload() for a full");
    console.error("document navigation, or Tier B optimistic local state with revert-on-error.");
    console.error("See docs/design/handoffs/2026-07-04-router-refresh-tiers.md.\n");
    for (const o of offenders) {
      console.error(`  ${o.file}:${o.line}  ${o.text}`);
    }
    process.exit(1);
  }

  console.log(`lint:nav OK — ${files.length} files scanned, 0 runtime router.refresh() calls.`);
}

main();
