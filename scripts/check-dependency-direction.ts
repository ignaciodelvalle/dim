// Inter-module dependency direction linter — CI ratchet (F3).
//
// Enforces that no NEW cross-module import edges are introduced beyond the
// baseline set captured on 2026-06-26 (branch integration/session-review).
//
// Within-module layer enforcement (domain → no db/infra/framework) is already
// handled by the biome.json noRestrictedImports overrides on
// src/modules/*/domain/**. This script covers the BETWEEN-module axis.
//
// Rule: every import from src/modules/<A>/** that resolves to
// @/src/modules/<B>/** (where B ≠ A) must be an entry in ALLOWED_EDGES.
// Any edge not in ALLOWED_EDGES is an error and exits 1.
//
// Adding a new edge requires a deliberate update to ALLOWED_EDGES (with a
// justification comment), keeping the graph legible and change-reviewed.
//
// Run: pnpm tsx scripts/check-dependency-direction.ts   (or: pnpm lint:deps)
// Exits 0 when clean; exits 1 listing each offending import with file:line.
//
// Regex-based, not a full AST analyzer — mirrors the sibling linters
// (check-ui-invariants.ts, check-design-tokens.ts, check-authz-guards.ts).

import { globSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Baseline — allowed cross-module edges as of 2026-06-26.
// Format: "from:to" where from and to are module names (the directory name
// under src/modules/).
//
// Current graph (acyclic):
//
//   adoption  ──▶  organizations   (shared kernel — acknowledged in README)
//   foster    ──▶  organizations   (shared kernel)
//   transfers ──▶  organizations   (shared kernel)
//   surveillance ▶ organizations   (shared kernel)
//   events    ──▶  surveillance    (trigger enqueue side-effect)
//   events    ──▶  pets            (chipImplantSiteFromLocation domain helper)
//   pets      ──▶  adoption        (NewNotification type from eligibility use-case)
//
// NOTE — pets→adoption is a grandfathered edge where a lower-tier module
// reaches into an upper-tier feature module. It is baselined to keep the guard
// green today. It is a candidate for clean-up (extract the type to a shared
// location or invert the dependency) but that refactor is NOT in scope here.
// ---------------------------------------------------------------------------
export const ALLOWED_EDGES = new Set<string>([
  "adoption:organizations",
  "foster:organizations",
  "transfers:organizations",
  "surveillance:organizations",
  "events:surveillance",
  "events:pets",
  "pets:adoption", // grandfathered — see note above
  // Edges surfaced by the strangler migration (2026-06-30) — real dependencies
  // that previously lived in app/actions/ (un-checked) and became visible when
  // the logic moved into src/modules/. All intentional:
  "alerts:surveillance", // alert-firings triage opens an outbreak investigation (openOutbreakInvestigationAction)
  "pets:custody", // pet-claim dispute flow opens a custody dispute (openDisputeFromEvent)
  "search:organizations", // omnibox logs a PII read (logPiiQueryForAuthority) + checks org capabilities (getGrantedCapabilities)
]);

// All module names (directory names under src/modules/).
export const ALL_MODULES = [
  "adoption",
  "cases",
  "events",
  "foster",
  "lost",
  "organizations",
  "panorama",
  "pets",
  "surveillance",
  "transfers",
  "welfare",
] as const;

// Regex to extract a module import target from an import statement.
// Matches @/src/modules/<moduleName> in both static and dynamic import forms.
const MODULE_IMPORT_RE = /@\/src\/modules\/([a-z]+)/g;

export type EdgeViolation = {
  file: string;
  line: number;
  fromModule: string;
  toModule: string;
  importPath: string;
};

// Derive which module a source file belongs to from its path.
// Returns undefined if the path is not under src/modules/<module>/.
export function moduleFromPath(filePath: string): string | undefined {
  const normalized = filePath.replaceAll("\\", "/");
  const m = normalized.match(/src\/modules\/([a-z]+)\//);
  return m ? m[1] : undefined;
}

// Scan a single file for cross-module imports that violate the allowed edges.
export function findViolations(filePath: string, src: string): EdgeViolation[] {
  const fromModule = moduleFromPath(filePath);
  if (!fromModule) return [];

  const violations: EdgeViolation[] = [];
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Reset lastIndex before each exec loop.
    MODULE_IMPORT_RE.lastIndex = 0;
    for (let m = MODULE_IMPORT_RE.exec(line); m !== null; m = MODULE_IMPORT_RE.exec(line)) {
      const toModule = m[1];
      if (toModule === fromModule) continue; // self-import, fine
      const edge = `${fromModule}:${toModule}`;
      if (!ALLOWED_EDGES.has(edge)) {
        violations.push({
          file: filePath.replaceAll("\\", "/"),
          line: i + 1,
          fromModule,
          toModule,
          importPath: m[0],
        });
      }
    }
  }

  return violations;
}

// All TypeScript/TSX files under src/modules/ (excluding test files so the
// check reflects production import edges, not test-fixture coupling).
export function listModuleFiles(): string[] {
  return globSync("src/modules/**/*.{ts,tsx}")
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .sort();
}

function runScan(): void {
  const files = listModuleFiles();
  if (files.length === 0) {
    console.error("✗ check-dependency-direction: no files found under src/modules/.");
    process.exit(1);
  }

  const allViolations: EdgeViolation[] = [];
  for (const file of files) {
    allViolations.push(...findViolations(file, readFileSync(file, "utf8")));
  }

  if (allViolations.length > 0) {
    for (const v of allViolations) {
      console.error(
        `${v.file}:${v.line} — forbidden cross-module import: ${v.fromModule} → ${v.toModule} ("${v.importPath}"). Add the edge to ALLOWED_EDGES in scripts/check-dependency-direction.ts with a justification comment if this edge is intentional.`,
      );
    }
    console.error(
      `\n✗ ${allViolations.length} forbidden cross-module import(s). ` +
        `Allowed edges: ${[...ALLOWED_EDGES].join(", ")}.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ Dependency direction clean — ${files.length} module files scanned; ` +
      `all cross-module edges are within the allowed set (${ALLOWED_EDGES.size} edges).`,
  );
}

// Guard: only scan when run directly; importing from tests exposes helpers
// without triggering the filesystem scan.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-dependency-direction.ts") ||
    process.argv[1].endsWith("check-dependency-direction.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
