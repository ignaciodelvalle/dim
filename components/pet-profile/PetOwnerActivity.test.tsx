// Structure tests for PetOwnerActivity (owner-ia-redesign P3) — the pet's own
// reminders / turnos / open cycles rendered inside its profile. Owner-only
// gating itself lives at the page (isOwner &&); this asserts the section
// structure and the render-nothing-when-empty contract.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  ActiveReminderRow,
  UpcomingAppointment,
  WorkflowItem,
} from "@/lib/analytics/owner-dashboard";
import { PetOwnerActivity } from "./PetOwnerActivity";

function reminder(overrides: Partial<ActiveReminderRow> = {}): ActiveReminderRow {
  return {
    reminderId: "r1",
    petId: "p1",
    petName: "Pampa",
    petToken: "DIM-AAAA-BBBB",
    petSpecies: "dog",
    title: "Antirrábica",
    dueAt: new Date("2026-08-01T12:00:00Z"),
    daysUntilDue: 10,
    variant: "due_soon",
    isReportable: true,
    ...overrides,
  };
}

function appointment(overrides: Partial<UpcomingAppointment> = {}): UpcomingAppointment {
  return {
    appointment: { publicToken: "APT-1", status: "confirmed" },
    slot: { startsAt: new Date("2026-08-05T14:00:00Z") },
    offering: {
      displayName: "Vacunación antirrábica",
      serviceKind: "vaccination_rabies",
      organizationId: null,
    },
    pet: { name: "Pampa" },
    org: null,
    provider: null,
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    id: "wf1",
    kind: "case_generic_open",
    title: "Caso ABC-123",
    subtitle: "Procedimiento en curso",
    ctaUrl: "/casos/ABC-123",
    since: new Date("2026-07-01T00:00:00Z"),
    severity: "info",
    ...overrides,
  };
}

describe("PetOwnerActivity", () => {
  it("renders nothing when the pet has no reminders, turnos, or open cycles", () => {
    const html = renderToStaticMarkup(
      <PetOwnerActivity reminders={[]} appointments={[]} workflows={[]} />,
    );
    expect(html).toBe("");
  });

  it("renders the section wrapper plus all three sub-surfaces when data is present", () => {
    const html = renderToStaticMarkup(
      <PetOwnerActivity
        reminders={[reminder(), reminder({ reminderId: "r2", title: "Quíntuple" })]}
        appointments={[appointment()]}
        workflows={[workflow()]}
      />,
    );
    expect(html).toContain('data-section="pet-owner-activity"');
    // Reminders (2+ → list panel).
    expect(html).toContain("Recordatorios");
    // Turnos card + the appointment link.
    expect(html).toContain("Próximos turnos");
    expect(html).toContain("/mis-turnos/APT-1");
    expect(html).toContain("Vacunación antirrábica");
    // Open cycles card.
    expect(html).toContain("Ciclos abiertos");
    expect(html).toContain("Caso ABC-123");
  });

  it("shows only the turnos card when that is the pet's only activity", () => {
    const html = renderToStaticMarkup(
      <PetOwnerActivity reminders={[]} appointments={[appointment()]} workflows={[]} />,
    );
    expect(html).toContain('data-section="pet-owner-activity"');
    expect(html).toContain("Próximos turnos");
    expect(html).not.toContain("Ciclos abiertos");
  });
});
