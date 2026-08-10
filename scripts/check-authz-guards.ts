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
// Scope — discovered by CONTENT, not by filename (see listActionFiles below):
// every module under app/ or src/ whose FIRST statement is the "use server"
// directive. The old filename globs (app/actions/*.ts + src/modules/**/actions.ts)
// are kept as a union floor so discovery can only ever widen.
//
// Run: pnpm tsx scripts/check-authz-guards.ts   (or: pnpm lint:authz)
// Exits 1 listing each offender; exits 0 when the whole surface is covered.
//
// Regex-based, not a full AST analyzer — the cheapest reliable approximation,
// matching the sibling linters (check-ui-invariants.ts, check-design-tokens.ts).
// It can be fooled by a guard-like string literal, but the false-positive rate
// is zero on this codebase and a new unguarded `…Action` is reliably caught.

import { globSync, readFileSync } from "node:fs";

import { stripComments } from "./lib/strip-comments.mjs";

// Recognized auth-gate calls. A function whose body contains a call to any of
// these is considered guarded. Mixes named helpers (lib/auth-guards.ts,
// lib/pet-access.ts), org/capability guards, file-local admin guards, and the
// inline `supabase.auth.getUser()` + `if (!user)` pattern used by legacy flows.
export const AUTH_GUARDS = [
  "requireUser",
  "requireUserOrRedirect",
  "requireCapability",
  // Confused-deputy-safe capability guard (Wave F3): resolves the org from the
  // URL orgToken, then delegates to requireCapability pinned to that org.id — so
  // a /org/{token} action authorizes against the URL org, not the session-default
  // membership. Distinct name so the `requireCapability` entry above does not
  // match it (the regex anchors `requireCapability\s*\(`, which the `ForOrgToken`
  // suffix breaks). Already blessed by __tests__/server-actions-auth-coverage.test.ts.
  "requireCapabilityForOrgToken",
  "requireOrgAccessByToken",
  "requireActiveOrgOrRedirect",
  "requireAdminOrRedirect",
  "requireAdminOrGovtOrRedirect",
  "requireDecomisoPrincipal",
  // Denuncia-moderation authority (Wave A/F). Reuses requireAdminOrGovtOrRedirect
  // verbatim — same role set + jurisdictions query — named separately so call
  // sites read as "requires denuncia moderation authority". Deletion-aware via
  // the reused institutional guard.
  "requireDenunciaModerationPrincipal",
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
  // Walk-in (atender) authorization boundary — app/org/[orgToken]/atender/
  // atender-access.ts. Resolves the acting org FROM THE URL TOKEN, requires an
  // active membership with `event.write`, re-checks profiles.deleted_at, and
  // rate-limits the DIM-code lookup. Became visible to this linter when
  // discovery moved from filename globs to the "use server" directive
  // (2026-08-05); it was always a real guard, just outside the old glob.
  "resolveAtenderPet",
  "resolveAtenderContext",
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

// WS-AUTHZ 1.4 — deletion-aware guard rule (Wave E2, Ley 25.326 art. 16).
//
// A valid Supabase JWT is necessary but NOT sufficient to MUTATE a pet. A self-
// erased account (profiles.deleted_at set by erase_subject_data) keeps a live
// token until it naturally expires; `supabase.auth.getUser()` returns that user
// and never consults deleted_at. So an action that authorizes a PET WRITE on a
// bare getUser() lets an erased account keep writing pets/events — invisible to
// Rule 1.2, which counts bare `auth.getUser` as an equivalent guard.
//
// Only these guards resolve the acting user AND reject an erased profile — they
// all funnel through requireUserOrRedirect (which checks deleted_at, Wave D2) or
// requirePetAccess/requireAlivePetAccess (which check it at the mutation
// boundary, Wave E2). Bare `auth.getUser` and the file-local `requireAdminUser`
// (auth.getUser + role re-check) are deliberately NOT here.
export const DELETION_AWARE_GUARDS = [
  "requireUserOrRedirect",
  "requirePetAccess",
  "requireAlivePetAccess",
  "requireOwnedPet",
  "requireOwnedPetByToken",
  "requireOwnedAndAlive",
  "requireOrgAccessByToken",
  "requireActiveOrgOrRedirect",
  "requireAdminOrRedirect",
  "requireAdminOrGovtOrRedirect",
  "requireDecomisoPrincipal",
  "requireDenunciaModerationPrincipal",
  "requireOrgInterventionAccess",
  "requireCapability",
  "requireCapabilityForOrgToken",
  // Both atender resolvers funnel through resolveAtenderContext, which reads
  // profiles.deletedAt and refuses an erased account (atender-access.ts).
  "resolveAtenderPet",
  "resolveAtenderContext",
] as const;

// Pet-write signal (inline): a drizzle insert/update/delete whose body also
// names a pet-scoped table — petEvents (the append-only event spine) or pets
// (the credential row). This catches the monolithic "getUser then write a pet
// event in the same function" pattern; shims that delegate the write to an
// application use-case are covered by that use-case routing through a guard.
const PET_TABLE_RE = /\b(petEvents|pets)\b/;
const DB_MUTATION_RE = /\.(insert|update|delete)\s*\(/;
const BARE_GET_USER_RE = /\.auth\.getUser\s*\(/;

// Documented safe exports: `"<relPath>#<name>"` → reason. Use ONLY when the
// action resolves identity through a bare getUser() and touches a pet table but
// the erased-account write is provably impossible (e.g. a deletion-aware check
// happens in a delegated use-case). Empty is the goal.
export const DELETION_AWARE_ALLOWLIST: Record<string, string> = {};

function callsAnyGuard(body: string, guards: readonly string[]): boolean {
  return guards.some((g) => new RegExp(`\\b${g.replace(/\./g, "\\.")}\\s*\\(`).test(body));
}

// Returns one offender line per exported action that authorizes an inline pet
// write on a bare auth.getUser() with no deletion-aware guard. Empty = clean.
export function findDeletionUnawareMutations(relPath: string, src: string): string[] {
  const offenders: string[] = [];
  for (const fn of extractExportedAsyncFunctions(src)) {
    // stripComments (2026-08-09): the body was tested RAW, so naming a
    // deletion-aware guard in a comment satisfied the rule. Same shape as the
    // check-db-budget substring hole. The module-level check already stripped;
    // the per-function checks did not.
    const body = stripComments(fn.body);
    if (isInnerWriter(fn.name)) continue;
    if (!BARE_GET_USER_RE.test(body)) continue;
    if (callsAnyGuard(body, DELETION_AWARE_GUARDS)) continue;
    if (!(PET_TABLE_RE.test(body) && DB_MUTATION_RE.test(body))) continue;
    if (DELETION_AWARE_ALLOWLIST[`${relPath}#${fn.name}`] !== undefined) continue;
    offenders.push(
      `${relPath}:${fn.startLine} export async function ${fn.name} — authorizes a pet write on a bare auth.getUser() with no deletion-aware guard (one of ${DELETION_AWARE_GUARDS.join("/")}). An erased account (profiles.deleted_at) keeps a valid JWT and could still mutate pets/events. Route the write through requirePetAccess/requireAlivePetAccess, or add the deleted_at check (see lib/infra/pet-access.ts).`,
    );
  }
  return offenders;
}

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
//
// Braces are counted ONLY inside the body. Counting them from the export line
// was a real recall bug: an inline object type in the PARAMETER LIST
// (`input: { fileHash: string; rows: { index: number }[] }`) drove the depth
// back to zero on the signature's own `}`, so the captured "body" was just the
// signature and the guard call in the real body was never seen — the action
// read as UNGUARDED (bit importIntakeRowsAction, 2026-08-06). Object types in
// the RETURN annotation have the same shape (`Promise<{ ok: boolean }>`), which
// is why the walk waits for a brace at angle-depth zero instead of taking the
// first `{` after the parameter list's closing paren.
//
// Phases: `signature` (up to the parameter list, including an optional `<T…>`
// type-parameter list) → `params` (paren-matched) → `returnType` (angle-aware)
// → `body` (brace-matched). Still line-based and dependency-free, like the rest
// of this script.
export function extractExportedAsyncFunctions(src: string): ExportedFn[] {
  const out: ExportedFn[] = [];
  const lines = src.split("\n");
  const exportRe = /^export\s+async\s+function\s+(\w+)\s*[(<]/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(exportRe);
    if (!m) continue;
    const name = m[1];

    let phase: "signature" | "generics" | "params" | "returnType" | "body" = "signature";
    let angleDepth = 0;
    let parenDepth = 0;
    let braceDepth = 0;
    let endLine = i;
    let body = "";
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (phase === "signature") {
          if (ch === "<") {
            angleDepth = 1;
            phase = "generics";
          } else if (ch === "(") {
            parenDepth = 1;
            phase = "params";
          }
        } else if (phase === "generics") {
          if (ch === "<") angleDepth++;
          else if (ch === ">") {
            angleDepth--;
            if (angleDepth === 0) phase = "signature";
          }
        } else if (phase === "params") {
          if (ch === "(") parenDepth++;
          else if (ch === ")") {
            parenDepth--;
            if (parenDepth === 0) phase = "returnType";
          }
        } else if (phase === "returnType") {
          // `async` forces a Promise-shaped return type, so any brace here is
          // inside `<…>`: track the angle depth and skip those.
          if (ch === "<") angleDepth++;
          else if (ch === ">") {
            if (angleDepth > 0) angleDepth--;
          } else if (ch === "{" && angleDepth === 0) {
            braceDepth = 1;
            phase = "body";
          }
        } else if (ch === "{") {
          braceDepth++;
        } else if (ch === "}") {
          braceDepth--;
        }
      }
      body += `${lines[j]}\n`;
      if (phase === "body" && braceDepth === 0) {
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
    // Raw body → a guard named only inside a comment counted as a guard CALL.
    // See findDeletionUnawareMutations for the same 2026-08-09 correction.
    if (callsAuthGuard(stripComments(fn.body))) continue;
    offenders.push(
      `${relPath}:${fn.startLine} export async function ${fn.name} — no auth guard call (name doesn't end in ${INNER_WRITER_SUFFIXES.join("/")} either). Add a guard call, rename to an inner-writer suffix, or add a \`// ${NO_AUTH_COMMENT}: <reason>\` comment immediately above the export.`,
    );
  }
  return offenders;
}

// Authz impersonation-export rule (pattern-based).
// Origin: authz triage 2026-07-04. Widened: security review 07 (2026-07-05).
//
// A "use server" module must NEVER export an inner writer that carries the
// acting identity. Every export of a "use server" file is an independently-
// addressable server action, and such a writer takes its actor / subject /
// org as a caller-supplied parameter — exporting one hands impersonation-as-
// anyone to any client. RLS is NOT a backstop: db/index.ts connects with
// postgres-js (no Supabase JWT), so the app-layer guard is the only defense.
//
// Two signals, both pattern-based (not an allowlist of functions), so the
// class cannot silently regress:
//   (1) NAME — the export's name ends in one of IMPERSONATION_SUFFIXES
//       (*ForUser / *ForAuthority / *ForOrg / *Writer). The original rule
//       matched only the *For* trio; review 07 added *Writer, which had been
//       slipping through: the coverage rule (INNER_WRITER_SUFFIXES) exempts a
//       *Writer from needing its own guard, and nothing forbade exporting one.
//   (2) PARAMS — a DECLARED export whose signature names a caller-supplied
//       actor/subject id (IMPERSONATION_ACTOR_PARAMS), even if its name does
//       not match a suffix (e.g. a no-auth writer taking a bare actorUserId).
//
// A genuinely-safe export (identity derived from the session INSIDE the
// "use server" file, no client-trusted actor) may be listed in
// IMPERSONATION_SAFE_EXPORTS with a documented reason. It is empty today —
// every current writer export was removed rather than baselined.
//
// The writers themselves live on in plain application modules
// (src/modules/**/application/**), where they are not client-addressable;
// guarded `*Action` wrappers derive the actor from the session and delegate.
export const IMPERSONATION_SUFFIXES = ["ForUser", "ForAuthority", "ForOrg", "Writer"] as const;

// Caller-supplied identity parameters. A declared "use server" export whose
// signature names any of these is trusting the client for "who is acting" —
// the impersonation surface, regardless of the function's name.
export const IMPERSONATION_ACTOR_PARAMS = [
  "actorUserId",
  "recordedByUserId",
  "actingUserId",
  "subjectUserId",
  "onBehalfOfUserId",
  "performedByUserId",
] as const;

// Documented safe exports: `"<relPath>#<name>"` → reason. Use ONLY when the
// identity is derived from the session inside the "use server" file and no
// actor is client-supplied.
export const IMPERSONATION_SAFE_EXPORTS: Record<string, string> = {};

const IMPERSONATION_SUFFIX_RE = new RegExp(`(?:${IMPERSONATION_SUFFIXES.join("|")})$`);

function lineOfIndex(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

// Extract the parenthesized parameter list whose opening `(` is at
// `openParenIndex`, balancing parens so destructured `{ … }` params and
// default values are captured whole. Returns the inner text (without the
// outer parens).
function paramListAt(src: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(openParenIndex + 1, i);
    }
  }
  return "";
}

function actorParamIn(paramList: string): string | null {
  for (const p of IMPERSONATION_ACTOR_PARAMS) {
    if (new RegExp(`\\b${p}\\b`).test(paramList)) return p;
  }
  return null;
}

// Returns one offender line per impersonation-class export in a "use server"
// module: declared exports (`export async function xWriter`), exports whose
// signature names a caller-supplied actor id, and runtime re-export lists
// (`export { x }`, `export { y as xWriter }`). `export type { ... }` is erased
// at runtime and allowed. Empty array = file is clean.
export function findImpersonationExports(relPath: string, src: string): string[] {
  // Was `src.startsWith('"use server"')` on the RAW source, while listActionFiles()
  // used the comment-stripped form. A header comment — the dominant convention in
  // this repo — therefore switched OFF the impersonation rule while leaving the
  // other two rules on, for the same file. One authority for the directive now.
  if (!isServerActionModule(src)) return [];
  const offenders: string[] = [];
  const isSafe = (name: string) => IMPERSONATION_SAFE_EXPORTS[`${relPath}#${name}`] !== undefined;
  const offendSuffix = (name: string, line: number) => {
    if (isSafe(name)) return;
    offenders.push(
      `${relPath}:${line} exports ${name} — a "use server" module must not export a *${IMPERSONATION_SUFFIXES.join(
        "/*",
      )} writer (caller-supplied identity = impersonation surface; RLS does not backstop). Keep the writer in a plain application module and export only a session-guarded *Action wrapper.`,
    );
  };
  const offendParam = (name: string, param: string, line: number) => {
    if (isSafe(name)) return;
    offenders.push(
      `${relPath}:${line} exports ${name} — its signature takes a caller-supplied \`${param}\` (impersonation surface: a "use server" export lets any client act as any user; RLS does not backstop). Derive the actor from the session in a guarded *Action wrapper and keep the writer in a plain application module.`,
    );
  };

  // Declared exports: `export [async] function name<generics>(params)`.
  const declRe = /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
  for (const m of src.matchAll(declRe)) {
    const name = m[1];
    const line = lineOfIndex(src, m.index);
    if (IMPERSONATION_SUFFIX_RE.test(name)) {
      offendSuffix(name, line);
      continue;
    }
    // The trailing char of the match is the param-list `(`.
    const openParen = (m.index ?? 0) + m[0].length - 1;
    const actor = actorParamIn(paramListAt(src, openParen));
    if (actor) offendParam(name, actor, line);
  }

  // Runtime re-export lists: `export { a, b as c } [from "..."]`.
  // (`export type { ... }` and inline `type x` entries are type-only.)
  // Name-based only — no signature is visible on a re-export.
  const reExportRe = /export\s*(type\s*)?\{([^}]*)\}/g;
  for (const m of src.matchAll(reExportRe)) {
    if (m[1]) continue; // export type { ... } — erased at runtime
    for (const rawEntry of m[2].split(",")) {
      const entry = rawEntry.trim();
      if (entry === "" || entry.startsWith("type ")) continue;
      const parts = entry.split(/\s+as\s+/);
      const exportedName = (parts[1] ?? parts[0]).trim();
      if (IMPERSONATION_SUFFIX_RE.test(exportedName)) {
        offendSuffix(exportedName, lineOfIndex(src, m.index));
      }
    }
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

// ---------------------------------------------------------------------------
// Server-action discovery — by CONTENT, not by filename
// ---------------------------------------------------------------------------
//
// WHY THIS CHANGED (2026-08-05, P2 "el gate miente" audit). The old definition
// was two filename globs: `app/actions/*.ts` (FLAT — not even recursive) plus
// `src/modules/**/actions.ts` (only the literal name `actions.ts`). Next.js
// does not care what a server-action file is called; the "use server" directive
// is what makes every export of a module a client-addressable endpoint. So the
// globs were a naming convention masquerading as a security boundary, and ten
// real "use server" modules were invisible to all three linters that share this
// list — among them app/org/[orgToken]/atender/actions.ts with its eight
// clinical WRITE actions, app/admin/outbox/actions.ts, app/gob/analytics/
// export/actions.ts, app/admin/libro/actions.ts, and four route-colocated
// `action.ts` (SINGULAR) files. check-action-redirect.ts had already paid for
// this exact lesson with its own globs; this is the same fix, done honestly.
//
// A file counts when its FIRST statement (after comments) is the "use server"
// directive — the same thing the bundler looks at.
//
// KNOWN GAP, stated rather than hidden: a FUNCTION-scoped `"use server"` inside
// a component or page (one occurrence today — app/(app)/denuncias/[id]/page.tsx
// :164) is also a server action, but it is a closure, not an exported module
// function, so the `export async function` analysis every rule here performs has
// nothing to bind to. Covering inline actions needs a different rule shape, not
// a wider glob.
const ACTION_SOURCE_GLOBS = ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "src/**/*.tsx"];

// The pre-2026-08-05 filename globs, kept as a UNION FLOOR. The content scan is
// a strict superset of them today except for one types-only file, and a union
// guarantees this change can never make the fence narrower than it already was.
const LEGACY_ACTION_GLOBS = ["app/actions/*.ts", "src/modules/**/actions.ts"];

/** True when the module's first statement is the "use server" directive. */
export function isServerActionModule(src: string): boolean {
  return /^(["'])use server\1/.test(stripComments(src).trimStart());
}

function isScannableSource(relPath: string): boolean {
  if (relPath.includes("__tests__")) return false;
  if (/\.test\.[jt]sx?$/.test(relPath)) return false;
  return !relPath.endsWith(".d.ts");
}

// The full server-action surface this linter covers.
export function listActionFiles(): string[] {
  const files = new Set<string>();
  for (const pattern of LEGACY_ACTION_GLOBS) {
    for (const f of globSync(pattern)) files.add(f.replaceAll("\\", "/"));
  }
  for (const pattern of ACTION_SOURCE_GLOBS) {
    for (const f of globSync(pattern)) {
      const relPath = f.replaceAll("\\", "/");
      if (files.has(relPath)) continue;
      if (!isScannableSource(relPath)) continue;
      if (!isServerActionModule(readFileSync(f, "utf8"))) continue;
      files.add(relPath);
    }
  }
  return [...files].filter(isScannableSource).sort();
}

function runScan(): void {
  const actionFiles = listActionFiles();
  if (actionFiles.length === 0) {
    console.error("✗ check-authz-guards: found no server-action files to scan.");
    process.exit(1);
  }

  // Rule 1.2 — every server action must call a guard.
  // Impersonation rule (2026-07-04) — no *ForUser/*ForAuthority/*ForOrg export
  // from a "use server" module, pattern-based.
  const coverageOffenders: string[] = [];
  const impersonationOffenders: string[] = [];
  const deletionOffenders: string[] = [];
  for (const file of actionFiles) {
    const relPath = file.replaceAll("\\", "/");
    const src = readFileSync(file, "utf8");
    coverageOffenders.push(...findOffenders(relPath, src));
    impersonationOffenders.push(...findImpersonationExports(relPath, src));
    deletionOffenders.push(...findDeletionUnawareMutations(relPath, src));
  }

  // Rule 1.3 — no operator route gated by a personal-tier guard alone.
  const routeOffenders: string[] = [];
  for (const file of listOperatorRouteFiles()) {
    const relPath = file.replaceAll("\\", "/");
    routeOffenders.push(...findRouteGuardViolations(relPath, readFileSync(file, "utf8")));
  }

  const offenders = [
    ...coverageOffenders,
    ...impersonationOffenders,
    ...deletionOffenders,
    ...routeOffenders,
  ];
  if (offenders.length > 0) {
    console.error(offenders.join("\n"));
    if (coverageOffenders.length > 0) {
      console.error(`\n✗ ${coverageOffenders.length} server action(s) without an auth guard.`);
    }
    if (impersonationOffenders.length > 0) {
      console.error(
        `✗ ${impersonationOffenders.length} impersonation-class export(s) (*${IMPERSONATION_SUFFIXES.join(
          "/*",
        )}) from "use server" module(s).`,
      );
    }
    if (deletionOffenders.length > 0) {
      console.error(
        `✗ ${deletionOffenders.length} pet-write action(s) authorized on a bare auth.getUser() with no deletion-aware guard.`,
      );
    }
    if (routeOffenders.length > 0) {
      console.error(
        `✗ ${routeOffenders.length} operator route(s) gated by a personal-tier guard only.`,
      );
    }
    process.exit(1);
  }

  console.log(
    `✓ authz coverage clean — ${actionFiles.length} action files guarded, no impersonation-class exports, no bare-getUser pet writes; operator routes (app/admin, app/gob) institutionally gated.`,
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
