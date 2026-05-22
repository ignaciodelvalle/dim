// Unit tests for PetHealthTimeline helpers.
//
// Tests the pure logic: event labelling, date formatting, recent-five cap,
// and latest-event detection. DOM/render behaviour (details element, signing
// transitions) is validated by the acceptance criteria in the spec.

import { describe, expect, it } from "vitest";
import type { PetEventMetadata } from "@/lib/owner-dashboard";
import {
  MAX_TIMELINE_EVENTS,
  capRecentFive,
  formatTimelineDate,
  latestEvent,
  timelineEventLabel,
} from "./PetHealthTimeline.helpers";

function makeEvent(
  eventType: string,
  occurredAt: Date,
  summary: string | null = null,
): PetEventMetadata {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    eventType,
    occurredAt,
    summary,
  };
}

describe("timelineEventLabel", () => {
  it("returns summary when present", () => {
    const label = timelineEventLabel("vaccination_administered", "Vacuna antirrábica");
    expect(label).toBe("Vacuna antirrábica");
  });

  it("returns mapped label when summary is null", () => {
    const label = timelineEventLabel("vaccination_administered", null);
    expect(label).toBe("Vacunación");
  });

  it("returns formatted eventType for unknown types", () => {
    const label = timelineEventLabel("some_unknown_event", null);
    expect(label).toBe("some unknown event");
  });
});

describe("capRecentFive (AC-A9)", () => {
  it("returns all events when 5 or fewer", () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makeEvent("weight_recorded", new Date(`2024-0${i + 1}-01`)),
    );
    expect(capRecentFive(events)).toHaveLength(3);
  });

  it("caps at MAX_TIMELINE_EVENTS when more events provided", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent("weight_recorded", new Date(`2024-0${(i % 9) + 1}-01`)),
    );
    expect(capRecentFive(events)).toHaveLength(MAX_TIMELINE_EVENTS);
  });

  it("MAX_TIMELINE_EVENTS equals 5", () => {
    expect(MAX_TIMELINE_EVENTS).toBe(5);
  });
});

describe("latestEvent", () => {
  it("returns null for empty array", () => {
    expect(latestEvent([])).toBeNull();
  });

  it("returns the event with the most recent occurredAt", () => {
    const events = [
      makeEvent("weight_recorded", new Date("2024-01-01")),
      makeEvent("vaccination_administered", new Date("2024-06-15")),
      makeEvent("sterilization_performed", new Date("2024-03-10")),
    ];
    const latest = latestEvent(events);
    expect(latest?.eventType).toBe("vaccination_administered");
    expect(latest?.occurredAt).toEqual(new Date("2024-06-15"));
  });
});

describe("formatTimelineDate", () => {
  it("formats a date object as a string with month and day numbers", () => {
    // Use a local-time date constructor to avoid UTC midnight parsing issues.
    const date = new Date(2024, 5, 15); // June 15, 2024 in local time
    const result = formatTimelineDate(date);
    // es-AR locale produces "15/6" or "15/06"; just assert both parts are present.
    expect(result).toContain("15");
    expect(result).toContain("6");
  });
});
