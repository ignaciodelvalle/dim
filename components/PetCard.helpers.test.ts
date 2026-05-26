import { describe, expect, it } from "vitest";

import { getPriorityBadge } from "./PetCard.helpers";

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
