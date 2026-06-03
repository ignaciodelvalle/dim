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
      // Routes are either absolute paths ("/eventos/nuevo/…") for full-page
      // forms or query-string shorthands ("?sheet=…") for SheetMounter sheets.
      const isAbsolutePath = entry.route.startsWith("/eventos/nuevo/");
      const isSheetRoute = entry.route.startsWith("?sheet=");
      expect(
        isAbsolutePath || isSheetRoute,
        `route for ${eventType} must be an /eventos/nuevo/ path or ?sheet= shorthand, got: ${entry.route}`,
      ).toBe(true);
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

  it("complex forms (incident, symptom, clinical) have empty prefillSlots", () => {
    const expectedEmpty: EventType[] = [
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

  it("medication_started forwards typed text via the EventCatcher chip handoff", () => {
    // medication_started carries notes + occurredAt so the medicacion chip
    // can preserve typed text from the home EventCatcher into the form.
    // See docs/eventcatcher-fixes-plan-2026-05-20.md PR 1.
    const entry = EVENT_CAPTURE_REGISTRY.medication_started;
    expect(entry?.prefillSlots).toEqual(["notes", "occurredAt"]);
  });
});

describe("buildCaptureDeeplink", () => {
  it("returns null for an event_type with no registry entry", () => {
    expect(buildCaptureDeeplink("pet_profile_updated" as EventType, "DIM-XXXX-YY")).toBeNull();
  });

  it("builds a sheet URL for weight_recorded (migrated to ?sheet=peso)", () => {
    expect(buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY")).toBe(
      "/mis-mascotas/DIM-XXXX-YY?sheet=peso",
    );
  });

  it("builds a full-page URL for a still-live route (vaccination_administered)", () => {
    expect(buildCaptureDeeplink("vaccination_administered" as EventType, "DIM-XXXX-YY")).toBe(
      "/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/vacuna",
    );
  });

  it("appends slot params after the sheet key for sheet routes", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("sheet=peso");
    expect(url).toContain("kg=12.5");
    expect(url).toContain("occurredAt=2026-05-10");
  });

  it("appends slot params as query string for full-page routes", () => {
    const url = buildCaptureDeeplink("vaccination_administered" as EventType, "DIM-XXXX-YY", {
      vaccineName: "Antirrábica",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("vaccineName=Antirr%C3%A1bica");
    expect(url).toContain("occurredAt=2026-05-10");
    expect(url).toMatch(/^\/mis-mascotas\/DIM-XXXX-YY\/eventos\/nuevo\/vacuna\?/);
  });

  it("skips null/undefined/empty slot values — sheet route", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      occurredAt: null,
      notes: undefined,
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY?sheet=peso&kg=12.5");
  });

  it("ignores slot keys not declared in prefillSlots", () => {
    const url = buildCaptureDeeplink("weight_recorded" as EventType, "DIM-XXXX-YY", {
      kg: "12.5",
      ...({ randomKey: "should not appear" } as Record<string, string>),
    });
    expect(url).not.toContain("randomKey");
  });

  it("empty-prefillSlots event types still produce a bare URL — full-page route", () => {
    const url = buildCaptureDeeplink("incident_reported" as EventType, "DIM-XXXX-YY", {
      ...({ anything: "ignored" } as Record<string, string>),
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY/eventos/nuevo/mordedura");
  });

  it("empty-prefillSlots event types produce a bare sheet URL — sheet route", () => {
    const url = buildCaptureDeeplink("symptom_observed" as EventType, "DIM-XXXX-YY", {
      ...({ anything: "ignored" } as Record<string, string>),
    });
    expect(url).toBe("/mis-mascotas/DIM-XXXX-YY?sheet=sintoma");
  });

  it("note_added produces a sheet URL with text and occurredAt slots", () => {
    const url = buildCaptureDeeplink("note_added" as EventType, "DIM-XXXX-YY", {
      text: "Mi nota",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("sheet=nota");
    expect(url).toContain("text=Mi+nota");
    expect(url).toContain("occurredAt=2026-05-10");
  });

  it("medication_started produces a sheet URL with notes and occurredAt slots", () => {
    const url = buildCaptureDeeplink("medication_started" as EventType, "DIM-XXXX-YY", {
      notes: "Amoxicilina",
      occurredAt: "2026-05-10",
    });
    expect(url).toContain("sheet=medicacion");
    expect(url).toContain("notes=Amoxicilina");
    expect(url).toContain("occurredAt=2026-05-10");
  });
});
