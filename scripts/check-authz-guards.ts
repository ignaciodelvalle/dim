// Authorization-coverage linter — CI guardrail (WS-AUTHZ 1.2).
//
// Enforces the "no server action without a guard" convention across the whole
// server-action surface. Every exported `async function` in a server-action
// file must be one of:
//   1. an inner writer (name ends in a `For…` / `Writer` / `From…` suffix) —
//      the public wrapper that calls it is what's required to be guarded;
//   2. a function whose body calls a known auth guard (AUTH_GUARDS); or
//   3. explicitly opted out with a `// @no-auth-required: <reason>` comment in
//      the contiguous comment block above the export — so the exception is
//      visible and justified, never silent.
//
// Scope (broader than the old app/actions-only test it supersedes):
//   - app/actions/*.ts                — flat public-action files
//   - src/modules/ ** /actions.ts     — module server actions
//
// Run: pnpm tsx scripts/check-authz-guards.ts   (or: pnpm lint:authz)
// Exits 1 listing each offender; exits 0 when the whole surface is covered.
//
// Regex-based, not a full AST analyzer — the cheapest reliable approximation,
// matching the sibling linters (check-ui-invariants.ts, check-design-tokens.ts).
// It can be fooled by a guard-like string literal, but the false-positive rate
// is zero on this codebase and a new unguarded `…Action` is reliably caught.

import { globSync, readFileSync } from "node:fs";

// Recognized auth-gate calls. A function whose body contains a call to any of
// these is considered guarded. Mixes named helpers (lib/auth-guards.ts,
// lib/pet-access.ts), org/capability guards, file-local admin guards, and the
// inline `supabase.auth.getUser()` + `if (!user)` pattern used by legacy flows.
export const AUTH_GUARDS = [
  "requireUser",
  "requireUserOrRedirect",
  "requireCapability",
  "requireOrgAccessByToken",
  "requireActiveOrgOrRedirect",
  "requireAdminOrRedirect",
  "requireAdminOrGovtOrRedirect",
  "requireDecomisoPrincipal",
  "requirePetAccess",
  "requireAlivePetAccess",
  "requireOwnedPet",
  "requireOwnedPetByToken",
  "requireOwnedAndAlive",
  // File-local admin guard used by the alert-subscriptions / alert-firings
  // actions: wraps auth.getUser + a profiles.role === 'admin' re-check.
  "requireAdminUser",
  // Module-private org-intervention guard (welfare derived-report actions):
  // wraps requireUserOrRedirect + an org-membership + intervention-role check.
  "requireOrgInterventionAccess",
  "auth.getUser",
] as const;

// WS-AUTHZ 1.3 — operator-route ↔ guard rule.
//
// Institutional guards establish admin/govt *authority* (not just a logged-in
// session). A file under an operator route tree (app/admin, app/gob) that gates
// access must use one of these.
export const INSTITUTIONAL_GUARDS = [
  "requireAdminOrRedirect",
  "requireAdminOrGovtOrRedirect",
  "requireDecomisoPrincipal",
] as const;

// Personal-tier guards authenticate a user (or scope to their own pet/org) but
// do NOT establish operator authority. They are correct for citizen/owner
// surfaces, but insufficient as the SOLE gate on an operator route — that is the
// AC1 "weaker guard than the route needs" class this rule catches.
export const PERSONAL_TIER_GUARDS = [
  "requireUser",
  "requireUserOrRedirect",
  "requirePetAccess",
  "requireAlivePetAccess",
  "requireOwnedPet",
  "requireOwnedPetByToken",
  "requireOwnedAndAlive",
] as const;

// Names of exported async functions that are inner writers / scoped helpers,
// taking caller identity as a parameter. They are called from public wrappers
// that themselves call a guard, so they are not required to be guarded.
export const INNER_WRITER_SUFFIXES = [
  "ForUser",
  "ForAuthority",
  "ForOrg",
  "ForOrganization",
  "ForAudit",
  "ForVet",
  "ForVetProvider",
  "ForVetServiceProvider",
  "ForAdmin",
  "ForGovt",
  "ForCaller",
  "Writer",
  "ForToken",
  "FromCron",
  "FromEvent",
  "FromTrigger",
] as const;

export const NO_AUTH_COMMENT = "@no-auth-required";

export type ExportedFn = {
  name: string;
  startLine: number; // 1-indexed
  endLine: number;
  body: string;
  hasNoAuthComment: boolean;
};

// Walk the file, find every `export async function NAME(` declaration, then
// brace-match to the closing `}` to capture the body. One entry per export.
export function extractExportedAsyncFunctions(src: string): ExportedFn[] {
  const out: ExportedFn[] = [];
  const lines = src.split("\n");
  const exportRe = /^export\s+async\s+function\s+(\w+)\s*[(<]/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(exportRe);
    if (!m) continue;
    const name = m[1];

    let braceDepth = 0;
    let started = false;
    let endLine = i;
    let body = "";
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") {
          braceDepth++;
          started = true;
        } else if (ch === "}") {
          braceDepth--;
        }
      }
      body += `${lines[j]}\n`;
      if (started && braceDepth === 0) {
        endLine = j;
        break;
      }
    }

    // Walk backwards through the contiguous comment block above the export.
    // The @no-auth-required marker may sit anywhere in that block.
    let hasNoAuthComment = false;
    for (let back = i - 1; back >= 0; back--) {
      const line = lines[back].trim();
      const isCommentLine =
        line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line === "";
      if (!isCommentLine) break;
      if (line.includes(NO_AUTH_COMMENT)) {
        hasNoAuthComment = true;
        break;
      }
    }

    out.push({ name, startLine: i + 1, endLine: endLine + 1, body, hasNoAuthComment });
  }

  return out;
}

export function isInnerWriter(name: string): boolean {
  return INNER_WRITER_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function callsAuthGuard(body: string): boolean {
  return AUTH_GUARDS.some((g) => {
    // Escape `.` so `auth.getUser` matches only a literal dot.
    const escaped = g.replace(/\./g, "\\.");
    return new RegExp(`\\b${escaped}\\s*\\(`).test(body);
  });
}

// Returns one human-readable offender line per unguarded exported action in
// `src`. `relPath` is used only for the message. Empty array = file is covered.
export function findOffenders(relPath: string, src: string): string[] {
  const offenders: string[] = [];
  for (const fn of extractExportedAsyncFunctions(src)) {
    if (isInnerWriter(fn.name)) continue;
    if (fn.hasNoAuthComment) continue;
    if (callsAuthGuard(fn.body)) continue;
    offenders.push(
      `${relPath}:${fn.startLine} export async function ${fn.name} — no auth guard call (name doesn't end in ${INNER_WRITER_SUFFIXES.join("/")} either). Add a guard call, rename to an inner-writer suffix, or add a \`// ${NO_AUTH_COMMENT}: <reason>\` comment immediately above the export.`,
    );
  }
  return offenders;
}

function bodyCallsAnyOf(src: string, guards: readonly string[]): boolean {
  return guards.some((g) => new RegExp(`\\b${g.replace(/\./g, "\\.")}\\s*\\(`).test(src));
}

// WS-AUTHZ 1.3 — operator-route ↔ guard rule. For a file under app/admin/** or
// app/gob/**: if it gates with a personal-tier guard but uses NO institutional
// guard, it's flagged. An operator surface must establish admin/govt authority,
// not merely authentication. Empty array = file is fine (institutionally gated,
// or gated upstream by its layout and calling no guard of its own).
//
// NOTE — the plan's stricter "admin folder ⇒ admin-only guard" heuristic is
// deliberately NOT enforced. Four admin surfaces (casos, panorama, and the two
// observaciones pages) use requireAdminOrGovtOrRedirect by design: casos narrows
// to admin via an in-body `redirect("/gob/casos")`, and panorama/observaciones
// are role-adaptive dashboards intentionally shared with govt. A blanket
// folder⇒guard rule would false-flag them; the invariant that actually holds
// tree-wide is the weaker, safer "no operator route gated by auth alone".
export function findRouteGuardViolations(relPath: string, src: string): string[] {
  const normalized = relPath.replaceAll("\\", "/");
  const isOperatorRoute =
    /(^|\/)app\/admin\//.test(normalized) || /(^|\/)app\/gob\//.test(normalized);
  if (!isOperatorRoute) return [];

  const usesPersonal = bodyCallsAnyOf(src, PERSONAL_TIER_GUARDS);
  const usesInstitutional = bodyCallsAnyOf(src, INSTITUTIONAL_GUARDS);
  if (usesPersonal && !usesInstitutional) {
    return [
      `${normalized} — operator route gated by a personal-tier guard only (one of ${PERSONAL_TIER_GUARDS.join("/")}) with no institutional guard (${INSTITUTIONAL_GUARDS.join("/")}). An admin/gob surface must establish operator authority, not just authentication.`,
    ];
  }
  return [];
}

// Operator route trees scanned by the route↔guard rule (pages, layouts, actions,
// route handlers).
export function listOperatorRouteFiles(): string[] {
  const patterns = [
    "app/admin/**/*.ts",
    "app/admin/**/*.tsx",
    "app/gob/**/*.ts",
    "app/gob/**/*.tsx",
  ];
  const files = patterns.flatMap((p) => globSync(p));
  return [...new Set(files)].filter((f) => !f.includes(".test.")).sort();
}

// The full server-action surface this linter covers.
export function listActionFiles(): string[] {
  const flat = globSync("app/actions/*.ts").filter((f) => !f.endsWith(".test.ts"));
  const modules = globSync("src/modules/**/actions.ts").filter((f) => !f.endsWith(".test.ts"));
  return [...flat, ...modules].sort();
}

function runScan(): void {
  const actionFiles = listActionFiles();
  if (actionFiles.length === 0) {
    console.error("✗ check-authz-guards: found no server-action files to scan.");
    process.exit(1);
  }

  // Rule 1.2 — every server action must call a guard.
  const coverageOffenders: string[] = [];
  for (const file of actionFiles) {
    const relPath = file.replaceAll("\\", "/");
    coverageOffenders.push(...findOffenders(relPath, readFileSync(file, "utf8")));
  }

  // Rule 1.3 — no operator route gated by a personal-tier guard alone.
  const routeOffenders: string[] = [];
  for (const file of listOperatorRouteFiles()) {
    const relPath = file.replaceAll("\\", "/");
    routeOffenders.push(...findRouteGuardViolations(relPath, readFileSync(file, "utf8")));
  }

  const offenders = [...coverageOffenders, ...routeOffenders];
  if (offenders.length > 0) {
    console.error(offenders.join("\n"));
    if (coverageOffenders.length > 0) {
      console.error(`\n✗ ${coverageOffenders.length} server action(s) without an auth guard.`);
    }
    if (routeOffenders.length > 0) {
      console.error(
        `✗ ${routeOffenders.length} operator route(s) gated by a personal-tier guard only.`,
      );
    }
    process.exit(1);
  }

  console.log(
    `✓ authz coverage clean — ${actionFiles.length} action files guarded; operator routes (app/admin, app/gob) institutionally gated.`,
  );
}

// Guard: only scan when run directly; importing (tests) exposes the helpers
// without triggering the filesystem scan.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-authz-guards.ts") ||
    process.argv[1].endsWith("check-authz-guards.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
