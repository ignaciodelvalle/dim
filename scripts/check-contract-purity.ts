// `packages/contract` purity fence — CI lint (native-readiness T1.1).
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// `packages/contract` is the first thing a React Native app will install. Its
// entire value is that it CAN be installed: no `next`, no `react`, no
// `drizzle-orm`, no `@/*` reach-back into the web app, and no runtime
// dependencies at all. None of that is self-enforcing. One `import type` from
// `@/db/schema` — which is exactly how the event-type source of truth ended up
// anchored to a 4.8k-line ORM module in the first place — quietly re-couples
// the package to the app, and nothing about the web build would notice: the
// web app HAS next and drizzle installed, so the import resolves and the
// typecheck is green. The failure surfaces months later, in a Metro bundler,
// to somebody who cannot fix it.
//
// So the boundary is checked here, in the repo that can still move the file.
//
// WHAT IT CHECKS
//   1. No `@/…` app-alias import anywhere in the package.
//   2. No relative import that escapes the package directory.
//   3. No import of a FORBIDDEN package (next, react, drizzle, postgres,
//      server-only, …) — named explicitly so the error can say why.
//   4. No import of ANY bare package the manifest does not declare. This is
//      the rule that survives contact with the future: a forbidden-name list
//      only knows the frameworks that existed when it was written, while
//      "you imported something you did not declare" catches all of them.
//      `node:*` builtins and the test runner are the only exceptions.
//   5. The manifest declares ZERO `dependencies` / `peerDependencies`. Without
//      this, rule 4 is trivially defeated by adding the dep — which may well
//      be the right call one day, but it is a decision that has to be made in
//      this file, in the open, not smuggled in behind an import.
//   6. Nothing outside the package imports it BY PATH. `@/*` maps to `./*`, so
//      `@/packages/contract/src/viz/viz-scales` resolves perfectly and walks
//      straight past the `exports` map. A boundary you can sidestep with a
//      longer string is not a boundary.
//   7. Non-vacuity: scanning zero files is a FAILURE, not a pass. (This repo
//      has been bitten repeatedly by a fence whose corpus quietly missed the
//      code it was supposed to guard.)
//
// Run: pnpm tsx scripts/check-contract-purity.ts   (or: pnpm lint:contract)
// Exits 0 when clean; exits 1 listing each file:line then the offending
// specifier.
//
// Regex-based, not a full AST analyzer — mirrors the sibling linters
// (check-dependency-direction.ts, check-mock-paths.ts, check-lib-root-files.ts).

import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The package under guard, repo-relative and posix-separated. */
export const PACKAGE_DIR = "packages/contract";

/** Its manifest. */
export const PACKAGE_MANIFEST = `${PACKAGE_DIR}/package.json`;

/** The published name — the ONLY way the rest of the repo may refer to it. */
export const PACKAGE_NAME = "@dim/contract";

/** Sources inside the package (its own tests included — a test that reaches
 *  into the app proves the module under test is not portable either). */
const PACKAGE_GLOB = `${PACKAGE_DIR}/**/*.{ts,tsx}`;

/** Where a path-form import of the package could be written from. */
const CONSUMER_GLOBS = [
  "app/**/*.{ts,tsx}",
  "components/**/*.{ts,tsx}",
  "db/**/*.{ts,tsx}",
  "lib/**/*.{ts,tsx}",
  "src/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx}",
  "__tests__/**/*.{ts,tsx}",
  "e2e/**/*.{ts,tsx}",
];

/**
 * Bare packages that are specifically disqualifying, with the reason. Rule 4
 * would already catch every one of these; naming them buys a message that says
 * what the boundary is FOR instead of "undeclared dependency".
 */
export const FORBIDDEN_PACKAGES: Record<string, string> = {
  next: "the contract must not know a web framework exists — a React Native app has no Next.js.",
  react: "the contract carries data and rules, never components. UI belongs to the consumer.",
  "react-dom": "DOM rendering is a web concern; the contract is renderer-agnostic.",
  "react-native": "the contract stays neutral between web and native, not tied to either.",
  "drizzle-orm": "the ORM is exactly the anchor this package exists to cut. Types included.",
  "drizzle-kit": "migration tooling is a server-side build concern.",
  postgres: "a database driver inside an installable client contract is a category error.",
  "server-only": "that marker is a Next.js bundler directive; it means nothing off the web.",
  zod: "runtime validation would make the contract a dependency rather than a description. If the API DTOs need schemas here (native-readiness T1.3), that is a deliberate decision — record it in this file first.",
};

/** Bare specifiers allowed despite not being declared as dependencies: the
 *  test runner, which is dev-time only and never part of the installed surface. */
const ALLOWED_BARE = new Set(["vitest"]);

// import ... from "x" | export ... from "x" | import "x" | import("x") | require("x")
const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PurityViolation = {
  file: string;
  line: number;
  specifier: string;
  reason: string;
};

// ---------------------------------------------------------------------------
// Core logic (exported for unit tests)
// ---------------------------------------------------------------------------

/** Every import/export/require specifier in `src`, with its 1-based line. */
export function extractSpecifiers(src: string): Array<{ specifier: string; line: number }> {
  const out: Array<{ specifier: string; line: number }> = [];
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = IMPORT_RE.exec(src))) {
    const specifier = m[1] ?? m[2] ?? m[3];
    if (!specifier) continue;
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ specifier, line });
  }
  return out;
}

/**
 * The npm package name a bare specifier belongs to.
 * "next/navigation" then "next"; "@supabase/ssr" stays "@supabase/ssr".
 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

/**
 * Classify one specifier seen inside the package. Returns the reason it is
 * disallowed, or null when it is fine.
 *
 * `declared` is the set of package names the manifest legitimately depends on
 * (empty today — see rule 5).
 */
export function violationFor(
  specifier: string,
  importerAbs: string,
  declared: ReadonlySet<string>,
  packageRootAbs: string,
): string | null {
  if (specifier.startsWith("@/")) {
    return `app-alias import. "@/…" resolves against the web app tsconfig; ${PACKAGE_NAME} has no such alias and neither will a native consumer.`;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = resolve(importerAbs, "..", specifier).replace(/\\/g, "/");
    const root = packageRootAbs.replace(/\\/g, "/");
    if (!target.startsWith(`${root}/`)) {
      return `relative import escaping ${PACKAGE_DIR}/. Anything the contract needs has to live inside it.`;
    }
    return null;
  }

  if (specifier.startsWith("node:")) return null;

  const pkg = packageNameOf(specifier);
  if (pkg === PACKAGE_NAME) return null; // self-reference through the exports map
  if (ALLOWED_BARE.has(pkg)) return null;

  const forbidden = FORBIDDEN_PACKAGES[pkg];
  if (forbidden) return `forbidden dependency "${pkg}" — ${forbidden}`;

  if (!declared.has(pkg)) {
    return `undeclared dependency "${pkg}". ${PACKAGE_NAME} declares no dependencies, so an import it does not declare is an install failure waiting for the first consumer that is not this repo.`;
  }

  return null;
}

/** Rule 6: a path-form reference to the package from outside it. */
export function pathFormReference(specifier: string): boolean {
  return (
    specifier.startsWith(`@/${PACKAGE_DIR}`) ||
    specifier.includes(`/${PACKAGE_DIR}/`) ||
    specifier.startsWith(`${PACKAGE_DIR}/`)
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function scanFiles(globs: string[]): string[] {
  const seen = new Set<string>();
  for (const g of globs) {
    for (const f of globSync(g)) {
      const p = posix(f);
      if (p.includes("node_modules/") || p.includes("/.next/")) continue;
      seen.add(p);
    }
  }
  return [...seen].sort();
}

function declaredDependencies(): { declared: Set<string>; manifestViolation: string | null } {
  const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST, "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const manifestViolation =
    declared.size > 0
      ? [
          `${PACKAGE_MANIFEST} declares ${declared.size} dependency/dependencies (${[...declared].join(", ")}).`,
          "The contract's promise is that installing it costs nothing. Adding a dependency is a deliberate",
          "architectural change: update rule 5 in scripts/check-contract-purity.ts in the same commit, with the reason.",
        ].join(" ")
      : null;
  return { declared, manifestViolation };
}

function runCheck(): void {
  const packageFiles = scanFiles([PACKAGE_GLOB]);

  // Rule 7 — non-vacuity.
  if (packageFiles.length === 0) {
    console.error(
      [
        `✗ check-contract-purity: scanned ZERO files under ${PACKAGE_DIR}/.`,
        "  That is not a pass — it means the glob no longer matches the package",
        "  (moved? renamed?) and this fence would wave everything through.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const packageRootAbs = resolve(process.cwd(), PACKAGE_DIR);
  const { declared, manifestViolation } = declaredDependencies();
  const violations: PurityViolation[] = [];

  for (const file of packageFiles) {
    const abs = resolve(process.cwd(), file);
    for (const { specifier, line } of extractSpecifiers(readFileSync(file, "utf8"))) {
      const reason = violationFor(specifier, abs, declared, packageRootAbs);
      if (reason) violations.push({ file, line, specifier, reason });
    }
  }

  // Rule 6 — path-form references from the rest of the repo.
  for (const file of scanFiles(CONSUMER_GLOBS)) {
    if (posix(relative(process.cwd(), file)).startsWith(PACKAGE_DIR)) continue;
    for (const { specifier, line } of extractSpecifiers(readFileSync(file, "utf8"))) {
      if (!pathFormReference(specifier)) continue;
      violations.push({
        file,
        line,
        specifier,
        reason: `path-form import of the contract. Use "${PACKAGE_NAME}" or a documented subpath — a path import bypasses the exports map and re-couples the app to the package's internal layout.`,
      });
    }
  }

  if (violations.length > 0 || manifestViolation) {
    console.error("");
    console.error(`✗ ${PACKAGE_NAME} purity FAILED`);
    console.error("");
    if (manifestViolation) {
      console.error(`  manifest: ${manifestViolation}`);
      console.error("");
    }
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  "${v.specifier}"`);
      console.error(`      ${v.reason}`);
    }
    console.error("");
    console.error(
      [
        `  ${PACKAGE_NAME} is what a React Native app installs. Everything in it must`,
        "  compile with no web framework, no ORM and no app aliases present.",
      ].join("\n"),
    );
    console.error("");
    process.exit(1);
  }

  console.log(
    `✓ ${PACKAGE_NAME} purity — ${packageFiles.length} file(s) under ${PACKAGE_DIR}/, zero framework/ORM/app-alias imports, zero declared dependencies.`,
  );
}

// Only run when invoked as a CLI; importing from tests must not exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-contract-purity.ts") ||
    process.argv[1].endsWith("check-contract-purity.js"));

if (isMain) runCheck();
