import { describe, expect, it } from "vitest";
import type { FutureLedgerItem } from "./libreta-future.helpers";
import { futureItemMatchesLens, pastEventMatchesLens } from "./libreta-lens";

describe("pastEventMatchesLens", () => {
  it("todo matches every event type", () => {
    expect(pastEventMatchesLens("note_added", "todo")).toBe(true);
    expect(pastEventMatchesLens("vaccination_administered", "todo")).toBe(true);
    expect(pastEventMatchesLens("status_changed", "todo")).toBe(true);
  });

  it("vacunas matches only vaccination_administered", () => {
    expect(pastEventMatchesLens("vaccination_administered", "vacunas")).toBe(true);
    expect(pastEventMatchesLens("deworming_administered", "vacunas")).toBe(false);
    expect(pastEventMatchesLens("weight_recorded", "vacunas")).toBe(false);
  });

  it("oficial matches the full LIBRETA_SANITARIA_EVENT_TYPES whitelist", () => {
    expect(pastEventMatchesLens("vaccination_administered", "oficial")).toBe(true);
    expect(pastEventMatchesLens("sterilization_performed", "oficial")).toBe(true);
    expect(pastEventMatchesLens("weight_recorded", "oficial")).toBe(true);
    // Non-libreta types (identity/admin/custody) must NOT pass.
    expect(pastEventMatchesLens("note_added", "oficial")).toBe(false);
    expect(pastEventMatchesLens("status_changed", "oficial")).toBe(false);
    expect(pastEventMatchesLens("custody_transferred", "oficial")).toBe(false);
  });
});

describe("futureItemMatchesLens", () => {
  const reminderItem: FutureLedgerItem = {
    id: "reminder-1",
    kind: "reminder",
    label: "Antirrábica",
    dueAt: new Date("2026-08-01"),
  };
  const medicationItem: FutureLedgerItem = {
    id: "med-1",
    kind: "medication",
    label: "Amoxicilina",
    dueAt: new Date("2026-08-01"),
  };
  const appointmentItem: FutureLedgerItem = {
    id: "appt-1",
    kind: "appointment",
    label: "Control clínico",
    dueAt: new Date("2026-08-01"),
  };

  it("todo matches every kind", () => {
    expect(futureItemMatchesLens(reminderItem, "todo")).toBe(true);
    expect(futureItemMatchesLens(medicationItem, "todo")).toBe(true);
    expect(futureItemMatchesLens(appointmentItem, "todo")).toBe(true);
  });

  it("vacunas matches reminders only (always vaccine-type)", () => {
    expect(futureItemMatchesLens(reminderItem, "vacunas")).toBe(true);
    expect(futureItemMatchesLens(medicationItem, "vacunas")).toBe(false);
    expect(futureItemMatchesLens(appointmentItem, "vacunas")).toBe(false);
  });

  it("oficial matches every kind", () => {
    expect(futureItemMatchesLens(reminderItem, "oficial")).toBe(true);
    expect(futureItemMatchesLens(medicationItem, "oficial")).toBe(true);
    expect(futureItemMatchesLens(appointmentItem, "oficial")).toBe(true);
  });
});
