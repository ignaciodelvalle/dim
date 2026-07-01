import { describe, expect, it } from "vitest";

import { replayPetWeight } from "@/lib/projections/pet-weight";
import type { ProjectionEvent } from "@/lib/projections/types";

function ev(
  eventType: string,
  payload: unknown,
  occurredAt = "2026-01-01T00:00:00Z",
): ProjectionEvent {
  return { id: `e-${occurredAt}`, eventType, occurredAt, recordedAt: occurredAt, payload };
}

describe("replayPetWeight", () => {
  it("returns null with no events", () => {
    expect(replayPetWeight([])).toEqual({ estimatedWeightKg: null });
  });

  it("returns the LATEST weight (string payload preserved as-is)", () => {
    const events = [
      ev("weight_recorded", { kg: "10.0" }, "2026-01-01T00:00:00Z"),
      ev("weight_recorded", { kg: "12.5" }, "2026-02-01T00:00:00Z"),
    ];
    expect(replayPetWeight(events).estimatedWeightKg).toBe("12.5");
  });

  it("coerces a numeric kg to its string form", () => {
    expect(replayPetWeight([ev("weight_recorded", { kg: 8 })]).estimatedWeightKg).toBe("8");
  });

  it("ignores non-weight events and malformed kg", () => {
    const events = [
      ev("vaccination_administered", { vaccine_name: "x" }),
      ev("weight_recorded", { kg: "" }),
    ];
    expect(replayPetWeight(events).estimatedWeightKg).toBeNull();
  });
});
