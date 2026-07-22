// Metric-contract fence — CI guard (C1, docs/reviews/results/
// 2026-07-22-plan-maestro-integridad.md, §2 "C1 · Contrato de Métrica").
//
// WHY THIS EXISTS
// ----------------
// C1's primitive: every KPI rendered on an operator surface SHOULD come from
// a lib/metrics/kpi-catalog.ts descriptor (question/target/semaphore/guards
// declared as data), consumed via <OpKpi descriptorId="…">. Today most of the
// ~80 OpKpi tiles across /gob + /admin still render descriptor-less (a label
// string + a raw value + an ad-hoc tone) — that gap is exactly what produced
// the dual-rabies label collision, the PPP "Peligro" verdict on a 0% uptake
// number, and the rest of the S1 findings this plan fences.
//
// This is a RATCHET, same shape as check-eyebrow-title.ts / check-tablist-
// ratchet.ts / check-state-coverage.ts's rule 4: the baseline below is the
// count of descriptor-less `<OpKpi` usages MEASURED on the day this fence
// landed — every one of those is grandfathered (green today, per the task's
// explicit instruction: "grandfather ALL current ones"). A file's count can
// only go DOWN from here (regenerate the baseline with --write-baseline after
// migrating a tile to `descriptorId`); a NEW descriptor-less tile, or an
// EXISTING file's count going UP, fails CI. The full ~80-tile sweep (giving
// every tile a catalog entry) is deliberately NOT this task — see the plan's
// "Ola II" for that; this fence just stops the count from growing while the
// sweep is pending.
//
// Detection: `<OpKpi` (word-boundary — deliberately does NOT match
// `<OpKpiSm`, which has no descriptorId/guard-engine integration and isn't
// in scope for this contract) with no `descriptorId` prop anywhere in its
// JSX block, scanned across app/gob/**/*.tsx and app/admin/**/*.tsx.
//
// Run: pnpm tsx scripts/check-metric-contract.ts   (or: pnpm lint:metric-contract)
// Regenerate baseline: pnpm tsx scripts/check-metric-contract.ts --write-baseline
// Exits 0 when clean; exits 1 listing each new/increased violation.

import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = resolve(ROOT, "scripts/metric-contract-baseline.json");

// ---------------------------------------------------------------------------
// Extraction — mirrors check-metric-labels.ts's brace-depth JSX-block scan
// (no full JSX parser; same "precision over recall" posture as
// check-ui-invariants.ts).
// ---------------------------------------------------------------------------

/** Extract every `<OpKpi` JSX block (NOT `<OpKpiSm`) from file content. */
function extractOpKpiBlocks(content: string): string[] {
  const blocks: string[] = [];
  // Word-boundary after "OpKpi": matches `<OpKpi ` / `<OpKpi\n` / `<OpKpi>`
  // but NOT `<OpKpiSm` (no boundary between two word chars 'i' and 'S').
  const tagRe = /<OpKpi\b/g;
  let match: RegExpExecArray | null = tagRe.exec(content);
  while (match !== null) {
    const start = match.index;
    let i = start + match[0].length;
    let depth = 0;
    let end = -1;
    while (i < content.length) {
      const ch = content[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (depth === 0 && ch === "/" && content[i + 1] === ">") {
        end = i + 2;
        break;
      } else if (depth === 0 && ch === ">") {
        end = i + 1;
        break;
      }
      i += 1;
    }
    if (end !== -1) blocks.push(content.slice(start, end));
    match = tagRe.exec(content);
  }
  return blocks;
}

function hasDescriptorId(block: string): boolean {
  return /\bdescriptorId\s*=/.test(block);
}

function normalizeRelPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/** Count of descriptor-less `<OpKpi` blocks per scanned file. Pure — file
 *  list injected so tests stay hermetic. */
export function scanMissingDescriptors(files: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const relPath = normalizeRelPath(file);
    const content = readFileSync(file, "utf8");
    const missing = extractOpKpiBlocks(content).filter((b) => !hasDescriptorId(b)).length;
    if (missing > 0) counts.set(relPath, missing);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

const SCAN_FILES = globSync("{app/gob,app/admin}/**/*.tsx").filter((f) => {
  const p = normalizeRelPath(f);
  if (p.includes("__tests__/") || p.endsWith(".test.tsx")) return false;
  return true;
});

type Baseline = Record<string, number>;

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

function writeBaseline(counts: Map<string, number>): void {
  const sorted: Baseline = {};
  for (const key of [...counts.keys()].sort()) sorted[key] = counts.get(key) as number;
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function runScan(): void {
  // FAIL CLOSED: an empty glob means the scan ran from the wrong directory —
  // that must never read as "no violations" (same posture as
  // check-metric-labels.ts's SCAN_FILES.length guard).
  if (SCAN_FILES.length === 0) {
    console.error("✗ check-metric-contract: no .tsx files matched under app/gob or app/admin.");
    process.exit(1);
  }

  const counts = scanMissingDescriptors(SCAN_FILES);

  if (process.argv.includes("--write-baseline")) {
    writeBaseline(counts);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(
      `✓ wrote baseline: ${counts.size} file(s), ${total} descriptor-less <OpKpi> tile(s) grandfathered.`,
    );
    return;
  }

  const baseline = loadBaseline();
  let failures = 0;
  let grandfathered = 0;

  for (const [file, count] of counts) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      failures += 1;
      console.error(
        `✗ ${file}: ${count} descriptor-less <OpKpi> tile(s) (baseline allows ${allowed}) — add a \`descriptorId\` prop resolving a lib/metrics/kpi-catalog.ts entry, or run \`pnpm tsx scripts/check-metric-contract.ts --write-baseline\` only if this is an intentional NEW pre-existing tile being grandfathered (prefer fixing it instead).`,
      );
    } else {
      grandfathered += count;
    }
  }

  // A file present in the baseline but absent from `counts` (0 violations
  // now) is progress — the ratchet should tighten, not silently drift stale.
  const stale = Object.keys(baseline).filter((f) => !counts.has(f));
  if (stale.length > 0) {
    console.warn(
      `[info] ${stale.length} baselined file(s) no longer have any descriptor-less <OpKpi> — regenerate the baseline (--write-baseline) to tighten the ratchet: ${stale.join(", ")}`,
    );
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} file(s) exceed their metric-contract baseline.`);
    process.exit(1);
  }

  console.log(
    `✓ metric-contract fence clean — ${grandfathered} grandfathered descriptor-less <OpKpi> tile(s) across ${Object.keys(baseline).length} baselined file(s); no NEW descriptor-less tiles.`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-metric-contract.ts") ||
    process.argv[1].endsWith("check-metric-contract.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
