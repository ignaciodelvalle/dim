// Unit tests for the govt roster console helpers (/admin/govts) and the
// /admin/sistema "actividad por govt" ordering. All pure — no DB.

import { describe, expect, it } from "vitest";

import { type GovtActivityRow, sortGovtActivityByActivity } from "@/lib/analytics/admin-metrics";
import { isDeadGovt, matchEmailIds, normalizeGovtStatus } from "@/lib/infra/govt-roster";

describe("isDeadGovt", () => {
  it("flags an active govt with zero localities", () => {
    expect(isDeadGovt(true, 0)).toBe(true);
  });
  it("does not flag an active govt with localities", () => {
    // 1 is the boundary (merged from the deleted lib/infra/govt-roster.test.ts).
    expect(isDeadGovt(true, 1)).toBe(false);
    expect(isDeadGovt(true, 3)).toBe(false);
    expect(isDeadGovt(true, 5)).toBe(false);
  });
  it("never flags a deactivated govt", () => {
    expect(isDeadGovt(false, 0)).toBe(false);
    expect(isDeadGovt(false, 3)).toBe(false);
  });
});

describe("normalizeGovtStatus", () => {
  it("passes through known filters", () => {
    expect(normalizeGovtStatus("active")).toBe("active");
    expect(normalizeGovtStatus("inactive")).toBe("inactive");
    expect(normalizeGovtStatus("dead")).toBe("dead");
    expect(normalizeGovtStatus("all")).toBe("all");
  });
  it("falls back to 'all' for unknown / missing input", () => {
    expect(normalizeGovtStatus(undefined)).toBe("all");
    expect(normalizeGovtStatus(null)).toBe("all");
    expect(normalizeGovtStatus("")).toBe("all");
    expect(normalizeGovtStatus("ACTIVE")).toBe("all");
    expect(normalizeGovtStatus("../../etc")).toBe("all");
  });
});

describe("matchEmailIds", () => {
  const map = new Map<string, string>([
    ["id-1", "ana@muni.gob.ar"],
    ["id-2", "carlos@salta.gob.ar"],
    ["id-3", "ANA.LOPEZ@muni.gob.ar"],
    ["id-4", ""],
  ]);

  it("matches case-insensitively on a substring", () => {
    expect(matchEmailIds(map, "ana")).toEqual(["id-1", "id-3"]);
  });
  it("matches on domain fragments", () => {
    expect(matchEmailIds(map, "salta")).toEqual(["id-2"]);
  });
  it("returns no ids for an empty/whitespace query", () => {
    expect(matchEmailIds(map, "")).toEqual([]);
    expect(matchEmailIds(map, "   ")).toEqual([]);
  });
  it("returns no ids when nothing matches", () => {
    expect(matchEmailIds(map, "zzz")).toEqual([]);
  });
  it("never matches an empty email", () => {
    expect(matchEmailIds(map, "")).not.toContain("id-4");
  });
});

describe("sortGovtActivityByActivity", () => {
  const mk = (
    displayName: string,
    lastActionAt: Date | null,
    decisions30d = 0,
  ): GovtActivityRow => ({
    userId: displayName,
    displayName,
    localitiesCount: 1,
    decisions30d,
    lastActionAt,
  });

  it("orders most-recent action first, no-action last", () => {
    const rows = [
      mk("idle", null),
      mk("recent", new Date("2026-07-03T10:00:00Z")),
      mk("older", new Date("2026-06-01T10:00:00Z")),
    ];
    const sorted = sortGovtActivityByActivity(rows);
    expect(sorted.map((r) => r.displayName)).toEqual(["recent", "older", "idle"]);
  });

  it("breaks ties on lastAction by decisions30d desc", () => {
    const ts = new Date("2026-07-03T10:00:00Z");
    const rows = [mk("few", ts, 2), mk("many", ts, 9)];
    const sorted = sortGovtActivityByActivity(rows);
    expect(sorted.map((r) => r.displayName)).toEqual(["many", "few"]);
  });

  it("breaks remaining ties by name (es-AR)", () => {
    const rows = [mk("Zeta", null), mk("alfa", null)];
    const sorted = sortGovtActivityByActivity(rows);
    expect(sorted.map((r) => r.displayName)).toEqual(["alfa", "Zeta"]);
  });

  it("does not mutate the input array", () => {
    const rows = [mk("b", null), mk("a", new Date())];
    const copy = [...rows];
    sortGovtActivityByActivity(rows);
    expect(rows).toEqual(copy);
  });
});
