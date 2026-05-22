// Unit tests for AchievementsSection helpers (B-4).
// Tests pure logic from AchievementsSection.helpers.ts — no JSX/DOM needed.

import { describe, expect, it } from "vitest";
import { shouldPulse, shouldRenderSection } from "./AchievementsSection.helpers";
import type { CredentialChip } from "./AchievementsSection.helpers";

// ---------------------------------------------------------------------------
// shouldPulse
// ---------------------------------------------------------------------------

describe("shouldPulse", () => {
  it("returns true when pulseUntil is in the future", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days
    expect(shouldPulse(future)).toBe(true);
  });

  it("returns false when pulseUntil is in the past", () => {
    const past = new Date(Date.now() - 1000); // 1 second ago
    expect(shouldPulse(past)).toBe(false);
  });

  it("returns false when pulseUntil is null", () => {
    expect(shouldPulse(null)).toBe(false);
  });

  it("returns false when pulseUntil is undefined", () => {
    expect(shouldPulse(undefined)).toBe(false);
  });

  it("returns false when pulseUntil is exactly now (boundary)", () => {
    // Exact equality is edge: Date.now() - itself <= 0 ms, so not strictly >
    // In practice a Date constructed from Date.now() is never > Date.now() read
    // a few instructions later, but test the <= boundary explicitly.
    const boundary = new Date(Date.now() - 1); // 1ms in the past
    expect(shouldPulse(boundary)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldRenderSection
// ---------------------------------------------------------------------------

describe("shouldRenderSection", () => {
  const noCredentials: CredentialChip[] = [];
  const pppChip: CredentialChip = { kind: "ppp", label: "PPP", icon: "⚠️" };

  it("returns true when there are earned achievements", () => {
    expect(shouldRenderSection(noCredentials, 1)).toBe(true);
  });

  it("returns true when there are credentials but no achievements", () => {
    expect(shouldRenderSection([pppChip], 0)).toBe(true);
  });

  it("returns true when both credentials and achievements are present", () => {
    expect(shouldRenderSection([pppChip], 2)).toBe(true);
  });

  it("returns false when both credentials and achievements are empty", () => {
    expect(shouldRenderSection(noCredentials, 0)).toBe(false);
  });
});
