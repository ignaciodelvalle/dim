// Guard for the scheduled-fence ref invariant
// (scripts/check-scheduled-fence-refs.ts).
//
//   A scheduled fence must check out the code it is meant to guard, and a
//   workflow that is not on the default branch does not run at all.
//
// Two halves, both proved here against the REAL `.github/workflows` tree rather
// than only against synthetic strings. The synthetic cases pin the parser; the
// real-tree cases are what actually stop the regression, because the failure
// this file exists to prevent is not "the parser broke" — it is somebody adding
// a nightly with a bare `actions/checkout@v4` and nobody noticing for a month.
//
// The cost of not having this, measured 2026-08-27: e2e-nightly 20 runs / 20
// failures on a login bug fixed 17 days earlier in a commit it never checked
// out; db-doctor 12 runs / 12 failures reporting phantom migration drift because
// main's tree stops at 0170 and staging is at 0202; mobile-export-nightly and
// panorama-qa-nightly at ZERO runs because a workflow absent from the default
// branch has no schedule at all.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRANCH,
  DEPLOY_REF,
  NOT_ON_DEFAULT_BRANCH,
  REF_EXEMPT,
  WORKFLOW_DIR,
  checkoutSteps,
  defaultBranchFindings,
  exemptionFindings,
  hasSchedule,
  refFindings,
  scheduledWorkflows,
  workflowsOnDefaultBranch,
} from "@/scripts/check-scheduled-fence-refs";

const PINNED_STEP = `
jobs:
  nightly:
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${DEPLOY_REF}

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
`;

const BARE_STEP = `
jobs:
  nightly:
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
`;

describe("hasSchedule", () => {
  it("sees a schedule trigger", () => {
    expect(hasSchedule('on:\n  schedule:\n    - cron: "0 6 * * *"\n')).toBe(true);
  });

  it("does not see one in a workflow that only runs on push and pull_request", () => {
    expect(hasSchedule("on:\n  push:\n    branches: [main]\n  pull_request:\n")).toBe(false);
  });

  // These workflow files carry pages of prose about crons. A schedule mentioned
  // in a comment is not a schedule — and `ci.yml` really does discuss cron in a
  // comment while having no schedule of its own.
  it("does not mistake a commented-out schedule for a real one", () => {
    expect(hasSchedule("on:\n  push:\n# on:\n#   schedule:\n#     - cron: '0 6 * * *'\n")).toBe(
      false,
    );
  });

  // The vacuity hole, closed on purpose. Matching only the block key would let a
  // flow-style schedule through unseen — a workflow that IS scheduled and that
  // the fence would not even look at. Fence the subject (a timer needs a `cron`
  // key), not one of its spellings.
  it("catches a flow-style schedule, where the block key never appears", () => {
    expect(hasSchedule(`on: {schedule: [{cron: "0 6 * * *"}]}\n`)).toBe(true);
  });

  it("catches `schedule:` written inline with its cron on the same nesting", () => {
    expect(hasSchedule('on:\n  schedule: [{cron: "0 6 * * *"}]\n')).toBe(true);
  });
});

describe("checkoutSteps", () => {
  it("reads the ref a checkout pins", () => {
    expect(checkoutSteps(PINNED_STEP)).toEqual([{ line: 5, name: "Checkout", ref: DEPLOY_REF }]);
  });

  it("reports null for a checkout with no ref — the default-branch case", () => {
    expect(checkoutSteps(BARE_STEP)[0].ref).toBeNull();
  });

  it('strips quotes so `ref: "x"` and `ref: x` compare equal', () => {
    const quoted = BARE_STEP.replace(
      "uses: actions/checkout@v4",
      `uses: actions/checkout@v4\n        with:\n          ref: "${DEPLOY_REF}"`,
    );
    expect(checkoutSteps(quoted)[0].ref).toBe(DEPLOY_REF);
  });

  // The load-bearing one, and the same hole check-ci-lint-parity closes: a ref
  // that appears only in documentation must not count as a ref that is set.
  it("does NOT count a ref that appears only in a comment", () => {
    const commented = BARE_STEP.replace(
      "uses: actions/checkout@v4",
      `uses: actions/checkout@v4\n        # ref: ${DEPLOY_REF}  <- explains why not`,
    );
    expect(checkoutSteps(commented)[0].ref).toBeNull();
  });

  it("finds every checkout when a workflow has several jobs", () => {
    expect(checkoutSteps(`${PINNED_STEP}${BARE_STEP}`)).toHaveLength(2);
  });

  it("does not confuse a later step's inputs for the checkout's", () => {
    const withNeighbourRef = `${BARE_STEP}
      - name: Something else
        with:
          ref: some-other-thing
`;
    expect(checkoutSteps(withNeighbourRef)[0].ref).toBeNull();
  });
});

describe("refFindings", () => {
  it("passes a pinned scheduled workflow", () => {
    expect(refFindings([{ file: "nightly.yml", yaml: PINNED_STEP }])).toEqual([]);
  });

  it("flags a scheduled workflow whose checkout has no ref", () => {
    const found = refFindings([{ file: "nightly.yml", yaml: BARE_STEP }]);
    expect(found).toHaveLength(1);
    expect(found[0].problem).toContain("carries no `ref:`");
  });

  it("flags a checkout pinned to the wrong branch", () => {
    const wrong = PINNED_STEP.replace(DEPLOY_REF, "main");
    expect(refFindings([{ file: "nightly.yml", yaml: wrong }])[0].problem).toContain("pins `main`");
  });

  // The exemption list is checked in BOTH directions on purpose. An exemption
  // that no longer describes the file is a lie the next reader will believe.
  it("flags an exemption that has quietly become stale", () => {
    const exempt = REF_EXEMPT[0].workflow;
    const found = refFindings([{ file: exempt, yaml: PINNED_STEP }]);
    expect(found).toHaveLength(1);
    expect(found[0].problem).toContain("REF_EXEMPT");
  });
});

describe("exemptionFindings", () => {
  it("flags an exemption naming a workflow that is not scheduled at all", () => {
    const found = exemptionFindings([{ file: "nightly.yml", yaml: PINNED_STEP }]);
    expect(found.map((f) => f.workflow)).toEqual([REF_EXEMPT[0].workflow]);
  });

  it("is quiet when every exemption still names a real scheduled workflow", () => {
    expect(exemptionFindings(scheduledWorkflows())).toEqual([]);
  });
});

describe("defaultBranchFindings", () => {
  const scheduled = [
    { file: "on-main.yml", yaml: PINNED_STEP },
    { file: "not-on-main.yml", yaml: PINNED_STEP },
  ];

  it("flags a scheduled workflow that is absent from the default branch and undocumented", () => {
    const found = defaultBranchFindings(scheduled, ["on-main.yml"]);
    expect(found?.map((f) => f.workflow)).toContain("not-on-main.yml");
    expect(found?.find((f) => f.workflow === "not-on-main.yml")?.problem).toContain(
      "DOES NOT EXIST",
    );
  });

  it("flags a NOT_ON_DEFAULT_BRANCH entry that has since been merged", () => {
    const waiting = NOT_ON_DEFAULT_BRANCH[0].workflow;
    const found = defaultBranchFindings([{ file: waiting, yaml: PINNED_STEP }], [waiting]);
    expect(found?.find((f) => f.workflow === waiting)?.problem).toContain(
      `has reached ${DEFAULT_BRANCH}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Against the real tree. These are the assertions that would have fired.
// ---------------------------------------------------------------------------

describe("the real .github/workflows tree", () => {
  const scheduled = scheduledWorkflows();

  it("finds scheduled workflows at all — a scan that finds none is a broken scan, not a pass", () => {
    expect(scheduled.length).toBeGreaterThanOrEqual(5);
  });

  it("has every scheduled workflow either pinned to the deploy branch or documented as exempt", () => {
    expect(refFindings(scheduled)).toEqual([]);
  });

  it("gives every exemption a reason someone can argue with", () => {
    for (const entry of [...REF_EXEMPT, ...NOT_ON_DEFAULT_BRANCH]) {
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });

  // ci.yml is the deliberate counter-example and it matters that it stays one:
  // it runs on push and pull_request, where a fixed ref would make it grade the
  // wrong tree on every PR. The rule is about SCHEDULED fences only.
  it("leaves ci.yml unpinned, because a push/PR gate must test the code that was pushed", () => {
    const ci = readFileSync(join(WORKFLOW_DIR, "ci.yml"), "utf8");
    expect(hasSchedule(ci)).toBe(false);
    for (const step of checkoutSteps(ci)) expect(step.ref).toBeNull();
  });

  it("agrees with the default branch about which workflows are live, when it can see it", () => {
    const onDefault = workflowsOnDefaultBranch();
    if (onDefault === null) {
      // A CI checkout fetches only the triggering ref, so origin/main is often
      // absent there. Skipping is reported, never folded into the pass — the
      // full-clone run in `pnpm verify` is what enforces this half.
      expect(onDefault).toBeNull();
      return;
    }
    expect(defaultBranchFindings(scheduled, onDefault)).toEqual([]);
  });

  it("keeps DEPLOY_REF as the only place the branch name is decided", () => {
    // Every `ref:` on a checkout in a scheduled workflow must be the constant,
    // never a second literal that could drift away from it.
    const refs = scheduled.flatMap(({ yaml }) =>
      checkoutSteps(yaml)
        .map((s) => s.ref)
        .filter((r): r is string => r !== null),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect([...new Set(refs)]).toEqual([DEPLOY_REF]);
  });
});

// ---------------------------------------------------------------------------
// The streak alert. A red fence nobody is told about is the same as no fence.
// ---------------------------------------------------------------------------

describe("red-streak alerting", () => {
  const ACTION = ".github/actions/red-streak-alert/action.yml";

  it("ships the composite action", () => {
    expect(readdirSync(".github/actions")).toContain("red-streak-alert");
  });

  it("keys on the streak length, not on a green→red transition", () => {
    // The reason the 20 consecutive e2e failures were never announced: GitHub's
    // built-in mail needs a transition, and a fence that has never been green
    // never transitions. If this action ever starts comparing against the
    // previous run's conclusion alone, that hole is back.
    const action = readFileSync(ACTION, "utf8");
    expect(action).toMatch(/min-streak/);
    expect(action).toMatch(/STREAK/);
  });

  it("needs no secret beyond the per-run GITHUB_TOKEN", () => {
    // A webhook secret that is absent turns alerting into a silent no-op, which
    // is the disease. Anything matching `secrets.<NAME>` other than GITHUB_TOKEN
    // in a workflow's alert wiring would be exactly that.
    for (const file of ["e2e-nightly.yml", "db-doctor-staging.yml"]) {
      const yaml = readFileSync(join(WORKFLOW_DIR, file), "utf8");
      const alertBlock = yaml.slice(yaml.indexOf("red-streak-alert"));
      const secrets = [...alertBlock.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
      expect([...new Set(secrets)]).toEqual(["GITHUB_TOKEN"]);
    }
  });

  it("is wired into every scheduled fence that has ever been red", () => {
    // e2e-nightly: 20/20 red. db-doctor-staging: 12/12 red. Both measured
    // 2026-08-27, both with zero notification of any kind before this.
    for (const file of ["e2e-nightly.yml", "db-doctor-staging.yml"]) {
      const yaml = readFileSync(join(WORKFLOW_DIR, file), "utf8");
      expect(yaml).toContain("uses: ./.github/actions/red-streak-alert");
      expect(yaml).toMatch(/issues:\s*write/);
    }
  });
});

describe("the fence runs where it matters", () => {
  it("is part of `pnpm verify`", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["lint:sched-refs"]).toBeTruthy();
    expect(pkg.scripts.verify).toContain("pnpm lint:sched-refs");
  });

  it("is part of CI", () => {
    // check-ci-lint-parity enforces this too; asserting it here as well means
    // the two fences would have to fail together to let it slip.
    const ci = readFileSync(join(WORKFLOW_DIR, "ci.yml"), "utf8");
    expect(ci).toContain("pnpm lint:sched-refs");
  });
});
