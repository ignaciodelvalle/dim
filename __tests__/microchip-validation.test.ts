import { validateMicrochipId } from "@/lib/domain/microchip-validation";
import { describe, expect, it } from "vitest";

describe("validateMicrochipId", () => {
  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("accepts exactly 15 digits and returns normalized form", () => {
    const result = validateMicrochipId("123456789012345");
    expect(result).toEqual({ ok: true, normalized: "123456789012345" });
  });

  it("strips leading/trailing whitespace before validation", () => {
    const result = validateMicrochipId("  123456789012345  ");
    expect(result).toEqual({ ok: true, normalized: "123456789012345" });
  });

  it("strips internal spaces and returns 15 digits", () => {
    const result = validateMicrochipId("12345 67890 12345");
    expect(result).toEqual({ ok: true, normalized: "123456789012345" });
  });

  it("strips hyphens and returns 15 digits", () => {
    const result = validateMicrochipId("12345-67890-12345");
    expect(result).toEqual({ ok: true, normalized: "123456789012345" });
  });

  it("strips mixed spaces and hyphens", () => {
    const result = validateMicrochipId("123 45-678 90-12345");
    expect(result).toEqual({ ok: true, normalized: "123456789012345" });
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it("rejects a 14-digit string", () => {
    const result = validateMicrochipId("12345678901234");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/14/);
    }
  });

  it("rejects a 16-digit string", () => {
    const result = validateMicrochipId("1234567890123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/16/);
    }
  });

  it("rejects a string with letters", () => {
    const result = validateMicrochipId("ABCDE6789012345");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/dígitos/i);
    }
  });

  it("rejects a string with letters mixed among digits", () => {
    const result = validateMicrochipId("1234A6789012345");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/dígitos/i);
    }
  });

  it("rejects an empty string", () => {
    const result = validateMicrochipId("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects a whitespace-only string", () => {
    const result = validateMicrochipId("   ");
    expect(result.ok).toBe(false);
  });
});
