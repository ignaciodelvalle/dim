// Unit tests for lib/outbox-list.ts
//
// Strict TDD mode: tests written before implementation.
// Tests the pure helper functions for breach predicate and filter logic.
// No real DB needed — all tested logic is pure.

import { describe, expect, it } from "vitest";

import {
  applyOutboxFilters,
  buildBreachCue,
  buildStatusLabel,
  isSlaBreached,
} from "@/lib/infra/outbox-list";

// ---------------------------------------------------------------------------
// isSlaBreached — breach predicate
// ---------------------------------------------------------------------------

describe("isSlaBreached", () => {
  it("returns true when status is pending and slaDueAt is in the past", () => {
    const past = new Date(Date.now() - 60_000); // 1 min ago
    expect(isSlaBreached("pending", past)).toBe(true);
  });

  it("returns false when status is pending and slaDueAt is in the future", () => {
    const future = new Date(Date.now() + 60_000); // 1 min from now
    expect(isSlaBreached("pending", future)).toBe(false);
  });

  it("returns false when status is delivered (regardless of slaDueAt)", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isSlaBreached("delivered", past)).toBe(false);
  });

  it("returns false when status is failed (terminal, not a SLA breach)", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isSlaBreached("failed", past)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildStatusLabel — human-readable status
// ---------------------------------------------------------------------------

describe("buildStatusLabel", () => {
  it("maps delivered to the expected Spanish label", () => {
    expect(buildStatusLabel("delivered")).toBe("Entregado");
  });

  it("maps failed to the expected Spanish label", () => {
    expect(buildStatusLabel("failed")).toBe("Fallido");
  });

  it("maps pending to the expected Spanish label", () => {
    expect(buildStatusLabel("pending")).toBe("Pendiente");
  });
});

// ---------------------------------------------------------------------------
// buildBreachCue — traffic-light emoji
// ---------------------------------------------------------------------------

describe("buildBreachCue", () => {
  it("returns green circle for delivered rows", () => {
    const future = new Date(Date.now() + 60_000);
    expect(buildBreachCue("delivered", future)).toBe("delivered");
  });

  it("returns failed indicator for failed rows", () => {
    const past = new Date(Date.now() - 60_000);
    expect(buildBreachCue("failed", past)).toBe("failed");
  });

  it("returns breach indicator for pending rows past SLA", () => {
    const past = new Date(Date.now() - 60_000);
    expect(buildBreachCue("pending", past)).toBe("breach");
  });

  it("returns ok indicator for pending rows within SLA", () => {
    const future = new Date(Date.now() + 60_000);
    expect(buildBreachCue("pending", future)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// applyOutboxFilters — JS-side filter predicate
// ---------------------------------------------------------------------------

describe("applyOutboxFilters", () => {
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 60_000);

  const rows = [
    {
      status: "pending" as const,
      targetKind: "govt_webhook",
      slaDueAt: past,
      targetJurisdictionProvince: "Buenos Aires",
    },
    {
      status: "delivered" as const,
      targetKind: "eno_authority",
      slaDueAt: future,
      targetJurisdictionProvince: "Córdoba",
    },
    {
      status: "pending" as const,
      targetKind: "govt_webhook",
      slaDueAt: future,
      targetJurisdictionProvince: "Santa Fe",
    },
  ];

  it("returns all rows when no filters applied", () => {
    expect(applyOutboxFilters(rows, {})).toHaveLength(3);
  });

  it("filters by status=delivered returns only delivered rows", () => {
    const result = applyOutboxFilters(rows, { status: "delivered" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("delivered");
  });

  it("filters by breach=yes returns only pending+past-SLA rows", () => {
    const result = applyOutboxFilters(rows, { breach: "yes" });
    expect(result).toHaveLength(1);
    expect(result[0].targetJurisdictionProvince).toBe("Buenos Aires");
  });

  it("filters by province returns only matching jurisdiction rows", () => {
    const result = applyOutboxFilters(rows, { province: "Córdoba" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("delivered");
  });
});
