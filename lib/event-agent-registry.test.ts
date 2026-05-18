import { describe, expect, it } from "vitest";

import { EVENT_TYPES, type EventType } from "@/db/schema";
import { EVENT_AGENT_REGISTRY, buildAgentDeeplink } from "./event-agent-registry";

describe("EVENT_AGENT_REGISTRY", () => {
  it("only contains keys that are valid EventTypes", () => {
    const validTypes = new Set<string>(EVENT_TYPES);
    for (const key of Object.keys(EVENT_AGENT_REGISTRY)) {
      expect(validTypes.has(key)).toBe(true);
    }
  });

  it("every entry has a non-empty route, description, and prefillSlots", () => {
    for (const [eventType, entry] of Object.entries(EVENT_AGENT_REGISTRY)) {
      if (!entry) continue;
      expect(entry.route, `route for ${eventType}`).toMatch(/^\/eventos\/nuevo\//);
      expect(entry.description.length, `description for ${eventType}`).toBeGreaterThan(10);
      expect(entry.description.length, `description for ${eventType}`).toBeLessThan(120);
      expect(entry.prefillSlots.length, `prefillSlots for ${eventType}`).toBeGreaterThan(0);
    }
  });
});

describe("buildAgentDeeplink", () => {
  it("returns null for an event_type with no registry entry", () => {
    // pet_profile_updated has no form; should be null.
    expect(buildAgentDeeplink("pet_profile_updated" as EventType, "DIM-XXXX-YY")).toBeNull();
  });

  it("builds a basic URL with no slots", () => {
    expect(buildAgentDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY")).toBe(
      "/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/peso",
    );
  });

  it("encodes provided slots as query params", () => {
    const url = buildAgentDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("kg=12.5");
    expect(url).toContain("occurredAt=2026-05-10");
  });

  it("skips null/undefined/empty slot values", () => {
    const url = buildAgentDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: null,
      notes: undefined,
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/peso?kg=12.5");
  });

  it("ignores slot keys not declared in prefillSlots", () => {
    const url = buildAgentDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      // Unknown key that's not in prefillSlots should be silently dropped.
      randomKey: "should not appear",
    });
    expect(url).not.toContain("randomKey");
  });
});
