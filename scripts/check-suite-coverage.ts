// Did every test file actually RUN?
//   pnpm vitest run --reporter=json --outputFile=<json>
//   pnpm tsx scripts/check-suite-coverage.ts <json>
//
// WHY THIS EXISTS — the suite's exit code is not a verdict, and it lies in both
// directions.
//
// FALSE RED: the `db` project holds a postgres.js pool. On teardown a worker can
// be killed with sockets still open; vitest reports an unhandled "Worker exited
// unexpectedly" and exits non-zero with every test green. vitest.config.ts
// already carries a globalSetup whose stated purpose is to drain the pool and
// prevent this; it does not always win the race.
//
// FALSE GREEN — the dangerous one: when a worker dies MID-RUN it takes its whole
// FILE with it. The report still says `success: true` with zero failures,
// because the tests in that file never executed. Seen twice on 2026-08-08/09 —
// "1217 passed | 1 skipped (1219)" and "1223 passed | 1 skipped (1225)". Both
// read like a pass unless you add them up.
//
// Green therefore means: exit code IGNORED, `numFailedTests === 0`, AND every
// test file present in `testResults`. This checks the third — the one nothing
// else checks.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The AUTHORITY for "which files does vitest run" — the same function
// vitest.config.ts feeds into `include` via computeTestPartition(). Using it
// (rather than `git ls-files`, as the first version of this script did) closes
// two silent gaps: an UNTRACKED new test file is run by vitest but invisible to
// the git index — exactly the newest, flakiest file, and exactly the one whose
// disappearance this script exists to catch — and the skip-list for
// `.claude`/`coverage`/`worktrees` stays in one place instead of two.
import { discoverTestFiles } from "../__tests__/db-reachability";

type VitestJson = {
  numFailedTests?: number;
  testResults?: { name: string }[];
};

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("usage: tsx scripts/check-suite-coverage.ts <vitest-json-report>");
  process.exit(2);
}

const repoRoot = resolve(import.meta.dirname, "..");
const report = JSON.parse(readFileSync(resolve(jsonPath), "utf8")) as VitestJson;

/** vitest emits absolute POSIX-separator paths, Windows drive letter included. */
const toRepoRelative = (p: string): string =>
  p.replace(/\\/g, "/").replace(`${repoRoot.replace(/\\/g, "/")}/`, "");

const reported = new Set((report.testResults ?? []).map((f) => toRepoRelative(f.name)));
const expected = discoverTestFiles().map(toRepoRelative);
const failed = report.numFailedTests ?? 0;

console.log(
  `reported ${reported.size} file(s); ${expected.length} discovered; ${failed} failing test(s)`,
);

const missing = expected.filter((f) => !reported.has(f));
if (missing.length > 0) {
  console.error(
    `\n${missing.length} test file(s) never reported — a worker died and took them with it.\n` +
      "The run is NOT green, whatever the summary said:\n",
  );
  for (const m of missing) console.error(`   ${m}`);
  process.exit(1);
}

if (failed > 0) {
  console.error(`\n${failed} failing test(s).`);
  process.exit(1);
}

console.log("every test file ran, nothing failed.");
