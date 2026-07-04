// Unit tests for the policy→outcome loop (Task #44.2).
// Pure helpers + mapping completeness — no DB, no Next.js runtime.

import { describe, expect, it } from "vitest";

// Import from the schema module directly (not the "@/db" barrel) so this
// pure test never instantiates the postgres client.
import { GOVT_BUSINESS_RULE_TYPES } from "@/db/schema";

import {
  POLICY_OUTCOME_K_ANON,
  POLICY_OUTCOME_WINDOW_DAYS,
  RULE_OUTCOME_METRICS,
  isSuppressedPair,
  outcomeDelta,
  windowsAround,
} from "./policy-outcome";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("RULE_OUTCOME_METRICS", () => {
  it("maps EVERY govt business rule type to an observed metric", () => {
    for (const ruleType of GOVT_BUSINESS_RULE_TYPES) {
      expect(RULE_OUTCOME_METRICS[ruleType]).toBeDefined();
      expect(RULE_OUTCOME_METRICS[ruleType].eventType.length).toBeGreaterThan(0);
      expect(RULE_OUTCOME_METRICS[ruleType].metricLabel.length).toBeGreaterThan(0);
    }
  });

  it("has no extra keys beyond the schema rule types", () => {
    expect(Object.keys(RULE_OUTCOME_METRICS).sort()).toEqual([...GOVT_BUSINESS_RULE_TYPES].sort());
  });
});

describe("windowsAround", () => {
  const changedAt = new Date("2026-03-01T00:00:00Z");

  it("builds symmetric full windows when the change is old enough", () => {
    const now = new Date(changedAt.getTime() + 90 * DAY_MS);
    const w = windowsAround(changedAt, now, 60);
    expect(w.before.since).toEqual(new Date(changedAt.getTime() - 60 * DAY_MS));
    expect(w.before.until).toEqual(changedAt);
    expect(w.after.since).toEqual(changedAt);
    expect(w.after.until).toEqual(new Date(changedAt.getTime() + 60 * DAY_MS));
    expect(w.afterDaysCovered).toBe(60);
    expect(w.partialAfter).toBe(false);
  });

  it("clamps the after-window to now and flags it partial", () => {
    const now = new Date(changedAt.getTime() + 20 * DAY_MS);
    const w = windowsAround(changedAt, now, 60);
    expect(w.after.until).toEqual(now);
    expect(w.afterDaysCovered).toBe(20);
    expect(w.partialAfter).toBe(true);
  });

  it("covers zero days for a change made right now", () => {
    const w = windowsAround(changedAt, changedAt, 60);
    expect(w.afterDaysCovered).toBe(0);
    expect(w.partialAfter).toBe(true);
  });

  it("defaults to the documented window constant", () => {
    const now = new Date(changedAt.getTime() + 365 * DAY_MS);
    const w = windowsAround(changedAt, now);
    expect(w.afterDaysCovered).toBe(POLICY_OUTCOME_WINDOW_DAYS);
  });
});

describe("outcomeDelta", () => {
  it("computes the percent movement with one decimal", () => {
    expect(outcomeDelta(40, 50)).toBe(25);
    expect(outcomeDelta(50, 40)).toBe(-20);
    expect(outcomeDelta(3, 4)).toBe(33.3);
  });

  it("returns null when the before-window has no baseline", () => {
    expect(outcomeDelta(0, 10)).toBeNull();
    expect(outcomeDelta(0, 0)).toBeNull();
  });

  it("returns 0 for no movement", () => {
    expect(outcomeDelta(7, 7)).toBe(0);
  });
});

describe("isSuppressedPair (k-anon)", () => {
  it("suppresses only when BOTH windows are under k", () => {
    expect(isSuppressedPair(2, 3)).toBe(true);
    expect(isSuppressedPair(0, 4)).toBe(true);
    expect(isSuppressedPair(5, 0)).toBe(false);
    expect(isSuppressedPair(2, 12)).toBe(false);
    expect(isSuppressedPair(10, 20)).toBe(false);
  });

  it("uses the documented k=5 default", () => {
    expect(POLICY_OUTCOME_K_ANON).toBe(5);
    expect(isSuppressedPair(4, 4)).toBe(true);
    expect(isSuppressedPair(5, 5)).toBe(false);
  });
});
