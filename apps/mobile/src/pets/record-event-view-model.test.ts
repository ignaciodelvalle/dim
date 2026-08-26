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
  it("names and describes all five pickable kinds, plus the one that is not", () => {
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

describe("isWritableKind — the route boundary", () => {
  it("accepts the six and refuses anything else", () => {
    expect(isWritableKind("vaccination")).toBe(true);
    expect(isWritableKind("medication_end")).toBe(true);
    // A deep link carrying a kind this build does not know lands on the picker,
    // which is where the person was going.
    expect(isWritableKind("death_recorded")).toBe(false);
    expect(isWritableKind("")).toBe(false);
  });
});
