// The eleven owner writers, behind `POST /api/v1/pets/{publicToken}/events`.
//
// Split out of `route.ts` for the reason the amend endpoint split its own
// handler: that file's subject is "is this request well formed", and this one's
// is "may this event be written, and what exactly does it say". They are
// different questions with different failure vocabularies, and the linter's
// complexity ceiling agrees.
//
// WHO MAY WRITE — VERIFIED AGAINST THE WEB, NOT ASSUMED, AND NOT UNIFORM
// ---------------------------------------------------------------------------
// TEN OF THE ELEVEN are guarded on the web by `requireAlivePetAccess(publicToken)`,
// cited at the GUARD CALL rather than at the function that contains it — a
// function's first line drifts every time somebody adds a parameter, and the
// line that matters is the one naming the rule:
//
//   vacuna              `createVaccinationAction`     actions-medical.ts:71
//   peso                `createWeightAction`          actions-medical.ts:170
//   antiparasitario     `createDewormingAction`       actions-medical.ts:243
//   esterilización      `createSterilizationAction`   actions-medical.ts:337
//   medicación inicio   `createMedicationStartAction` actions-medical.ts:412
//   medicación fin      `createMedicationEndAction`   actions-medical.ts:519
//   microchip           `createMicrochipAction`       actions.ts:103
//   visita veterinaria  `createVetVisitAction`        actions.ts:321
//   información clínica `createClinicalInfoAction`    actions.ts:408
//   síntoma             `createSymptomObservedAction` actions.ts:722
//
// Read literally, that guard is:
//
//   · Any CURRENT HOLDER on the person path — owner, co_owner, foster OR
//     caretaker. Not titular-only.
//   · An ORG-path member whose membership grants `event.write`.
//   · Never on a DECEASED animal: a closed life record accepts no new clinical
//     events.
//
// THE ELEVENTH — NOTA (`createNoteAction`, actions.ts:257) — IS GUARDED BY
// `requirePetAccess` PLUS AN ORG CAPABILITY CHECK THE ACTION PERFORMS ITSELF,
// and the asymmetry that remains is now HALF of what it used to be.
//
// It used to be both halves. `requirePetAccess` checks neither capability nor
// life status, so a nota needed no `event.write` on the org path AND was
// accepted on a deceased animal, and this file mirrored both — on the grounds
// that the server actions are themselves addressable endpoints, so narrowing
// here would only make the two doors disagree. That reasoning was right about
// the doors and wrong about which way to resolve it: the org ficha has always
// GATED the note form on `event.write`, and the two writers behind it (the
// action and this route) both let an ungated member through. The PO ratified
// the gate as the rule on 2026-08-26, so BOTH doors close, in the same commit,
// rather than one of them narrowing alone.
//
// WHAT SURVIVES, AND IT IS THE HALF THAT MATTERED: a nota is still accepted on
// a DECEASED animal, on both doors. A memorial note is the one thing a grieving
// owner may still write into the libreta, and an endpoint that "tidied up" the
// eleven into one guard would take it away. The PO ratified a rule about the
// CALLER; the closed life record is a fact about the ANIMAL, and widening that
// would be a second, unratified behaviour change.
//
// The remaining asymmetry is enforced BY CONSTRUCTION rather than by
// resemblance: both doors resolve through one query
// (`resolvePetHolderAccess`), and the only branch below is the
// `kind === "note"` early return in `checkWriteGuard` — which now sits AFTER
// the capability check rather than in front of it.
//
// SÍNTOMA IS THE ONE WHOSE WRITE LEAVES THE ANIMAL'S OWN RECORD
// ---------------------------------------------------------------------------
// Ten of these eleven append a fact and, at most, schedule a reminder for the
// household. `createSymptomObservedWriter` runs the free text through the
// disease matcher and, for every REPORTABLE disease flagged alertable, appends
// a system-authored `outbreak_signal`, enqueues an ENO outbox row and routes
// notifications to the jurisdiction's authorities — and when the animal is
// already under an antirrabic observation, escalates.
//
// THAT IS THE REASON TO OFFER IT, not a reason to hesitate. The fan-out is the
// point of the kind; a person noticing something at 23:00 with a phone in their
// hand is the fastest surveillance input this product has, and it was reachable
// from a browser and not from the app. What the phone must NOT do is invent any
// of it: the matcher, the signals, the outbox row and the routing all run
// SERVER-SIDE off the free text, exactly as they do for the web form, and the
// wire carries no disease code, no signal and no recipient.
//
// IT DOES NOT OPEN A CASE, which is the line that separates it from mordedura
// below. The rabies escalation fires only when `pets.rabiesObservationStatus`
// is ALREADY `in_progress` — a lifecycle somebody else started.
//
// WHAT DELIBERATELY DID NOT CROSS, AND ON WHAT EVIDENCE
// ---------------------------------------------------------------------------
//   · DIAGNÓSTICO DE ENFERMEDAD (`recordDiseaseDiagnosisAction`,
//     actions.ts:561 — the line naming ITS rule, same convention). NOT AN OWNER
//     WRITER AT ALL: it performs no ownership check whatsoever and authorizes on
//     `role === "vet" && matriculaVerified`.
//     It shares an `event_type` with información clínica —
//     `clinical_info_logged`, sub_kind `disease_diagnosis` — which is one of the
//     two reasons the contract's `CLINICAL_SUB_KINDS` holds five of the spine's
//     SEVEN. An owner's bearer token must not sign a professional's claim.
//   · MORDEDURA (`reportBiteAction`, surveillance/actions.ts:191) IS an owner
//     writer under this same guard, and is still not here: it does not append a
//     fact, it OPENS A CASE — a `rabies_observation_started` cascade, a
//     10-day observation lifecycle and an authority fan-out across
//     jurisdictions. That belongs in its own work unit with its own contract,
//     not as a twelfth branch of a switch whose other eleven only append.
//   · PERDIDA / ENCONTRADA (`setPetLostAction` actions.ts:811,
//     `setPetFoundAction` actions.ts:965) mutate `pets.status` and carry
//     disclosure preferences, an enriched description and an alert fan-out.
//     Lost mode is a FEATURE and not an asiento: it belongs behind its own
//     endpoints with their own shapes, not as branches of a switch whose whole
//     job is to append one row.
//   · FALLECIMIENTO (`createDeathRecordAction`, actions.ts:1014) is guarded by
//     `requirePetAccess` like nota, and is deferred for shape rather than for
//     reach: five cross-field rules, a disease-code lookup and a custody-episode
//     stamp read before the transaction.
//   · ATESTACIÓN PPP (actions.ts:179) and EMBARAZO (app/actions/pregnancy.ts:41,
//     :86) are owner writers whose use-cases DO NOT ROUTE THROUGH
//     `insertEventIdempotent` — they insert plainly, with no
//     `clientIdempotencyKey` parameter to pass. This endpoint REQUIRES an
//     `Idempotency-Key` and promises it is honoured; accepting a kind that
//     silently could not honour it would make that promise false, which is
//     worse than not offering the kind. Closing that gap is a change to those
//     writers, not to this file.
//
//     SÍNTOMA WAS LISTED HERE ON EXACTLY THAT GROUND AND THE GROUND WAS FALSE.
//     `createSymptomObservedWriter` has taken a `clientIdempotencyKey` and
//     branched to `insertEventIdempotent` since the W-1 fix of 2026-06-07, with
//     parity tests, and `createSymptomObservedAction` reads the field off its
//     own form (actions.ts:749) and passes it (:771). The exclusion outlived
//     its reason by two work units because nobody re-read the writer — which is
//     the argument for citing a LINE and not a belief.
//
// WHAT THE SERVER DECIDES AND THE CLIENT MAY NOT
// ---------------------------------------------------------------------------
//   · THE DATE'S MEANING. `occurredAt` arrives as `"YYYY-MM-DD"` and is anchored
//     at noon UTC by the same `parseDateInput` the web uses. The plausibility
//     rules (not in the future, not before the animal's registered birth) run
//     against the PET'S RECORD, which a client does not hold and must not be
//     asked to.
//   · THE SCHEDULE. A medication's dose times come out of `parseFrequencyFields`
//     + `generateDoseSchedule` here, never off the wire. A client that computed
//     its own would be a second source for the reminder rows.
//   · THE SIGNATURE. The person path signs as the owner; the org path signs as
//     its member's resolved authorship, which is `vet` only when that member
//     holds a validated matrícula. Re-deriving either would be a native write
//     claiming a verification nobody gave it.
//
// NO ATTACHMENTS ON THIS PATH. Ten of the eleven web forms offer a file and
// every call below passes `uploadedPath: null`, because a native upload needs a
// signed URL and that whole path is blocked. Stated here rather than left as
// three nulls a reader has to interpret. It costs the four WU-L kinds more than
// it costs the first six — a lab result and a sterilization certificate are the
// kind of asiento a person photographs — and that is an argument for unblocking
// the upload, not for a native form that pretends to take one. Síntoma is the
// exception that does not pay it: its web form takes no file either, so the
// native one loses nothing.

import { assertOccurredAtPlausible } from "@/lib/events/plausibility";
import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import {
  OWNER_AUTHORSHIP,
  type PetHolderAccess,
  resolvePetHolderAccess,
} from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { reportError } from "@/lib/infra/report-error";
import { findDrugByLabel } from "@/lib/reference/drugs";
import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/reference/medication-schedule";
import { parseDateInput } from "@/lib/utils/format";
import { createClinicalInfo } from "@/src/modules/events/application/clinical/clinical-info-use-case";
import { createVetVisit } from "@/src/modules/events/application/clinical/vet-visit-use-case";
import { createMicrochip } from "@/src/modules/events/application/identity/microchip-use-case";
import { createNote } from "@/src/modules/events/application/identity/note-use-case";
import { createDeworming } from "@/src/modules/events/application/medical/deworming-use-case";
import { createMedicationEnd } from "@/src/modules/events/application/medical/medication-end-use-case";
import { createMedicationStart } from "@/src/modules/events/application/medical/medication-start-use-case";
import { createSterilization } from "@/src/modules/events/application/medical/sterilization-use-case";
import { createVaccination } from "@/src/modules/events/application/medical/vaccination-use-case";
import { createWeight } from "@/src/modules/events/application/medical/weight-use-case";
import { createSymptomObservedWriter } from "@/src/modules/events/application/surveillance/symptom-observed-use-case";
import type { RecordedEvent, UseCaseResult } from "@/src/modules/events/application/types";
// NOT a copy of the flush, and the export's own docblock says why moving it
// into a shared module is refused by two fences. Imported from the module that
// is already allowed to hold that insert.
import { flushNotifications } from "@/src/modules/events/application/writers";
import { EventsRepository } from "@/src/modules/events/infrastructure/events-repository";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import type { EventRecordedV1 } from "@dim/contract/api";
import type { RecordEventInput } from "@dim/contract/input";

import { db } from "@/db";

/**
 * The pre-write reads: the access query, the org capability lookup, the
 * same-day probe and the medication-source lookup.
 *
 * The WRITE is deliberately outside any budget, for the reason `POST
 * /api/v1/pets` records and the amend endpoint repeats: `withDbBudgetOrThrow`
 * races a promise against a timer and rejects, which does not abort a Postgres
 * transaction. Wrapping the append would produce a 503 for a transaction that
 * then COMMITS — the client sees failure, the ledger has the event, and the two
 * disagree forever. The honest bound is the platform's function timeout and the
 * honest recovery is the retry the `Idempotency-Key` guarantees is safe.
 */
const RESOLVE_BUDGET_MS = 8_000;

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/** The 503 this endpoint answers for every degraded pre-write read. */
export function unavailable() {
  return apiV1Error("temporarily_unavailable", 503, {
    "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
  });
}

/**
 * `"YYYY-MM-DD"` → the instant the web anchors it at, or `null` if that string
 * does not name a real day.
 *
 * `parseDateInput` ALONE IS NOT THAT CHECK, and this is the one place on this
 * surface where the difference writes a wrong fact into an append-only ledger.
 * `new Date("2026-02-31T12:00:00Z")` neither throws nor is `NaN` — JavaScript
 * rolls it over to 3 March — so `parseDateInput` returns a perfectly good Date
 * for a day that never existed, and the vaccination lands three days late with
 * nothing reporting a substitution.
 *
 * The contract's schema refuses it first, so this is a backstop. It exists
 * anyway because a schema and a writer agreeing today is not a reason for the
 * writer to have no opinion about a date it is about to make permanent.
 */
function parseWireDay(value: string): Date | null {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

/**
 * The `pet_events.event_type` each wire `kind` becomes.
 *
 * EVERY KIND, though only two are ever indexed — the same-day gate is the one
 * reader and it applies to vaccination and deworming alone. The rest are here
 * because this is the table a person asks for ("which spine row is a
 * `medication_end`?") and answering a fraction of that question would send them
 * hunting through the use-cases for the remainder. The `kind → event_type`
 * mapping is otherwise implicit in the dispatch below, which is not a place to
 * read it.
 *
 * NO COUNT IN THIS SENTENCE, deliberately, for the reason `RecordedEvent`'s doc
 * dropped its own: it said "all six" while listing ten, because a number in
 * prose has to be edited every time a kind crosses and nothing fails when it is
 * not. The property is that the map is TOTAL over the union — which the
 * `satisfies` below states to the typechecker instead of to a reader.
 */
const EVENT_TYPE_OF_KIND = {
  vaccination: "vaccination_administered",
  weight: "weight_recorded",
  deworming: "deworming_administered",
  medication_start: "medication_started",
  medication_end: "medication_stopped",
  note: "note_added",
  microchip: "microchip_implanted",
  sterilization: "sterilization_performed",
  vet_visit: "vet_visit_logged",
  clinical_info: "clinical_info_logged",
  symptom: "symptom_observed",
} as const satisfies Record<RecordEventInput["kind"], string>;

type WriteContext = {
  publicToken: string;
  userId: string;
  idempotencyKey: string;
  input: RecordEventInput;
};

/** Everything from the access guard to the append. */
export async function writeEvent(ctx: WriteContext) {
  let access: PetHolderAccess;
  try {
    access = await withDbBudgetOrThrow(
      resolvePetHolderAccess(ctx.publicToken, ctx.userId),
      RESOLVE_BUDGET_MS,
      "api-v1-event-access",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  // A pet this caller may not touch and a pet that does not exist answer
  // IDENTICALLY, exactly as every read endpoint on this surface does.
  if (access.kind === "none") return apiV1Error("not_found", 404);

  const guard = await checkWriteGuard(access, ctx.input.kind);
  if (guard) return guard;

  // THE DAY THIS EVENT IS ABOUT, or `null` for the one kind entitled not to name
  // one. Ten kinds state it outright; síntoma carries an OPTIONAL `onsetAt`,
  // and when it is absent the use-case stamps the moment of REPORTING — the
  // same shape `createSymptomObservedAction` has.
  const day = ctx.input.kind === "symptom" ? ctx.input.onsetAt : ctx.input.occurredAt;

  let occurredAt: Date | null = null;
  if (day !== null) {
    occurredAt = parseWireDay(day);
    if (!occurredAt) return apiV1Error("invalid_request", 400);
  }

  const repo = new EventsRepository();

  // BOTH GATES NEED A DAY, and the one kind that may lack one passes through
  // both untouched anyway: síntoma is neither of the two the same-day gate
  // reads, nor a medicación fin. Skipping them when there is no day is
  // therefore not a carve-out — it is the same answer, reached without asking
  // the database a question with a `null` in it.
  if (occurredAt) {
    const plausible = assertOccurredAtPlausible({
      occurredAt,
      // The wire carries a DAY, so the future check compares ARGENTINE CALENDAR
      // DAYS and not instants — comparing the noon-UTC anchor against `now`
      // would refuse every same-day entry made before 09:05 AR.
      isDateOnly: true,
      petDateOfBirth: access.pet.dateOfBirth,
    });
    if (!plausible.ok) {
      return apiV1Error(
        plausible.error === "FUTURE_DATE" ? "event_date_future" : "event_date_before_birth",
        400,
      );
    }

    const softGate = await checkSameDayGate(repo, access.pet.id, ctx.input, occurredAt);
    if (softGate) return softGate;
  }

  const sourceCheck = await checkMedicationSource(repo, access.pet.id, ctx.input);
  if (sourceCheck) return sourceCheck;

  return append(ctx, access, occurredAt, repo);
}

/**
 * The access refusals, and the one place the note's looser rule is decided.
 *
 * `null` means "write it". Both refusals are named by WHOSE fact they are: the
 * closed life record is about the ANIMAL (409, and nothing the caller can
 * retry or reword), the missing capability is about the CALLER (403).
 *
 * THE ORDER OF THE TWO CHECKS IS THE RULE, and it changed on 2026-08-26. The
 * caller-side check now runs FIRST and applies to all eleven kinds; only the
 * animal-side one is skipped for a nota. Written this way rather than as a
 * second `kind === "note"` branch inside the org arm because the asymmetry is
 * now exactly one line long, and a reader can see which half of the guard the
 * nota is exempt from without holding two conditions in their head.
 */
async function checkWriteGuard(
  access: Exclude<PetHolderAccess, { kind: "none" }>,
  kind: RecordEventInput["kind"],
) {
  // ABOUT THE CALLER — every kind, nota included since the PO ratified the org
  // ficha's gate as the rule (2026-08-26). `createNoteAction` performs this
  // same check at the cookie door, so the two still agree by construction.
  if (access.kind === "org") {
    const granted = await getGrantedCapabilities(access.membership);
    if (!granted.has("event.write")) return apiV1Error("event_forbidden", 403);
  }

  // ABOUT THE ANIMAL — and the nota is still exempt, on BOTH doors. A closed
  // life record refuses clinical facts; a memorial note is the one thing a
  // grieving owner (or the shelter that held the animal when it died) may still
  // write. `createNoteAction` still guards with `requirePetAccess` and not the
  // alive variant, which is what keeps this line honest.
  if (kind === "note") return null;

  if (access.pet.status === "deceased") return apiV1Error("event_not_allowed", 409);

  return null;
}

/**
 * The same-day soft gate, for the two kinds the web asks about.
 *
 * NOT A REFUSAL THE CALLER CANNOT PASS: it answers 409 once, the client asks
 * "¿registrar otra igual?", and a caller who means it re-sends the identical
 * body with `sameDayOverride: true`. Two doses of one product on one day are
 * unusual and not impossible — a hard rule here would be this endpoint claiming
 * to know the animal better than the person holding it.
 *
 * Runs BEFORE the append, as the web's does, so a prompt round trip never
 * leaves anything behind.
 */
async function checkSameDayGate(
  repo: EventsRepository,
  petId: string,
  input: RecordEventInput,
  occurredAt: Date,
) {
  if (input.kind !== "vaccination" && input.kind !== "deworming") return null;
  if (input.sameDayOverride) return null;

  try {
    const duplicate = await withDbBudgetOrThrow(
      repo.findSameDayEventOfType(petId, EVENT_TYPE_OF_KIND[input.kind], occurredAt),
      RESOLVE_BUDGET_MS,
      "api-v1-event-sameday",
    );
    if (duplicate) return apiV1Error("same_day_duplicate_suspected", 409);
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  return null;
}

/**
 * That a medication END names a real START on THIS animal.
 *
 * Checked here so the refusal carries a status a client can switch on, and
 * checked AGAIN inside the use-case, which is where it belongs — the same
 * belt-and-braces the amend endpoint applies to its allowlist.
 *
 * NOT `not_found`: on this surface that code always means the PET, and
 * answering 404 to a bad medication reference would tell a client its animal
 * had vanished.
 */
async function checkMedicationSource(
  repo: EventsRepository,
  petId: string,
  input: RecordEventInput,
) {
  if (input.kind !== "medication_end") return null;

  try {
    const source = await withDbBudgetOrThrow(
      repo.findSourceMedicationEvent(petId, input.medicationStartedEventId),
      RESOLVE_BUDGET_MS,
      "api-v1-event-medsource",
    );
    if (!source || source.eventType !== "medication_started") {
      return apiV1Error("medication_source_invalid", 400);
    }
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  return null;
}

/** Dispatch to the use-case for this kind, then answer. */
async function append(
  ctx: WriteContext,
  access: Exclude<PetHolderAccess, { kind: "none" }>,
  occurredAt: Date | null,
  repo: EventsRepository,
) {
  const { input } = ctx;
  const pet = access.pet;

  // SÍNTOMA IS DISPATCHED FIRST AND SEPARATELY, because it shares neither of the
  // two things every other branch below shares: it has no `occurredAt` of its
  // own to anchor, and its writer answers in its own shape rather than in
  // `UseCaseResult<RecordedEvent>`. Folding it into the switch would mean a
  // `common` object with a nullable date nine branches must not have, and a
  // result variable typed as a union of two shapes.
  if (input.kind === "symptom") return appendSymptom(ctx, access, input, repo);

  // Every remaining kind states its day outright, and `writeEvent` refused the
  // request before reaching here if that day did not parse.
  if (!occurredAt) return apiV1Error("invalid_request", 400);

  const common = {
    user: { id: ctx.userId },
    // The person path signs as the owner; the org path signs as its member's
    // resolved authorship. Never re-derived here.
    eventAuthorship: access.kind === "org" ? access.eventAuthorship : OWNER_AUTHORSHIP,
    occurredAt,
    // No native upload path exists yet — see the file header.
    uploadedPath: null,
    uploadedMimeType: null,
    uploadedSize: null,
    clientIdempotencyKey: ctx.idempotencyKey,
  };
  const deps = {
    repo,
    transaction: async <T>(cb: (tx: unknown) => Promise<T>) =>
      db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>,
  };

  let result: UseCaseResult<RecordedEvent>;

  switch (input.kind) {
    case "vaccination":
      result = await createVaccination(
        {
          ...common,
          pet: { id: pet.id },
          vaccineName: input.vaccineName,
          brand: input.brand,
          batch: input.batch,
          administeredBy: input.administeredBy,
          nextDueAt: input.nextDueAt ? parseWireDay(input.nextDueAt) : null,
          notes: input.notes,
          // The web's "this dose completes that reminder" field. Absent until
          // the app grows the affordance that would produce one.
          sourceReminderId: null,
        },
        deps,
      );
      break;

    case "weight":
      result = await createWeight(
        {
          ...common,
          pet: { id: pet.id },
          // The SAME normalization the web applies before the write, so one
          // animal weighed from two surfaces reads the same in the ledger.
          kgStr: input.kg.toFixed(2),
          notes: input.notes,
        },
        deps,
      );
      break;

    case "deworming":
      result = await createDeworming(
        {
          ...common,
          pet: { id: pet.id, name: pet.name },
          product: input.product,
          type: input.type,
          nextDueAt: input.nextDueAt ? parseWireDay(input.nextDueAt) : null,
          notes: input.notes,
        },
        deps,
      );
      break;

    case "medication_start": {
      // The schema already checked these bounds; this is the web's own parser,
      // run as the backstop AND as the converter — `firstDoseAt` becomes an
      // instant here, read as Argentine wall clock, because a dose at 08:00
      // means 08:00 where the animal lives.
      const freq = parseFrequencyFields(
        input.frequency,
        input.customHours == null ? null : String(input.customHours),
        input.durationDays == null ? null : String(input.durationDays),
        input.firstDoseAt,
      );
      if (freq.error !== null) return apiV1Error("invalid_request", 400);

      const schedule = generateDoseSchedule({
        firstDoseAt: freq.firstDoseAt,
        intervalHours: intervalHoursForFrequency(freq.frequency, freq.customHours),
        durationDays: freq.durationDays,
      });

      result = await createMedicationStart(
        {
          ...common,
          pet: { id: pet.id, name: pet.name },
          drugName: input.drugName,
          dose: input.dose,
          prescribedBy: input.prescribedBy,
          notes: input.notes,
          frequency: freq.frequency,
          customHours: freq.customHours,
          durationDays: freq.durationDays,
          firstDoseAt: freq.firstDoseAt,
          schedule,
          matchedDrugCode: findDrugByLabel(input.drugName)?.code ?? null,
          frequencyLabel: FREQUENCY_LABELS[freq.frequency] ?? freq.frequency,
        },
        deps,
      );
      break;
    }

    case "medication_end":
      result = await createMedicationEnd(
        {
          ...common,
          pet: { id: pet.id },
          medicationStartedEventId: input.medicationStartedEventId,
          reason: input.reason,
          notes: input.notes,
        },
        deps,
      );
      break;

    case "note":
      result = await createNote(
        {
          ...common,
          pet: { id: pet.id },
          text: input.text,
          category: input.category ?? null,
        },
        deps,
      );
      break;

    case "microchip": {
      // THE CANONICAL CHIP, read here because the use-case needs the NUMBER and
      // not a boolean. `createMicrochipAction` resolves it the same way and its
      // own header says why: a boolean collapses "re-submitted the same chip"
      // and "implanted a different one" into one branch, and that branch wrote
      // the event while skipping the canonical row.
      let canonicalChipNumber: string | null;
      try {
        const existing = await withDbBudgetOrThrow(
          fetchActiveIdentifications(pet.id),
          RESOLVE_BUDGET_MS,
          "api-v1-event-chip",
        );
        canonicalChipNumber = existing.microchip?.code ?? null;
      } catch (err) {
        if (err instanceof DbBudgetExceededError) return unavailable();
        throw err;
      }

      result = await createMicrochip(
        {
          ...common,
          pet: { id: pet.id, canonicalChipNumber },
          chipNumber: input.chipNumber,
          countryCode: input.countryCode,
          implantedBy: input.implantedBy,
          locationOnBody: input.locationOnBody,
          notes: input.notes,
        },
        deps,
      );
      break;
    }

    case "sterilization":
      result = await createSterilization(
        {
          ...common,
          pet: { id: pet.id },
          procedure: input.procedure,
          performedBy: input.performedBy,
          clinic: input.clinic,
          notes: input.notes,
        },
        deps,
      );
      break;

    case "vet_visit":
      result = await createVetVisit(
        {
          ...common,
          pet: { id: pet.id },
          reason: input.reason,
          diagnosis: input.diagnosis,
          vetName: input.vetName,
          clinic: input.clinic,
          notes: input.notes,
          // NOT a narrowing: the web runs its capture through
          // `normalizeLocationForWrite`, and an untouched form resolves to this
          // same pair of nulls. See the contract header for why the app has no
          // location to send yet.
          eventJurisdictionProvince: null,
          eventJurisdictionLocality: null,
        },
        deps,
      );
      break;

    case "clinical_info":
      result = await createClinicalInfo(
        {
          ...common,
          pet: { id: pet.id },
          subKind: input.subKind,
          title: input.title,
          details: input.details,
          performedBy: input.performedBy,
          notes: input.notes,
          // Same pair of nulls, same reason, as visita veterinaria above.
          eventJurisdictionProvince: null,
          eventJurisdictionLocality: null,
        },
        deps,
      );
      break;

    default: {
      const unhandled: never = input;
      throw new Error(`Unhandled event kind: ${JSON.stringify(unhandled)}`);
    }
  }

  if (!result.ok) {
    // ONE generic code, for the reason `pet_registration_failed` is one: these
    // six use-cases carry an untyped `string` failure arm holding es-AR prose
    // written for a web form, and it can name internal constraints. Every
    // branch a client can act on differently was decided ABOVE, before the
    // write — which is what makes a single code here honest rather than lazy.
    reportError("api-v1-event", new Error(result.error), { userId: ctx.userId });
    return apiV1Error("event_failed", 500);
  }

  // 201 on both paths. A replay answers with the FIRST attempt's event and
  // `wasDuplicate: true`: the caller asked for an asiento to exist and one
  // exists, which is a success and not a conflict.
  const payload: EventRecordedV1 = {
    eventId: result.value.eventId,
    wasDuplicate: result.value.wasDuplicate,
  };
  return apiV1Json(payload, { status: 201 });
}

/**
 * SÍNTOMA — the one write on this endpoint that reaches past the animal.
 *
 * WHAT THE PHONE SENDS IS THREE FIELDS AND NOTHING ELSE: the free text, an
 * optional self-assessed severity, an optional onset. Everything the write
 * FANS OUT to — which reportable diseases the text matched, the
 * system-authored `outbreak_signal` rows, the ENO outbox entry, the
 * jurisdiction's recipients, the antirrabic escalation — is decided inside the
 * writer, off the pet's own record. A wire that carried a disease code would be
 * a client filing a claim; a wire that carried a recipient would be a client
 * choosing who gets woken up.
 *
 * THE ANIMAL'S SURVEILLANCE CONTEXT IS READ HERE, from the access query's own
 * pet row rather than re-fetched: species and jurisdiction decide which
 * authorities a signal reaches, and `rabiesObservationStatus` decides whether
 * this is an ordinary report or an escalation inside an open observation. Every
 * one of them already came back with the guard.
 */
async function appendSymptom(
  ctx: WriteContext,
  access: Exclude<PetHolderAccess, { kind: "none" }>,
  input: Extract<RecordEventInput, { kind: "symptom" }>,
  repo: EventsRepository,
) {
  const pet = access.pet;

  const result = await createSymptomObservedWriter(
    {
      petId: pet.id,
      petPublicToken: pet.publicToken,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      rabiesObservationStatus: pet.rabiesObservationStatus ?? null,
      recordedByUserId: ctx.userId,
      // Same rule as every other kind: the person path signs as the owner, the
      // org path as its member's resolved authorship. Never re-derived here.
      eventAuthorship: access.kind === "org" ? access.eventAuthorship : OWNER_AUTHORSHIP,
      freeText: input.freeText,
      severity: input.severity ?? null,
      onsetAt: input.onsetAt,
      clientIdempotencyKey: ctx.idempotencyKey,
    },
    {
      repo,
      transaction: async <T>(cb: (tx: unknown) => Promise<T>) =>
        db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>,
      // THE FAN-OUT'S LAST LEG, and an endpoint that dropped it would be the
      // quietest possible regression: every signal still written, every row
      // still on the spine, and nobody told. The web's action passes the same
      // function; this is not the endpoint's own notion of who to notify.
      flushNotifications,
    },
  );

  if (!result.ok) {
    reportError("api-v1-event", new Error(result.error), { userId: ctx.userId });
    return apiV1Error("event_failed", 500);
  }

  // THE SYMPTOM'S OWN EVENT ID, never a signal's. `signalEventIds` are
  // system-authored rows about a DISEASE in a jurisdiction; the asiento the
  // owner wrote is the one they can open, correct and see in the libreta.
  const payload: EventRecordedV1 = {
    eventId: result.symptomEventId,
    wasDuplicate: result.wasDuplicate,
  };
  return apiV1Json(payload, { status: 201 });
}
