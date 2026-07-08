// Jurisdiction-subsumption linter — CI guardrail (regression armor).
//
// THE BUG CLASS THIS CATCHES ("exact-pair jurisdiction gate"):
//   An authorization site that gates a govt operator by hand-rolling an EXACT
//   (province, locality) equality against a resource row's stored jurisdiction:
//
//     jurisdictions.some(
//       (j) => j.province === row.jurisdictionProvince &&
//              j.locality === row.jurisdictionLocality,
//     )
//
//   This DIVERGES from the two-tier CABA model: a whole-province assignment
//   (e.g. whole-CABA / "Ciudad Autónoma de Buenos Aires") governs EVERY barrio
//   in that province, but the exact pair only matches the literal whole-city
//   string — so a whole-CABA operator 404s / is denied on a barrio-tagged row
//   (Almagro, Palermo, …). The queue LIST already subsumes barrios via
//   jurisdictionPairClause, so list and detail authorization silently disagree.
//   See lib/domain/jurisdiction-canonical.ts and the fix in commit 4cc1cbd5.
//
// THE FIX (what makes a site pass this linter):
//   Route the check through the canonical subsumption helpers instead of a raw
//   pair — jurisdictionScopeContains (in-memory) or jurisdictionPairClause /
//   isWholeProvinceLocality (SQL). Those keep barrio-specific assignments exact
//   and other provinces invisible, so they NEVER widen security.
//
// WHY A HARD FAIL (no baseline, unlike check-authz-scoping):
//   After the class was closed there are ZERO offenders in source. The signature
//   keys on the RESOURCE column names `.jurisdictionProvince` / `.jurisdictionLocality`,
//   which only appear paired-and-exact at a real authorization read. Legitimate
//   exact matches elsewhere compare against a UI SELECTION (`selectedLocalityName`,
//   `selectedLocalityRow.localityName`) or use different field names — they do NOT
//   match. So any new hit is a real regression of the whole class (like lint:events
//   for ghost payload keys).
//
// SANCTIONED EXCEPTIONS (the only files allowed to pair the exact columns):
//   - lib/domain/jurisdiction-canonical.ts — defines jurisdictionScopeContains,
//     whose fail-closed inner branch IS the exact pair (for barrio assignments).
//   - lib/metrics/scope.ts — defines jurisdictionPairClause (the SQL counterpart).
//
// Run: pnpm tsx scripts/check-jurisdiction-subsumption.ts  (or: pnpm lint:authz-subsumption)

import { globSync, readFileSync } from "node:fs";

// Files allowed to hand-roll the exact (province, locality) pair — they are the
// canonical subsumption helpers themselves.
const SANCTIONED = new Set<string>([
  "lib/domain/jurisdiction-canonical.ts",
  "lib/metrics/scope.ts",
]);

// The anti-pattern signature: an operator jurisdiction's `.province` / `.locality`
// compared for EXACT equality against a resource row's `.jurisdictionProvince` /
// `.jurisdictionLocality`, joined by `&&` (order-tolerant, newline-tolerant).
// Keying on the resource column names is what keeps this precise: UI-selection
// exact matches compare against `selected*` / `*localityName`, never these.
const ANTI_PATTERN =
  /\.province\s*===\s*[\w.]+\.jurisdictionProvince\s*&&\s*[\w.]*\.?locality\s*===\s*[\w.]+\.jurisdictionLocality/;

// Line-level scan (so we can report line numbers) with a small look-ahead window
// to catch the pattern when it spans lines — the common Biome-formatted shape.
export function findSubsumptionOffenders(relPath: string, src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Join up to 3 lines so a wrapped `&&` predicate still matches.
    const window = `${lines[i]}\n${lines[i + 1] ?? ""}\n${lines[i + 2] ?? ""}`;
    if (ANTI_PATTERN.test(window)) {
      out.push(`${relPath}:${i + 1}`);
    }
  }
  return out;
}

export function listScopedSourceFiles(): string[] {
  const patterns = ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts", "src/**/*.ts", "src/**/*.tsx"];
  return patterns
    .flatMap((p) => globSync(p))
    .map((f) => f.replaceAll("\\", "/"))
    .filter(
      (f) => !f.includes("/__tests__/") && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
    )
    .filter((f) => !SANCTIONED.has(f));
}

export function scanAll(): string[] {
  const offenders: string[] = [];
  for (const file of listScopedSourceFiles()) {
    offenders.push(...findSubsumptionOffenders(file, readFileSync(file, "utf8")));
  }
  return offenders;
}

function runScan(): void {
  const offenders = scanAll();
  if (offenders.length === 0) {
    console.log(
      "✓ jurisdiction-subsumption clean — no exact-pair (province, locality) authorization gates.",
    );
    return;
  }
  console.error(
    `✗ ${offenders.length} exact-pair jurisdiction gate(s) — a whole-province operator (e.g. whole-CABA) would be denied on a barrio-tagged row (list-vs-detail authorization divergence):`,
  );
  for (const o of offenders) console.error(`    ${o}`);
  console.error(
    "\nRoute the check through jurisdictionScopeContains (in-memory) or jurisdictionPairClause / isWholeProvinceLocality (SQL) — see lib/domain/jurisdiction-canonical.ts. These keep barrio assignments exact and never widen security.",
  );
  process.exit(1);
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-jurisdiction-subsumption.ts") ||
    process.argv[1].endsWith("check-jurisdiction-subsumption.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
