import { describe, expect, it } from "vitest";

import { EVENT_TYPES, type EventType } from "@/db/schema";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "./event-capture-registry";

describe("EVENT_CAPTURE_REGISTRY", () => {
  it("only contains keys that are valid EventTypes", () => {
    const validTypes = new Set<string>(EVENT_TYPES);
    for (const key of Object.keys(EVENT_CAPTURE_REGISTRY)) {
      expect(validTypes.has(key)).toBe(true);
    }
  });

  it("every entry has a valid route + non-empty description", () => {
    for (const [eventType, entry] of Object.entries(EVENT_CAPTURE_REGISTRY)) {
      if (!entry) continue;
      expect(entry.route, `route for ${eventType}`).toMatch(/^\/eventos\/nuevo\//);
      expect(entry.description.length, `description for ${eventType}`).toBeGreaterThan(10);
      expect(entry.description.length, `description for ${eventType}`).toBeLessThan(120);
    }
  });

  it("covers every form that exists under app/(app)/mis-mascotas/[publicToken]/eventos/nuevo", () => {
    // The 14 forms are the source of truth. Registry should map every
    // event_type that has a form. If a form lands without a registry
    // entry, the matcher can't deeplink to it.
    const formEventTypes = [
      "weight_recorded",
      "vaccination_administered",
      "deworming_administered",
      "sterilization_performed",
      "vet_visit_logged",
      "microchip_implanted",
      "note_added",
      "death_recorded",
      "post_adoption_checkin",
      "medication_started",
      "medication_stopped",
      "incident_reported",
      "symptom_observed",
      "clinical_info_logged",
    ];
    for (const t of formEventTypes) {
      expect(EVENT_CAPTURE_REGISTRY[t as EventType], `missing entry for ${t}`).toBeTruthy();
    }
  });

  it("complex forms (incident, symptom, clinical, medication) have empty prefillSlots", () => {
    const expectedEmpty: EventType[] = [
      "medication_started",
      "medication_stopped",
      "incident_reported",
      "symptom_observed",
      "clinical_info_logged",
    ];
    for (const t of expectedEmpty) {
      const entry = EVENT_CAPTURE_REGISTRY[t];
      expect(entry?.prefillSlots, `prefillSlots for ${t}`).toEqual([]);
    }
  });
});

describe("buildCaptureDeeplink", () => {
  it("returns null for an event_type with no registry entry", () => {
    expect(buildCaptureDeeplink("pet_profile_updated" as EventType, "DIM-XXXX-YY")).toBeNull();
  });

  it("builds a basic URL with no slots", () => {
    expect(buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY")).toBe(
      "/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/peso",
    );
  });

  it("encodes provided slots as query params", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("kg=12.5");
    expect(url).toContain("occurredAt=2026-05-10");
  });

  it("skips null/undefined/empty slot values", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: null,
      notes: undefined,
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/peso?kg=12.5");
  });

  it("ignores slot keys not declared in prefillSlots", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      // biome-ignore lint/suspicious/noExplicitAny: testing the slot ignore path
      ...({ randomKey: "should not appear" } as any),
    });
    expect(url).not.toContain("randomKey");
  });

  it("empty-prefillSlots event types still produce a bare URL", () => {
    const url = buildCaptureDeeplink("incident_reported" as EventType, "DIM-XXXX-YY", {
      // biome-ignore lint/suspicious/noExplicitAny: empty-prefillSlots path
      ...({ anything: "ignored" } as any),
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/mordedura");
  });
});
