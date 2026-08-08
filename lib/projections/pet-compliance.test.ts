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
// The owner-declared fixture names its AUTHOR, and baseInput names the READER.
// Before 2026-08-01 it said only `authorRole: "owner"` and no reader existed at
// all, so "cargada por vos" was true by construction for every viewer — which
// is precisely how a transferred pet's dose came to greet the new titular as
// her own work.
const OWNER_USER = "user-owner";
const SELF = {
  authorRole: "owner",
  authorVerified: false,
  authorOrganizationId: null,
  recordedByUserId: OWNER_USER,
};
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
    viewerUserId: OWNER_USER,
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
  // task #78 Part 1 / #4: a declared rabies dose is now a DUAL honest card — not
  // a single flat badge. The badge is provenance-forward ("Declarada"), tone
  // neutral (not al-día), and it carries a dual block: what the owner HAS +
  // what the registry NEEDS.
  it("self-reported rabies dose without next_due_at → dual 'Declarada' card, never 'Sin registro'", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, SELF)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Declarada");
    expect(rabies?.tone).toBe("neutral");
    expect(rabies?.detail).toBeTruthy();
    expect(rabies?.dual?.ownerLabel).toContain("cargada por vos");
    // Currency unknown (no next_due_at) → no currency chip.
    expect(rabies?.dual?.currencyLabel).toBeNull();
    expect(rabies?.dual?.registryLine).toBeTruthy();
  });

  it("vet-verified rabies dose without next_due_at → 'Registrada' (ok), never 'Sin registro'", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, VET)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.state).toBe("Registrada");
    expect(rabies?.tone).toBe("ok");
  });

  // C5/#1 (external design review, reproduced live): a dose on record with no
  // next_due_at has UNKNOWN currency. The projection already knew that
  // internally; the card did not carry it, so the panel stamped "VIGENTE" over
  // it and the summary counted it as "al día". Both are the project's own
  // stated rule inverted — "'no sabemos' nunca se sella VIGENTE"
  // (LibretaSanitariaView.tsx:127-132, which is why the "SIN DATO" vstamp
  // exists at all).
  it("a dose with no next_due_at reports its currency as UNKNOWN on the card", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, VET)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.currencyKnown).toBe(false);
  });

  it("a dose with a real next_due_at reports its currency as KNOWN", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", VET)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    expect(rabies?.currencyKnown).toBe(true);
  });

  it("does NOT count an unknown-currency dose as 'al día' in the summary", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", null, VET)] }),
    );
    const rabies = state.cards.find((c) => c.key === "rabies");
    // The card still reads "Registrada" — the libreta shows a real asiento and
    // this must never regress to "Sin registro" (UX gate M5a, pinned above).
    expect(rabies?.state).toBe("Registrada");
    // But "registered" is not "current": counting it would make the panel say
    // "N de N al día" beside a card stamped SIN DATO.
    expect(state.summary.ok).toBe(0);
  });
});

// H1 — provenance gates compliance: only professional/institutional events clear.
describe("deriveComplianceState — H1 provenance gate", () => {
  it("self-reported sterilization → 'Declarada', not counted", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...SELF }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Declarada");
    expect(card?.tone).toBe("neutral");
    expect(card?.hint).toBeTruthy();
    expect(state.summary.ok).toBe(0);
  });

  it("org-registered sterilization (no matrícula) → 'Declarada', NOT counted (#43)", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...ORG }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Declarada");
    expect(card?.tone).toBe("neutral");
    expect(state.summary.ok).toBe(0);
  });

  it("org-registered rabies dose (no matrícula) → not 'Vigente' (does not satisfy the gate) (#43)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", ORG)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    // Dual card (declarado tier), NOT counted. An org RECORD is not "cargada por
    // vos" — the dual line says "registrada sin firma de matrícula".
    expect(card?.state).toBe("Declarada");
    expect(card?.tone).toBe("neutral");
    expect(card?.dual?.ownerLabel).toContain("sin firma");
    // Currency IS known (future next_due) → shows the "Vigente" chip.
    expect(card?.dual?.currencyLabel).toBe("Vigente");
    expect(card?.dual?.currencyTone).toBe("ok");
    expect(state.summary.ok).toBe(0);
  });

  it("vet-verified sterilization → 'Verificada' (ok), counted", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Verificada");
    expect(card?.tone).toBe("ok");
    expect(state.summary.ok).toBe(1);
  });

  // Seal/footnote agreement: a declared (unverified) sterilization must NEVER
  // carry a footnote claiming the event is "verificado" — the seal reads
  // "Declarada", so a "Evento verificado en la libreta" footer
  // is a direct self-contradiction (adversarial-citizen 2026-07-06).
  it("self-reported sterilization footnote never claims 'verificado'", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...SELF }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Declarada");
    expect(card?.legalFootnote).not.toMatch(/verificad/i);
    expect(card?.legalFootnote).toBe("Declarado por el titular, sin verificación profesional");
  });

  it("vet-verified sterilization footnote says 'verificado en la libreta'", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [{ eventType: "sterilization_performed", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Verificada");
    expect(card?.legalFootnote).toBe("Evento verificado en la libreta");
  });

  it("sterilization with no record has a footnote that does not claim 'verificado'", () => {
    const state = deriveComplianceState(baseInput());
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Sin registro");
    expect(card?.legalFootnote).not.toMatch(/verificad/i);
  });

  it("rabies currency from a self-reported dose → dual 'Declarada' card (not Vigente), keeps currency", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", SELF)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Declarada");
    expect(card?.tone).toBe("neutral");
    // Dual: the owner's dose IS vigente (currency lens) even though it does not
    // count as "al día" (compliance lens) — both truths surfaced at once (#4).
    expect(card?.dual?.currencyLabel).toBe("Vigente");
    expect(card?.dual?.ownerLabel).toContain("cargada por vos");
  });

  it("a dose declared by a PREVIOUS titular is never 'cargada por vos' for the new one", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", SELF)],
        viewerUserId: "user-someone-else",
      }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.dual?.ownerLabel).not.toContain("vos");
    expect(card?.dual?.ownerLabel).toBe("Antirrábica cargada por el titular");
    // Only the authorship claim moves — the dose is still declared, still
    // vigente, and still needs a matrícula.
    expect(card?.dual?.currencyLabel).toBe("Vigente");
    expect(card?.state).toBe("Declarada");
    // Keeps the due-date detail.
    expect(card?.detail).toBeTruthy();
  });

  it("declared rabies dose that is EXPIRED keeps its 'Vencida' urgency (provenance never hides an expiry)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2026-01-01T00:00:00Z", SELF)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Vencida");
    expect(card?.tone).toBe("over");
    expect(card?.dual?.currencyLabel).toBe("Vencida");
    expect(card?.dual?.currencyTone).toBe("over");
  });

  it("a vet-signed vigente rabies dose reads 'Vigente' (ok), no dual block", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", VET)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Vigente");
    expect(card?.tone).toBe("ok");
    expect(card?.dual).toBeUndefined();
  });

  it("rabies currency from a professional_verified dose → 'Vigente' (ok)", () => {
    const state = deriveComplianceState(
      baseInput({ events: [vaccination("Antirrábica", "2027-01-01T00:00:00Z", VET)] }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Vigente");
    expect(card?.tone).toBe("ok");
  });

  it("microchip code present but implant self-reported → 'Declarado'", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipCode: "982000123456789",
        events: [{ eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...SELF }],
      }),
    );
    const card = state.cards.find((c) => c.key === "microchip");
    expect(card?.state).toBe("Declarado");
    expect(card?.tone).toBe("neutral");
    expect(card?.detail).toBe("982000123456789");
  });

  // PJ-H1: best-provenance selection, not earliest. Events arrive ascending, so
  // an early owner-declared event used to mask a later vet-VERIFIED one (`find`
  // returned the oldest), leaving the pet non-compliant despite a signed record.
  it("earlier owner-declared THEN later vet-verified sterilization → 'Verificada' (ok), counted", () => {
    const state = deriveComplianceState(
      baseInput({
        events: [
          {
            eventType: "sterilization_performed",
            occurredAt: "2026-01-01T00:00:00Z",
            payload: {},
            ...SELF,
          },
          {
            eventType: "sterilization_performed",
            occurredAt: "2026-06-01T00:00:00Z",
            payload: {},
            ...VET,
          },
        ],
      }),
    );
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.state).toBe("Verificada");
    expect(card?.tone).toBe("ok");
    expect(card?.legalFootnote).toBe("Evento verificado en la libreta");
    expect(state.summary.ok).toBeGreaterThanOrEqual(1);
  });

  it("earlier owner-declared THEN later vet-verified microchip implant → 'Verificado' (ok), counted", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipCode: "982000123456789",
        events: [
          {
            eventType: "microchip_implanted",
            occurredAt: "2026-01-01T00:00:00Z",
            payload: {},
            ...SELF,
          },
          {
            eventType: "microchip_implanted",
            occurredAt: "2026-06-01T00:00:00Z",
            payload: {},
            ...VET,
          },
        ],
      }),
    );
    const card = state.cards.find((c) => c.key === "microchip");
    expect(card?.state).toBe("Verificado");
    expect(card?.tone).toBe("ok");
  });
});

describe("deriveComplianceState — PJ-M3 timezone boundary on rabies expiry", () => {
  // A date-only next_due_at ("2026-08-01") is midnight UTC = 2026-07-31 21:00 AR.
  // `now` is 2026-08-01T01:00:00Z = 2026-07-31 22:00 AR — the AR due day (Aug 1)
  // has NOT arrived yet. Pre-fix (`new Date(nextDue)`) reads midnight-UTC <= now
  // → Vencida a day early; anchoring at noon UTC keeps it Vigente.
  it("date-only next_due_at is not read Vencida before the AR due day", () => {
    const now = new Date("2026-08-01T01:00:00Z");
    const state = deriveComplianceState(
      baseInput({
        now,
        events: [vaccination("Antirrábica", "2026-08-01", VET)],
      }),
    );
    const card = state.cards.find((c) => c.key === "rabies");
    expect(card?.state).toBe("Vigente");
    expect(card?.tone).toBe("ok");
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
    expect(chip?.state).toBe("Declarado");
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

  it("marks the card dataUnknown so no summary stamp says 'por vencer' over it", () => {
    // S2-F06 (2026-08-08): the tone is `due` on purpose — it ranks the card
    // first and keeps it out of the "al día" count — but the credential stamp
    // rendered `due`'s word and told the reader something was expiring on a pet
    // that has no dates at all. The tone ranks; dataUnknown says what KIND.
    const state = deriveComplianceState(baseInput({ species: "dog" }));
    expect(state.cards.find((c) => c.key === "ppp")?.dataUnknown).toBe(true);
    expect(state.worstTone).toBe("due");
    expect(state.worstIsUnknown).toBe(true);
  });

  it("stops being the unknown case as soon as something genuinely dated outranks it", () => {
    // Non-vacuity in the direction that matters: worstIsUnknown must not become
    // a permanent flag on every dog. An overdue rabies dose sorts ahead of the
    // PPP card, and the stamp has to go back to speaking about time.
    const state = deriveComplianceState(
      baseInput({
        species: "dog",
        events: [vaccination("Antirrábica", "2026-01-01T00:00:00Z", VET)],
      }),
    );
    expect(state.worstTone).toBe("over");
    expect(state.worstIsUnknown).toBe(false);
  });

  it("dog with a breed but no weight → hint names ONLY the weight, never the breed (C1)", () => {
    // Adversarial-citizen C1 (2026-07-06): a Boxer (breed visible in the header)
    // with no weight must NOT read "completá la raza" — that contradicts the
    // shown breed. The seal names exactly what's missing: the weight.
    const state = deriveComplianceState(baseInput({ species: "dog", breed: "Boxer" }));
    const ppp = state.cards.find((c) => c.key === "ppp");
    expect(ppp?.state).toBe("Faltan datos");
    expect(ppp?.hint).toContain("el peso");
    expect(ppp?.hint).not.toContain("la raza");
  });

  it("dog with a weight but no breed → hint names ONLY the breed, never the weight", () => {
    const state = deriveComplianceState(baseInput({ species: "dog", estimatedWeightKg: "12.5" }));
    const ppp = state.cards.find((c) => c.key === "ppp");
    expect(ppp?.state).toBe("Faltan datos");
    expect(ppp?.hint).toContain("la raza");
    expect(ppp?.hint).not.toContain("el peso");
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

  it("self-reported code/event → 'Microchip declarado', never 'verificado' (the exact bug: hero said verificado while the card said Declarado)", () => {
    const state = deriveComplianceState(baseInput({ microchipCode: "982000123456789" }));
    expect(state.cards.find((c) => c.key === "microchip")?.state).toBe("Declarado");
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

  // PJ-M1: a deceased pet is a closed life record — it must map to the memorial
  // state, NOT "ok" (AL DÍA), even when every obligation is satisfied.
  it("a deceased fully-compliant pet maps to 'deceased', never 'ok'", () => {
    expect(
      lnPetStatusFromCompliance({ status: "deceased", pregnancyStatus: null }, fullyCompliant),
    ).toBe("deceased");
  });

  it("deceased takes precedence over pregnancy (matching PetCard.helpers: lost > deceased)", () => {
    expect(
      lnPetStatusFromCompliance(
        { status: "deceased", pregnancyStatus: "in_progress" },
        fullyCompliant,
      ),
    ).toBe("deceased");
  });
});

describe("deriveMicrochip — jurisdiction applicability gate (microchip_required rule)", () => {
  it("default (microchipApplies undefined) keeps the obligation card — non-breaking", () => {
    const { cards } = deriveComplianceState(baseInput());
    const chip = cards.find((c) => c.key === "microchip");
    expect(chip?.state).toBe("Sin registro");
  });

  it("microchipApplies:true + no chip → 'Sin registro' obligation card (in N de M)", () => {
    const state = deriveComplianceState(baseInput({ microchipApplies: true }));
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.state).toBe("Sin registro");
    expect(state.summary.total).toBe(3);
  });

  it("microchipApplies:false + no chip → NO card, and the M in N de M shrinks", () => {
    const state = deriveComplianceState(baseInput({ microchipApplies: false }));
    expect(state.cards.some((c) => c.key === "microchip")).toBe(false);
    // rabies + sterilization only.
    expect(state.summary.total).toBe(2);
  });

  it("microchipApplies:false but a chip IS registered (declared) → card still shows as information", () => {
    const state = deriveComplianceState(
      baseInput({ microchipApplies: false, microchipCode: "982000123456789" }),
    );
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip).toBeDefined();
    expect(chip?.state).toBe("Declarado");
    expect(chip?.detail).toBe("982000123456789");
  });

  it("microchipApplies:false but a VERIFIED implant exists → card shows as ok/informational", () => {
    const state = deriveComplianceState(
      baseInput({
        microchipApplies: false,
        microchipCode: "982000123456789",
        events: [{ eventType: "microchip_implanted", occurredAt: NOW, payload: {}, ...VET }],
      }),
    );
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.state).toBe("Verificado");
    expect(chip?.tone).toBe("ok");
  });

  it("uses a neutral, non-CABA-specific legal footnote", () => {
    const state = deriveComplianceState(baseInput({ microchipApplies: true }));
    const chip = state.cards.find((c) => c.key === "microchip");
    expect(chip?.legalFootnote).not.toMatch(/CABA/);
  });
});
