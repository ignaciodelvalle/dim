// The six daily writers, behind `POST /api/v1/pets/{publicToken}/events`.
//
// Split out of `route.ts` for the reason the amend endpoint split its own
// handler: that file's subject is "is this request well formed", and this one's
// is "may this event be written, and what exactly does it say". They are
// different questions with different failure vocabularies, and the linter's
// complexity ceiling agrees.
//
// WHO MAY WRITE — VERIFIED AGAINST THE WEB, NOT ASSUMED, AND NOT UNIFORM
// ---------------------------------------------------------------------------
// FIVE OF THE SIX (vacuna, peso, antiparasitario, medicación inicio, medicación
// fin) are guarded on the web by `requireAlivePetAccess(publicToken)`. Read
// literally, that is:
//
//   · Any CURRENT HOLDER on the person path — owner, co_owner, foster OR
//     caretaker. Not titular-only.
//   · An ORG-path member whose membership grants `event.write`.
//   · Never on a DECEASED animal: a closed life record accepts no new clinical
//     events.
//
// THE SIXTH — NOTA — IS GUARDED BY `requirePetAccess`, and the difference is
// deliberate on the web, marked there with a `PARITY:` comment that says so in
// as many words. A note needs NO capability on the org path and is accepted on
// a DECEASED animal. That second half is the one worth stating out loud: a
// memorial note is the one thing a grieving owner may still write into the
// libreta, and an endpoint that "tidied up" the six into one guard would take
// it away. Mirrored exactly, asymmetry included, because the server actions are
// themselves addressable endpoints — narrowing here would not close anything,
// it would only make the two doors disagree.
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
// NO ATTACHMENTS ON THIS PATH. Every one of the six web forms offers a file and
// every call below passes `uploadedPath: null`, because a native upload needs a
// signed URL and that whole path is blocked. Stated here rather than left as
// three nulls a reader has to interpret.

import { assertOccurredAtPlausible } from "@/lib/events/plausibility";
import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import {
  OWNER_AUTHORSHIP,
  type PetHolderAccess,
  resolvePetHolderAccess,
} from "@/lib/infra/pet-access";
import { reportError } from "@/lib/infra/report-error";
import { findDrugByLabel } from "@/lib/reference/drugs";
import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/reference/medication-schedule";
import { parseDateInput } from "@/lib/utils/format";
import { createNote } from "@/src/modules/events/application/identity/note-use-case";
import { createDeworming } from "@/src/modules/events/application/medical/deworming-use-case";
import { createMedicationEnd } from "@/src/modules/events/application/medical/medication-end-use-case";
import { createMedicationStart } from "@/src/modules/events/application/medical/medication-start-use-case";
import { createVaccination } from "@/src/modules/events/application/medical/vaccination-use-case";
import { createWeight } from "@/src/modules/events/application/medical/weight-use-case";
import type { RecordedEvent, UseCaseResult } from "@/src/modules/events/application/types";
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
 * ALL SIX, though only two are ever indexed — the same-day gate is the one
 * reader and it applies to vaccination and deworming alone. The other four are
 * here because this is the table a person asks for ("which spine row is a
 * `medication_end`?") and answering four sixths of that question would send them
 * hunting through six use-cases for the rest. The `kind → event_type` mapping is
 * otherwise implicit in the dispatch below, which is not a place to read it.
 */
const EVENT_TYPE_OF_KIND = {
  vaccination: "vaccination_administered",
  weight: "weight_recorded",
  deworming: "deworming_administered",
  medication_start: "medication_started",
  medication_end: "medication_stopped",
  note: "note_added",
} as const;

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

  const occurredAt = parseWireDay(ctx.input.occurredAt);
  if (!occurredAt) return apiV1Error("invalid_request", 400);

  const plausible = assertOccurredAtPlausible({
    occurredAt,
    // The wire carries a DAY, so the future check compares ARGENTINE CALENDAR
    // DAYS and not instants — comparing the noon-UTC anchor against `now` would
    // refuse every same-day entry made before 09:05 AR.
    isDateOnly: true,
    petDateOfBirth: access.pet.dateOfBirth,
  });
  if (!plausible.ok) {
    return apiV1Error(
      plausible.error === "FUTURE_DATE" ? "event_date_future" : "event_date_before_birth",
      400,
    );
  }

  const repo = new EventsRepository();

  const softGate = await checkSameDayGate(repo, access.pet.id, ctx.input, occurredAt);
  if (softGate) return softGate;

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
 */
async function checkWriteGuard(
  access: Exclude<PetHolderAccess, { kind: "none" }>,
  kind: RecordEventInput["kind"],
) {
  // `createNoteAction` guards with `requirePetAccess`, which has neither of the
  // two checks below. Any holder — person path or org path, capability or not —
  // may write a note, and a deceased animal still accepts one.
  if (kind === "note") return null;

  if (access.pet.status === "deceased") return apiV1Error("event_not_allowed", 409);

  if (access.kind === "org") {
    const granted = await getGrantedCapabilities(access.membership);
    if (!granted.has("event.write")) return apiV1Error("event_forbidden", 403);
  }

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
  occurredAt: Date,
  repo: EventsRepository,
) {
  const { input } = ctx;
  const pet = access.pet;
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
