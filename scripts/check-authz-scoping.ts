// Authorization-SCOPING linter — CI guardrail (regression armor).
//
// Sibling to check-authz-guards.ts. That linter answers "is there a guard AT
// ALL?". This one answers the next question: "the guard proves the caller is an
// admin / govt agent / org member — but is the resource the action touches
// actually SCOPED to that caller's jurisdiction / tenant / ownership?".
//
// THE PATTERN THIS CATCHES ("guard-called-but-not-jurisdiction-scoped"):
//   A server action calls an INSTITUTIONAL or CAPABILITY guard — one that
//   establishes authority OVER OTHER TENANTS (admin/govt/org/capability), not
//   merely a logged-in session — and then accepts a caller-supplied resource id
//   (orgId / targetUserId / publicToken / disputeToken / ruleId / firingId …)
//   WITHOUT any visible predicate tying that id to the caller's scope. An admin
//   is global by design, but a govt agent is bounded to their assigned
//   jurisdiction and an org member to their tenant; a role check alone lets a
//   scoped operator act outside their bounds if the downstream query forgets
//   the WHERE clause. See docs/design/handoffs/2026-07-04-authz-inventory-raw.md
//   for the hand audit this automates (its ⚠ rows are the seed baseline).
//
// HEURISTIC (regex approximation, matching the sibling linters):
//   An exported server action is an OFFENDER when its body:
//     (1) calls a TENANT_GUARD (below), AND
//     (2) contains NO SCOPING_MARKER (below) — no jurisdiction/tenant/owner
//         predicate and no inline authority re-check.
//   Inner writers (`*ForUser`/`*ForOrg`/… suffixes) and `@no-auth-required`
//   opt-outs are skipped, exactly as in check-authz-guards.ts. Personal-tier
//   guards (requireUser/requirePetAccess/requireOwnedPet…) are NOT tenant
//   guards: they are inherently self-scoped, so an action gated only by those
//   is never a candidate.
//
// REPORT-ONLY / BASELINE MODE (like the app/actions line-budget ratchet):
//   Most current offenders delegate their scoping to an application use-case
//   that this file-local regex cannot see — legitimate strangler-migration
//   debt, not a live breach. So the linter does NOT fail on the existing set:
//   it records a per-file offender count baseline (authz-scoping-baseline.json)
//   and fails only when a file's count GROWS or a NEW action file introduces an
//   offender. That makes "a new admin/govt/org action with no visible scoping"
//   a red build, while the audited backlog burns down without blocking CI.
//   Run `pnpm tsx scripts/check-authz-scoping.ts --write-baseline` after a
//   deliberate change to re-record.
//
// Run: pnpm tsx scripts/check-authz-scoping.ts   (or: pnpm lint:authz-scoping)

import { readFileSync, writeFileSync } from "node:fs";

import {
  type ExportedFn,
  extractExportedAsyncFunctions,
  isInnerWriter,
  listActionFiles,
} from "./check-authz-guards";

// ---------------------------------------------------------------------------
// Tenant/authority guards — establish authority beyond the caller's own
// session (admin-global, govt-jurisdictional, org-tenant, or capability). An
// action gated by one of these MUST scope the resource it touches. Personal
// guards (requireUser*, requirePetAccess*, requireOwnedPet*) are intentionally
// EXCLUDED — they scope to the caller's own identity/pet by construction.
// ---------------------------------------------------------------------------
export const TENANT_GUARDS = [
  "requireAdminOrRedirect",
  "requireAdminOrGovtOrRedirect",
  "requireDecomisoPrincipal",
  "requireOrgAccessByToken",
  "requireActiveOrgOrRedirect",
  "requireCapability",
  "requireOrgInterventionAccess",
  // File-local admin guard (alert-firings / alert-subscriptions actions):
  // wraps auth.getUser + a profiles.role === 'admin' re-check.
  "requireAdminUser",
] as const;

// ---------------------------------------------------------------------------
// Scoping markers — the presence of ANY of these in the action body is taken
// as evidence the resource is bounded to the caller's jurisdiction / tenant /
// ownership (a WHERE predicate, an injected tenant id, or an inline authority
// re-check). Deliberately generous: in baseline mode a false "scoped" only
// means an action is NOT flagged, and the goal is to catch the ZERO-scoping
// actions, not to grade scoping quality.
// ---------------------------------------------------------------------------
export const SCOPING_MARKERS: readonly RegExp[] = [
  // Tenant / ownership predicate columns.
  /organizationId/,
  /organization\.id/,
  /ownerUserId/,
  /actorUserId/,
  /openedByOrganizationId/,
  // Jurisdiction predicates (govt agents are bounded to assigned localities).
  /session\.jurisdictions/,
  /jurisdictions\.some/,
  /\.province\b/,
  /jurisdiction/i,
  /\blocality\b/i,
  /localidad/i,
  // Capability/authority resolution pinned to a specific org id, plus the
  // defense-in-depth inline re-check pattern the audit calls a "Good example":
  // `organization.publicToken !== input.receiverOrgToken`, `!== govtOrg.id`.
  /!==\s*[\w.]*[Tt]oken/,
  /[Tt]oken\s*!==/,
  /!==\s*govtOrg/,
  /!==\s*[\w.]*\.id/,
  // Owner-scoping via an ownerships join in the action itself.
  /ownerships\./,
] as const;

export function callsTenantGuard(body: string): boolean {
  return TENANT_GUARDS.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));
}

export function hasScopingMarker(body: string): boolean {
  return SCOPING_MARKERS.some((re) => re.test(body));
}

export function isScopingOffender(fn: ExportedFn): boolean {
  if (isInnerWriter(fn.name)) return false;
  if (fn.hasNoAuthComment) return false;
  if (!callsTenantGuard(fn.body)) return false;
  return !hasScopingMarker(fn.body);
}

/** Offenders in one file, as `path:line export async function NAME` lines. */
export function findScopingOffenders(relPath: string, src: string): string[] {
  const out: string[] = [];
  for (const fn of extractExportedAsyncFunctions(src)) {
    if (isScopingOffender(fn)) {
      out.push(`${relPath}:${fn.startLine} ${fn.name}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Baseline ratchet
// ---------------------------------------------------------------------------

export type Baseline = Record<string, number>;

const BASELINE_PATH = "scripts/authz-scoping-baseline.json";

/** offenders-per-file for the whole action surface. */
export function scanOffendersByFile(): Record<string, string[]> {
  const byFile: Record<string, string[]> = {};
  for (const file of listActionFiles()) {
    const relPath = file.replaceAll("\\", "/");
    const offenders = findScopingOffenders(relPath, readFileSync(file, "utf8"));
    if (offenders.length > 0) byFile[relPath] = offenders;
  }
  return byFile;
}

export type Ratchet = {
  grew: Array<{ file: string; baseline: number; actual: number; offenders: string[] }>;
  newFiles: Array<{ file: string; offenders: string[] }>;
};

/** Compare the live scan against the baseline. Only GROWTH is a violation. */
export function ratchet(baseline: Baseline, byFile: Record<string, string[]>): Ratchet {
  const grew: Ratchet["grew"] = [];
  const newFiles: Ratchet["newFiles"] = [];
  for (const [file, offenders] of Object.entries(byFile)) {
    const base = baseline[file];
    if (base === undefined) {
      newFiles.push({ file, offenders });
    } else if (offenders.length > base) {
      grew.push({ file, baseline: base, actual: offenders.length, offenders });
    }
  }
  return { grew, newFiles };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function writeBaseline(byFile: Record<string, string[]>): void {
  const baseline: Baseline = {};
  for (const [file, offenders] of Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b))) {
    baseline[file] = offenders.length;
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  const total = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(
    `✓ wrote ${BASELINE_PATH} — ${Object.keys(baseline).length} file(s), ${total} baselined offender(s).`,
  );
}

function runScan(): void {
  const byFile = scanOffendersByFile();

  if (process.argv.includes("--write-baseline")) {
    writeBaseline(byFile);
    return;
  }

  let baseline: Baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    console.error(
      `✗ check-authz-scoping: cannot read baseline at ${BASELINE_PATH}. Generate it with --write-baseline.`,
    );
    process.exit(1);
  }

  const { grew, newFiles } = ratchet(baseline, byFile);

  if (grew.length === 0 && newFiles.length === 0) {
    const total = Object.values(byFile).reduce((a, arr) => a + arr.length, 0);
    console.log(
      `✓ authz-scoping clean — no NEW tenant-guarded-but-unscoped actions (baseline: ${total} known, delegated-scope offender(s) unchanged).`,
    );
    return;
  }

  for (const g of grew) {
    console.error(
      `${g.file}: ${g.actual} tenant-guarded actions with no visible scoping (baseline ${g.baseline}). New offender(s):`,
    );
    for (const o of g.offenders) console.error(`    ${o}`);
  }
  for (const n of newFiles) {
    console.error(`${n.file}: NEW action file with tenant-guarded but unscoped action(s):`);
    for (const o of n.offenders) console.error(`    ${o}`);
  }
  console.error(
    "\n✗ NEW guard-called-but-not-jurisdiction-scoped offender(s). Add a jurisdiction/tenant/owner" +
      " predicate (WHERE clause pinning the resource to the caller's scope), or if the scoping is" +
      " genuinely delegated to a use-case, re-baseline with --write-baseline and note why in the PR.",
  );
  process.exit(1);
}

// Guard: only scan when run directly; importing (tests) exposes the helpers.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-authz-scoping.ts") ||
    process.argv[1].endsWith("check-authz-scoping.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
