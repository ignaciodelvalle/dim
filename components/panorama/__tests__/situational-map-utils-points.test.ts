// panorama-event-points Slice 1 — unit tests for the near-zoom points gate.
//
// Pure (no map, no DOM): asserts the Z_POINTS threshold and the pointsEligible
// UX predicate. The predicate is UX-only — the SERVER re-derives points mode —
// but it must be correct so the console only REQUESTS dots at street zoom inside
// a jurisdiction (never nationally, which would be a dot-dump request).

import { describe, expect, it } from "vitest";

import type { PanoramaScope } from "@/src/modules/panorama/domain/types";
import { Z_POINTS, pointsEligible } from "../situational-map-utils";

const scope = (over: Partial<PanoramaScope> = {}): PanoramaScope => ({
  country: "AR",
  province: null,
  locality: null,
  ...over,
});

describe("Z_POINTS", () => {
  it("is deeper than the divisions threshold (street scale)", () => {
    // Z_DIVISIONS is 6.5; real dots must only appear well past it.
    expect(Z_POINTS).toBeGreaterThan(6.5);
    expect(Z_POINTS).toBe(10);
  });
});

describe("pointsEligible", () => {
  it("is false at national scope regardless of zoom (no dot-dump request)", () => {
    expect(pointsEligible(scope(), 20)).toBe(false);
    expect(pointsEligible(scope(), Z_POINTS)).toBe(false);
  });

  it("is false when a province is selected but the camera is above the threshold", () => {
    expect(pointsEligible(scope({ province: "AR-C" }), Z_POINTS - 0.01)).toBe(false);
    expect(pointsEligible(scope({ province: "AR-C" }), 5)).toBe(false);
  });

  it("is true only when BOTH a province is in scope AND zoom ≥ Z_POINTS", () => {
    expect(pointsEligible(scope({ province: "AR-C" }), Z_POINTS)).toBe(true);
    expect(pointsEligible(scope({ province: "AR-C" }), 12)).toBe(true);
  });

  it("honors an implicit province scope with a locality too", () => {
    expect(pointsEligible(scope({ province: "AR-X", locality: "cordoba" }), 11)).toBe(true);
  });

  it("a locality without a province does not open points mode", () => {
    // The gate keys on province: a locality-only scope (should not happen, but be
    // strict) must not enable dots.
    expect(pointsEligible(scope({ locality: "cordoba" }), 15)).toBe(false);
  });
});
