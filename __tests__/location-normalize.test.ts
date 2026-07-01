// Unit tests for normalizeLocationForWrite (P2 gate).
//
// Tests cover:
//   1. Province canonicalization via ISO code.
//   2. locality:"none" — no catalog lookup; raw locality passed through.
//   3. locality:"strict" — throws JurisdictionValidationError on unknown locality.
//   4. locality:"soft" — passes raw through on miss; resolves on hit.
//   5. requireCoords:true — throws CoordError when coords absent.
//   6. Coord range check — throws CoordError for lat > 90, lng < -180.
//   7. Coord range check — passes for valid in-range coords.
//   8. No coord error when coords absent and requireCoords is false (default).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: jurisdiction-validation
// ---------------------------------------------------------------------------

const mockResolveCanonicalJurisdiction = vi.hoisted(() => vi.fn());
const mockTryResolveCanonicalJurisdiction = vi.hoisted(() => vi.fn());
const MockJurisdictionValidationError = vi.hoisted(
  () =>
    class extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.name = "JurisdictionValidationError";
        this.code = code;
      }
    },
);

vi.mock("@/lib/infra/jurisdiction-validation", () => ({
  resolveCanonicalJurisdiction: mockResolveCanonicalJurisdiction,
  tryResolveCanonicalJurisdiction: mockTryResolveCanonicalJurisdiction,
  JurisdictionValidationError: MockJurisdictionValidationError,
}));

// ---------------------------------------------------------------------------
// Mock: jurisdiction-canonical
// ---------------------------------------------------------------------------

vi.mock("@/lib/domain/jurisdiction-canonical", () => ({
  canonicalProvinceNameForStorage: vi.fn((input: string | null | undefined) => {
    if (!input) return null;
    // Minimal simulation: ISO AR-B → "Buenos Aires", display name passthrough.
    if (input === "AR-B") return "Buenos Aires";
    if (input === "AR-C") return "CABA";
    // Return input as-is for other non-empty strings to simulate display name acceptance.
    return input.trim() || null;
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";
import type { LocationValue } from "@/lib/domain/location-value";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocationValue(overrides: Partial<LocationValue> = {}): LocationValue {
  return {
    province: null,
    provinceCode: null,
    locality: null,
    localityIndecId: null,
    lat: null,
    lng: null,
    address: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeLocationForWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("province canonicalization", () => {
    it("converts ISO provinceCode to canonical display name", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue({ provinceCode: "AR-B" }), {
        locality: "none",
      });
      expect(result.province).toBe("Buenos Aires");
    });

    it("passes display name through when provinceCode is absent", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue({ province: "Mendoza" }), {
        locality: "none",
      });
      expect(result.province).toBe("Mendoza");
    });

    it("returns null province for empty inputs", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue(), { locality: "none" });
      expect(result.province).toBeNull();
    });
  });

  describe('locality:"none"', () => {
    it("passes raw locality through without catalog lookup", async () => {
      const result = await normalizeLocationForWrite(
        makeLocationValue({ provinceCode: "AR-B", locality: "La Plata" }),
        { locality: "none" },
      );
      expect(result.locality).toBe("La Plata");
      expect(result.localityCanonical).toBe(false);
      expect(mockResolveCanonicalJurisdiction).not.toHaveBeenCalled();
      expect(mockTryResolveCanonicalJurisdiction).not.toHaveBeenCalled();
    });
  });

  describe('locality:"strict"', () => {
    it("returns canonical locality on successful resolution", async () => {
      mockResolveCanonicalJurisdiction.mockResolvedValue({
        province: { name: "Buenos Aires" },
        locality: { localityName: "La Plata" },
      });

      const result = await normalizeLocationForWrite(
        makeLocationValue({ provinceCode: "AR-B", locality: "la plata" }),
        { locality: "strict" },
      );

      expect(result.province).toBe("Buenos Aires");
      expect(result.locality).toBe("La Plata");
      expect(result.localityCanonical).toBe(true);
    });

    it("throws JurisdictionValidationError on unknown locality", async () => {
      mockResolveCanonicalJurisdiction.mockRejectedValue(
        new MockJurisdictionValidationError("INVALID_LOCALITY", "Localidad no encontrada."),
      );

      await expect(
        normalizeLocationForWrite(makeLocationValue({ provinceCode: "AR-B", locality: "Narnia" }), {
          locality: "strict",
        }),
      ).rejects.toBeInstanceOf(JurisdictionValidationError);
    });

    it("skips strict resolution when locality is absent", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue({ provinceCode: "AR-B" }), {
        locality: "strict",
      });
      expect(result.locality).toBeNull();
      expect(mockResolveCanonicalJurisdiction).not.toHaveBeenCalled();
    });
  });

  describe('locality:"soft"', () => {
    it("returns canonical locality when resolved", async () => {
      mockTryResolveCanonicalJurisdiction.mockResolvedValue({
        province: "Buenos Aires",
        locality: "La Plata",
        canonical: true,
      });

      const result = await normalizeLocationForWrite(
        makeLocationValue({ provinceCode: "AR-B", locality: "la plata" }),
        { locality: "soft" },
      );

      expect(result.locality).toBe("La Plata");
      expect(result.localityCanonical).toBe(true);
    });

    it("falls back to raw locality when catalog miss", async () => {
      mockTryResolveCanonicalJurisdiction.mockResolvedValue({
        province: "Buenos Aires",
        locality: "Localidad Rara",
        canonical: false,
      });

      const result = await normalizeLocationForWrite(
        makeLocationValue({ provinceCode: "AR-B", locality: "Localidad Rara" }),
        { locality: "soft" },
      );

      expect(result.locality).toBe("Localidad Rara");
      expect(result.localityCanonical).toBe(false);
    });
  });

  describe("requireCoords:true", () => {
    it("throws CoordError COORD_REQUIRED when lat/lng are null", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue(), { requireCoords: true }),
      ).rejects.toMatchObject({ code: "COORD_REQUIRED" });
    });

    it("throws CoordError COORD_REQUIRED when coords are non-finite (NaN)", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue({ lat: Number.NaN, lng: Number.NaN }), {
          requireCoords: true,
        }),
      ).rejects.toMatchObject({ code: "COORD_REQUIRED" });
    });

    it("resolves when valid coords are present", async () => {
      const result = await normalizeLocationForWrite(
        makeLocationValue({ lat: -34.6037, lng: -58.3816 }),
        { requireCoords: true },
      );
      expect(result.lat).toBe(-34.6037);
      expect(result.lng).toBe(-58.3816);
    });
  });

  describe("coord range check (always applied when coords present)", () => {
    it("throws CoordError COORD_OUT_OF_RANGE for lat > 90", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue({ lat: 91, lng: 0 })),
      ).rejects.toMatchObject({ code: "COORD_OUT_OF_RANGE" });
    });

    it("throws CoordError COORD_OUT_OF_RANGE for lat < -90", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue({ lat: -91, lng: 0 })),
      ).rejects.toMatchObject({ code: "COORD_OUT_OF_RANGE" });
    });

    it("throws CoordError COORD_OUT_OF_RANGE for lng > 180", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue({ lat: 0, lng: 181 })),
      ).rejects.toMatchObject({ code: "COORD_OUT_OF_RANGE" });
    });

    it("throws CoordError COORD_OUT_OF_RANGE for lng < -180", async () => {
      await expect(
        normalizeLocationForWrite(makeLocationValue({ lat: 0, lng: -181 })),
      ).rejects.toMatchObject({ code: "COORD_OUT_OF_RANGE" });
    });

    it("accepts boundary values exactly at range", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue({ lat: -90, lng: 180 }));
      expect(result.lat).toBe(-90);
      expect(result.lng).toBe(180);
    });

    it("does not throw for absent coords (requireCoords defaults to false)", async () => {
      const result = await normalizeLocationForWrite(makeLocationValue());
      expect(result.lat).toBeNull();
      expect(result.lng).toBeNull();
    });
  });

  describe("CoordError class", () => {
    it("is instanceof Error", () => {
      const err = new CoordError("COORD_REQUIRED", "test");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("COORD_REQUIRED");
    });
  });
});
