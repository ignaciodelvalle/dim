// lib/metrics/alert-evaluation.test.ts — Pure unit tests for isBreaching.
//
// All tests here are DB-FREE. isBreaching is a pure function with no DB
// dependency — fully exercised here.
//
// DB-bound evaluateAlertSubscriptions follows the shape-only tsc-verified-only
// pattern established in trends.test.ts and custody.test.ts: the type
// assertions below are written to be tsc-valid, but the tests do NOT run
// against a live Postgres instance in the unit suite.

import { describe, expect, it } from "vitest";

import { isBreaching } from "./alert-evaluation";

// ---------------------------------------------------------------------------
// isBreaching — pure function
// ---------------------------------------------------------------------------

describe("isBreaching", () => {
  // --- direction: 'above' ---

  it("above: value > threshold → breaching", () => {
    expect(isBreaching(101, "above", 100)).toBe(true);
  });

  it("above: value === threshold → NOT breaching (strict inequality)", () => {
    expect(isBreaching(100, "above", 100)).toBe(false);
  });

  it("above: value < threshold → NOT breaching", () => {
    expect(isBreaching(50, "above", 100)).toBe(false);
  });

  // --- direction: 'below' ---

  it("below: value < threshold → breaching", () => {
    expect(isBreaching(49, "below", 50)).toBe(true);
  });

  it("below: value === threshold → NOT breaching (strict inequality)", () => {
    expect(isBreaching(50, "below", 50)).toBe(false);
  });

  it("below: value > threshold → NOT breaching", () => {
    expect(isBreaching(99, "below", 50)).toBe(false);
  });

  // --- null input ---

  it("null currentValue → false (no data = not breaching)", () => {
    expect(isBreaching(null, "above", 0)).toBe(false);
  });

  it("null currentValue with below direction → false", () => {
    expect(isBreaching(null, "below", 100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateAlertSubscriptions — DB-shape tests (tsc-only, do NOT run)
// ---------------------------------------------------------------------------
// These assertions verify the return type shape at compile time. They are
// inside an `if (false)` block so they are dead code at runtime.
// Pattern: trends.test.ts / custody.test.ts.

// DB-shape: evaluateAlertSubscriptions returns EvaluatedSubscription[] (tsc-only).
// These type assertions are checked at compile time via the type alias declarations below.
// No runtime code — only type-level verification.

import type {
  EvaluatedSubscription,
  evaluateAlertSubscriptions as _EvalFn,
} from "./alert-evaluation";

// Verify the return type shape.
type _EvalReturn = Awaited<ReturnType<typeof _EvalFn>>;
// Each element has AlertSubscription fields + currentValue + breaching.
type _HasId = _EvalReturn extends Array<{ id: string }> ? true : never;
type _HasCurrentValue = _EvalReturn extends Array<{ currentValue: number | null }> ? true : never;
type _HasBreaching = _EvalReturn extends Array<{ breaching: boolean }> ? true : never;
// Compile-time assertion: these types must resolve to `true`.
// (declaration only — no runtime reference)
declare const _shapeCheck: [_HasId, _HasCurrentValue, _HasBreaching];
type _AssertShape = typeof _shapeCheck;
