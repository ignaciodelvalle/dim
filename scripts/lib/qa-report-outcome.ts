// How a REPORT-ONLY QA harness turns its result into an exit code (T1-C4).
//
// `.github/workflows/panorama-qa-nightly.yml` declares itself report-only: a
// finding is a row in an uploaded report, never a red run. The two harnesses
// it drives did not honour that. report-panorama-a11y let an uncaught
// `waitFor` timeout (the panorama dock not visible in 20 s) crash to exit 1,
// and qa-panorama-chaos ended with `process.exit(passed ? 0 : 1)` — a failed
// recovery check turned the night red. Twenty consecutive red nights later,
// the red-streak alert was reporting FINDINGS as if they were outages, and a
// real outage (the stack never came up) would have looked the same.
//
// So the mapping is one pure function, shared by both scripts and pinned by a
// test:
//
//   - the harness ran and wrote its report      → 0, however many findings
//   - the harness itself could not run          → 1
//
// "Could not run" is narrow on purpose: the browser did not launch, or the
// report could not be written. A page that times out, a login that fails, a
// recovery that does not recover — those are what the harness exists to
// MEASURE, so they are findings, recorded as report rows and shown in the job
// summary. The steps around the scripts (`supabase start`, `pnpm build`, ...)
// can still fail the job, and should: a report-only job that produced no
// report is not a pass.

import { appendFileSync } from "node:fs";

export type QaFinding = {
  /** Where in the run it happened — a state, a round, a step. */
  where: string;
  /** Short machine-ish kind: "step-failed", "no-map", "recovery-failed", ... */
  kind: string;
  detail: string;
};

export type QaRunOutcome =
  | { kind: "completed"; findings: QaFinding[] }
  | { kind: "harness-crash"; message: string };

/** 0 for any run that completed (findings included); 1 only when the harness could not run. */
export function reportOnlyExitCode(outcome: QaRunOutcome): 0 | 1 {
  return outcome.kind === "completed" ? 0 : 1;
}

/** Markdown for the GitHub job summary — findings stay visible without a failing run. */
export function outcomeSummaryMarkdown(title: string, outcome: QaRunOutcome): string {
  if (outcome.kind === "harness-crash") {
    return `### ${title}\n\n**The harness could not run** — this is not a finding, the report does not exist.\n\n\`\`\`\n${outcome.message}\n\`\`\`\n`;
  }
  if (outcome.findings.length === 0) {
    return `### ${title}\n\nNo findings.\n`;
  }
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const rows = outcome.findings
    .map((f) => `| ${cell(f.where)} | ${cell(f.kind)} | ${cell(f.detail)} |`)
    .join("\n");
  return `### ${title}\n\n**${outcome.findings.length} finding(s)** — report-only, the run stays green.\n\n| Where | Kind | Detail |\n|---|---|---|\n${rows}\n`;
}

/**
 * Append to `$GITHUB_STEP_SUMMARY` when running on Actions. Returns whether it
 * wrote. Never throws: failing to decorate the summary must not turn a
 * report-only run red.
 */
export function appendJobSummary(markdown: string, env = process.env): boolean {
  const target = env.GITHUB_STEP_SUMMARY;
  if (!target) return false;
  try {
    appendFileSync(target, `${markdown}\n`);
    return true;
  } catch (err) {
    console.error("could not append to GITHUB_STEP_SUMMARY:", err);
    return false;
  }
}

/** The error's message, for a report row — never the whole object. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Playwright messages carry a multi-line call log; the first line says what failed.
  return message.split("\n")[0] ?? message;
}
