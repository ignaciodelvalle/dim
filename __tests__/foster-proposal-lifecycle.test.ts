// Unit tests for the foster_proposal lifecycle declaration.
//
// Verifies that the lifecycle object satisfies the structural invariants
// expected by the case system — matching the style of case-lifecycles.test.ts:
//   - kind + statusValues + phases are declared correctly.
//   - opensEvents points to the right event_type.
//   - terminalEvents closes the case.
//   - cronCloseRoute is null: proposeFosterAction does not yet open a cases
//     row, so no cron close can be wired (lands with the case-opening action).
//   - phases contains only genuine open-state subdivisions (lifecycles spec L1).
//     accepted / rejected / cancelled / expired are closed outcomes, not phases.
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

  it("declares pending_response as the only open phase (lifecycles spec L1)", () => {
    const phases = lifecycle?.phases ?? [];
    // pending_response is the sole subdivision of status='open'.
    expect(phases).toContain("pending_response");
    // Closed outcomes must NOT appear as phases (they are discriminated by
    // closed_reason / payload.outcome, not by the phases array).
    expect(phases).not.toContain("accepted");
    expect(phases).not.toContain("rejected");
    expect(phases).not.toContain("cancelled");
    expect(phases).not.toContain("expired");
    expect(phases).toHaveLength(1);
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

  it("has no auto-close cron (case-opening action not yet wired)", () => {
    // proposeFosterAction does not INSERT a cases row, so there is no cases
    // row for the cron to close. cronCloseRoute lands with the foster_proposed
    // case-opening action implementation.
    expect(lifecycle?.cronCloseRoute).toBeNull();
    expect(lifecycle?.cronCloseScheduleHours).toBe(0);
  });

  it("does not allow manual open (must come from foster_proposed event)", () => {
    expect(lifecycle?.manualOpenAllowed).toBe(false);
  });

  it("does not allow reopen", () => {
    expect(lifecycle?.reopenAllowed).toBeFalsy();
  });
});
