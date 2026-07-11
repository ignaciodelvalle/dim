import { describe, expect, it } from "vitest";

import { getPriorityBadge, isTransitRole } from "./PetCard.helpers";

describe("getPriorityBadge — PetCard priority logic", () => {
  it("status='lost' wins over any vaccine variant", () => {
    expect(getPriorityBadge("lost", { variant: "overdue_critical" })).toEqual({ kind: "lost" });
    expect(getPriorityBadge("lost", { variant: "upcoming" })).toEqual({ kind: "lost" });
    expect(getPriorityBadge("lost", undefined)).toEqual({ kind: "lost" });
  });

  it("status='deceased' wins over any vaccine variant", () => {
    expect(getPriorityBadge("deceased", { variant: "overdue_critical" })).toEqual({
      kind: "deceased",
    });
    expect(getPriorityBadge("deceased", undefined)).toEqual({ kind: "deceased" });
  });

  it("status='active' falls through to vaccine variant when present", () => {
    expect(getPriorityBadge("active", { variant: "overdue_critical" })).toEqual({
      kind: "vaccine",
      variant: "overdue_critical",
    });
    expect(getPriorityBadge("active", { variant: "due_soon" })).toEqual({
      kind: "vaccine",
      variant: "due_soon",
    });
  });

  it("status='active' with no vaccine state returns none", () => {
    expect(getPriorityBadge("active", undefined)).toEqual({ kind: "none" });
  });

  it("unknown variants are ignored (returns none for active)", () => {
    // success variant: doesn't warrant a chip
    expect(getPriorityBadge("active", { variant: "success" as never })).toEqual({ kind: "none" });
  });
});

describe("isTransitRole — 'En tránsito' badge predicate (AF-H2)", () => {
  it("fires for a foster placement (the role that surfaces in Mis mascotas)", () => {
    // A fostered pet joins on ownerUserId=user.id with role='foster'; it must
    // render the "En tránsito" badge. This is the exact case the dead
    // shelter_custody predicate silently missed.
    expect(isTransitRole("foster")).toBe(true);
  });

  it("does not fire for an owner", () => {
    expect(isTransitRole("owner")).toBe(false);
  });

  it("does not fire for shelter_custody (org-level, never in the personal list)", () => {
    // The old predicate matched here — which is precisely why the badge was
    // dead: shelter_custody rows have ownerUserId=null and never join into this
    // list. Guards against regressing to the broken behavior.
    expect(isTransitRole("shelter_custody")).toBe(false);
  });
});
