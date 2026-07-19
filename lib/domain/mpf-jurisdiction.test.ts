// Tests for the MPF export jurisdiction gate (capability-gating pattern).

import { describe, expect, it } from "vitest";

import { MPF_CONFIGURED_PROVINCES, isMpfConfiguredForProvince } from "./mpf-jurisdiction";

describe("MPF_CONFIGURED_PROVINCES", () => {
  it("contains only CABA today", () => {
    expect([...MPF_CONFIGURED_PROVINCES]).toEqual(["CABA"]);
  });
});

describe("isMpfConfiguredForProvince", () => {
  it("returns true for CABA", () => {
    expect(isMpfConfiguredForProvince("CABA")).toBe(true);
  });

  it("returns false for a non-configured province", () => {
    expect(isMpfConfiguredForProvince("Buenos Aires")).toBe(false);
    expect(isMpfConfiguredForProvince("Mendoza")).toBe(false);
  });

  it("returns false for null/undefined/empty jurisdiction", () => {
    expect(isMpfConfiguredForProvince(null)).toBe(false);
    expect(isMpfConfiguredForProvince(undefined)).toBe(false);
    expect(isMpfConfiguredForProvince("")).toBe(false);
  });
});
