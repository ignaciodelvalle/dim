// Confused-deputy linter — CI guardrail (org-token authorization class).
//
// Sibling to check-authz-guards.ts ("is there a guard AT ALL?") and
// check-authz-scoping.ts ("is the resource scoped to the caller?"). This one
// answers a third question specific to /org/{orgToken}/… server actions:
//   "the action receives the URL org token — but does its capability check
//    authorize against THAT org, or against the session-default membership?"
//
// THE ANTI-PATTERN THIS CATCHES ("org-token confused deputy"):
//   An exported server action whose SIGNATURE takes an org-token-shaped param
//   (orgToken / senderOrgToken / receiverOrgToken) gates with BARE
//   `requireCapability("cap")` — a single-argument call. Bare requireCapability
//   resolves the caller's MOST-RECENTLY-JOINED active membership (see
//   authz-resolver.ts: `memberships[memberships.length - 1]`), NOT the org named
//   in the URL token. A member of several orgs acting from /org/{A}/… is then
//   authorized against whichever org they happened to join last — a classic
//   confused deputy: the action trusts the URL for its intent but a different
//   org for its authority.
//
//   THE FIX is `requireCapabilityForOrgToken("cap", orgToken)`, which resolves
//   the acting org FROM the URL token first, then pins the capability check to
//   that org.id. See src/modules/transfers/actions.ts (propose / accept / reject
//   / cancel / transferCustody) for the canonical form.
//
// NOT flagged (correctly safe):
//   - `requireCapability("cap", someOrgId)` — the two-argument form already pins
//     the check to a specific org.id (e.g. an org resolved from the token first,
//     as app/actions/decomiso.ts does).
//   - Actions that call `requireCapabilityForOrgToken(...)`.
//   - Actions with NO org-token param in their typed signature (they legitimately
//     act on the caller's session-default org).
//
// HEURISTIC (regex approximation, matching the sibling linters):
//   An exported server action is an OFFENDER when ALL hold:
//     (1) its typed signature names an ORG_TOKEN_PARAM, AND
//     (2) its body calls BARE requireCapability (single string-literal arg), AND
//     (3) its body does NOT call requireCapabilityForOrgToken.
//   Inner writers (`*ForOrg`/… suffixes) are skipped, as in the sibling linters.
//
//   KNOWN BLIND SPOT: an org token delivered via FormData (not a typed param) is
//   invisible to this signature-based check — e.g. createServiceOfferingAction /
//   create/updateScheduleRuleAction read `orgToken` from formData only for
//   revalidatePath and scope their write to the session org.id in the use-case.
//   Those are UX-latent (a multi-org member acts under their last-joined org) but
//   not a privilege escalation. Converting them is tracked separately.
//
// DOCUMENTED-SAFE EXCEPTIONS (CONFUSED_DEPUTY_ALLOWLIST): a real offender kept
// out of the current lane, listed with a reason so the exception is visible.
//
// Run: pnpm tsx scripts/check-confused-deputy.ts   (or: pnpm lint:authz-orgtoken)
// Exits 1 listing each offender; exits 0 when the surface is clean.

import { readFileSync } from "node:fs";

import {
  type ExportedFn,
  extractExportedAsyncFunctions,
  isInnerWriter,
  listActionFiles,
} from "./check-authz-guards";

// ---------------------------------------------------------------------------
// Org-token-shaped signature params. A typed param with one of these names
// means the action's intent is bound to a specific /org/{token} URL — its
// capability check must pin to that token, not the session-default membership.
// `publicToken` is deliberately EXCLUDED: in this codebase it is the PET token
// (e.g. transferCustodyAction(orgToken, publicToken)), not an org token.
// ---------------------------------------------------------------------------
export const ORG_TOKEN_PARAMS = ["orgToken", "senderOrgToken", "receiverOrgToken"] as const;

// Bare, session-default capability check: `requireCapability("cap")` with a
// single string-literal argument and the closing paren right after it. The
// two-argument form `requireCapability("cap", orgId)` (pinned) does NOT match,
// because a comma sits between the literal and the `)`.
export const BARE_REQUIRE_CAPABILITY_RE = /requireCapability\s*\(\s*(["'])[^"']*\1\s*\)/;

// The confused-deputy-safe guard. Its presence exempts the action.
export const FOR_ORG_TOKEN_RE = /requireCapabilityForOrgToken\s*\(/;

const ORG_TOKEN_PARAM_RE = new RegExp(`\\b(?:${ORG_TOKEN_PARAMS.join("|")})\\b`);

// Strip comments so a bare `requireCapability("cap")` written in a doc comment
// (e.g. "requireCapability(...) alone resolves the session default — so we pin
// it") is never mistaken for a real call. `://` in string URLs is preserved so
// line-comment stripping does not truncate paths like "https://…". Regex
// approximation, matching the sibling linters — good enough for this surface.
export function stripComments(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (not inside `://`)
}

// Documented-safe offenders: `"<relPath>#<name>"` → reason. Use ONLY when the
// action is a genuine org-token confused-deputy shape but is intentionally out
// of the current remediation lane (or provably safe). Keep the set small and
// justified — the goal is zero.
export const CONFUSED_DEPUTY_ALLOWLIST: Record<string, string> = {
  "src/modules/surveillance/actions.ts#reportBiteFromOrgAction":
    "Out of the current confused-deputy lane (surveillance is excluded). The bite " +
    "is recorded against a pet looked up GLOBALLY by petPublicToken; orgToken is " +
    "reporter-attribution context, not a data-access scope, so the worst case is a " +
    "multi-org reporter's report attributed to their last-joined org (no cross-org " +
    "data access). Tracked for a dedicated surveillance-scoped pass.",
};

// ---------------------------------------------------------------------------
// Signature param-list extraction. `fn.body` begins at the
// `export async function NAME(` line; balance parens from the first `(` so
// destructured `{ … }` params and default values are captured whole.
// ---------------------------------------------------------------------------
export function signatureParamList(body: string): string {
  const open = body.indexOf("(");
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  return "";
}

export function hasOrgTokenParam(paramList: string): boolean {
  return ORG_TOKEN_PARAM_RE.test(paramList);
}

export function callsBareRequireCapability(body: string): boolean {
  return BARE_REQUIRE_CAPABILITY_RE.test(body);
}

export function callsRequireCapabilityForOrgToken(body: string): boolean {
  return FOR_ORG_TOKEN_RE.test(body);
}

// The full heuristic: org-token signature + bare requireCapability + no
// requireCapabilityForOrgToken. Inner writers are exempt (guarded upstream).
export function isConfusedDeputyOffender(fn: ExportedFn): boolean {
  if (isInnerWriter(fn.name)) return false;
  const code = stripComments(fn.body);
  if (!hasOrgTokenParam(signatureParamList(code))) return false;
  if (callsRequireCapabilityForOrgToken(code)) return false;
  return callsBareRequireCapability(code);
}

/** Offenders in one file as `path:line NAME` lines (allowlisted ones excluded). */
export function findConfusedDeputyOffenders(relPath: string, src: string): string[] {
  const out: string[] = [];
  for (const fn of extractExportedAsyncFunctions(src)) {
    if (!isConfusedDeputyOffender(fn)) continue;
    if (CONFUSED_DEPUTY_ALLOWLIST[`${relPath}#${fn.name}`] !== undefined) continue;
    out.push(`${relPath}:${fn.startLine} ${fn.name}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runScan(): void {
  const actionFiles = listActionFiles();
  if (actionFiles.length === 0) {
    console.error("✗ check-confused-deputy: found no server-action files to scan.");
    process.exit(1);
  }

  const offenders: string[] = [];
  let allowlisted = 0;
  for (const file of actionFiles) {
    const relPath = file.replaceAll("\\", "/");
    const src = readFileSync(file, "utf8");
    offenders.push(...findConfusedDeputyOffenders(relPath, src));
    for (const fn of extractExportedAsyncFunctions(src)) {
      if (
        isConfusedDeputyOffender(fn) &&
        CONFUSED_DEPUTY_ALLOWLIST[`${relPath}#${fn.name}`] !== undefined
      ) {
        allowlisted++;
      }
    }
  }

  if (offenders.length > 0) {
    const hint =
      'gated by BARE requireCapability("cap") (resolves the session-default / most-recently-joined ' +
      "membership, NOT the URL org). A multi-org member acting from /org/{orgToken}/… is authorized " +
      'against the wrong org. Pin it: requireCapabilityForOrgToken("cap", orgToken). If genuinely ' +
      "safe/out-of-lane, add it to CONFUSED_DEPUTY_ALLOWLIST with a reason.";
    for (const o of offenders) {
      console.error(`${o} — org-token action ${hint}`);
    }
    console.error(`\n✗ ${offenders.length} org-token confused-deputy offender(s).`);
    process.exit(1);
  }

  console.log(
    `✓ confused-deputy clean — ${actionFiles.length} action files scanned; every org-token ` +
      `action pins its capability check to the URL token${
        allowlisted > 0 ? ` (${allowlisted} documented-safe exception(s))` : ""
      }.`,
  );
}

// Guard: only scan when run directly; importing (tests) exposes the helpers
// without triggering the filesystem scan.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-confused-deputy.ts") ||
    process.argv[1].endsWith("check-confused-deputy.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
