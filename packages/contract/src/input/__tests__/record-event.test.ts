// `recordEventInputSchema` — what a client may send to `POST .../events`.
//
// THE POINT OF TESTING A SCHEMA THE SERVER ALSO ENFORCES: this is the copy the
// CLIENT runs, before the network, to put a message under the right field. A
// rule that only the server knows is a rule the app can only discover from a
// 400 with no field detail.
//
// The calendar cases are the ones a reviewer should read first. They are not
// pedantry: `"2026-02-31"` passes a `YYYY-MM-DD` regex, and `new Date` rolls it
// silently to 3 March rather than failing, so without the round-trip refine a
// vaccination dated 31 February reaches an append-only ledger dated the 3rd.

import { describe, expect, it } from "vitest";

import {
  MAX_WEIGHT_KG,
  firstRecordEventInputCode,
  recordEventInputSchema,
} from "../record-event.ts";

/** The first input code for a body, or `null` when the body parses. */
function codeFor(body: unknown): string | null {
  const parsed = recordEventInputSchema.safeParse(body);
  return parsed.success ? null : firstRecordEventInputCode(parsed.error);
}

const A_DAY = "2026-08-20";

describe("recordEventInputSchema — the calendar", () => {
  it("accepts a real day", () => {
    expect(codeFor({ kind: "vaccination", vaccineName: "Antirrábica", occurredAt: A_DAY })).toBe(
      null,
    );
  });

  it("refuses a day that does not exist, which a regex alone would accept", () => {
    expect(
      codeFor({ kind: "vaccination", vaccineName: "Antirrábica", occurredAt: "2026-02-31" }),
    ).toBe("OCCURRED_AT_INVALID");
  });

  it("refuses a month that does not exist", () => {
    expect(
      codeFor({ kind: "vaccination", vaccineName: "Antirrábica", occurredAt: "2026-13-01" }),
    ).toBe("OCCURRED_AT_INVALID");
  });

  it("accepts 29 February in a leap year and refuses it otherwise", () => {
    const leap = { kind: "vaccination", vaccineName: "X", occurredAt: "2028-02-29" };
    const notLeap = { kind: "vaccination", vaccineName: "X", occurredAt: "2027-02-29" };
    expect(codeFor(leap)).toBe(null);
    expect(codeFor(notLeap)).toBe("OCCURRED_AT_INVALID");
  });

  it("reads a BLANK optional date as unstated, exactly as the web's action does", () => {
    // `String(formData.get("nextDueAt") ?? "").trim() || null` is what the web
    // writer does with an untouched date input. A schema that ran the regex over
    // `""` would refuse a request the other door takes happily.
    const parsed = recordEventInputSchema.parse({
      kind: "deworming",
      product: "Endogard",
      type: "internal",
      occurredAt: A_DAY,
      nextDueAt: "   ",
    });
    expect(parsed).toMatchObject({ nextDueAt: null });
    expect(codeFor({ kind: "weight", kg: 10, occurredAt: A_DAY, notes: "" })).toBe(null);
  });

  it("applies the same round-trip to a next-dose date", () => {
    expect(
      codeFor({
        kind: "deworming",
        product: "Endogard",
        type: "internal",
        occurredAt: A_DAY,
        nextDueAt: "2026-06-31",
      }),
    ).toBe("NEXT_DUE_AT_INVALID");
  });

  it("refuses an hour that does not exist on a first dose", () => {
    expect(
      codeFor({
        kind: "medication_start",
        drugName: "Amoxicilina",
        dose: "250 mg",
        occurredAt: A_DAY,
        frequency: "once_daily",
        firstDoseAt: "2026-08-20T25:00",
      }),
    ).toBe("FIRST_DOSE_AT_INVALID");
  });
});

describe("recordEventInputSchema — the six kinds", () => {
  it("names the kind when the discriminator is not one of the six", () => {
    expect(codeFor({ kind: "death_recorded", occurredAt: A_DAY })).toBe("KIND_REQUIRED");
  });

  it("requires a vaccine name", () => {
    expect(codeFor({ kind: "vaccination", vaccineName: "   ", occurredAt: A_DAY })).toBe(
      "VACCINE_NAME_REQUIRED",
    );
  });

  it("refuses a weight over the shared ceiling, and accepts one at it", () => {
    expect(codeFor({ kind: "weight", kg: MAX_WEIGHT_KG + 0.01, occurredAt: A_DAY })).toBe(
      "WEIGHT_TOO_HIGH",
    );
    expect(codeFor({ kind: "weight", kg: MAX_WEIGHT_KG, occurredAt: A_DAY })).toBe(null);
  });

  it("refuses a weight of zero or less — a fact nobody records", () => {
    expect(codeFor({ kind: "weight", kg: 0, occurredAt: A_DAY })).toBe("WEIGHT_INVALID");
    expect(codeFor({ kind: "weight", kg: -3, occurredAt: A_DAY })).toBe("WEIGHT_INVALID");
  });

  it("refuses an antiparasitic route outside the three the form offers", () => {
    expect(
      codeFor({ kind: "deworming", product: "Endogard", type: "oral", occurredAt: A_DAY }),
    ).toBe("DEWORMING_TYPE_INVALID");
  });

  it("demands an interval for a CUSTOM frequency and only for that one", () => {
    const base = {
      kind: "medication_start",
      drugName: "Amoxicilina",
      dose: "250 mg",
      occurredAt: A_DAY,
      firstDoseAt: "2026-08-20T08:00",
    };
    expect(codeFor({ ...base, frequency: "custom" })).toBe("CUSTOM_HOURS_INVALID");
    expect(codeFor({ ...base, frequency: "custom", customHours: 0 })).toBe("CUSTOM_HOURS_INVALID");
    expect(codeFor({ ...base, frequency: "custom", customHours: 25 })).toBe("CUSTOM_HOURS_INVALID");
    expect(codeFor({ ...base, frequency: "custom", customHours: 8 })).toBe(null);
    // A named frequency carries its own interval; a stray `customHours` beside
    // one is ignored rather than refused, exactly as `parseFrequencyFields` does.
    expect(codeFor({ ...base, frequency: "twice_daily", customHours: 99 })).toBe(null);
  });

  it("bounds a treatment's length at the web's 1–90 days", () => {
    const base = {
      kind: "medication_start",
      drugName: "Amoxicilina",
      dose: "250 mg",
      occurredAt: A_DAY,
      frequency: "once_daily",
      firstDoseAt: "2026-08-20T08:00",
    };
    expect(codeFor({ ...base, durationDays: 0 })).toBe("DURATION_DAYS_INVALID");
    expect(codeFor({ ...base, durationDays: 91 })).toBe("DURATION_DAYS_INVALID");
    expect(codeFor({ ...base, durationDays: 90 })).toBe(null);
    expect(codeFor(base)).toBe(null);
  });

  it("requires a uuid for the medication a stop refers to", () => {
    expect(
      codeFor({ kind: "medication_end", medicationStartedEventId: "med-1", occurredAt: A_DAY }),
    ).toBe("MEDICATION_SOURCE_REQUIRED");
  });

  it("requires note text and refuses a category outside the owner-facing five", () => {
    expect(codeFor({ kind: "note", text: "  ", occurredAt: A_DAY })).toBe("TEXT_REQUIRED");
    expect(codeFor({ kind: "note", text: "ok", occurredAt: A_DAY, category: "system" })).toBe(
      "NOTE_CATEGORY_INVALID",
    );
    expect(codeFor({ kind: "note", text: "ok", occurredAt: A_DAY, category: null })).toBe(null);
    expect(codeFor({ kind: "note", text: "ok", occurredAt: A_DAY, category: "dieta" })).toBe(null);
  });
});

describe("recordEventInputSchema — the shape it hands the caller", () => {
  it("normalizes every unstated optional to null, so a writer never sees three absences", () => {
    const parsed = recordEventInputSchema.parse({
      kind: "vaccination",
      vaccineName: "  Antirrábica  ",
      occurredAt: A_DAY,
      brand: "   ",
    });
    expect(parsed).toEqual({
      kind: "vaccination",
      vaccineName: "Antirrábica",
      occurredAt: A_DAY,
      brand: null,
      batch: null,
      administeredBy: null,
      nextDueAt: null,
      notes: null,
      sameDayOverride: false,
    });
  });
});

describe("recordEventInputSchema — the four WU-L kinds", () => {
  it("accepts a minimal body for each, and names the one missing required field", () => {
    expect(codeFor({ kind: "microchip", chipNumber: "982000123456789", occurredAt: A_DAY })).toBe(
      null,
    );
    expect(codeFor({ kind: "microchip", chipNumber: "  ", occurredAt: A_DAY })).toBe(
      "CHIP_NUMBER_REQUIRED",
    );

    expect(codeFor({ kind: "sterilization", procedure: "castration", occurredAt: A_DAY })).toBe(
      null,
    );
    expect(codeFor({ kind: "sterilization", procedure: "spay", occurredAt: A_DAY })).toBe(null);

    expect(codeFor({ kind: "vet_visit", reason: "Control anual", occurredAt: A_DAY })).toBe(null);
    expect(codeFor({ kind: "vet_visit", reason: "", occurredAt: A_DAY })).toBe(
      "VISIT_REASON_REQUIRED",
    );

    expect(
      codeFor({
        kind: "clinical_info",
        subKind: "lab_work",
        title: "Hemograma",
        occurredAt: A_DAY,
      }),
    ).toBe(null);
    expect(
      codeFor({ kind: "clinical_info", subKind: "lab_work", title: " ", occurredAt: A_DAY }),
    ).toBe("CLINICAL_TITLE_REQUIRED");
  });

  it("refuses a sterilization procedure the web's form does not offer", () => {
    expect(codeFor({ kind: "sterilization", procedure: "neuter", occurredAt: A_DAY })).toBe(
      "STERILIZATION_PROCEDURE_INVALID",
    );
  });

  it("refuses the VET-ONLY clinical sub_kind, which is why the enum has five", () => {
    // `disease_diagnosis` is a real `clinical_info_logged` sub_kind whose writer
    // authorizes on a verified matrícula and checks no ownership at all. If this
    // schema accepted it, an owner's bearer token could sign a professional's
    // claim — the one exclusion in this file that is a SECURITY boundary rather
    // than a copy of a form's options.
    expect(
      codeFor({
        kind: "clinical_info",
        subKind: "disease_diagnosis",
        title: "Moquillo",
        occurredAt: A_DAY,
      }),
    ).toBe("CLINICAL_SUB_KIND_INVALID");
  });

  it("holds all four to the same calendar as the six before them", () => {
    for (const body of [
      { kind: "microchip", chipNumber: "982000123456789" },
      { kind: "sterilization", procedure: "castration" },
      { kind: "vet_visit", reason: "Control" },
      { kind: "clinical_info", subKind: "imaging", title: "Radiografía" },
    ]) {
      expect(codeFor({ ...body, occurredAt: "2026-02-31" })).toBe("OCCURRED_AT_INVALID");
      expect(codeFor({ ...body, occurredAt: "" })).toBe("OCCURRED_AT_REQUIRED");
    }
  });

  it("normalizes every unstated optional to null on the four as well", () => {
    expect(
      recordEventInputSchema.parse({
        kind: "microchip",
        chipNumber: "  982000123456789  ",
        occurredAt: A_DAY,
        implantedBy: "   ",
      }),
    ).toEqual({
      kind: "microchip",
      chipNumber: "982000123456789",
      occurredAt: A_DAY,
      countryCode: null,
      implantedBy: null,
      locationOnBody: null,
      notes: null,
    });
  });

  it("carries NO same-day override on the four — the web has no such gate for them", () => {
    const parsed = recordEventInputSchema.parse({
      kind: "sterilization",
      procedure: "spay",
      occurredAt: A_DAY,
    });
    expect(parsed).not.toHaveProperty("sameDayOverride");
  });
});

// ---------------------------------------------------------------------------
// WU-M — síntoma, the eleventh kind and the only one with no `occurredAt`.
// ---------------------------------------------------------------------------

describe("recordEventInputSchema — síntoma", () => {
  it("accepts the free text ALONE — no date, no severity", () => {
    // The web's own shape: `createSymptomObservedAction` requires `freeText` and
    // nothing else. A schema that demanded a day here would refuse a report the
    // browser takes happily.
    expect(recordEventInputSchema.parse({ kind: "symptom", freeText: "Decaído, no come" })).toEqual(
      { kind: "symptom", freeText: "Decaído, no come", severity: undefined, onsetAt: null },
    );
  });

  it("refuses an empty description — the one field it cannot do without", () => {
    expect(codeFor({ kind: "symptom", freeText: "   " })).toBe("SYMPTOM_TEXT_REQUIRED");
    expect(codeFor({ kind: "symptom" })).toBe("SYMPTOM_TEXT_REQUIRED");
  });

  it("carries NO occurredAt, which is what separates it from the other ten", () => {
    const parsed = recordEventInputSchema.parse({ kind: "symptom", freeText: "Tos seca" });
    expect(parsed).not.toHaveProperty("occurredAt");
  });

  it("takes the three severities and REFUSES a fourth, where the web drops it silently", () => {
    for (const severity of ["mild", "moderate", "severe"]) {
      expect(codeFor({ kind: "symptom", freeText: "Tos", severity })).toBe(null);
    }
    // The web's `<select>` cannot produce this; a JSON client can, and a symptom
    // filed with no severity because the app sent Spanish is a typo that reaches
    // the ledger. Same call `note.category` makes.
    expect(codeFor({ kind: "symptom", freeText: "Tos", severity: "moderado" })).toBe(
      "SYMPTOM_SEVERITY_INVALID",
    );
    expect(codeFor({ kind: "symptom", freeText: "Tos", severity: null })).toBe(null);
  });

  it("normalizes a blank onset to null rather than refusing it", () => {
    // The web reads `String(formData.get("onsetAt") ?? "").trim() || null`, so an
    // untouched date input reaches the writer as null. A schema that ran the
    // regex over "" would answer 400 to a request the web accepts.
    for (const onsetAt of ["", "   ", null, undefined]) {
      expect(recordEventInputSchema.parse({ kind: "symptom", freeText: "Tos", onsetAt })).toEqual({
        kind: "symptom",
        freeText: "Tos",
        severity: undefined,
        onsetAt: null,
      });
    }
  });

  it("holds a STATED onset to the same calendar as every other date here", () => {
    expect(codeFor({ kind: "symptom", freeText: "Tos", onsetAt: "2026-02-31" })).toBe(
      "ONSET_AT_INVALID",
    );
    expect(codeFor({ kind: "symptom", freeText: "Tos", onsetAt: "20/08/2026" })).toBe(
      "ONSET_AT_INVALID",
    );
    expect(codeFor({ kind: "symptom", freeText: "Tos", onsetAt: A_DAY })).toBe(null);
  });

  it("caps NOTHING on the description, because the web caps nothing", () => {
    // The matcher reads this text. A truncation invented here would be a symptom
    // the browser surfaces to the sanitary authority and the app silently drops.
    const long = "vómitos ".repeat(500);
    expect(codeFor({ kind: "symptom", freeText: long })).toBe(null);
  });
});
