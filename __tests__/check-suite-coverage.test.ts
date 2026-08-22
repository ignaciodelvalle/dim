// Tests for the suite verdict (scripts/check-suite-coverage.ts).
//
// WHY THIS FILE EXISTS. The verdict is the Definition of Done — the line an
// operator pastes as evidence — so it must be right in every direction vitest's
// exit code is wrong. It already caught the worker-died-mid-run case (a file
// that never reports). It did NOT catch a file that reports with an error
// OUTSIDE any test: a vi.mock factory missing an export, an import that throws,
// a hook or worker that dies after the tests ran. Such a file has zero failing
// tests, so `numFailedTests` stays 0, and the old verdict printed "every test
// file ran, nothing failed." On 2026-08-22 that happened four consecutive runs
// (three on CI) for the same file, and was read as the known worker-teardown
// crash for four runs because the verdict said nothing. These tests pin the
// grading against synthetic reports in vitest's JSON shape.

import { describe, expect, it } from "vitest";

import { formatVerdictLine, gradeSuiteReport, timedOut } from "@/scripts/check-suite-coverage";

// vitest emits ABSOLUTE paths with POSIX separators, drive letter included.
const ROOT = "C:\\fake\\dim";
const abs = (rel: string): string => `C:/fake/dim/${rel}`;

const passed = (rel: string, n = 2) => ({
  name: abs(rel),
  status: "passed",
  message: "",
  assertionResults: Array.from({ length: n }, (_, i) => ({
    status: "passed",
    fullName: `case ${i}`,
    failureMessages: [],
  })),
});

describe("gradeSuiteReport()", () => {
  it("grades a full, clean run as ok", () => {
    const expected = ["__tests__/a.test.ts", "lib/b.test.ts"];
    const v = gradeSuiteReport(
      { numFailedTests: 0, testResults: [passed(expected[0]), passed(expected[1])] },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.broken).toEqual([]);
    expect(v.assertions).toEqual([]);
    expect(v.timeouts).toEqual([]);
    expect(formatVerdictLine(v)).toBe(
      "reported 2 file(s); 2 discovered; 0 failing test(s); 0 broken file(s)",
    );
  });

  it("fails when a discovered file never reported (a worker died and took it)", () => {
    const expected = ["__tests__/a.test.ts", "__tests__/b.test.ts", "__tests__/c.test.ts"];
    const v = gradeSuiteReport(
      { numFailedTests: 0, testResults: [passed(expected[0]), passed(expected[2])] },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(["__tests__/b.test.ts"]);
    expect(formatVerdictLine(v)).toBe(
      "reported 2 file(s); 3 discovered; 0 failing test(s); 0 broken file(s)",
    );
  });

  // THE REGRESSION PIN. Exactly the shape vitest's JSON reporter wrote on
  // 2026-08-22 for __tests__/set-pet-lost-coord-range.test.ts: reported, status
  // "failed", zero assertions, the error in `message`, numFailedTests 0.
  it("fails on a file that reported an error outside any test (collection/mock error, zero tests)", () => {
    const expected = ["__tests__/a.test.ts", "__tests__/set-pet-lost-coord-range.test.ts"];
    const v = gradeSuiteReport(
      {
        numFailedTests: 0,
        testResults: [
          passed(expected[0]),
          {
            name: abs(expected[1]),
            status: "failed",
            message:
              '[vitest] No "authorRoleEnum" export is defined on the "@/db" mock. Did you forget to return it from "vi.mock"?',
            assertionResults: [],
          },
        ],
      },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual([]);
    expect(v.failedTests).toBe(0);
    expect(v.broken).toEqual([
      {
        file: "__tests__/set-pet-lost-coord-range.test.ts",
        message:
          '[vitest] No "authorRoleEnum" export is defined on the "@/db" mock. Did you forget to return it from "vi.mock"?',
      },
    ]);
    expect(formatVerdictLine(v)).toBe(
      "reported 2 file(s); 2 discovered; 0 failing test(s); 1 broken file(s)",
    );
  });

  // A worker that dies at TEARDOWN is attributed to the file it was running,
  // AFTER every test in it passed. That file is broken too — the verdict names
  // it and quotes the message, so the operator can tell the open teardown
  // defect from a collection error without reading the whole log.
  it("fails on a file whose tests all passed but which reported a file-level error", () => {
    const expected = ["__tests__/a.test.ts"];
    const v = gradeSuiteReport(
      {
        numFailedTests: 0,
        testResults: [
          { ...passed(expected[0], 3), status: "failed", message: "Worker exited unexpectedly" },
        ],
      },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(false);
    expect(v.broken).toEqual([
      { file: "__tests__/a.test.ts", message: "Worker exited unexpectedly" },
    ]);
  });

  it("does NOT count a file as broken when its failure is a failing assertion", () => {
    const expected = ["__tests__/a.test.ts"];
    const v = gradeSuiteReport(
      {
        numFailedTests: 1,
        testResults: [
          {
            name: abs(expected[0]),
            status: "failed",
            message: "",
            assertionResults: [
              { status: "passed", fullName: "ok case", failureMessages: [] },
              {
                status: "failed",
                fullName: "broken case",
                failureMessages: ["AssertionError: expected 1 to be 2"],
              },
            ],
          },
        ],
      },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(false);
    expect(v.broken).toEqual([]);
    expect(v.failedTests).toBe(1);
    expect(v.assertions).toEqual(["__tests__/a.test.ts › broken case"]);
    expect(v.timeouts).toEqual([]);
  });

  it("separates timed-out failures from assertion failures", () => {
    const expected = ["__tests__/a.test.ts"];
    const v = gradeSuiteReport(
      {
        numFailedTests: 2,
        testResults: [
          {
            name: abs(expected[0]),
            status: "failed",
            message: "",
            assertionResults: [
              {
                status: "failed",
                fullName: "slow case",
                failureMessages: ["Error: Test timed out in 5000ms."],
              },
              {
                status: "failed",
                fullName: "wrong case",
                failureMessages: ["AssertionError: expected 1 to be 2"],
              },
            ],
          },
        ],
      },
      expected,
      ROOT,
    );
    expect(v.timeouts).toEqual(["__tests__/a.test.ts › slow case"]);
    expect(v.assertions).toEqual(["__tests__/a.test.ts › wrong case"]);
  });

  it("matches Windows backslash report paths against posix discovered paths", () => {
    const expected = ["__tests__/a.test.ts"];
    const v = gradeSuiteReport(
      {
        numFailedTests: 0,
        testResults: [{ ...passed(expected[0]), name: "C:\\fake\\dim\\__tests__\\a.test.ts" }],
      },
      expected,
      ROOT,
    );
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
  });
});

describe("timedOut()", () => {
  it("recognises vitest's timeout message and the registration-stack sentinel", () => {
    expect(timedOut(["Error: Test timed out in 5000ms."])).toBe(true);
    expect(timedOut(["STACK_TRACE_ERROR"])).toBe(true);
    expect(timedOut(["AssertionError: expected 1 to be 2"])).toBe(false);
    expect(timedOut([])).toBe(false);
  });
});
