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
// The baseline was EMPTY between 2026-08-01 and 2026-08-05, and the header said
// so proudly: "an absolute ban, not a ratchet". It was neither. It was a fence
// that could not see where the redirects actually live.
//
// WHERE THEY ACTUALLY LIVE (2026-08-05)
// ---------------------------------------------------------------------------
// This repo's strangler migration moved the WRITERS into application use-cases
// (src/modules/**/application/**) and left thin `"use server"` wrappers behind
// that just delegate. app/actions/auth.ts is four lines of `return
// _logoutAction(...args)`. The redirect() went with the writer. So the fence,
// which only opened files declaring the directive, counted ZERO for eleven
// redirect() calls that run inside a Server Action's call stack every day:
//
//   src/modules/auth/application/logout.ts                       2
//   src/modules/adoption/application/apply-intent/start-apply-intent.ts  2
//   src/modules/pets/application/intake/create-intake.ts         3
//   src/modules/pets/application/stub-claim/claim-stub-profile.ts        1
//   src/modules/pets/application/reminders/create-vaccine-reminder.ts    1
//   src/modules/pets/application/reminders/delete-vaccine-reminder.ts    1
//   src/modules/pets/application/checkin/record-post-adoption-checkin.ts 1
//
// Every one of the seven is imported by a `"use server"` module (verified by
// enumerating the 84 action modules and matching their imports), so every one is
// the real defect, not a theoretical one. The directive is on the wrapper; the
// bug is in the callee. A fence that keys on the directive keys on the wrong
// file.
//
// Two of the eleven were converted in the same pass, because their forms were
// already useActionState-based and the contract only needed the return value:
// createVaccineReminder (ScheduleVaccineForm) and recordPostAdoptionCheckin
// (CheckinForm). The remaining nine are baselined as DEBT: their callers are
// bare `<form action={fn}>` server-component forms with no state consumer, so
// each conversion means turning a page into a client component — a per-flow
// change with its own UX regression surface, not batch work. They are now
// COUNTED and cannot grow. Burn them down flow by flow and lower the number.
//
// Run:  pnpm tsx scripts/check-action-redirect.ts   (or: pnpm lint:action-redirect)
//       pnpm tsx scripts/check-action-redirect.ts --write-baseline   (after a migration)
// Exits 0 when no file exceeds its baselined count.
// Exits 1 naming each file that grew, and each new offender.

import { globSync, readFileSync, writeFileSync } from "node:fs";

import { stripComments } from "./check-scope-discipline";

export const BASELINE_PATH = "scripts/action-redirect-baseline.json";

/**
 * Modules that DECLARE themselves server actions. A file here only counts if
 * the "use server" directive is present.
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
const DIRECTIVE_GLOBS = [
  "app/actions/**/*.ts",
  "src/modules/**/actions.ts",
  "app/**/actions.ts",
  "app/**/action.ts",
];

/**
 * Application use-cases — where the strangler migration PUT the writers, and
 * with them the redirect() calls. These do NOT declare "use server": the
 * directive sits on the thin wrapper that delegates to them (app/actions/auth.ts
 * is literally `return _logoutAction(...args)`). Requiring the directive here
 * would reproduce the exact blindness this tier exists to fix — see the
 * "WHERE THEY ACTUALLY LIVE" note in the header.
 *
 * A redirect() in one of these files is only a defect when the module is
 * reached from a server action rather than from an RSC page. Today all seven
 * such files are imported by a "use server" module, so the tier has no false
 * positives; if one ever appears, baseline it and say why in the PR rather than
 * narrowing the glob back.
 */
const USE_CASE_GLOBS = ["src/modules/**/application/**/*.ts"];

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

function isScannable(relPath: string): boolean {
  if (relPath.includes("__tests__")) return false;
  if (/\.test\.[jt]sx?$/.test(relPath)) return false;
  return !relPath.endsWith(".d.ts");
}

/**
 * Every file the fence actually looks at, as forward-slash paths. Exported so a
 * test can pin the SCAN SET and not just the two pure predicates: BOTH of this
 * fence's real failures were scan-set failures — a glob list that missed
 * `action.ts`, then a directive filter that missed every application use-case —
 * and no assertion about counting or comment-stripping could have caught either.
 * The files were never opened.
 */
export function listServerActionFiles(): string[] {
  const seen = new Set<string>();
  for (const pattern of DIRECTIVE_GLOBS) {
    for (const file of globSync(pattern)) {
      const normalized = file.replaceAll("\\", "/");
      if (seen.has(normalized)) continue;
      if (!isScannable(normalized)) continue;
      if (!isServerActionModule(readFileSync(file, "utf8"))) continue;
      seen.add(normalized);
    }
  }
  for (const pattern of USE_CASE_GLOBS) {
    for (const file of globSync(pattern)) {
      const normalized = file.replaceAll("\\", "/");
      if (seen.has(normalized)) continue;
      if (!isScannable(normalized)) continue;
      seen.add(normalized);
    }
  }
  return [...seen].sort();
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
