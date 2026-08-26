// Client-input contract for RECORDING an event —
// `POST /api/v1/pets/{publicToken}/events`.
//
// ONE ENDPOINT, TEN KINDS, AND THAT IS THE DOMAIN'S OWN SHAPE. `pet_events` is
// a single append-only table discriminated by `event_type`; ten sibling URLs
// would be ten copies of one guard, one limiter pair and one idempotency
// contract, kept in agreement by hand. A discriminated union puts the ten
// differences where they are — in the fields and in ONE guard branch — and
// leaves everything they share written once.
//
// THE REFERENCE POINT is the web's own writers, field for field:
//   · `createVaccinationAction`, `createWeightAction`, `createDewormingAction`,
//     `createMedicationStartAction`, `createMedicationEndAction`,
//     `createSterilizationAction` (`src/modules/events/actions-medical.ts`)
//   · `createNoteAction`, `createMicrochipAction`, `createVetVisitAction`,
//     `createClinicalInfoAction` (`src/modules/events/actions.ts`)
// Every name below is the name that action reads out of its `FormData`, and
// every limit below is that action's limit. Where the web caps nothing, this
// caps nothing: a text length this schema invented would be a value the web
// accepts and the app refuses, which is the two doors disagreeing in the
// direction nobody tests.
//
// DATES TRAVEL AS THE STRINGS THE FORM SUBMITS, not as instants.
//   · `occurredAt` is `"YYYY-MM-DD"` — what `<input type="date">` posts, which
//     the server anchors at NOON UTC (`parseDateInput`). A client sending an
//     ISO instant would be choosing its own anchor, and a phone in Ushuaia and
//     a server in Virginia would disagree about which day a vaccine happened.
//   · `firstDoseAt` is `"YYYY-MM-DDTHH:mm"` — what `<input type="datetime-local">`
//     posts, read as ARGENTINE wall clock (`parseArDatetimeLocal`). Same reason,
//     one step finer: a dose at 08:00 means 08:00 where the animal lives.
// Both are shape-checked here and CONVERTED on the server by the same two
// helpers the web uses, so neither door can drift from the other's calendar.
//
// WHAT IS NOT HERE, AND WHY:
//   · `publicToken` — a PATH segment. A body that named it too would create two
//     sources for one identity and a way for them to disagree.
//   · `Idempotency-Key` — a HEADER, like every other write on this surface. It
//     is a property of the REQUEST, not a fact about the event.
//   · ATTACHMENTS. The web forms all offer one; this does not, because a native
//     upload needs a signed URL and that whole path is blocked. An event
//     recorded here carries no file, and the owner can add one from the web.
//   · `sourceReminderId` (the vaccine form's "this completes that reminder"
//     hidden field). The app's Libreta shows upcoming reminders but has no
//     affordance to write one closed, so the field would arrive from nowhere.
//     When that affordance exists, it is one optional uuid here and one line in
//     the writer.
//   · THE LOCATION the web's visita-veterinaria and información-clínica forms
//     can capture. Those two run their value through `normalizeLocationForWrite`,
//     which resolves a province against the canonical catalog — a SERVER
//     resolution over a table a phone does not hold, and the app has no location
//     affordance to feed it. An untouched web form posts every location field
//     empty and both writers store `null`, which is exactly what this endpoint
//     sends: the same fact, not a narrower one. Adding it later is a nested
//     optional object here and the same normalize call in the writer.
//
// WHY MACHINE CODES INSTEAD OF MESSAGES: the contract carries data and rules;
// the consumer owns its words. Same reasoning as `intake.ts` and
// `amend-event.ts`.

import { z } from "zod";

/**
 * The upper bound on a recorded weight, in kilograms.
 *
 * MOVED HERE FROM `actions-medical.ts`, where it was a module-local const, so
 * that both doors read ONE number. It is a data-quality gate (P4 item 2), not a
 * medical claim: the write path parses `kg` as a bare positive float, so a
 * fat-fingered "500" persisted silently. 120 sits comfortably above any dog
 * breed's healthy adult weight — the heaviest recognised breeds top out well
 * under 100 — generous enough never to block a real entry, tight enough to
 * catch a decimal slip or a kg/lb mixup.
 */
export const MAX_WEIGHT_KG = 120;

/** Antiparasitic route, exactly the three the web's radio group offers. */
export const DEWORMING_TYPES = ["internal", "external", "both"] as const;
export type DewormingType = (typeof DEWORMING_TYPES)[number];

/**
 * The two sterilization procedures.
 *
 * MOVED HERE FROM an INLINE array literal in `createSterilizationAction`
 * (`actions-medical.ts`), where it had no name at all — the same move
 * `MAX_WEIGHT_KG` got, for the same reason and with the same consequence: the
 * action imports it back, so a third procedure is added in one place or in
 * none. A copy of these two strings living in this file while the web kept its
 * own literal is exactly the drift the package exists to stop.
 */
export const STERILIZATION_PROCEDURES = ["castration", "spay"] as const;
export type SterilizationProcedure = (typeof STERILIZATION_PROCEDURES)[number];

/**
 * Clinical sub-kinds the OWNER-FACING form offers.
 *
 * MOVED HERE FROM `src/modules/events/domain/enums.ts`, which re-exports it so
 * its existing importers — `src/modules/events/actions.ts` and the org
 * `atender` action — keep reading ONE array.
 *
 * FIVE, NOT SIX: `disease_diagnosis` is a sixth `clinical_info_logged`
 * sub_kind, and it is deliberately not here. Its writer
 * (`recordDiseaseDiagnosisAction`, `actions.ts:512`) has NO ownership check at
 * all — it authorizes on `role === "vet" && matriculaVerified`, and accepting
 * the value here would let a phone with an owner's bearer token file a
 * diagnosis a verified professional is supposed to sign. The web's owner form
 * never offers it either; this is that same exclusion, written down.
 */
export const CLINICAL_SUB_KINDS = [
  "lab_work",
  "imaging",
  "surgery",
  "allergy_detection",
  "other",
] as const;
export type ClinicalSubKind = (typeof CLINICAL_SUB_KINDS)[number];

/**
 * Dosing frequencies, exactly `parseFrequencyFields`' `VALID_FREQUENCIES`.
 *
 * The interval each one means (24h, 12h, 8h, 6h, none) is the SERVER's
 * arithmetic and is not restated here: a client that computed its own schedule
 * would be a second source for the reminder rows the server generates.
 */
export const MEDICATION_FREQUENCIES = [
  "once_daily",
  "twice_daily",
  "three_times_daily",
  "four_times_daily",
  "single_dose",
  "custom",
] as const;
export type MedicationFrequency = (typeof MEDICATION_FREQUENCIES)[number];

/** Custom-interval bounds, from `parseFrequencyFields`. */
export const MIN_CUSTOM_HOURS = 1;
export const MAX_CUSTOM_HOURS = 24;

/** Treatment-length bounds, from `parseFrequencyFields`. */
export const MIN_DURATION_DAYS = 1;
export const MAX_DURATION_DAYS = 90;

/**
 * Note categories the OWNER-FACING form offers.
 *
 * Five, not six: the spine's own `note_added` schema also accepts `"system"`,
 * reserved for notes a cron job writes about the animal. `createNoteAction`
 * never offers it, so neither does this — an endpoint that accepted it would
 * let a phone sign a note as the platform.
 */
export const NOTE_CATEGORIES = [
  "comportamiento",
  "dieta",
  "grooming",
  "estado_de_animo",
  "otro",
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const RECORD_EVENT_INPUT_CODES = [
  "KIND_REQUIRED",
  "OCCURRED_AT_REQUIRED",
  "OCCURRED_AT_INVALID",
  "VACCINE_NAME_REQUIRED",
  "NEXT_DUE_AT_INVALID",
  "WEIGHT_REQUIRED",
  "WEIGHT_INVALID",
  "WEIGHT_TOO_HIGH",
  "PRODUCT_REQUIRED",
  "DEWORMING_TYPE_INVALID",
  "DRUG_NAME_REQUIRED",
  "DOSE_REQUIRED",
  "FREQUENCY_INVALID",
  "CUSTOM_HOURS_INVALID",
  "DURATION_DAYS_INVALID",
  "FIRST_DOSE_AT_REQUIRED",
  "FIRST_DOSE_AT_INVALID",
  "MEDICATION_SOURCE_REQUIRED",
  "TEXT_REQUIRED",
  "NOTE_CATEGORY_INVALID",
  "CHIP_NUMBER_REQUIRED",
  "STERILIZATION_PROCEDURE_INVALID",
  "VISIT_REASON_REQUIRED",
  "CLINICAL_SUB_KIND_INVALID",
  "CLINICAL_TITLE_REQUIRED",
] as const;
export type RecordEventInputCode = (typeof RECORD_EVENT_INPUT_CODES)[number];

/** `"YYYY-MM-DD"` — what `<input type="date">` posts. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `"YYYY-MM-DDTHH:mm"`, seconds optional — what `<input type="datetime-local">` posts. */
const AR_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does this string name a day that EXISTS?
 *
 * A REGEX IS NOT ENOUGH, and finding that out cost a test. `"2026-02-31"`
 * matches `ISO_DATE_RE` perfectly, and `new Date("2026-02-31T12:00:00Z")` does
 * not throw and is not `NaN` — JavaScript ROLLS IT OVER to 3 March. So the
 * server's own `parseDateInput` accepts it, silently, and a vaccination the
 * owner dated 31 February lands in the ledger dated 3 March with nothing
 * anywhere reporting a substitution.
 *
 * The web never had this problem: `<input type="date">` cannot produce a day
 * that does not exist. A JSON client can, which makes this exactly the kind of
 * rule that has to be WRITTEN DOWN when a second door opens onto one spine.
 *
 * Round-tripping is the whole check: a rolled-over date stringifies back to a
 * different day than it came from.
 */
function isRealDay(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/** The same round-trip for the DATE half of a `"YYYY-MM-DDTHH:mm"` value. */
function isRealDayAndTime(value: string): boolean {
  if (!isRealDay(value.slice(0, 10))) return false;
  const [hours, minutes] = value.slice(11).split(":");
  const h = Number(hours);
  const m = Number(minutes);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

const isoDate = (required: RecordEventInputCode, invalid: RecordEventInputCode) =>
  z
    .string({ error: required })
    .trim()
    .min(1, { error: required })
    .regex(ISO_DATE_RE, { error: invalid })
    .refine(isRealDay, { error: invalid });

/** An optional free-text field: absent, blank and `null` all mean "not stated". */
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const occurredAt = isoDate("OCCURRED_AT_REQUIRED", "OCCURRED_AT_INVALID");

/**
 * An OPTIONAL day: absent, `null` and blank all mean "not stated".
 *
 * The blank case is why this is not just `isoDate(...).nullish()`. The web's
 * actions read `String(formData.get("nextDueAt") ?? "").trim() || null`, so an
 * untouched date input reaches the writer as `null` and is accepted; a schema
 * that ran the regex over `""` would answer 400 to a request the web takes
 * happily. The blank is normalized away FIRST, and everything that survives is
 * held to the same calendar as `occurredAt`.
 */
const nextDueAt = z
  .union([z.string(), z.null()])
  .nullish()
  .transform((v) => {
    const trimmed = typeof v === "string" ? v.trim() : "";
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((v) => v === null || ISO_DATE_RE.test(v), { error: "NEXT_DUE_AT_INVALID" })
  .refine((v) => v === null || isRealDay(v), { error: "NEXT_DUE_AT_INVALID" });

const vaccination = z.object({
  kind: z.literal("vaccination"),
  vaccineName: z
    .string({ error: "VACCINE_NAME_REQUIRED" })
    .trim()
    .min(1, { error: "VACCINE_NAME_REQUIRED" }),
  occurredAt,
  brand: optionalText,
  batch: optionalText,
  administeredBy: optionalText,
  nextDueAt,
  notes: optionalText,
  /**
   * Re-send with `true` to accept the same-day soft gate.
   *
   * The web asks "¿Ya cargaste X hoy — registrar otra igual?" and resubmits
   * with a hidden `sameDayOverride=1`. Same gate, same bypass, same reason it
   * is SOFT: a second dose on one day is unusual and not impossible, and a hard
   * refusal would be the endpoint deciding it knows the animal better than the
   * person holding it.
   */
  sameDayOverride: z.boolean().optional().default(false),
});

const weight = z.object({
  kind: z.literal("weight"),
  /**
   * Kilograms. A NUMBER on the wire, where the web's form field is
   * `<input type="number">` and its action parses the posted string — same
   * value, one less string round trip, and JSON has numbers.
   */
  kg: z
    .number({ error: "WEIGHT_REQUIRED" })
    .refine((v) => Number.isFinite(v) && v > 0, { error: "WEIGHT_INVALID" })
    .refine((v) => v <= MAX_WEIGHT_KG, { error: "WEIGHT_TOO_HIGH" }),
  occurredAt,
  notes: optionalText,
});

const deworming = z.object({
  kind: z.literal("deworming"),
  product: z.string({ error: "PRODUCT_REQUIRED" }).trim().min(1, { error: "PRODUCT_REQUIRED" }),
  type: z.enum(DEWORMING_TYPES, { error: "DEWORMING_TYPE_INVALID" }),
  occurredAt,
  nextDueAt,
  notes: optionalText,
  /** Same soft gate as `vaccination.sameDayOverride`. */
  sameDayOverride: z.boolean().optional().default(false),
});

const medicationStart = z.object({
  kind: z.literal("medication_start"),
  drugName: z
    .string({ error: "DRUG_NAME_REQUIRED" })
    .trim()
    .min(1, { error: "DRUG_NAME_REQUIRED" }),
  dose: z.string({ error: "DOSE_REQUIRED" }).trim().min(1, { error: "DOSE_REQUIRED" }),
  prescribedBy: optionalText,
  /** The day the treatment STARTS, as a fact about the animal's history. */
  occurredAt,
  frequency: z.enum(MEDICATION_FREQUENCIES, { error: "FREQUENCY_INVALID" }),
  /**
   * Required only for `frequency: "custom"`, and IGNORED otherwise — the same
   * asymmetry `parseFrequencyFields` has, checked below by `superRefine` rather
   * than by a second union so the error can name the one field at fault.
   */
  customHours: z.number().int().nullish(),
  durationDays: z.number().int().nullish(),
  /** The first dose's wall-clock moment, in ARGENTINE time. */
  firstDoseAt: z
    .string({ error: "FIRST_DOSE_AT_REQUIRED" })
    .trim()
    .min(1, { error: "FIRST_DOSE_AT_REQUIRED" })
    .regex(AR_DATETIME_LOCAL_RE, { error: "FIRST_DOSE_AT_INVALID" })
    .refine(isRealDayAndTime, { error: "FIRST_DOSE_AT_INVALID" }),
  notes: optionalText,
});

const medicationEnd = z.object({
  kind: z.literal("medication_end"),
  /**
   * The `medication_started` event this ends. The server checks it exists, is
   * of that type, and belongs to THIS animal — three things a uuid shape cannot
   * say.
   */
  medicationStartedEventId: z
    .string({ error: "MEDICATION_SOURCE_REQUIRED" })
    .trim()
    .regex(UUID_RE, { error: "MEDICATION_SOURCE_REQUIRED" }),
  occurredAt,
  reason: optionalText,
  notes: optionalText,
});

const note = z.object({
  kind: z.literal("note"),
  text: z.string({ error: "TEXT_REQUIRED" }).trim().min(1, { error: "TEXT_REQUIRED" }),
  occurredAt,
  /**
   * NULLABLE, and a bad value is a REFUSAL here where the web silently drops it
   * to `null`.
   *
   * The web can afford that: its field is a `<select>` whose options are the
   * five, so an unrecognised value means somebody bypassed the form. A JSON
   * client has no `<select>`, and silently filing a note under "no category"
   * because the app sent `"comportamento"` is a typo that survives to the
   * ledger. Narrower than the web, deliberately, and in the direction where
   * being wrong is visible.
   */
  category: z.enum(NOTE_CATEGORIES, { error: "NOTE_CATEGORY_INVALID" }).nullish(),
});

const microchip = z.object({
  kind: z.literal("microchip"),
  /**
   * The chip's code, as printed. NO SHAPE RULE HERE, and that is the web's rule
   * rather than an omission: `createMicrochipAction` checks only that the field
   * is non-empty. Whether the number agrees with the pet's CANONICAL chip is
   * decided by `checkChipMatchesCanonical` inside the use-case, against a row
   * this schema cannot see — and a 15-digit regex invented here would refuse the
   * shorter legacy codes the web accepts today.
   */
  chipNumber: z
    .string({ error: "CHIP_NUMBER_REQUIRED" })
    .trim()
    .min(1, { error: "CHIP_NUMBER_REQUIRED" }),
  /** The day of the IMPLANT, not of the reading. */
  occurredAt,
  countryCode: optionalText,
  implantedBy: optionalText,
  locationOnBody: optionalText,
  notes: optionalText,
});

const sterilization = z.object({
  kind: z.literal("sterilization"),
  procedure: z.enum(STERILIZATION_PROCEDURES, { error: "STERILIZATION_PROCEDURE_INVALID" }),
  occurredAt,
  performedBy: optionalText,
  clinic: optionalText,
  notes: optionalText,
});

const vetVisit = z.object({
  kind: z.literal("vet_visit"),
  reason: z
    .string({ error: "VISIT_REASON_REQUIRED" })
    .trim()
    .min(1, { error: "VISIT_REASON_REQUIRED" }),
  occurredAt,
  /**
   * What the vet SAID, as the owner reports it — free text, and deliberately
   * NOT the `disease_diagnosis` clinical sub-kind. That one is a signed
   * professional claim with an outbreak-signal cascade behind it; this is a line
   * in an owner's own libreta and carries no such weight.
   */
  diagnosis: optionalText,
  vetName: optionalText,
  clinic: optionalText,
  notes: optionalText,
});

const clinicalInfo = z.object({
  kind: z.literal("clinical_info"),
  subKind: z.enum(CLINICAL_SUB_KINDS, { error: "CLINICAL_SUB_KIND_INVALID" }),
  title: z
    .string({ error: "CLINICAL_TITLE_REQUIRED" })
    .trim()
    .min(1, { error: "CLINICAL_TITLE_REQUIRED" }),
  occurredAt,
  details: optionalText,
  performedBy: optionalText,
  notes: optionalText,
});

export const recordEventInputSchema = z
  .discriminatedUnion("kind", [
    vaccination,
    weight,
    deworming,
    medicationStart,
    medicationEnd,
    note,
    microchip,
    sterilization,
    vetVisit,
    clinicalInfo,
  ])
  .superRefine((input, ctx) => {
    if (input.kind !== "medication_start") return;

    if (input.frequency === "custom") {
      const hours = input.customHours;
      if (
        typeof hours !== "number" ||
        !Number.isFinite(hours) ||
        hours < MIN_CUSTOM_HOURS ||
        hours > MAX_CUSTOM_HOURS
      ) {
        ctx.addIssue({ code: "custom", message: "CUSTOM_HOURS_INVALID", path: ["customHours"] });
      }
    }

    const days = input.durationDays;
    if (days !== null && days !== undefined) {
      if (!Number.isFinite(days) || days < MIN_DURATION_DAYS || days > MAX_DURATION_DAYS) {
        ctx.addIssue({ code: "custom", message: "DURATION_DAYS_INVALID", path: ["durationDays"] });
      }
    }
  });

export type RecordEventInput = z.infer<typeof recordEventInputSchema>;

/** The wire `kind` discriminator, for a client that wants to name one. */
export type RecordEventKind = RecordEventInput["kind"];

/**
 * The FIRST input code in a failed parse, for a client that wants to show one
 * message. Mirrors `firstAmendEventInputCode` — same shape, same reason.
 *
 * `KIND_REQUIRED` is the answer when the union itself did not match: zod's
 * discriminator failure carries its own message, and a client that got the
 * `kind` wrong has a bug rather than a field to fix.
 */
export function firstRecordEventInputCode(error: z.ZodError<unknown>): RecordEventInputCode | null {
  for (const issue of error.issues) {
    const code = issue.message;
    if ((RECORD_EVENT_INPUT_CODES as readonly string[]).includes(code)) {
      return code as RecordEventInputCode;
    }
  }
  for (const issue of error.issues) {
    if (issue.code === "invalid_union" || issue.path.length === 0 || issue.path[0] === "kind") {
      return "KIND_REQUIRED";
    }
  }
  return null;
}
