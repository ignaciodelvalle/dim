// Pure-function tests for lib/location.ts. No DB needed — these run fast.

import { describe, expect, it } from "vitest";

import { readPoint, writePoint } from "@/lib/location";

describe("readPoint", () => {
  it("returns null for both-null rows", () => {
    expect(readPoint({ locationLat: null, locationLng: null })).toBeNull();
  });

  it("returns null when only one column is set", () => {
    expect(readPoint({ locationLat: "-34.6", locationLng: null })).toBeNull();
    expect(readPoint({ locationLat: null, locationLng: "-58.4" })).toBeNull();
  });

  it("returns null for undefined inputs", () => {
    expect(readPoint({ locationLat: undefined, locationLng: undefined })).toBeNull();
  });

  it("parses numeric-string inputs (the Drizzle numeric round-trip shape)", () => {
    const point = readPoint({ locationLat: "-34.6083000", locationLng: "-58.3712000" });
    expect(point).toEqual({ lat: -34.6083, lng: -58.3712 });
  });

  it("parses number inputs (legacy doublePrecision shape)", () => {
    const point = readPoint({ locationLat: -34.6083, locationLng: -58.3712 });
    expect(point).toEqual({ lat: -34.6083, lng: -58.3712 });
  });

  it("returns null for NaN inputs", () => {
    expect(readPoint({ locationLat: Number.NaN, locationLng: -58.4 })).toBeNull();
    expect(readPoint({ locationLat: "not a number", locationLng: "-58.4" })).toBeNull();
  });

  it("returns null for empty-string inputs (avoids the Number('') === 0 trap)", () => {
    expect(readPoint({ locationLat: "", locationLng: "" })).toBeNull();
    expect(readPoint({ locationLat: "   ", locationLng: "   " })).toBeNull();
  });

  it("returns null for Infinity inputs", () => {
    expect(readPoint({ locationLat: Number.POSITIVE_INFINITY, locationLng: 0 })).toBeNull();
    expect(readPoint({ locationLat: 0, locationLng: Number.NEGATIVE_INFINITY })).toBeNull();
  });

  it("accepts the zero coordinate (0, 0 is a valid point even if rarely useful)", () => {
    expect(readPoint({ locationLat: 0, locationLng: 0 })).toEqual({ lat: 0, lng: 0 });
    expect(readPoint({ locationLat: "0", locationLng: "0" })).toEqual({ lat: 0, lng: 0 });
  });
});

describe("writePoint", () => {
  it("returns nulls for null input", () => {
    expect(writePoint(null)).toEqual({ locationLat: null, locationLng: null });
  });

  it("formats to 7 decimal places as strings", () => {
    expect(writePoint({ lat: -34.6083, lng: -58.3712 })).toEqual({
      locationLat: "-34.6083000",
      locationLng: "-58.3712000",
    });
  });

  it("rounds excess precision to 7 decimals", () => {
    const result = writePoint({ lat: -34.60833333333333, lng: -58.37122222222222 });
    expect(result.locationLat).toBe("-34.6083333");
    expect(result.locationLng).toBe("-58.3712222");
  });

  it("throws on non-finite inputs (defense against Postgres invalid_text_representation)", () => {
    expect(() => writePoint({ lat: Number.NaN, lng: 0 })).toThrow();
    expect(() => writePoint({ lat: 0, lng: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => writePoint({ lat: Number.NEGATIVE_INFINITY, lng: 0 })).toThrow();
  });
});

describe("readPoint(writePoint(p)) round trip", () => {
  it("preserves the value up to numeric(10,7) precision", () => {
    const original = { lat: -34.6083, lng: -58.3712 };
    const written = writePoint(original);
    const readBack = readPoint(written);
    expect(readBack).toEqual(original);
  });

  it("null round-trips to null", () => {
    expect(readPoint(writePoint(null))).toBeNull();
  });
});
