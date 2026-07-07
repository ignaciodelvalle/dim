// Unit tests for the /admin/auditoria filter helpers (#55 dashboard drill fix).
// Pure — no DB. Pins the multi-action + date-range parsing and the "Decisiones
// 7d" KPI drill href so the tile can never regress back to linking the
// all-time, all-action audit log.

import { describe, expect, it } from "vitest";

import {
  DECISION_AUDIT_ACTIONS,
  decisionsAuditDrillHref,
  parseAuditActions,
  parseAuditDateRange,
} from "@/lib/ui/audit-filters";

describe("parseAuditActions", () => {
  it("returns an empty list for null/undefined/empty", () => {
    expect(parseAuditActions(null)).toEqual([]);
    expect(parseAuditActions(undefined)).toEqual([]);
    expect(parseAuditActions("")).toEqual([]);
  });

  it("parses a single valid action code", () => {
    expect(parseAuditActions("request_approved")).toEqual(["request_approved"]);
  });

  it("parses a comma-separated list of valid codes (the decisions drill)", () => {
    expect(parseAuditActions("request_approved,request_rejected")).toEqual([
      "request_approved",
      "request_rejected",
    ]);
  });

  it("trims whitespace and drops unknown/duplicate codes", () => {
    expect(parseAuditActions(" request_approved , not_a_real_action , request_approved ")).toEqual([
      "request_approved",
    ]);
  });
});

describe("parseAuditDateRange", () => {
  it("returns null bounds when both params are absent", () => {
    expect(parseAuditDateRange(undefined, undefined)).toEqual({ since: null, until: null });
  });

  it("parses `from` to a UTC-midnight inclusive lower bound", () => {
    const { since, until } = parseAuditDateRange("2026-06-27", undefined);
    expect(since?.toISOString()).toBe("2026-06-27T00:00:00.000Z");
    expect(until).toBeNull();
  });

  it("makes `to` inclusive by advancing `until` to the next UTC midnight", () => {
    const { until } = parseAuditDateRange(undefined, "2026-06-27");
    expect(until?.toISOString()).toBe("2026-06-28T00:00:00.000Z");
  });

  it("rejects malformed and rolled-over dates", () => {
    expect(parseAuditDateRange("2026/06/27", "13-40-2026")).toEqual({ since: null, until: null });
    // 2026-02-30 would silently normalise to Mar 2 — must be rejected.
    expect(parseAuditDateRange("2026-02-30", null).since).toBeNull();
  });
});

describe("decisionsAuditDrillHref", () => {
  it("carries both decision actions and a trailing-7d `from` date", () => {
    const now = new Date("2026-07-04T12:00:00Z").getTime();
    const href = decisionsAuditDrillHref(now);
    expect(href).toContain("action=request_approved,request_rejected");
    expect(href).toContain("from=2026-06-27");
  });

  it("the drill's action param round-trips through parseAuditActions", () => {
    const href = decisionsAuditDrillHref(Date.now());
    const actionParam = new URL(href, "https://x").searchParams.get("action");
    expect(parseAuditActions(actionParam)).toEqual([...DECISION_AUDIT_ACTIONS]);
  });
});
