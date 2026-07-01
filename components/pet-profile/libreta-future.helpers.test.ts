import { describe, expect, it } from "vitest";
import { mergeFutureLedger } from "./libreta-future.helpers";

describe("mergeFutureLedger", () => {
  it("interleaves reminders, appointments, and doses ascending by dueAt", () => {
    const result = mergeFutureLedger(
      [
        {
          reminderId: "r1",
          title: "Antiparasitario",
          dueAt: new Date("2026-08-10"),
          variant: "upcoming",
        },
      ],
      [
        {
          publicToken: "apt1",
          offeringDisplayName: "Control clínico",
          slotStartsAt: new Date("2026-08-05"),
        },
      ],
      [{ reminderId: "m1", drugName: "Amoxicilina", dueAt: new Date("2026-08-01") }],
    );

    expect(result.map((r) => r.id)).toEqual(["med-m1", "appt-apt1", "reminder-r1"]);
  });

  it("keeps ties stable — original append order (reminders, appointments, doses)", () => {
    const sameDate = new Date("2026-08-01T10:00:00Z");
    const result = mergeFutureLedger(
      [{ reminderId: "r1", title: "Antiparasitario", dueAt: sameDate, variant: "upcoming" }],
      [{ publicToken: "apt1", offeringDisplayName: "Control clínico", slotStartsAt: sameDate }],
      [{ reminderId: "m1", drugName: "Amoxicilina", dueAt: sameDate }],
    );

    expect(result.map((r) => r.id)).toEqual(["reminder-r1", "appt-apt1", "med-m1"]);
  });

  it("returns an empty array when all sources are empty", () => {
    expect(mergeFutureLedger([], [], [])).toEqual([]);
  });

  it("a due rabies reminder row carries the programar-turno action", () => {
    const [item] = mergeFutureLedger(
      [
        {
          reminderId: "r1",
          title: "Vacuna antirrábica",
          dueAt: new Date("2026-08-01"),
          variant: "due_soon",
        },
      ],
      [],
      [],
    );
    expect(item?.action).toEqual({ type: "programar-turno" });
  });

  it("an overdue rabies reminder row carries the programar-turno action", () => {
    const [item] = mergeFutureLedger(
      [
        {
          reminderId: "r1",
          title: "Antirrábica",
          dueAt: new Date("2026-08-01"),
          variant: "overdue_critical",
        },
      ],
      [],
      [],
    );
    expect(item?.action).toEqual({ type: "programar-turno" });
  });

  it("a non-due rabies reminder row does not carry the programar-turno action", () => {
    const [item] = mergeFutureLedger(
      [
        {
          reminderId: "r1",
          title: "Vacuna antirrábica",
          dueAt: new Date("2026-08-01"),
          variant: "upcoming",
        },
      ],
      [],
      [],
    );
    expect(item?.action).toBeUndefined();
  });

  it("a non-rabies reminder never carries the programar-turno action", () => {
    const [item] = mergeFutureLedger(
      [
        {
          reminderId: "r1",
          title: "Antiparasitario",
          dueAt: new Date("2026-08-01"),
          variant: "overdue",
        },
      ],
      [],
      [],
    );
    expect(item?.action).toBeUndefined();
  });

  it("medication doses carry a mark-dose action", () => {
    const [item] = mergeFutureLedger(
      [],
      [],
      [{ reminderId: "m1", drugName: "Amoxicilina", dueAt: new Date("2026-08-01") }],
    );
    expect(item?.action).toEqual({ type: "mark-dose", reminderId: "m1" });
  });

  it("appointments carry a reschedule action", () => {
    const [item] = mergeFutureLedger(
      [],
      [
        {
          publicToken: "apt1",
          offeringDisplayName: "Control",
          slotStartsAt: new Date("2026-08-01"),
        },
      ],
      [],
    );
    expect(item?.action).toEqual({ type: "reschedule", href: "/mis-turnos/apt1" });
  });
});
