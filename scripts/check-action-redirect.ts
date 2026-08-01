// Post-mutation redirect() fence — nav contract N3.
//
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// Next.js 15.5.x's App Router drops a Server Action's own redirect(). The
// response resolves — the mutation commits, the RSC fetch completes with an
// `x-action-redirect` header — and then the client router's transition never
// fires: no history.pushState, no re-render, no error. Reproduced 3/3 with
// Playwright against a production build (engram #621/#622, verify-report #650
// WARNING-1; the full mechanism is documented in lib/ui/full-page-action-nav.ts).
//
// The repo's answer is contract N3: an action RETURNS `redirectTo` and the
// calling form performs a full document navigation via useActionRedirect.
//
// WHY A FENCE, AND WHY NOW
// ---------------------------------------------------------------------------
// The contract was written, the helpers were built — and the login still called
// redirect() three times. On the app's highest-traffic surface that reads as
// "Ingresando…" → the button returns to "Iniciar sesión" → nothing happens, with
// correct credentials and a live session. Intermittent, so support cannot
// reproduce it.
//
// `lint:nav` already bans router.refresh() for the sibling defect. Nothing
// looked at redirect() inside actions, so the hole was invisible to `pnpm
// verify` — a doctrine with no enforcement is a preference (external design
// review X1-F3).
//
// THE BASELINE
// ---------------------------------------------------------------------------
// This ratchets like its siblings (lint:brand, lint:file-size, lint:seed-ids):
// per-file counts are frozen, a NEW call fails, and each migration lowers the
// number. Failing every offender at once would have blocked every branch on
// work that has to be done file by file, hence the baseline. It is DEBT, not
// approval — every entry is a place a user can press a button and watch nothing
// happen.
//
// The baseline is EMPTY as of 2026-08-01: the burn-down finished with the three
// chip-replacement `action.ts` flows. An empty baseline means the fence is now
// an absolute ban, not a ratchet — any redirect() in a server action fails.
// Do not re-run --write-baseline to "fix" a failure; migrate the call.
//
// Run:  pnpm tsx scripts/check-action-redirect.ts   (or: pnpm lint:action-redirect)
//       pnpm tsx scripts/check-action-redirect.ts --write-baseline   (after a migration)
// Exits 0 when no file exceeds its baselined count.
// Exits 1 naming each file that grew, and each new offender.

import { globSync, readFileSync, writeFileSync } from "node:fs";

import { stripComments } from "./check-scope-discipline";

export const BASELINE_PATH = "scripts/action-redirect-baseline.json";

/**
 * Where server actions live. A file only counts if it declares "use server".
 *
 * `action.ts` (SINGULAR) is in the list because leaving it out cost the fence
 * its whole point. Route-colocated actions in this repo are named `action.ts`
 * — the three chip-replacement flows among them — and every one of them was
 * invisible here: the baseline read `{}` and the fence printed "0 baselined
 * call(s) across 0 file(s)" while three post-mutation redirect() calls sat in
 * the tree. A review even cited the baseline as proof the debt was tracked.
 * A fence whose globs miss the naming convention is worse than no fence: it
 * reports success and is believed.
 */
const CANDIDATE_GLOBS = [
  "app/actions/**/*.ts",
  "src/modules/**/actions.ts",
  "app/**/actions.ts",
  "app/**/action.ts",
];

type BaselineFile = {
  _comment: string;
  files: Record<string, number>;
};

/** True when the source declares itself a server-action module. */
export function isServerActionModule(source: string): boolean {
  return /^\s*["']use server["']/m.test(source);
}

/**
 * How many redirect() CALLS a source makes, ignoring comments.
 *
 * Comments are stripped first because this file's own doctrine is written in
 * them across the codebase — a fence that counted prose would flag the very
 * explanations telling people not to do it.
 */
export function countRedirectCalls(source: string): number {
  const code = stripComments(source);
  return (code.match(/\bredirect\s*\(/g) ?? []).length;
}

/**
 * Every server-action module the fence actually looks at, as forward-slash
 * paths. Exported so a test can pin the SCAN SET and not just the two pure
 * predicates: the fence's one real failure so far was a glob list that missed
 * `action.ts`, and no assertion about counting or comment-stripping could have
 * caught it — the files were never opened.
 */
export function listServerActionFiles(): string[] {
  const seen = new Set<string>();
  for (const pattern of CANDIDATE_GLOBS) {
    for (const file of globSync(pattern)) {
      const normalized = file.replaceAll("\\", "/");
      if (seen.has(normalized)) continue;
      if (!isServerActionModule(readFileSync(file, "utf8"))) continue;
      seen.add(normalized);
    }
  }
  return [...seen];
}

function collectCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of listServerActionFiles()) {
    const n = countRedirectCalls(readFileSync(file, "utf8"));
    if (n > 0) counts[file] = n;
  }
  return counts;
}

function readBaseline(): Record<string, number> {
  try {
    return (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineFile).files;
  } catch {
    console.warn(
      `[warn] ${BASELINE_PATH} not found — every redirect() in a server action will fail.\n  Regenerate with: pnpm tsx scripts/check-action-redirect.ts --write-baseline`,
    );
    return {};
  }
}

function writeBaseline(counts: Record<string, number>): void {
  const payload: BaselineFile = {
    _comment:
      "Server-action files still calling next/navigation redirect() (nav contract N3). " +
      "This is DEBT, not approval: each entry is a place the App Router can drop the " +
      "navigation and the user sees nothing happen. Counts may only go DOWN. " +
      "Regenerate after a migration with: pnpm tsx scripts/check-action-redirect.ts --write-baseline",
    files: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `✓ Baseline written — ${Object.keys(counts).length} file(s), ${Object.values(counts).reduce((a, b) => a + b, 0)} call(s).`,
  );
}

function runCheck(argv: string[]): void {
  const counts = collectCounts();

  if (argv.includes("--write-baseline")) {
    writeBaseline(counts);
    return;
  }

  const baseline = readBaseline();
  const problems: string[] = [];

  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file];
    if (allowed === undefined) {
      problems.push(
        `✗ ${file} — ${n} redirect() call(s) in a server action, and this file is NOT baselined.\n    Return redirectTo in the action's state and let the form navigate\n    (useActionRedirect). See lib/ui/full-page-action-nav.ts for why.`,
      );
    } else if (n > allowed) {
      problems.push(`✗ ${file} — ${n} redirect() call(s), baselined at ${allowed}. The debt grew.`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(
      `\n✗ ${problems.length} post-mutation redirect violation(s).\n  A Server Action's redirect() resolves and is then dropped by the client\n  router: the mutation commits, the URL never changes, nothing is shown.\n  Contract N3 exists because this is not theoretical — it is what the login\n  did on the app's busiest screen.`,
    );
    process.exit(1);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(
    `✓ No new post-mutation redirect() — ${total} baselined call(s) across ${Object.keys(counts).length} file(s)` +
      `${total < baselineTotal ? ` (down from ${baselineTotal}; run --write-baseline to lock it in)` : ""}.`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-action-redirect.ts") ||
    process.argv[1].endsWith("check-action-redirect.js"));

if (isMain) {
  runCheck(process.argv.slice(2));
}
