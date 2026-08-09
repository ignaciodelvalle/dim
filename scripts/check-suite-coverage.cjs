#!/usr/bin/env node
// Did every test file actually RUN?  `node scripts/check-suite-coverage.cjs <vitest-json>`
//
// WHY THIS EXISTS — the suite's exit code is not a verdict.
//
// The `db` project holds a postgres.js pool. On teardown a worker can be killed
// while its sockets are still open, and vitest reports that as an unhandled
// "Worker exited unexpectedly" and exits NON-ZERO — with every test green.
// vitest.config.ts already carries a globalSetup whose stated purpose is to
// drain the pool and prevent exactly this; it does not always win the race.
//
// The dangerous half is the mirror image: when a worker dies mid-run it takes
// its FILE with it, and the run still reports `success: true` with zero
// failures because the tests in that file simply never executed. Seen twice on
// 2026-08-08/09 — once as "1217 passed | 1 skipped (1219)" and once as
// "1223 passed | 1 skipped (1225)". Both read like a pass at a glance.
//
// So a green run is: exit code IGNORED, `numFailedTests === 0`, AND every test
// file on disk present in `testResults`. This script checks the third, which is
// the one nothing else checks.
//
// Usage in a gate:
//   pnpm vitest run --reporter=json --outputFile=/tmp/t.json
//   node scripts/check-suite-coverage.cjs /tmp/t.json   # exits 1 if any file is missing

const { execSync } = require("node:child_process");
const path = require("node:path");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("usage: check-suite-coverage.cjs <vitest-json-report>");
  process.exit(2);
}

const report = require(path.resolve(jsonPath));
const repoRoot = path.resolve(__dirname, "..");

/** Absolute, OS-specific paths from the report → repo-relative forward slashes. */
const norm = (p) => path.relative(repoRoot, p.split("/").join(path.sep)).split(path.sep).join("/");

const reported = new Set((report.testResults ?? []).map((f) => norm(f.name)));

// e2e is a separate gate (Playwright), never part of this run.
const onDisk = execSync("git ls-files", { encoding: "utf8", cwd: repoRoot })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f))
  .filter((f) => !f.startsWith("e2e/"));

const missing = onDisk.filter((f) => !reported.has(f));
const failed = report.numFailedTests ?? 0;

console.log(
  `reported ${reported.size} file(s); ${onDisk.length} on disk; ${failed} failing test(s)`,
);

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
