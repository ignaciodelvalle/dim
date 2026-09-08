// Client-input contract for RECORDING an event —
// `POST /api/v1/pets/{publicToken}/events`.
//
// ONE ENDPOINT, ELEVEN KINDS, AND THAT IS THE DOMAIN'S OWN SHAPE. `pet_events`
// is a single append-only table discriminated by `event_type`; eleven sibling
// URLs would be eleven copies of one guard, one limiter pair and one
// idempotency contract, kept in agreement by hand. A discriminated union puts
// the eleven differences where they are — in the fields and in ONE guard branch
// — and leaves everything they share written once.
//
// THE REFERENCE POINT is the web's own writers, field for field:
//   · `createVaccinationAction`, `createWeightAction`, `createDewormingAction`,
//     `createMedicationStartAction`, `createMedicationEndAction`,
//     `createSterilizationAction` (`src/modules/events/actions-medical.ts`)
//   · `createNoteAction`, `createMicrochipAction`, `createVetVisitAction`,
//     `createClinicalInfoAction`, `createSymptomObservedAction`
//     (`src/modules/events/actions.ts`)
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
//     SÍNTOMA IS THE ONE KIND THAT DOES NOT CARRY IT, and that is the web's own
//     shape rather than an omission — see the variant's own note.
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

import { findDisease } from "../reference/diseases.ts";

import { isRealArDay } from "./ar-calendar-day.ts";

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
 * FIVE OF THE SPINE'S SEVEN. `clinical_info_logged`'s own payload schema
 * (`lib/events/event-schemas.ts`) accepts `lab_work`, `imaging`, `surgery`,
 * `allergy_detection`, `disease_diagnosis`, `pregnancy` and `other`; the two
 * missing here are missing for two different reasons.
 *
 *   · `disease_diagnosis` — its writer (`recordDiseaseDiagnosisAction`,
 *     `src/modules/events/actions.ts:584`) has NO ownership check at all: it
 *     authorizes on
 *     `role === "vet" && matriculaVerified`. Accepting the value here would let
 *     a phone holding an owner's bearer token file a diagnosis a verified
 *     professional is supposed to sign.
 *   · `pregnancy` — written by its own flow (`app/actions/pregnancy.ts`), which
 *     is not this endpoint's dispatch and carries its own rules.
 *
 * The web's owner form offers neither either; this is that same exclusion,
 * written down. The boundary was always right and the count was not: this said
 * "five, not six" for as long as the spine had seven.
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

/**
 * How bad the owner judges the sign to be — exactly the three
 * `createSymptomObservedAction` accepts, and no more.
 *
 * SELF-ASSESSED, and the spine's own field name says so
 * (`severity_self_assessed`). It is not a triage category and nothing downstream
 * treats it as one: the disease matcher runs on the FREE TEXT, and the alert
 * cascade is decided by which reportable diseases that text matched, never by
 * this value. Stated because a field called `severity` invites a client to
 * believe that picking "severe" summons somebody.
 */
export const SYMPTOM_SEVERITIES = ["mild", "moderate", "severe"] as const;
export type SymptomSeverity = (typeof SYMPTOM_SEVERITIES)[number];

/**
 * TWO CODES PER DATE, NOT ONE — split 2026-09-06 (mobile QoL audit, forms-F2).
 *
 * `*_MALFORMED` is the SHAPE refusal: the string is not `YYYY-MM-DD` at all.
 * `*_INVALID` is the CALENDAR refusal: the shape is right and the day does not
 * exist (`2026-02-31`). They used to share one code, so a person who typed
 * `20/08/2026` into the app read "esa fecha no existe" — a sentence about a
 * calendar, aimed at somebody whose only mistake was the format. The consumer
 * owns the words, but it cannot say two different things over one code.
 *
 * The server still accepts ISO only; the app converts before sending. Splitting
 * the code changes nothing about what the endpoint takes.
 */
export const RECORD_EVENT_INPUT_CODES = [
  "KIND_REQUIRED",
  "OCCURRED_AT_REQUIRED",
  "OCCURRED_AT_MALFORMED",
  "OCCURRED_AT_INVALID",
  "VACCINE_NAME_REQUIRED",
  "NEXT_DUE_AT_MALFORMED",
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
  "FIRST_DOSE_AT_MALFORMED",
  "FIRST_DOSE_AT_INVALID",
  "MEDICATION_SOURCE_REQUIRED",
  "TEXT_REQUIRED",
  "NOTE_CATEGORY_INVALID",
  "CHIP_NUMBER_REQUIRED",
  "STERILIZATION_PROCEDURE_INVALID",
  "VISIT_REASON_REQUIRED",
  "CLINICAL_SUB_KIND_INVALID",
  "CLINICAL_TITLE_REQUIRED",
  "SYMPTOM_TEXT_REQUIRED",
  "SYMPTOM_SEVERITY_INVALID",
  "ONSET_AT_MALFORMED",
  "ONSET_AT_INVALID",
  "MICROCHIP_REPLACE_REASON_INVALID",
  "MICROCHIP_REPLACE_NEW_CHIP_REQUIRED",
  "PPP_REGISTRY_REQUIRED",
  "DEATH_CAUSE_INVALID",
  "DEATH_DISPOSITION_INVALID",
  "DEATH_VET_CONTACT_INVALID",
  "DEATH_CLINIC_REQUIRES_AT_CLINIC",
  "DEATH_VET_CONTACT_REQUIRES_AT_CLINIC",
  "DEATH_VET_DECIDED_REQUIRES_NO_CONTACT",
  "DEATH_DISEASE_CODE_REQUIRED",
  "DEATH_DISEASE_CODE_UNKNOWN",
] as const;
export type RecordEventInputCode = (typeof RECORD_EVENT_INPUT_CODES)[number];

/**
 * The registries a PPP attestation may name when the animal's jurisdiction
 * has overridden nothing — the NATIONAL FALLBACK.
 *
 * MOVED HERE FROM `src/modules/events/domain/enums.ts` on 2026-09-08, which
 * re-exports it so its four existing importers keep reading ONE array. Same
 * move `STERILIZATION_PROCEDURES` got and for the same reason: a copy of these
 * three ids living in this package while the server kept its own literal is
 * exactly the drift this package exists to stop.
 *
 * IT IS A FALLBACK AND NOT THE ANSWER. `allowedAttestationRegistries` uses the
 * jurisdiction's own `ppp_attestation_required_registries` rule when it has
 * one, and this list only when it has none — plus `other`, always, on both
 * paths. A client that showed only these three to a jurisdiction that named
 * its own would be offering the wrong registries; a client that showed a FREE
 * TEXT BOX would be offering something the server refuses outright, because
 * the accepted set is a membership check and is never empty.
 *
 * That second mistake was shipped and caught in review the same day: the app's
 * attestation form fell back to a text input, which could only ever produce a
 * 400 unless the person happened to type an internal id.
 */
export const DANGEROUS_BREED_REGISTRIES = ["caba_4078", "prov_14107", "other"] as const;

/**
 * The nine causes of death, and the owner gets ALL NINE.
 *
 * Unlike `OWNER_MICROCHIP_REPLACE_REASONS`, which is five of the spine's seven
 * because two of them are professional findings, there is nothing here an owner
 * may not say about their own animal — checked against the web's own radio list
 * (`fallecimiento/DeathRecordForm.tsx:177-185`), which offers the nine.
 *
 * Mirrors `DEATH_CAUSES` in `src/modules/events/domain/death-rules.ts`; that
 * module remains the write-side authority and re-exports these from here, so
 * the two cannot drift into disagreement about what a cause is.
 */
export const DEATH_CAUSES = [
  "known",
  "unknown",
  "natural",
  "disease",
  "accident",
  "euthanasia",
  "sudden",
  "violent",
  "other",
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/** What was done with the body. `null` is a valid answer — many people do not know. */
export const DISPOSITION_METHODS = [
  "cremation_collective",
  "cremation_individual_ashes",
  "authorized_cemetery",
  "owner_burial",
  "household_waste",
  "rendering",
  "unknown",
] as const;
export type DispositionMethod = (typeof DISPOSITION_METHODS)[number];

/**
 * Whether the veterinarian reached the owner before acting.
 *
 * THREE VALUES AND NOT A BOOLEAN, because "no aplica" is a different fact from
 * "no la contactó" — the first says the animal did not die at a clinic, the
 * second is the precondition of `vetDecidedAlone`, which is the field a dispute
 * would turn on.
 */
export const VET_CONTACT_VALUES = ["yes", "no", "not_applicable"] as const;
export type VetContactValue = (typeof VET_CONTACT_VALUES)[number];
export type DangerousBreedRegistry = (typeof DANGEROUS_BREED_REGISTRIES)[number];

/**
 * es-AR label for a fallback registry.
 *
 * The SAME three strings `lib/events/events.ts` prints on the asiento's own
 * row, so the form a person fills and the ledger line they read afterwards
 * name the registry identically.
 */
export function dangerousBreedRegistryLabel(id: string): string {
  switch (id) {
    case "caba_4078":
      return "CABA · Ley 4078";
    case "prov_14107":
      return "Prov. Bs. As. · Ley 14.107";
    case "other":
      return "Otro registro";
    default:
      // A registry a jurisdiction named itself. Its own label travels with it
      // on the wire; this is only reached when a client asks for a label it
      // was not given, and the id is better than an empty row.
      return id;
  }
}

/**
 * The reasons an OWNER may give for replacing or revoking a microchip.
 *
 * FIVE OF THE SEVEN the spine knows. `duplicate_detected` and `fraud_detected`
 * are vet/admin findings — they open a `microchip_remediation` case — and the
 * web's owner action refuses them at the door (`OWNER_REASONS` in
 * `microchip-reemplazo/action.ts`). Same set here, for the same reason: a
 * bearer token must not be able to file a finding only a professional makes.
 */
export const OWNER_MICROCHIP_REPLACE_REASONS = [
  "damaged",
  "unreadable",
  "owner_request",
  "device_failure",
  "other",
] as const;
export type OwnerMicrochipReplaceReason = (typeof OWNER_MICROCHIP_REPLACE_REASONS)[number];

/**
 * The reasons under which `newChipNumber` may be null — a PURE REVOCATION that
 * leaves the animal without a chip. Any other reason is a replacement and needs
 * the new code. Mirrors `REVOCATION_REASONS` in the same web action.
 */
export const MICROCHIP_REVOCATION_REASONS = ["owner_request", "device_failure"] as const;

/** `"YYYY-MM-DD"` — what `<input type="date">` posts. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `"YYYY-MM-DDTHH:mm"`, seconds optional — what `<input type="datetime-local">` posts. */
const AR_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does this string name a day that EXISTS?
 *
 * LIVED HERE UNTIL WU-P, as a private helper. It moved to `./ar-calendar-day.ts`
 * unchanged, because the caretaker schema needs the identical rule and a second
 * copy of a calendar is how two doors onto one spine stop agreeing. The full
 * story of the defect it exists for is in that file's header; this alias is kept
 * so the four call sites below still read in this file's own vocabulary.
 */
const isRealDay = isRealArDay;

/** The same round-trip for the DATE half of a `"YYYY-MM-DDTHH:mm"` value. */
function isRealDayAndTime(value: string): boolean {
  if (!isRealDay(value.slice(0, 10))) return false;
  const [hours, minutes] = value.slice(11).split(":");
  const h = Number(hours);
  const m = Number(minutes);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

const isoDate = (
  required: RecordEventInputCode,
  malformed: RecordEventInputCode,
  invalid: RecordEventInputCode,
) =>
  z
    .string({ error: required })
    .trim()
    .min(1, { error: required })
    .regex(ISO_DATE_RE, { error: malformed })
    .refine(isRealDay, { error: invalid });

/** An optional free-text field: absent, blank and `null` all mean "not stated". */
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const occurredAt = isoDate("OCCURRED_AT_REQUIRED", "OCCURRED_AT_MALFORMED", "OCCURRED_AT_INVALID");

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
  .refine((v) => v === null || ISO_DATE_RE.test(v), { error: "NEXT_DUE_AT_MALFORMED" })
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
    .regex(AR_DATETIME_LOCAL_RE, { error: "FIRST_DOSE_AT_MALFORMED" })
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

/**
 * A SIGN THE OWNER SAW — and the one kind on this endpoint whose write reaches
 * past the animal's own record.
 *
 * `createSymptomObservedWriter` runs the free text through the disease matcher
 * and, for every REPORTABLE disease the match flags as alertable, appends a
 * system-authored `outbreak_signal`, enqueues an ENO outbox row and routes
 * notifications to the jurisdiction's authorities. That is the whole point of
 * the kind, not a side effect to be sorry about: a person noticing something at
 * 23:00 with a phone in their hand is the fastest surveillance input this
 * product has. It is stated here so no reader believes this variant is as
 * inert as `note`.
 *
 * NO `occurredAt`, WHICH IS THE WEB'S SHAPE AND NOT AN OMISSION. Every other
 * kind here is a dated act — a dose given, a weighing taken. A symptom is
 * NOTICED, and `createSymptomObservedAction` asks only for an OPTIONAL onset:
 * when it is absent the writer stamps the moment of REPORTING, because "I don't
 * know when this started" is the honest and common answer and a required date
 * field would collect a guess instead.
 */
const symptom = z.object({
  kind: z.literal("symptom"),
  /**
   * What the owner saw, in their words. NO CAP, matching the web, and the free
   * text is what the matcher reads — a truncation invented here would be a
   * symptom the web surfaces and the app silently drops.
   */
  freeText: z
    .string({ error: "SYMPTOM_TEXT_REQUIRED" })
    .trim()
    .min(1, { error: "SYMPTOM_TEXT_REQUIRED" }),
  /**
   * NULLABLE, and a bad value is a REFUSAL here where the web drops it to
   * `null`. The same call `note.category` makes, for the same reason: the web's
   * field is a `<select>` of the three, a JSON client has none, and a symptom
   * silently filed with no severity because the app sent `"moderado"` is a typo
   * that reaches the ledger.
   */
  severity: z.enum(SYMPTOM_SEVERITIES, { error: "SYMPTOM_SEVERITY_INVALID" }).nullish(),
  /**
   * When it STARTED, if the person knows. Absent, `null` and blank all mean
   * "not stated" — the same normalization `nextDueAt` does and for the same
   * reason: the web reads `String(formData.get("onsetAt") ?? "").trim() || null`
   * and an untouched date input reaches the writer as `null`.
   *
   * A STATED onset is held to the animal's own record — not in the future, not
   * before it was born — exactly as the web's action does before it writes.
   */
  onsetAt: z
    .union([z.string(), z.null()])
    .nullish()
    .transform((v) => {
      const trimmed = typeof v === "string" ? v.trim() : "";
      return trimmed.length === 0 ? null : trimmed;
    })
    .refine((v) => v === null || ISO_DATE_RE.test(v), { error: "ONSET_AT_MALFORMED" })
    .refine((v) => v === null || isRealDay(v), { error: "ONSET_AT_INVALID" }),
});

/**
 * Reemplazo o revocación de microchip — `microchip_replaced` on the spine.
 *
 * NOT A SECOND `microchip`. The implant kind above appends a fact about a chip
 * going in; this one RETIRES the canonical chip and, unless the reason is a
 * revocation, writes the successor into `pet_identifications`. Different
 * use-case (`replaceMicrochipForUser`), different table touched, and it always
 * leaves an `audit_log` row — the only owner-recordable kind that does.
 *
 * NO `previousChipNumber` ON THE WIRE, deliberately. The web's action reads the
 * pet's canonical chip server-side and refuses when there is none
 * ("Esta mascota no tiene microchip registrado"); the endpoint does the same. A
 * client that had to send the old code would be asserting a fact the server
 * already holds, and a mismatch would have to be adjudicated somewhere.
 *
 * `occurredAt` is the web's `replacedAt`, renamed to the wire's one word for a
 * day so the dispatcher routes it like every other dated kind.
 */
const microchipReplace = z.object({
  kind: z.literal("microchip_replace"),
  reason: z.enum(OWNER_MICROCHIP_REPLACE_REASONS, {
    error: "MICROCHIP_REPLACE_REASON_INVALID",
  }),
  /**
   * The successor chip's code, or null for a PURE revocation. Nullness is
   * only valid under `MICROCHIP_REVOCATION_REASONS`; the cross-field rule is in
   * the `superRefine` below, because a field-level schema cannot see `reason`.
   */
  newChipNumber: z
    .union([z.string(), z.null()])
    .nullish()
    .transform((v) => {
      const trimmed = typeof v === "string" ? v.trim() : "";
      return trimmed.length === 0 ? null : trimmed;
    }),
  replacedBy: optionalText,
  occurredAt,
  notes: optionalText,
});

/**
 * Atestación de raza potencialmente peligrosa — `dangerous_breed_attested`.
 *
 * REACHED FROM THE COMPLIANCE CARD, NOT THE PICKER. The web's page redirects
 * away unless `pet.potentiallyDangerousBreed` is set, so an unconditional row
 * in the asentar menu would be a form that refuses most animals. The endpoint
 * enforces the same precondition; the app's job is to offer the door only
 * where the card reads "Atestación requerida".
 *
 * `registry` is a jurisdiction-resolved choice — the options come from the
 * `ppp_attestation_required_registries` business rule for the pet's own
 * province/locality, carried on the owner pet detail as `pppRegistries`. Not a
 * fixed enum: an admin editing the rule changes what the owner may pick, so no
 * membership check lives here beyond "non-empty".
 *
 * `occurredAt` is the web's `attestedAt`.
 */
const dangerousBreedAttestation = z.object({
  kind: z.literal("dangerous_breed_attestation"),
  registry: z
    .string({ error: "PPP_REGISTRY_REQUIRED" })
    .trim()
    .min(1, { error: "PPP_REGISTRY_REQUIRED" }),
  registryId: optionalText,
  occurredAt,
  notes: optionalText,
});

/**
 * Fallecimiento — the terminal asiento.
 *
 * THE LARGEST MEMBER OF THIS UNION, and every field earns its place by being a
 * question the web form asks. What it does NOT carry is as deliberate: no
 * `custodyEpisodeCaseId` (the server finds the open custody case itself), no
 * `isReportable` (derived from the disease code by
 * `resolveDeathReportable`), and no jurisdiction — a death is a fact about an
 * animal whose jurisdiction the server already holds.
 *
 * FOUR CROSS-FIELD RULES live in the `superRefine` below rather than here,
 * because each of them reads two fields at once and zod's object shape cannot.
 * They are the same four `validateDeathCrossFields` enforces on the web, which
 * stays the write-side authority — these codes exist so the app can refuse the
 * combination BEFORE a round trip, with a sentence about the field the person
 * is looking at.
 */
const death = z.object({
  kind: z.literal("death"),
  cause: z.enum(DEATH_CAUSES, { error: "DEATH_CAUSE_INVALID" }),
  causeDetail: optionalText,
  occurredAt,
  confirmedByVet: z.boolean().optional().default(false),
  vetName: optionalText,
  // NULLABLE ON PURPOSE. "No sé qué se hizo con el cuerpo" is a real answer and
  // the web's select starts blank; a required field here would invent a
  // certainty the person does not have.
  dispositionMethod: z
    .enum(DISPOSITION_METHODS, { error: "DEATH_DISPOSITION_INVALID" })
    .nullish()
    .transform((v) => v ?? null),
  facility: optionalText,
  deathAtClinic: z.boolean().optional().default(false),
  clinicName: optionalText,
  vetContactedOwner: z
    .enum(VET_CONTACT_VALUES, { error: "DEATH_VET_CONTACT_INVALID" })
    .nullish()
    .transform((v) => v ?? null),
  vetDecidedAlone: z.boolean().optional().default(false),
  ownerToPrivateCrematorium: z.boolean().optional().default(false),
  diseaseCode: optionalText,
  confirmedByLab: z.boolean().optional().default(false),
  notes: optionalText,
});

/**
 * The four cross-field rules of a death record.
 *
 * ITS OWN FUNCTION FOR THE LINTER'S REASON, not an aesthetic one: adding this
 * kind took `superRefine` past the cognitive-complexity ceiling. The
 * alternative was to add this file to the override list, which raises the
 * ceiling for the WHOLE contract — a general loosening bought to settle one
 * block. Same trade, same answer, as the endpoint's `appendUniformKind` split.
 *
 * The rules and their order are `validateDeathCrossFields`'s
 * (death-rules.ts:66-95). That function stays the write-side authority and
 * refuses the same combinations in es-AR prose; these are codes the app turns
 * into a sentence pointing at the field the person is looking at, before a
 * round trip rather than after one.
 */
function refineDeath(
  input: {
    cause: string;
    clinicName: string | null;
    deathAtClinic: boolean;
    vetContactedOwner: string | null;
    vetDecidedAlone: boolean;
    diseaseCode: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  // A clinic name without "falleció en una veterinaria" is a half-answered
  // question, not extra information.
  if (input.clinicName !== null && !input.deathAtClinic) {
    ctx.addIssue({
      code: "custom",
      message: "DEATH_CLINIC_REQUIRES_AT_CLINIC",
      path: ["clinicName"],
    });
  }
  if (input.vetContactedOwner !== null && !input.deathAtClinic) {
    ctx.addIssue({
      code: "custom",
      message: "DEATH_VET_CONTACT_REQUIRES_AT_CLINIC",
      path: ["vetContactedOwner"],
    });
  }
  // THE FIELD A DISPUTE WOULD TURN ON. "El veterinario decidió sin
  // contactarme" only means something when the answer to "¿te contactó?"
  // was NO — under "sí" or "no aplica" it is a contradiction, and this
  // record is the one a person may later take to a colegio profesional.
  if (input.vetDecidedAlone && input.vetContactedOwner !== "no") {
    ctx.addIssue({
      code: "custom",
      message: "DEATH_VET_DECIDED_REQUIRES_NO_CONTACT",
      path: ["vetDecidedAlone"],
    });
  }
  if (input.cause === "disease") {
    if (input.diseaseCode === null) {
      ctx.addIssue({
        code: "custom",
        message: "DEATH_DISEASE_CODE_REQUIRED",
        path: ["diseaseCode"],
      });
    } else if (!findDisease(input.diseaseCode)) {
      // THE CATALOG IS THE CONTRACT'S OWN, which is why this check can live
      // on the wire at all. It moved into `@dim/contract/reference` with
      // this kind (2026-09-08) so the native picker draws the same codes
      // the server accepts — a picker that cannot name them could only ever
      // produce a 400.
      ctx.addIssue({
        code: "custom",
        message: "DEATH_DISEASE_CODE_UNKNOWN",
        path: ["diseaseCode"],
      });
    }
  }
}

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
    symptom,
    microchipReplace,
    dangerousBreedAttestation,
    death,
  ])
  .superRefine((input, ctx) => {
    // THE ONE CROSS-FIELD RULE OF A REPLACEMENT: leaving the animal with no
    // chip is only a valid outcome under the two revocation reasons. The web's
    // action refuses the same combination with the same words
    // ("Para dejar la mascota sin chip, el motivo debe ser…"); here it is a
    // code the app turns into that sentence.
    if (input.kind === "microchip_replace") {
      const isRevocation = (MICROCHIP_REVOCATION_REASONS as readonly string[]).includes(
        input.reason,
      );
      if (input.newChipNumber === null && !isRevocation) {
        ctx.addIssue({
          code: "custom",
          message: "MICROCHIP_REPLACE_NEW_CHIP_REQUIRED",
          path: ["newChipNumber"],
        });
      }
      return;
    }

    if (input.kind === "death") {
      refineDeath(input, ctx);
      return;
    }

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
