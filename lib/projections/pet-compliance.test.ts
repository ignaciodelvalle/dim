import { describe, expect, it } from "vitest";

import {
  type ComplianceEvent,
  type ComplianceInput,
  deriveComplianceState,
} from "@/lib/projections/pet-compliance";

const NOW = new Date("2026-07-01T12:00:00Z");

function baseInput(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    now: NOW,
    events: [],
    rabiesReminder: null,
    reservedRabiesTurno: null,
    microchipCode: null,
    pppApplies: false,
    ...overrides,
  };
}

function vaccination(vaccineName: string, nextDueAt: string | null): ComplianceEvent {
  return {
    eventType: "vaccination_administered",
    occurredAt: "2026-01-01T00:00:00Z",
    payload: { vaccine_name: vaccineName, next_due_at: nextDueAt },
  };
}

describe("deriveComplianceState — card set + PPP gate", () => {
  it("always yields rabies, sterilization and microchip", () => {
    const { cards } = deriveComplianceState(baseInput());
    expect(cards.map((c) => c.key).sort()).toEqual(["microchip", "rabies", "sterilization"]);
  });

  it("omits the PPP card when the jurisdiction gate does not apply", () => {
    const { cards } = deriveComplianceState(baseInput({ pppApplies: false }));
    expect(cards.some((c) => c.key === "ppp")).toBe(false);
  });

  it("appends the PPP card when the gate applies", () => {
    const { cards } = deriveComplianceState(baseInput({ pppApplies: true }));
    expect(cards.some((c) => c.key === "ppp")).toBe(true);
  });
});

describe("deriveComplianceState — rabies state machine", () => {
  const dueAt = new Date("2026-08-01T00:00:00Z");

  it("reserved turno wins over everything else", () => {
    const state = deriveComplianceState(
      baseInput({
        rabiesReminder: { variant: "overdue", dueAt },
        reservedRabiesTurno: { date: new Date("2026-07-10T00:00:00Z"), provider: "Vet Palermo" },
      }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.tone).toBe("reserved");
    expect(rabies?.state).toBe("Turno reservado");
    expect(rabies?.detail).toContain("Vet Palermo");
  });

  it("reserved turno without a provider shows just the date", () => {
    const state = deriveComplianceState(
      baseInput({
        reservedRabiesTurno: { date: new Date("2026-07-10T00:00:00Z"), provider: null },
      }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.tone).toBe("reserved");
    expect(rabies?.detail).not.toContain("·");
  });

  it("maps reminder variants to Vigente / Por vencer / Vencida", () => {
    const cases: Array<[ComplianceInput["rabiesReminder"], string, string]> = [
      [{ variant: "upcoming", dueAt }, "Vigente", "ok"],
      [{ variant: "success", dueAt }, "Vigente", "ok"],
      [{ variant: "due_soon", dueAt }, "Por vencer", "due"],
      [{ variant: "overdue", dueAt }, "Vencida", "over"],
      [{ variant: "overdue_critical", dueAt }, "Vencida", "over"],
    ];
    for (const [reminder, expectedState, expectedTone] of cases) {
      const state = deriveComplianceState(baseInput({ rabiesReminder: reminder }));
      const rabies = state.cards.find((c) => c.key === "rabies");
      expect(rabies?.state, `variant ${reminder?.variant}`).toBe(expectedState);
      expect(rabies?.tone, `variant ${reminder?.variant}`).toBe(expectedTone);
    }
  });

  it("falls back to the latest rabies vaccination event when there is no reminder", () => {
    const past = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2026-01-01T00:00:00Z")] }),
    );
    expect(past.cards.find((c) => c.key === "rabies")?.tone).toBe("over");

    const future = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z")] }),
    );
    expect(future.cards.find((c) => c.key === "rabies")?.tone).toBe("ok");
  });

  it("ignores non-rabies vaccines in the events fallback", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Quíntuple", "2026-01-01T00:00:00Z")] }),
    );
    expect(state.cards.find((c) => c.key === "rabies")?.state).toBe("Sin registro");
  });

  it("reports 'Sin registro' when nothing is known", () => {
    const state = deriveComplianceState(baseInput());
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Sin registro");
    expect(rabies?.tone).toBe("neutral");
  });
});

describe("deriveComplianceState — sterilization, microchip, PPP", () => {
  it("sterilization reflects the presence of a sterilization_performed event", () => {
    const without = deriveComplianceState(baseInput());
    expect(without.cards.find((c) => c.key === "sterilization")?.tone).toBe("neutral");

    const withEvent = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {} }],
      }),
    );
    expect(withEvent.cards.find((c) => c.key === "sterilization")?.tone).toBe("ok");
  });

  it("microchip shows the code when present", () => {
    const state = deriveComplianceState(baseInput({ microchipCode: "982000123456789" }));
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.tone).toBe("ok");
    expect(chip?.detail).toBe("982000123456789");
  });

  it("PPP is 'Atestación requerida' (due) until a dangerous_breed_attested event exists", () => {
    const pending = deriveComplianceState(baseInput({ pppApplies: true }));
    expect(pending.cards.find((c) => c.key === "ppp")?.tone).toBe("due");

    const attested = deriveComplianceState(
      baseInput({
        pppApplies: true,
        events: [{ eventType: "dangerous_breed_attested", occurredAt: NOW, payload: {} }],
      }),
    );
    expect(attested.cards.find((c) => c.key === "ppp")?.tone).toBe("ok");
  });
});

describe("deriveComplianceState — ordering + summary", () => {
  it("orders cards worst-state first", () => {
    const state = deriveComplianceState(
      baseInput({
        rabiesReminder: { variant: "overdue", dueAt: new Date("2026-06-01T00:00:00Z") },
        microchipCode: "982000123456789", // ok
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {} }], // ok
      }),
    );
    // Rabies (over) must be first.
    expect(state.cards[0].key).toBe("rabies");
    expect(state.cards[0].tone).toBe("over");
  });

  it("summarizes how many obligations are al día", () => {
    const state = deriveComplianceState(
      baseInput({
        rabiesReminder: { variant: "upcoming", dueAt: new Date("2026-08-01T00:00:00Z") }, // ok
        microchipCode: "982000123456789", // ok
        // sterilization missing -> neutral
      }),
    );
    expect(state.summary).toEqual({ total: 3, ok: 2, label: "2 de 3 al día" });
    expect(state.worstTone).toBe("neutral");
  });
});
