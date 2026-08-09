// `pnpm test:verified` — run the suite, then render the REAL verdict.
//
// WHY THIS IS A SCRIPT AND NOT A `package.json` ONE-LINER
// ---------------------------------------------------------------------------
// It used to be:
//
//   "test:verified": "vitest run --reporter=json --outputFile=.vitest-report.json; tsx scripts/check-suite-coverage.ts .vitest-report.json"
//
// The `;` is deliberate and load-bearing: check-suite-coverage MUST run even
// when vitest exits non-zero, because vitest's exit code is exactly the thing
// it exists to distrust. `&&` would skip the verdict on the runs that need it
// most.
//
// But `;` is a POSIX separator. pnpm runs scripts through the platform shell,
// and on Windows that is cmd.exe, where `;` is NOT a separator — it is an
// ordinary character. So on Windows the whole tail became ARGUMENTS to vitest:
// the report was written to a file literally named `.vitest-report.json;`, the
// checker never ran at all, and the command exited with vitest's own code.
//
// The consequence, found 2026-08-09: a local run reported success while 887 of
// 1225 test files had never reported — a worker had died and taken them with
// it. That is the precise failure check-suite-coverage was written to catch,
// and on the maintainer's own machine it had been silently skipped. CI (bash)
// was unaffected, which is why it went unnoticed: the gate worked everywhere
// except where it was read most often.
//
// Neither `;` nor `&` is portable across sh and cmd. A node script is, and it
// cannot be broken by a shell's quoting rules.
//
// Run: pnpm test:verified   [-- <extra vitest args>]

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const REPORT = ".vitest-report.json";

// Extra args after `--` are forwarded to vitest (e.g. a file filter).
const passthrough = process.argv.slice(2);

// A stale report from a previous run must never be graded as this one's: the
// checker reads a file, and a crashed vitest leaves the old one in place.
rmSync(REPORT, { force: true });

// `default` alongside `json` so a human still sees which test failed and why.
// The old one-liner emitted json ONLY, which meant the readable output was the
// price of the verdict — a bad trade that discourages running the safe command.
const suite = spawnSync(
  "vitest",
  ["run", "--reporter=default", "--reporter=json", `--outputFile.json=${REPORT}`, ...passthrough],
  { stdio: "inherit", shell: true },
);

// DELIBERATELY IGNORED HERE. `suite.status` is the number the verdict below
// exists to check, not a reason to skip it. It is folded back in at the end so
// a genuine test failure still fails the command.
const verdict = spawnSync("tsx", ["scripts/check-suite-coverage.ts", REPORT], {
  stdio: "inherit",
  shell: true,
});

if (verdict.status !== 0) process.exit(verdict.status ?? 1);
if (suite.status !== 0) {
  console.error(
    `\n✗ the coverage verdict passed but vitest itself exited ${suite.status} — failing on that.`,
  );
  process.exit(suite.status ?? 1);
}
