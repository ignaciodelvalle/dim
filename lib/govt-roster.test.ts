import { describe, expect, it } from "vitest";

import { isDeadGovt } from "./govt-roster";

describe("isDeadGovt (C24 — active govt with 0 localities)", () => {
  it("flags an active govt with zero active localities", () => {
    expect(isDeadGovt(true, 0)).toBe(true);
  });

  it("does NOT flag an active govt with at least one locality", () => {
    expect(isDeadGovt(true, 1)).toBe(false);
    expect(isDeadGovt(true, 5)).toBe(false);
  });

  it("does NOT flag a deactivated govt regardless of locality count", () => {
    expect(isDeadGovt(false, 0)).toBe(false);
    expect(isDeadGovt(false, 3)).toBe(false);
  });
});
