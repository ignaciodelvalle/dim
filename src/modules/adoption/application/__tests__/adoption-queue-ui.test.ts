// Unit tests for pure UI helpers in AdoptionQueueList (no DOM, no React).
//
// Covers:
//   - ageDays: age computation from ISO timestamp.
//   - ADOPTION_SLA_WARNING_DAYS: breach threshold is defined and positive.
//   - Range-selection math (the shift-click logic, extracted as a pure helper).

import { describe, expect, it } from "vitest";

import { ADOPTION_SLA_WARNING_DAYS, ageDays } from "@/components/AdoptionQueueList";

// ---------------------------------------------------------------------------
// ageDays
// ---------------------------------------------------------------------------

describe("ageDays", () => {
  it("returns 0 for a timestamp in the last 24 hours", () => {
    const now = new Date();
    const iso = now.toISOString();
    expect(ageDays(iso)).toBe(0);
  });

  it("returns 1 for a timestamp 25 hours ago", () => {
    const d = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(ageDays(d.toISOString())).toBe(1);
  });

  it("returns correct days for 7-day-old timestamp (SLA threshold)", () => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(ageDays(d.toISOString())).toBe(7);
  });

  it("returns correct days for 30-day-old timestamp", () => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 1000);
    expect(ageDays(d.toISOString())).toBe(30);
  });

  it("floors fractional days (does not round up)", () => {
    // 1 day + 23 hours = 1.958 days → should be 1, not 2
    const d = new Date(Date.now() - (24 + 23) * 60 * 60 * 1000);
    expect(ageDays(d.toISOString())).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ADOPTION_SLA_WARNING_DAYS
// ---------------------------------------------------------------------------

describe("ADOPTION_SLA_WARNING_DAYS", () => {
  it("is defined as a positive number", () => {
    expect(ADOPTION_SLA_WARNING_DAYS).toBeGreaterThan(0);
  });

  it("applications at exactly the threshold are considered stale", () => {
    const d = new Date(Date.now() - ADOPTION_SLA_WARNING_DAYS * 24 * 60 * 60 * 1000 - 1000);
    expect(ageDays(d.toISOString())).toBeGreaterThanOrEqual(ADOPTION_SLA_WARNING_DAYS);
  });

  it("applications just under the threshold are NOT stale", () => {
    const d = new Date(Date.now() - (ADOPTION_SLA_WARNING_DAYS - 1) * 24 * 60 * 60 * 1000 + 60_000);
    expect(ageDays(d.toISOString())).toBeLessThan(ADOPTION_SLA_WARNING_DAYS);
  });
});

// ---------------------------------------------------------------------------
// Range-select logic (mirrors the handleRowCheckbox implementation)
// ---------------------------------------------------------------------------

describe("shift-click range select math", () => {
  const IDS = ["a", "b", "c", "d", "e"];

  /**
   * Pure helper that mirrors the shift-click range logic in AdoptionQueueList
   * so we can test it without React.
   */
  function applyRangeSelect(
    prev: Set<string>,
    rows: string[],
    anchorIdx: number,
    targetIdx: number,
    targetId: string,
  ): Set<string> {
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const next = new Set(prev);
    const targetState = !prev.has(targetId);
    for (let i = lo; i <= hi; i++) {
      const rowId = rows[i];
      if (rowId) {
        if (targetState) next.add(rowId);
        else next.delete(rowId);
      }
    }
    return next;
  }

  it("selects a range from anchor to target when none were selected", () => {
    const result = applyRangeSelect(new Set(), IDS, 1, 3, "d");
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(true);
    expect(result.has("d")).toBe(true);
    expect(result.has("a")).toBe(false);
    expect(result.has("e")).toBe(false);
  });

  it("works in reverse order (target before anchor)", () => {
    const result = applyRangeSelect(new Set(), IDS, 4, 2, "c");
    expect(result.has("c")).toBe(true);
    expect(result.has("d")).toBe(true);
    expect(result.has("e")).toBe(true);
    expect(result.has("a")).toBe(false);
  });

  it("deselects a range when the target is already selected", () => {
    const prev = new Set(["b", "c", "d"]);
    // Clicking "b" (idx 1) with anchor at idx 3 ("d") — "b" is already selected → deselect range.
    const result = applyRangeSelect(prev, IDS, 3, 1, "b");
    expect(result.has("b")).toBe(false);
    expect(result.has("c")).toBe(false);
    expect(result.has("d")).toBe(false);
    expect(result.has("a")).toBe(false); // was not selected, stays out
    expect(result.has("e")).toBe(false); // was not in range
  });

  it("single-item range (anchor === target) behaves like a normal toggle", () => {
    const result = applyRangeSelect(new Set(), IDS, 2, 2, "c");
    expect(result.has("c")).toBe(true);
    expect(result.size).toBe(1);
  });
});
