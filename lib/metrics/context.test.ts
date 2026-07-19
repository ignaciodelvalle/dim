// lib/metrics/context.test.ts — unit tests for the pure ProjectionContext
// predicates. No DB: these exercise scope/grain logic only.

import { describe, expect, it } from "vitest";

import { buildProjectionContext, isSubProvincialScope } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

const PERIOD = windows.trailing12m();

describe("isSubProvincialScope", () => {
  it("national admin (no drill-down) is NOT sub-provincial", () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], PERIOD);
    expect(isSubProvincialScope(ctx)).toBe(false);
  });

  it("admin drilled to a province (no locality) is NOT sub-provincial", () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], PERIOD, {
      adminProvince: "Buenos Aires",
    });
    expect(isSubProvincialScope(ctx)).toBe(false);
  });

  it("admin drilled to a locality IS sub-provincial", () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], PERIOD, {
      adminProvince: "Ciudad Autónoma de Buenos Aires",
      adminLocality: "Palermo",
    });
    expect(isSubProvincialScope(ctx)).toBe(true);
  });

  it("govt scoped to a WHOLE province (locality === '') is NOT sub-provincial", () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: "Buenos Aires", locality: "" }],
      PERIOD,
    );
    expect(isSubProvincialScope(ctx)).toBe(false);
  });

  it("govt scoped to a specific locality IS sub-provincial", () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: "CABA", locality: "Palermo" }],
      PERIOD,
    );
    expect(isSubProvincialScope(ctx)).toBe(true);
  });

  it("govt scoped to WHOLE CABA (two-tier canonical form) is NOT sub-provincial", () => {
    // The canonical whole-province form for CABA is the INDEC whole-city entry,
    // NOT locality === "". It has a census row and an honest per-10k rate, so it
    // must NOT be suppressed (regression guard for the fresh-review H-1 finding).
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: "CABA", locality: "Ciudad Autónoma de Buenos Aires" }],
      PERIOD,
    );
    expect(isSubProvincialScope(ctx)).toBe(false);
  });

  it("govt with a MIXED scope (a whole province + a specific locality) IS sub-provincial", () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [
        { province: "Córdoba", locality: "" },
        { province: "Buenos Aires", locality: "La Plata" },
      ],
      PERIOD,
    );
    expect(isSubProvincialScope(ctx)).toBe(true);
  });

  it("govt with an empty scope is NOT sub-provincial", () => {
    const ctx = buildProjectionContext({ role: "govt" }, [], PERIOD);
    expect(isSubProvincialScope(ctx)).toBe(false);
  });
});
