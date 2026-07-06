import { describe, expect, it } from "vitest";

import {
  type ComplianceEvent,
  type ComplianceInput,
  deriveComplianceState,
  lnPetStatusFromCompliance,
  microchipHeroTag,
} from "@/lib/projections/pet-compliance";

const NOW = new Date("2026-07-01T12:00:00Z");

// Provenance presets (H1): only professional/institutional events clear an
// obligation. VET → professional_verified; SELF (owner) → self_reported.
const VET = { authorRole: "vet", authorVerified: true, authorOrganizationId: null };
const SELF = { authorRole: "owner", authorVerified: false, authorOrganizationId: null };
// VET-role trust keystone (#43): an org member WITHOUT a validated matrícula →
// org_registered. A valid record, but NOT professional-verified — it must NOT
// clear the "al día" gate (closes the "verificado por profesional" theater #45).
const ORG = { authorRole: "shelter", authorVerified: false, authorOrganizationId: "org-1" };

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

function vaccination(
  vaccineName: string,
  nextDueAt: string | null,
  prov: Partial<ComplianceEvent> = SELF,
): ComplianceEvent {
  return {
    eventType: "vaccination_administered",
    occurredAt: "2026-01-01T00:00:00Z",
    payload: { vaccine_name: vaccineName, next_due_at: nextDueAt },
    ...prov,
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
  // A verified rabies dose so the "Vigente" (ok) branch is backed (H1).
  const verifiedDose = vaccination("Antirrábica", "2026-08-01T00:00:00Z", VET);

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

  it("maps reminder variants to Vigente / Por vencer / Vencida (dose verified)", () => {
    const cases: Array<[ComplianceInput["rabiesReminder"], string, string]> = [
      [{ variant: "upcoming", dueAt }, "Vigente", "ok"],
      [{ variant: "success", dueAt }, "Vigente", "ok"],
      [{ variant: "due_soon", dueAt }, "Por vencer", "due"],
      [{ variant: "overdue", dueAt }, "Vencida", "over"],
      [{ variant: "overdue_critical", dueAt }, "Vencida", "over"],
    ];
    for (const [reminder, expectedState, expectedTone] of cases) {
      const state = deriveComplianceState(
        baseInput({ rabiesReminder: reminder, events: [verifiedDose] }),
      );
      const rabies = state.cards.find((c) => c.key === "rabies");
      expect(rabies?.state, `variant ${reminder?.variant}`).toBe(expectedState);
      expect(rabies?.tone, `variant ${reminder?.variant}`).toBe(expectedTone);
    }
  });

  it("falls back to the latest rabies vaccination event when there is no reminder", () => {
    // Overdue (past next_due) is not gated by provenance — it already signals "not met".
    const past = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2026-01-01T00:00:00Z", VET)] }),
    );
    expect(past.cards.find((c) => c.key === "rabies")?.tone).toBe("over");

    // Future next_due with a verified dose → Vigente.
    const future = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", VET)] }),
    );
    expect(future.cards.find((c) => c.key === "rabies")?.tone).toBe("ok");
  });

  it("ignores non-rabies vaccines in the events fallback", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Quíntuple", "2026-01-01T00:00:00Z", VET)] }),
    );
    expect(state.cards.find((c) => c.key === "rabies")?.state).toBe("Sin registro");
  });

  it("reports 'Sin registro' when nothing is known", () => {
    const state = deriveComplianceState(baseInput());
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Sin registro");
    expect(rabies?.tone).toBe("neutral");
  });

  // UX gate M5a: a recorded antirrábica dose with no next_due_at must NOT read
  // "Sin registro" — that contradicts the libreta asiento the owner can see.
  it("self-reported rabies dose without next_due_at → 'Declarada · sin verificar', never 'Sin registro'", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, SELF)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Declarada · sin verificar");
    expect(rabies?.tone).toBe("neutral");
    expect(rabies?.detail).toBeTruthy();
  });

  it("vet-verified rabies dose without next_due_at → 'Registrada' (ok), never 'Sin registro'", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, VET)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Registrada");
    expect(rabies?.tone).toBe("ok");
  });
});

// H1 — provenance gates compliance: only professional/institutional events clear.
describe("deriveComplianceState — H1 provenance gate", () => {
  it("self-reported sterilization → 'Declarada · sin verificar', not counted", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...SELF }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Declarada · sin verificar");
    expect(card?.tone).toBe("neutral");
    expect(card?.hint).toBeTruthy();
    expect(state.summary.ok).toBe(0);
  });

  it("org-registered sterilization (no matrícula) → 'Declarada · sin verificar', NOT counted (#43)", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...ORG }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Declarada · sin verificar");
    expect(card?.tone).toBe("neutral");
    expect(state.summary.ok).toBe(0);
  });

  it("org-registered rabies dose (no matrícula) → not 'Vigente' (does not satisfy the gate) (#43)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", ORG)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Declarada · sin verificar");
    expect(card?.tone).toBe("neutral");
  });

  it("vet-verified sterilization → 'Registrada' (ok), counted", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Registrada");
    expect(card?.tone).toBe("ok");
    expect(state.summary.ok).toBe(1);
  });

  it("rabies currency from a self-reported dose → 'Declarada · sin verificar' (not Vigente)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", SELF)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Declarada · sin verificar");
    expect(card?.tone).toBe("neutral");
    // Keeps the due-date detail even when downgraded.
    expect(card?.detail).toBeTruthy();
  });

  it("rabies currency from a professional_verified dose → 'Vigente' (ok)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", VET)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Vigente");
    expect(card?.tone).toBe("ok");
  });

  it("microchip code present but implant self-reported → 'Declarada · sin verificar'", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipCode: "982000123456789",
        events: [{ eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...SELF }],
      }),
    );
    const card = state.cards.find((c) => c.key === "microchip");
    expect(card?.state).toBe("Declarada · sin verificar");
    expect(card?.tone).toBe("neutral");
    expect(card?.detail).toBe("982000123456789");
  });
});

describe("deriveComplianceState — sterilization, microchip, PPP", () => {
  it("sterilization: verified event → ok, none → neutral", () => {
    const without = deriveComplianceState(baseInput());
    expect(without.cards.find((c) => c.key === "sterilization")?.tone).toBe("neutral");

    const withEvent = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    expect(withEvent.cards.find((c) => c.key === "sterilization")?.tone).toBe("ok");
  });

  it("microchip: verified implant → ok with the code detail", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipCode: "982000123456789",
        events: [{ eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.tone).toBe("ok");
    expect(chip?.detail).toBe("982000123456789");
  });

  it("microchip: code alone with no implant event → declared, not verified", () => {
    const state = deriveComplianceState(baseInput({ microchipCode: "982000123456789" }));
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.tone).toBe("neutral");
    expect(chip?.state).toBe("Declarada · sin verificar");
  });

  it("microchip: no code and no event → 'Sin registro'", () => {
    const state = deriveComplianceState(baseInput());
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.tone).toBe("neutral");
    expect(chip?.state).toBe("Sin registro");
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

// PPP indeterminado (2026-07-04): a DOG missing breed and/or weight surfaces the
// obligation instead of hiding it. Strong-but-optional — alta is never blocked.
describe("deriveComplianceState — PPP indeterminado (dog missing breed/weight)", () => {
  it("dog missing both breed and weight → 'Faltan datos' (due), with a nudge", () => {
    const state = deriveComplianceState(baseInput({ species: "dog" }));
    const ppp = state.cards.find((c) => c.key === "ppp");
    expect(ppp?.state).toBe("Faltan datos");
    expect(ppp?.tone).toBe("due");
    expect(ppp?.hint).toContain("raza y el peso");
    // It counts against "al día" — never silently satisfied.
    expect(state.summary.total).toBe(4);
    expect(state.summary.ok).toBe(0);
  });

  it("dog with a breed but no weight → still indeterminado", () => {
    const state = deriveComplianceState(baseInput({ species: "dog", breed: "Beagle" }));
    expect(state.cards.find((c) => c.key === "ppp")?.state).toBe("Faltan datos");
  });

  it("dog with a weight but no breed → still indeterminado", () => {
    const state = deriveComplianceState(baseInput({ species: "dog", estimatedWeightKg: "12.5" }));
    expect(state.cards.find((c) => c.key === "ppp")?.state).toBe("Faltan datos");
  });

  it("blank breed and zero weight are treated as missing", () => {
    const state = deriveComplianceState(
      baseInput({ species: "dog", breed: "   ", estimatedWeightKg: 0 }),
    );
    expect(state.cards.find((c) => c.key === "ppp")?.tone).toBe("due");
  });

  it("dog with breed AND weight but not flagged PPP → no PPP card (genuinely non-PPP)", () => {
    const state = deriveComplianceState(
      baseInput({ species: "dog", breed: "Beagle", estimatedWeightKg: 12, pppApplies: false }),
    );
    expect(state.cards.some((c) => c.key === "ppp")).toBe(false);
    expect(state.summary.total).toBe(3);
  });

  it("dog with a PPP breed (flagged) → attestation card, even if weight is absent", () => {
    const state = deriveComplianceState(
      baseInput({ species: "dog", breed: "Dogo Argentino", pppApplies: true }),
    );
    const ppp = state.cards.find((c) => c.key === "ppp");
    expect(ppp?.label).toBe("Atestación PPP");
    expect(ppp?.state).toBe("Atestación requerida");
    expect(ppp?.tone).toBe("due");
  });

  it("cat is never PPP — no card regardless of missing breed/weight", () => {
    const state = deriveComplianceState(baseInput({ species: "cat" }));
    expect(state.cards.some((c) => c.key === "ppp")).toBe(false);
  });

  it("other species (rabbit) is never PPP — no card", () => {
    const state = deriveComplianceState(baseInput({ species: "rabbit" }));
    expect(state.cards.some((c) => c.key === "ppp")).toBe(false);
  });
});

describe("deriveComplianceState — ordering + summary", () => {
  it("orders cards worst-state first", () => {
    const state = deriveComplianceState(
      baseInput({
        rabiesReminder: { variant: "overdue", dueAt: new Date("2026-06-01T00:00:00Z") },
        microchipCode: "982000123456789",
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    // Rabies (over) must be first.
    expect(state.cards[0].key).toBe("rabies");
    expect(state.cards[0].tone).toBe("over");
  });

  it("summarizes how many obligations are al día (verified only)", () => {
    const state = deriveComplianceState(
      baseInput({
        rabiesReminder: { variant: "upcoming", dueAt: new Date("2026-08-01T00:00:00Z") },
        events: [
          vaccination("Antirrábica", "2026-08-01T00:00:00Z", VET), // backs Vigente → ok
          { eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...VET }, // ok
        ],
        microchipCode: "982000123456789",
        // sterilization missing → neutral
      }),
    );
    expect(state.summary).toEqual({ total: 3, ok: 2, label: "2 de 3 al día" });
    expect(state.worstTone).toBe("neutral");
  });
});

describe("microchipHeroTag — hero tag agrees with the compliance card (H1 display contradiction fix)", () => {
  it("verified implant → 'Microchip verificado', same tier that flips the card to ok", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipCode: "982000123456789",
        events: [{ eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    expect(state.cards.find((c) => c.key === "microchip")?.tone).toBe("ok");
    expect(microchipHeroTag(state)).toBe("Microchip verificado");
  });

  it("self-reported code/event → 'Microchip declarado', never 'verificado' (the exact bug: hero said verificado while the card said Declarada · sin verificar)", () => {
    const state = deriveComplianceState(baseInput({ microchipCode: "982000123456789" }));
    expect(state.cards.find((c) => c.key === "microchip")?.state).toBe("Declarada · sin verificar");
    expect(microchipHeroTag(state)).toBe("Microchip declarado");
  });

  it("no code and no event → no hero tag at all (matches the card's 'Sin registro')", () => {
    const state = deriveComplianceState(baseInput());
    expect(state.cards.find((c) => c.key === "microchip")?.state).toBe("Sin registro");
    expect(microchipHeroTag(state)).toBeNull();
  });
});

describe("lnPetStatusFromCompliance — the single chip mapper (QA round 2 #4)", () => {
  const notCompliant = deriveComplianceState(baseInput()); // 0 de 3 al día
  const fullyCompliant = deriveComplianceState(
    baseInput({
      rabiesReminder: { variant: "upcoming", dueAt: new Date("2026-08-01T00:00:00Z") },
      events: [
        vaccination("Antirrábica", "2026-08-01T00:00:00Z", VET),
        { eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...VET },
        { eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET },
      ],
    }),
  );

  it("a fresh 0/3 pet is registered, never ok (AL DÍA)", () => {
    expect(
      lnPetStatusFromCompliance({ status: "active", pregnancyStatus: null }, notCompliant),
    ).toBe("registered");
  });

  it("only full verified compliance earns ok", () => {
    expect(fullyCompliant.summary.ok).toBe(fullyCompliant.summary.total);
    expect(
      lnPetStatusFromCompliance({ status: "active", pregnancyStatus: null }, fullyCompliant),
    ).toBe("ok");
  });

  it("lost and pregnancy override compliance", () => {
    expect(
      lnPetStatusFromCompliance({ status: "lost", pregnancyStatus: null }, fullyCompliant),
    ).toBe("lost");
    expect(
      lnPetStatusFromCompliance(
        { status: "active", pregnancyStatus: "in_progress" },
        fullyCompliant,
      ),
    ).toBe("pregnant");
  });
});
