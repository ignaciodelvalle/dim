// Unit tests for observation-overdue.ts — the G3 per-row "vencida" predicate.
//
// The 2026-07-03 critique: /admin/observaciones showed "Cierre estimado:
// {date}" but never compared it to now, so overdue observations looked
// identical to on-time ones. These tests pin the pure classification and the
// shared badge copy (honest math: the number is the real day distance).
//
// Dates are pinned mid-day UTC (09:00Z = 06:00 in AR, same calendar day) so
// the AR-calendar-day identity is unambiguous.

import { describe, expect, it } from "vitest";

import {
  OBSERVATION_DUE_SOON_DAYS,
  observationOverdueLabel,
  observationOverdueState,
} from "@/src/modules/surveillance/domain/observation-overdue";

const NOW = new Date("2026-08-02T09:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("observationOverdueState", () => {
  it("classifies a deadline N days in the past as overdue by N", () => {
    expect(observationOverdueState(daysFromNow(-1), NOW)).toEqual({ state: "overdue", days: 1 });
    expect(observationOverdueState(daysFromNow(-20), NOW)).toEqual({ state: "overdue", days: 20 });
  });

  it("classifies a deadline today as due_soon with 0 days left", () => {
    expect(observationOverdueState(NOW, NOW)).toEqual({ state: "due_soon", days: 0 });
  });

  it("classifies deadlines within the due-soon window", () => {
    expect(observationOverdueState(daysFromNow(1), NOW)).toEqual({ state: "due_soon", days: 1 });
    expect(observationOverdueState(daysFromNow(OBSERVATION_DUE_SOON_DAYS), NOW)).toEqual({
      state: "due_soon",
      days: OBSERVATION_DUE_SOON_DAYS,
    });
  });

  it("classifies deadlines beyond the due-soon window as on_time", () => {
    expect(observationOverdueState(daysFromNow(OBSERVATION_DUE_SOON_DAYS + 1), NOW)).toEqual({
      state: "on_time",
      days: OBSERVATION_DUE_SOON_DAYS + 1,
    });
    expect(observationOverdueState(daysFromNow(10), NOW)).toEqual({ state: "on_time", days: 10 });
  });

  it("uses AR calendar-day identity, not raw 24h buckets", () => {
    // 23:00Z on 2026-08-01 is 20:00 on 2026-08-01 in AR — the AR day BEFORE
    // now's AR day (2026-08-02), so it is overdue by exactly 1 calendar day
    // even though fewer than 24 hours elapsed.
    const lateYesterday = new Date("2026-08-01T23:00:00Z");
    expect(observationOverdueState(lateYesterday, NOW)).toEqual({ state: "overdue", days: 1 });
  });
});

describe("observationOverdueLabel", () => {
  it("renders the danger copy with the ACTUAL overdue day count", () => {
    expect(observationOverdueLabel({ state: "overdue", days: 3 })).toBe("Vencida hace 3 días");
  });

  it("keeps singular agreement — never 'hace 1 días'", () => {
    expect(observationOverdueLabel({ state: "overdue", days: 1 })).toBe("Vencida hace 1 día");
    expect(observationOverdueLabel({ state: "due_soon", days: 1 })).toBe("Vence en 1 día");
  });

  it("says 'Vence hoy' when the deadline is today", () => {
    expect(observationOverdueLabel({ state: "due_soon", days: 0 })).toBe("Vence hoy");
  });

  it("renders the warn copy for a near deadline", () => {
    expect(observationOverdueLabel({ state: "due_soon", days: 2 })).toBe("Vence en 2 días");
  });

  it("returns null for on-time rows — no badge, no noise", () => {
    expect(observationOverdueLabel({ state: "on_time", days: 8 })).toBeNull();
  });

  it("end-to-end: an overdue deadline yields a 'Vencida hace' badge (fails against pre-G3 code)", () => {
    const label = observationOverdueLabel(observationOverdueState(daysFromNow(-5), NOW));
    expect(label).toBe("Vencida hace 5 días");
  });
});
