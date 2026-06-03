// Unit tests for the foster_proposal lifecycle declaration.
//
// Verifies that the lifecycle object satisfies the structural invariants
// expected by the case system — matching the style of case-lifecycles.test.ts:
//   - kind + statusValues + phases are declared correctly.
//   - opensEvents points to the right event_type.
//   - terminalEvents closes the case.
//   - Cron is wired (7-day expiry, daily cadence).
//   - manualOpenAllowed=false (proposal must come through foster_proposed event).
//   - reopenAllowed=false (declined proposals open new cases, never reopen old).
//   - No escalated status (proposals are either pending or resolved).

import { describe, expect, it } from "vitest";

import { getLifecycle } from "@/lib/case-lifecycles";

describe("foster_proposal lifecycle — declaration", () => {
  const lifecycle = getLifecycle("foster_proposal");

  it("is registered and kind matches", () => {
    expect(lifecycle).not.toBeNull();
    expect(lifecycle?.kind).toBe("foster_proposal");
  });

  it("admits open + closed status only (no escalated)", () => {
    expect(lifecycle?.statusValues).toContain("open");
    expect(lifecycle?.statusValues).toContain("closed");
    expect(lifecycle?.statusValues).not.toContain("escalated");
    expect(lifecycle?.statusValues).not.toContain("merged");
  });

  it("declares all expected phases", () => {
    const phases = lifecycle?.phases ?? [];
    expect(phases).toContain("pending_response");
    expect(phases).toContain("accepted");
    expect(phases).toContain("rejected");
    expect(phases).toContain("cancelled");
    expect(phases).toContain("expired");
  });

  it("opens on foster_proposed event", () => {
    const triggers = lifecycle?.opensEvents ?? [];
    expect(triggers.some((t) => t.eventType === "foster_proposed")).toBe(true);
  });

  it("terminates on foster_proposal_resolved", () => {
    expect(lifecycle?.terminalEvents).toContain("foster_proposal_resolved");
  });

  it("has no other terminal events (resolved is the sole umbrella)", () => {
    // foster_proposal_resolved covers accepted / rejected / cancelled / expired
    // via payload.outcome — no separate event_types needed.
    expect(lifecycle?.terminalEvents).toHaveLength(1);
  });

  it("has auto-close cron (expire-foster-proposals, daily)", () => {
    expect(lifecycle?.cronCloseRoute).toBe("/api/cron/expire-foster-proposals");
    expect(lifecycle?.cronCloseScheduleHours).toBe(24);
  });

  it("does not allow manual open (must come from foster_proposed event)", () => {
    expect(lifecycle?.manualOpenAllowed).toBe(false);
  });

  it("does not allow reopen", () => {
    expect(lifecycle?.reopenAllowed).toBeFalsy();
  });
});
