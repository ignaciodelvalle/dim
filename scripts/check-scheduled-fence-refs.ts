// Scheduled-fence ref parity.
//
// THE INVARIANT
// ---------------------------------------------------------------------------
//   A scheduled fence must check out the code it is meant to guard, and a
//   workflow that is not on the default branch does not run at all.
//
// Both halves are properties of GitHub's `schedule:` trigger, and both are
// invisible until somebody goes looking:
//
//   · A `schedule:` event fires ONLY from the repository's DEFAULT branch, and
//     `actions/checkout` with no `ref:` checks that branch out. This repo ships
//     staging from an integration branch. Measured 2026-08-27, `main` was 3876
//     commits and three weeks behind it — so every nightly was grading code that
//     nobody was running, against an app built from code it had never seen.
//   · A workflow file that is absent from the default branch has no schedule.
//     Not a late schedule — none. It sits in the repo looking exactly like a
//     fence and has never executed once.
//
// WHAT IT ACTUALLY COST, BEFORE THE FIX
// ---------------------------------------------------------------------------
//   e2e-nightly.yml         20 runs, 20 failures. `65815dcb6` renamed /login to
//                           /iniciar-sesion with a 308; main's `loginAs` waits
//                           for the path to stop starting with "/login", which
//                           is true the instant the redirect lands, so it cached
//                           an anonymous session. Fixed 2026-08-10 in
//                           `63c093065`. The nightly never checked that out.
//   db-doctor-staging.yml   12 runs, 12 failures. Main's tree stops at migration
//                           0170; staging has 0202 applied. Section A reported
//                           every migration in between as "in the ledger, NOT on
//                           disk" — an alarm about nothing. Sections B and C,
//                           which ask the database directly and do not read the
//                           checked-out tree, passed in the same run.
//   mobile-export-nightly   0 runs. Never on the default branch.
//   panorama-qa-nightly     0 runs. Never on the default branch.
//
// WHY A LITERAL BRANCH NAME AND NOT A REPOSITORY VARIABLE
// ---------------------------------------------------------------------------
// A `${{ vars.DEPLOY_BRANCH }}` would put the name in one place, and it is the
// wrong trade. An unset or misspelled variable interpolates to the EMPTY STRING,
// and `actions/checkout` treats an empty `ref:` as "use the default branch" —
// silently reintroducing the exact bug, with the added insult that the workflow
// now looks correct. A literal that stops naming a branch makes checkout fail
// with `couldn't find remote ref`, which is loud.
//
// So the literals stay, and THIS FILE is the one place that knows what they must
// all say. Rename or merge the branch and `pnpm lint:sched-refs` fails naming
// every workflow line to change. One place to edit; N places verified.
//
// Run:  pnpm tsx scripts/check-scheduled-fence-refs.ts   (or: pnpm lint:sched-refs)

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const WORKFLOW_DIR = ".github/workflows";

/** The repository's default branch — the only branch `schedule:` fires from. */
export const DEFAULT_BRANCH = "main";

/**
 * The branch staging is deployed from: the code every scheduled fence is meant
 * to guard. THIS is the single source of truth for the `ref:` literals in
 * `.github/workflows/*.yml`.
 */
export const DEPLOY_REF = "integration/all-20260703";

export type Exemption = { workflow: string; reason: string };

/**
 * Scheduled workflows that deliberately run the DEFAULT branch's tree.
 *
 * An entry here is a claim that running stale-relative-to-staging code is the
 * CORRECT behaviour for that workflow — not that pinning was inconvenient. It is
 * checked in both directions: the workflow must exist, must be scheduled, and
 * must NOT be pinned. Pin it later without deleting the entry and this fails,
 * so the exemption cannot outlive the argument that justified it.
 */
export const REF_EXEMPT: Exemption[] = [
  {
    workflow: "codeql.yml",
    reason:
      "CodeQL uploads SARIF against the ref that TRIGGERED the run. On a schedule that is " +
      "refs/heads/main; checking out an integration branch there files findings against main " +
      "for code not in main, poisoning the default-branch baseline with alerts no fix can " +
      "close. The weekly scan is a default-branch scan by design. The live tree is covered " +
      "the correct way instead — codeql.yml's push: trigger includes integration/**, where " +
      "github.ref is the integration branch and attribution is right.",
  },
];

/**
 * Scheduled workflows known to be ABSENT from the default branch, and therefore
 * not running at all. Only a merge to `${DEFAULT_BRANCH}` clears one of these —
 * no `ref:` can, because there is no schedule to give a ref to.
 *
 * Checked in both directions where the default branch is visible: an entry for a
 * workflow that HAS reached the default branch is stale and fails. A scheduled
 * workflow absent from the default branch with no entry here also fails, so a
 * newly added nightly cannot quietly join the two below.
 */
export const NOT_ON_DEFAULT_BRANCH: Exemption[] = [
  {
    workflow: "mobile-export-nightly.yml",
    reason: "Written 2026-08-27; 0 runs as of that date. Merge to main to give it a schedule.",
  },
  {
    workflow: "panorama-qa-nightly.yml",
    reason: "0 runs as of 2026-08-27. Merge to main to give it a schedule.",
  },
];

// ---------------------------------------------------------------------------
// Parsing. Deliberately line-based rather than a YAML AST: the thing being
// checked is a literal a human wrote on a line, and a line-based check is one a
// human can confirm by eye against the same file.
// ---------------------------------------------------------------------------

/**
 * Strip `#` comments. Done FIRST everywhere below: these workflow files document
 * themselves at length, and a `ref:` that appears only inside prose is exactly
 * the false pass this fence exists to prevent.
 */
export function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
}

/**
 * True when the workflow is scheduled.
 *
 * TWO detectors, and the second one is the point. Every file in this repo writes
 * the block form (`  schedule:` as a 2-space key under `on:`), so a fence that
 * matched only that would pass today and go silently vacuous the moment somebody
 * wrote `on: {schedule: [{cron: "0 6 * * *"}]}` — a workflow that IS scheduled
 * and that the fence would simply not see. That is this repo's own recorded
 * mistake: a fence that enumerates the SPELLINGS misses one; fence the SUBJECT.
 *
 * The subject is "this workflow runs on a timer", and the thing a timer cannot
 * be written without is a `cron` key. It fails closed: a `workflow_dispatch`
 * input that happened to be named `cron` would be treated as scheduled and
 * demand a pin, which a human then either adds or exempts with a reason. Being
 * asked an unnecessary question is the cheap error here; not being asked the
 * necessary one is what cost 32 red nights.
 */
export function hasSchedule(yaml: string): boolean {
  const source = stripComments(yaml);
  return /^ {2}schedule:\s*$/m.test(source) || /(?:^|[\s{,[])cron\s*:/m.test(source);
}

export type CheckoutStep = {
  /** 1-based line of the step's first line, for the error message. */
  line: number;
  /** The step's `name:`, or a placeholder when it has none. */
  name: string;
  /** The `ref:` value with surrounding quotes removed, or null when absent. */
  ref: string | null;
};

/**
 * Every `actions/checkout` step in the file, with the `ref:` it carries.
 *
 * A step runs from its `- ` bullet until the next line at or left of the
 * bullet's column, which is how YAML block sequences nest — no parser needed and
 * no dependency added.
 */
export function checkoutSteps(yaml: string): CheckoutStep[] {
  const lines = stripComments(yaml).split("\n");
  const steps: CheckoutStep[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(?:-\s+)?uses:\s*actions\/checkout@/.test(lines[i])) continue;

    let start = i;
    while (start >= 0 && !/^\s*-\s/.test(lines[start])) start--;
    if (start < 0) start = i;
    const bulletColumn = lines[start].search(/\S/);

    let end = start + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() === "") {
        end++;
        continue;
      }
      if (line.search(/\S/) <= bulletColumn) break;
      end++;
    }

    const block = lines.slice(start, end);
    const nameLine = block.find((l) => /^\s*-?\s*name:\s*\S/.test(l));
    const refLine = block.find((l) => /^\s*ref:\s*\S/.test(l));

    steps.push({
      line: start + 1,
      name: nameLine ? nameLine.replace(/^\s*-?\s*name:\s*/, "").trim() : "(unnamed step)",
      ref: refLine
        ? refLine
            .replace(/^\s*ref:\s*/, "")
            .trim()
            .replace(/^["']|["']$/g, "")
        : null,
    });

    i = end - 1;
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Git. Every git-backed check states whether it RAN or was skipped, and why.
// A skipped check is reported as skipped, never folded into the pass.
// ---------------------------------------------------------------------------

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Workflow file names present on the default branch, or null when it is not visible. */
export function workflowsOnDefaultBranch(): string[] | null {
  for (const ref of [`origin/${DEFAULT_BRANCH}`, DEFAULT_BRANCH]) {
    const out = git(["ls-tree", "--name-only", ref, `${WORKFLOW_DIR}/`]);
    if (out === null) continue;
    return out
      .split("\n")
      .filter(Boolean)
      .map((path) => path.split("/").pop() as string);
  }
  return null;
}

/** True/false when the deploy ref is resolvable/unresolvable; null when git cannot answer. */
export function deployRefResolves(): boolean | null {
  // Gate on the default branch being visible. A CI checkout fetches only the
  // ref that triggered it, so neither origin/main NOR origin/<deploy> exists
  // there — and "I cannot see it" must not be reported as "it is gone".
  if (git(["rev-parse", "--verify", "-q", `refs/remotes/origin/${DEFAULT_BRANCH}`]) === null) {
    return null;
  }
  for (const ref of [`refs/remotes/origin/${DEPLOY_REF}`, `refs/heads/${DEPLOY_REF}`]) {
    if (git(["rev-parse", "--verify", "-q", ref]) !== null) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

export type Finding = { workflow: string; problem: string };

export function scheduledWorkflows(dir = WORKFLOW_DIR): { file: string; yaml: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort()
    .map((file) => ({ file, yaml: readFileSync(join(dir, file), "utf8") }))
    .filter(({ yaml }) => hasSchedule(yaml));
}

/** The pure core: everything checkable from the workflow files alone. */
export function refFindings(workflows: { file: string; yaml: string }[]): Finding[] {
  const findings: Finding[] = [];
  const exemptNames = new Set(REF_EXEMPT.map((e) => e.workflow));

  for (const { file, yaml } of workflows) {
    const steps = checkoutSteps(yaml);
    if (exemptNames.has(file)) {
      const pinned = steps.filter((s) => s.ref !== null);
      if (pinned.length > 0) {
        findings.push({
          workflow: file,
          problem: `is listed in REF_EXEMPT but now pins a ref (${pinned.map((s) => s.ref).join(", ")}). Delete the exemption in scripts/check-scheduled-fence-refs.ts, or delete the pin — an exemption that no longer describes the file is worse than none.`,
        });
      }
      continue;
    }
    for (const step of steps) {
      if (step.ref === DEPLOY_REF) continue;
      findings.push({
        workflow: file,
        problem: `line ${step.line}, step "${step.name}": checkout ${step.ref === null ? "carries no `ref:`" : `pins \`${step.ref}\``}, expected \`ref: ${DEPLOY_REF}\`. A schedule checks out the DEFAULT branch, so an unpinned scheduled fence grades code nobody is running.`,
      });
    }
  }

  return findings;
}

/**
 * List hygiene, kept separate from {@link refFindings} so each can be exercised
 * on its own. An exemption naming a workflow that no longer exists (or no longer
 * has a `schedule:`) is a lie the next reader will believe, so it fails.
 */
export function exemptionFindings(workflows: { file: string; yaml: string }[]): Finding[] {
  const scheduledNames = new Set(workflows.map((w) => w.file));
  return REF_EXEMPT.filter((e) => !scheduledNames.has(e.workflow)).map(({ workflow }) => ({
    workflow,
    problem:
      "is in REF_EXEMPT but is not a scheduled workflow (renamed, deleted, or its " +
      "`schedule:` trigger was removed). Remove the stale entry.",
  }));
}

/** The default-branch half of the invariant. Returns null when it could not be checked. */
export function defaultBranchFindings(
  workflows: { file: string; yaml: string }[],
  onDefault: string[] | null,
): Finding[] | null {
  const listed = new Set(NOT_ON_DEFAULT_BRANCH.map((e) => e.workflow));
  const scheduledNames = new Set(workflows.map((w) => w.file));
  const findings: Finding[] = [];

  // Checkable with or without git: the list must describe real files.
  for (const { workflow } of NOT_ON_DEFAULT_BRANCH) {
    if (!scheduledNames.has(workflow)) {
      findings.push({
        workflow,
        problem:
          "is in NOT_ON_DEFAULT_BRANCH but is not a scheduled workflow in this tree. " +
          "Remove the stale entry.",
      });
    }
  }

  if (onDefault === null) return findings.length > 0 ? findings : null;

  const present = new Set(onDefault);
  for (const { file } of workflows) {
    if (present.has(file)) {
      if (listed.has(file)) {
        findings.push({
          workflow: file,
          problem: `has reached ${DEFAULT_BRANCH} — its schedule is live now. Remove it from NOT_ON_DEFAULT_BRANCH in scripts/check-scheduled-fence-refs.ts and from the workflow header that says it never runs.`,
        });
      }
      continue;
    }
    if (!listed.has(file)) {
      findings.push({
        workflow: file,
        problem: `is absent from ${DEFAULT_BRANCH}, so its \`schedule:\` trigger DOES NOT EXIST — it has never run and never will until it is merged. Merge it, or add it to NOT_ON_DEFAULT_BRANCH with the reason it is still waiting.`,
      });
    }
  }

  return findings;
}

function runCheck(): void {
  const workflows = scheduledWorkflows();

  if (workflows.length === 0) {
    console.error(
      `✗ check-scheduled-fence-refs: found ZERO scheduled workflows.\n  That is not a pass — it means the scan of ${WORKFLOW_DIR} broke, and a broken\n  scan waves every stale-checkout fence through.`,
    );
    process.exit(1);
  }

  const findings = [...refFindings(workflows), ...exemptionFindings(workflows)];

  const onDefault = workflowsOnDefaultBranch();
  const branchFindings = defaultBranchFindings(workflows, onDefault);
  if (branchFindings) findings.push(...branchFindings);

  const refResolves = deployRefResolves();
  if (refResolves === false) {
    findings.push({
      workflow: "(all pinned workflows)",
      problem: `DEPLOY_REF \`${DEPLOY_REF}\` no longer names a branch. Every \`ref:\` in the workflows below points at nothing, and actions/checkout will fail on the next scheduled run. Update DEPLOY_REF here and the literal in each file listed above.`,
    });
  }

  if (findings.length > 0) {
    console.error("");
    console.error(
      `✗ Scheduled-fence refs FAILED — ${findings.length} problem(s) across ${workflows.length} scheduled workflow(s):`,
    );
    console.error("");
    for (const f of findings) console.error(`    ${f.workflow}: ${f.problem}`);
    console.error("");
    console.error(
      `  The rule: a scheduled fence must check out the code it is meant to guard, and a\n  workflow that is not on the default branch does not run at all.\n  Single source of truth: DEPLOY_REF in ${"scripts/check-scheduled-fence-refs.ts"}.`,
    );
    console.error("");
    process.exit(1);
  }

  const pinned = workflows.filter((w) => !REF_EXEMPT.some((e) => e.workflow === w.file)).length;
  console.log(
    `✓ Scheduled-fence refs — ${workflows.length} scheduled workflow(s): ${pinned} pinned to ` +
      `${DEPLOY_REF}, ${REF_EXEMPT.length} documented exemption(s).`,
  );
  console.log(
    onDefault === null
      ? `  · default-branch presence: SKIPPED (origin/${DEFAULT_BRANCH} is not in this clone — a CI checkout fetches only the triggering ref). Runs on a full clone, e.g. \`pnpm verify\`.`
      : `  · default-branch presence: checked against origin/${DEFAULT_BRANCH} — ` +
          `${NOT_ON_DEFAULT_BRANCH.length} workflow(s) still waiting to be merged there.`,
  );
  console.log(
    refResolves === null
      ? `  · ${DEPLOY_REF} resolvable: SKIPPED (this clone cannot see origin/${DEFAULT_BRANCH} either).`
      : `  · ${DEPLOY_REF} resolvable: yes.`,
  );
}

// Only run when invoked as a CLI; importing from tests must not exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-scheduled-fence-refs.ts") ||
    process.argv[1].endsWith("check-scheduled-fence-refs.js"));

if (isMain) {
  try {
    runCheck();
  } catch (err) {
    console.error("✗ check-scheduled-fence-refs: unexpected error:", err);
    process.exit(1);
  }
}
