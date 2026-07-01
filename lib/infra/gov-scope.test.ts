// Unit tests for lib/gov-scope.ts — pure helpers only (no DB).
//
// Tests cover:
//   resolveScopedJurisdictions — 4 cases: admin passthrough, govt province filter,
//     govt province+locality filter, govt no selection → all assignments.
//   computeBounds — empty→null, single point, multi-point (correct
//     [[minLng,minLat],[maxLng,maxLat]] MapLibre order).
//
// DB-bound helpers (jurisdictionBounds) are tsc-verified via shape stubs below.

import { describe, expect, it } from "vitest";

import type { DashboardJurisdiction } from "@/lib/metrics";

import {
  computeBounds,
  jurisdictionBounds,
  resolveScopedJurisdictions,
} from "@/lib/infra/gov-scope";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ASSIGNMENTS: DashboardJurisdiction[] = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "Buenos Aires", locality: "Mar del Plata" },
  { province: "Córdoba", locality: "Córdoba" },
];

// ---------------------------------------------------------------------------
// resolveScopedJurisdictions
// ---------------------------------------------------------------------------

describe("resolveScopedJurisdictions", () => {
  it("admin: returns jurisdictions unchanged regardless of province selection", () => {
    const result = resolveScopedJurisdictions({
      jurisdictions: ASSIGNMENTS,
      role: "admin",
      selectedProvinceName: "Buenos Aires",
      selectedLocalityName: "La Plata",
    });
    // Admin receives ALL assignments — no narrowing.
    expect(result).toStrictEqual(ASSIGNMENTS);
  });

  it("govt: no selection → returns all assignments unchanged", () => {
    const result = resolveScopedJurisdictions({
      jurisdictions: ASSIGNMENTS,
      role: "govt",
      selectedProvinceName: null,
      selectedLocalityName: null,
    });
    expect(result).toStrictEqual(ASSIGNMENTS);
  });

  it("govt: province selected → filters to that province only", () => {
    const result = resolveScopedJurisdictions({
      jurisdictions: ASSIGNMENTS,
      role: "govt",
      selectedProvinceName: "Buenos Aires",
    });
    expect(result).toHaveLength(2);
    expect(result.every((j) => j.province === "Buenos Aires")).toBe(true);
  });

  it("govt: province + locality selected → filters to the exact pair", () => {
    const result = resolveScopedJurisdictions({
      jurisdictions: ASSIGNMENTS,
      role: "govt",
      selectedProvinceName: "Buenos Aires",
      selectedLocalityName: "La Plata",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual({ province: "Buenos Aires", locality: "La Plata" });
  });

  it("govt: locality not in assignments → returns empty list (cannot widen)", () => {
    const result = resolveScopedJurisdictions({
      jurisdictions: ASSIGNMENTS,
      role: "govt",
      selectedProvinceName: "Buenos Aires",
      selectedLocalityName: "Rosario", // belongs to Santa Fe, not in assignments
    });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeBounds
// ---------------------------------------------------------------------------

describe("computeBounds", () => {
  it("returns null for an empty array", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("returns identical SW and NE for a single point", () => {
    const result = computeBounds([{ lat: -34.6, lng: -58.4 }]);
    expect(result).toStrictEqual([
      [-58.4, -34.6],
      [-58.4, -34.6],
    ]);
  });

  it("returns correct [[minLng,minLat],[maxLng,maxLat]] for multiple points", () => {
    // Spread across two Argentine cities.
    const points = [
      { lat: -34.6, lng: -58.4 }, // Buenos Aires
      { lat: -31.4, lng: -64.2 }, // Córdoba (further west, further north)
      { lat: -38.7, lng: -62.3 }, // Bahía Blanca (further south)
    ];
    const result = computeBounds(points);
    // minLng = -64.2 (Córdoba), minLat = -38.7 (Bahía Blanca)
    // maxLng = -58.4 (Buenos Aires), maxLat = -31.4 (Córdoba)
    expect(result).toStrictEqual([
      [-64.2, -38.7],
      [-58.4, -31.4],
    ]);
  });

  it("handles points with equal lat or lng (degenerate box)", () => {
    const points = [
      { lat: -34.6, lng: -58.4 },
      { lat: -34.6, lng: -60.0 },
    ];
    const result = computeBounds(points);
    expect(result).toStrictEqual([
      [-60.0, -34.6],
      [-58.4, -34.6],
    ]);
  });
});

// ---------------------------------------------------------------------------
// DB-bound shape stubs — tsc-verified, no live DB required.
//
// These stubs confirm that `jurisdictionBounds` has the correct return type.
// The actual DB call is exercised only in integration tests with a live Postgres.
// ---------------------------------------------------------------------------

import type { DashboardJurisdiction as DJ } from "@/lib/infra/gov-scope";

// Compile-time check: jurisdictionBounds returns Promise<[[number,number],[number,number]] | null>
const _boundsShape: (j: DJ[]) => Promise<[[number, number], [number, number]] | null> =
  jurisdictionBounds;
void _boundsShape;

describe("gov-scope — tsc shape contracts (no DB)", () => {
  it("jurisdictionBounds return type: [[number,number],[number,number]] | null", () => {
    // Shape is verified at compile time; this test confirms the import resolves.
    expect(typeof jurisdictionBounds).toBe("function");
  });
});
