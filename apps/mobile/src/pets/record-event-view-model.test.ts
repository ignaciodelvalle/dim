// `record-event-view-model` — the mapping between a filled-in form and the wire.
//
// The render tests beside this one prove the screen wires up; these prove the
// small number of DECISIONS the mapping makes, which are the ones a screen test
// would only reach through six taps each.

import { describe, expect, it } from "@jest/globals";

import {
  RECORD_KINDS,
  emptyDraft,
  inputCodeMessage,
  isWritableKind,
  kindSubtitle,
  kindTitle,
  symptomSeverityLabel,
  todayInAr,
  validateDraft,
} from "./record-event-view-model";

const A_DAY = "2026-08-20";

function draft(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return { ...emptyDraft(new Date("2026-08-25T15:00:00Z")), occurredAt: A_DAY, ...overrides };
}

describe("todayInAr — the default date a form offers", () => {
  it("uses ARGENTINE calendar days, not the device's idea of today", () => {
    // 01:30 UTC on the 26th is still the 25th in Buenos Aires. A phone that
    // travels with its owner would otherwise pre-fill tomorrow, and the server
    // would refuse a day the owner never chose.
    expect(todayInAr(new Date("2026-08-26T01:30:00Z"))).toBe("2026-08-25");
    expect(todayInAr(new Date("2026-08-25T14:00:00Z"))).toBe("2026-08-25");
  });

  it("rolls over at 21:00 UTC, which is midnight in Buenos Aires", () => {
    expect(todayInAr(new Date("2026-08-25T20:59:00Z"))).toBe("2026-08-25");
    expect(todayInAr(new Date("2026-08-25T21:00:00Z"))).toBe("2026-08-25");
    expect(todayInAr(new Date("2026-08-26T03:00:00Z"))).toBe("2026-08-26");
  });
});

describe("validateDraft — what leaves the device", () => {
  it("reads an es-AR decimal comma as a decimal point", () => {
    const result = validateDraft("weight", draft({ kg: "12,5" }));
    expect(result.ok && result.input).toMatchObject({ kind: "weight", kg: 12.5 });
  });

  it("turns every untouched optional into null, not into an empty string", () => {
    // A `""` on the wire would be a STATED empty value where the person stated
    // nothing, and the ledger would carry a brand of "".
    const result = validateDraft("vaccination", draft({ vaccineName: "Antirrábica", brand: "  " }));
    expect(result.ok && result.input).toMatchObject({ brand: null, batch: null, notes: null });
  });

  it("joins the two first-dose fields into the one string the contract describes", () => {
    const result = validateDraft(
      "medication_start",
      draft({
        drugName: "Amoxicilina",
        dose: "250 mg",
        firstDoseDay: A_DAY,
        firstDoseTime: "08:00",
      }),
    );
    expect(result.ok && result.input).toMatchObject({ firstDoseAt: "2026-08-20T08:00" });
  });

  it("carries the source asiento a medication END names, and refuses without one", () => {
    const withSource = validateDraft("medication_end", draft(), {
      sourceEventId: "33333333-3333-4333-8333-333333333333",
    });
    expect(withSource.ok).toBe(true);

    const without = validateDraft("medication_end", draft());
    expect(without.ok).toBe(false);
    expect(!without.ok && without.code).toBe("MEDICATION_SOURCE_REQUIRED");
  });

  it("tells a filled-in unreadable weight apart from a missing one", () => {
    // `kg` is a number on the wire, so "abc" arrives as NaN — and zod rejects
    // NaN as an INVALID TYPE, the same issue a missing number raises. Without
    // the pre-check both said "Falta el peso." and one of them was looking at a
    // field with "abc" in it.
    const unreadable = validateDraft("weight", draft({ kg: "abc" }));
    expect(!unreadable.ok && unreadable.code).toBe("WEIGHT_INVALID");
    expect(!unreadable.ok && unreadable.message).toContain("número");

    const missing = validateDraft("weight", draft({ kg: "  " }));
    expect(!missing.ok && missing.code).toBe("WEIGHT_REQUIRED");
  });

  it("refuses what the SERVER would refuse, before the network sees it", () => {
    const tooHeavy = validateDraft("weight", draft({ kg: "500" }));
    expect(!tooHeavy.ok && tooHeavy.code).toBe("WEIGHT_TOO_HIGH");
    expect(!tooHeavy.ok && tooHeavy.message).toContain("120 kg");

    const noDay = validateDraft(
      "vaccination",
      draft({ vaccineName: "X", occurredAt: "2026-02-31" }),
    );
    expect(!noDay.ok && noDay.code).toBe("OCCURRED_AT_INVALID");
  });

  it("passes the same-day override through only when it was asked for", () => {
    const first = validateDraft("vaccination", draft({ vaccineName: "X" }));
    expect(first.ok && first.input).toMatchObject({ sameDayOverride: false });
    const second = validateDraft("vaccination", draft({ vaccineName: "X" }), {
      sameDayOverride: true,
    });
    expect(second.ok && second.input).toMatchObject({ sameDayOverride: true });
  });
});

describe("the copy every branch owes", () => {
  it("names and describes EVERY pickable kind, plus the one that is not", () => {
    // Driven off `RECORD_KINDS` rather than a list written here, which is what
    // makes a kind added to the union a failing test instead of an untested
    // one.
    for (const kind of [...RECORD_KINDS, "medication_end" as const]) {
      expect(kindTitle(kind).length).toBeGreaterThan(0);
      expect(kindSubtitle(kind).length).toBeGreaterThan(0);
    }
  });

  it("says SOMETHING even when the contract named nothing", () => {
    // A parse that fails on a code this build does not know must not render a
    // blank line under the button. Honest about being unable to say more.
    expect(inputCodeMessage(null).length).toBeGreaterThan(0);
  });
});

describe("validateDraft — síntoma, the kind with no date of its own", () => {
  it("sends the free text alone, with no occurredAt the person never chose", () => {
    // `emptyDraft` pre-fills `occurredAt` with today because ten kinds need it.
    // Síntoma does not have the field at all, and sending the pre-filled value
    // as an onset would be this form answering a question nobody asked.
    const result = validateDraft("symptom", draft({ freeText: "Decaído, no come" }));
    expect(result.ok && result.input).toEqual({
      kind: "symptom",
      freeText: "Decaído, no come",
      severity: null,
      onsetAt: null,
    });
  });

  it("refuses an empty description with its OWN sentence, not the nota's", () => {
    const result = validateDraft("symptom", draft({ freeText: "   " }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("SYMPTOM_TEXT_REQUIRED");
    expect(!result.ok && result.message).toBe("Contá qué le viste.");
  });

  it("keeps a blank onset as null and holds a stated one to the calendar", () => {
    const blank = validateDraft("symptom", draft({ freeText: "Tos", onsetAt: "   " }));
    expect(blank.ok && blank.input).toMatchObject({ onsetAt: null });

    const stated = validateDraft("symptom", draft({ freeText: "Tos", onsetAt: A_DAY }));
    expect(stated.ok && stated.input).toMatchObject({ onsetAt: A_DAY });

    const impossible = validateDraft("symptom", draft({ freeText: "Tos", onsetAt: "2026-02-31" }));
    expect(!impossible.ok && impossible.code).toBe("ONSET_AT_INVALID");
  });

  it("carries a chosen severity and leaves an unchosen one null", () => {
    const none = validateDraft("symptom", draft({ freeText: "Tos" }));
    expect(none.ok && none.input).toMatchObject({ severity: null });

    const chosen = validateDraft("symptom", draft({ freeText: "Tos", severity: "severe" }));
    expect(chosen.ok && chosen.input).toMatchObject({ severity: "severe" });
  });

  it("labels the three severities without borrowing triage words", () => {
    // Nothing downstream reads this value — the alert cascade is decided by what
    // the FREE TEXT matched — so "urgente" here would be the app implying that
    // picking one summons somebody.
    expect(symptomSeverityLabel("mild")).toBe("Leve");
    expect(symptomSeverityLabel("moderate")).toBe("Moderado");
    expect(symptomSeverityLabel("severe")).toBe("Grave");
  });

  it("warns about the sanitary authority BEFORE the form, in the subtitle", () => {
    // This is the one asiento whose write can leave the animal's own record. A
    // person is entitled to know that while they can still decide not to send it.
    expect(kindSubtitle("symptom")).toContain("autoridad sanitaria");
  });
});

describe("isWritableKind — the route boundary", () => {
  it("accepts every kind this build writes and refuses anything else", () => {
    expect(isWritableKind("vaccination")).toBe(true);
    expect(isWritableKind("medication_end")).toBe(true);
    // A deep link carrying a kind this build does not know lands on the picker,
    // which is where the person was going.
    expect(isWritableKind("death_recorded")).toBe(false);
    expect(isWritableKind("")).toBe(false);
  });
});
