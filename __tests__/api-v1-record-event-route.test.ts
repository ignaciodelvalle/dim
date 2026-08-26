// `POST /api/v1/pets/{token}/events` — every owner writer behind one URL.
//
// WHAT THIS FILE HAS TO PROVE
// ---------------------------------------------------------------------------
//   1. THE GUARD IS NOT UNIFORM, and the asymmetry is the web's. Every kind but
//      one mirrors `requireAlivePetAccess` (deceased refuses, org path needs
//      `event.write`); NOTA mirrors `requirePetAccess` (neither). An endpoint
//      that tidied them into one rule would silently take a memorial note
//      away from a grieving owner, and no typechecker would notice.
//   2. THE SERVER OWNS THE CALENDAR AND THE SCHEDULE. `occurredAt` is anchored
//      and checked against the ANIMAL's record; a medication's dose times are
//      generated here, never taken off the wire.
//   3. `Idempotency-Key` IS HONOURED, not merely demanded — it reaches the
//      spine as `clientIdempotencyKey`, and a replay is a 201 that says so.
//   4. THE REFUSALS CARRY THE RIGHT STATUS PER WHOSE FACT THEY ARE: 403 for the
//      CALLER, 409 for the ANIMAL, 400 for the request, 404 for anything a
//      caller may not see.
//   5. NOTHING IS WRITTEN when any gate refuses.

import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  live: null as null | (() => unknown),
  limits: [] as Array<{ endpoint: string; identifier: string }>,
  access: null as null | (() => unknown),
  capabilities: new Set<string>(["event.write"]),
  /** Same-day probe result. `true` → an event of that type already exists today. */
  sameDay: false,
  /** The `medication_started` row a medication END resolves to. */
  medicationSource: { id: "med-1", eventType: "medication_started" } as {
    id: string;
    eventType: string;
  } | null,
  /** The pet's canonical `pet_identifications` chip code, or null for none. */
  canonicalChip: null as string | null,
  /** Every use-case call. Empty means nothing was written. */
  writes: [] as Array<{ kind: string; input: Record<string, unknown> }>,
  writeResult: null as null | (() => unknown),
  /**
   * Síntoma answers in its OWN shape — `{symptomEventId, signalEventIds}`, not
   * `UseCaseResult<RecordedEvent>` — so it needs its own override rather than
   * sharing `writeResult`.
   */
  symptomResult: null as null | (() => unknown),
  /** Every dep object the symptom writer was handed. Proves the flush is wired. */
  symptomDeps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/infra/live-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/live-user")>();
  return {
    ...actual,
    requireLiveUser: async () =>
      control.live
        ? control.live()
        : { ok: true, supabase: {}, user: { id: OWNER_ID }, profile: null },
  };
});

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: async (endpoint: string, identifier: string) => {
      control.limits.push({ endpoint, identifier });
    },
  };
});

vi.mock("@/lib/infra/pet-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/pet-access")>();
  return {
    ...actual,
    resolvePetHolderAccess: async () =>
      control.access ? control.access() : { kind: "owner", pet: petRow(), holderRole: "owner" },
  };
});

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/src/modules/organizations/infrastructure/authz-resolver")
    >();
  return { ...actual, getGrantedCapabilities: async () => control.capabilities };
});

vi.mock("@/src/modules/events/infrastructure/events-repository", () => ({
  EventsRepository: class {
    async findSameDayEventOfType() {
      return control.sameDay ? { id: "dup-1" } : null;
    }
    async findSourceMedicationEvent() {
      return control.medicationSource;
    }
  },
}));

/** One factory for all six use-case mocks — they share a call signature. */
function writerMock(kind: string) {
  return async (input: Record<string, unknown>) => {
    control.writes.push({ kind, input });
    return control.writeResult
      ? control.writeResult()
      : { ok: true, value: { eventId: EVENT_ID, wasDuplicate: false }, notifications: [] };
  };
}

vi.mock("@/src/modules/events/application/medical/vaccination-use-case", () => ({
  createVaccination: writerMock("vaccination"),
}));
vi.mock("@/src/modules/events/application/medical/weight-use-case", () => ({
  createWeight: writerMock("weight"),
}));
vi.mock("@/src/modules/events/application/medical/deworming-use-case", () => ({
  createDeworming: writerMock("deworming"),
}));
vi.mock("@/src/modules/events/application/medical/medication-start-use-case", () => ({
  createMedicationStart: writerMock("medication_start"),
}));
vi.mock("@/src/modules/events/application/medical/medication-end-use-case", () => ({
  createMedicationEnd: writerMock("medication_end"),
}));
vi.mock("@/src/modules/events/application/identity/note-use-case", () => ({
  createNote: writerMock("note"),
}));
vi.mock("@/src/modules/events/application/identity/microchip-use-case", () => ({
  createMicrochip: writerMock("microchip"),
}));
vi.mock("@/src/modules/events/application/medical/sterilization-use-case", () => ({
  createSterilization: writerMock("sterilization"),
}));
vi.mock("@/src/modules/events/application/clinical/vet-visit-use-case", () => ({
  createVetVisit: writerMock("vet_visit"),
}));
vi.mock("@/src/modules/events/application/clinical/clinical-info-use-case", () => ({
  createClinicalInfo: writerMock("clinical_info"),
}));

vi.mock("@/src/modules/events/application/surveillance/symptom-observed-use-case", () => ({
  createSymptomObservedWriter: async (
    input: Record<string, unknown>,
    deps: Record<string, unknown>,
  ) => {
    control.writes.push({ kind: "symptom", input });
    control.symptomDeps.push(deps);
    return control.symptomResult
      ? control.symptomResult()
      : { ok: true, symptomEventId: EVENT_ID, signalEventIds: [], wasDuplicate: false };
  },
}));

vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: async () => ({
    microchip: control.canonicalChip ? { code: control.canonicalChip } : null,
  }),
}));

vi.mock("@/lib/supabase/bearer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/bearer")>();
  return {
    ...actual,
    createClientFromBearer: (header: string | null) =>
      header ? { ok: true, supabase: {}, token: "tok" } : { ok: false, reason: "MISSING" },
  };
});

import { POST } from "@/app/api/v1/pets/[publicToken]/events/route";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PET_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const MED_ID = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";
const TOKEN = "DIM-PAMP-0001";

/** A day in the past, comfortably after the fixture's date of birth. */
const A_PAST_DAY = "2026-08-20";

function petRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PET_ID,
    publicToken: TOKEN,
    name: "Pampa",
    status: "active",
    dateOfBirth: "2020-01-01",
    // The animal's SURVEILLANCE CONTEXT, which only síntoma reads: species and
    // jurisdiction decide which authorities a signal reaches, and the
    // observation status decides whether a rabies match is an ordinary report
    // or an escalation inside an open case.
    species: "dog",
    jurisdictionCountry: "AR",
    jurisdictionProvince: "La Pampa",
    jurisdictionLocality: "Santa Rosa",
    rabiesObservationStatus: null,
    ...overrides,
  };
}

function orgAccess(overrides: Record<string, unknown> = {}) {
  return () => ({
    kind: "org",
    pet: petRow(),
    organization: { id: "org-1" },
    membership: { id: "m-1" },
    eventAuthorship: {
      authorRole: "shelter",
      authorOrganizationId: "org-1",
      authorVerified: false,
    },
    ...overrides,
  });
}

const A_VACCINE = { kind: "vaccination", vaccineName: "Antirrábica", occurredAt: A_PAST_DAY };
const A_NOTE = { kind: "note", text: "Comió bien toda la semana.", occurredAt: A_PAST_DAY };

async function call(
  body: unknown = A_VACCINE,
  init: { key?: string | null; authorization?: string | null } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = init.authorization === undefined ? "Bearer tok" : init.authorization;
  if (auth) headers.authorization = auth;
  const key = init.key === undefined ? KEY : init.key;
  if (key) headers["idempotency-key"] = key;
  return POST(
    new Request(`https://mimar.ar/api/v1/pets/${TOKEN}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ publicToken: TOKEN }) },
  );
}

beforeEach(() => {
  control.live = null;
  control.limits = [];
  control.access = null;
  control.capabilities = new Set(["event.write"]);
  control.sameDay = false;
  control.medicationSource = { id: "med-1", eventType: "medication_started" };
  control.canonicalChip = null;
  control.writes = [];
  control.writeResult = null;
  control.symptomResult = null;
  control.symptomDeps = [];
});

describe("POST .../events — the guard is the web's, and it is not uniform", () => {
  it("refuses a clinical event on a DECEASED animal, as a fact about the animal", async () => {
    control.access = () => ({
      kind: "owner",
      pet: petRow({ status: "deceased" }),
      holderRole: "owner",
    });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "event_not_allowed" });
    expect(control.writes).toEqual([]);
  });

  it("ACCEPTS a nota on a deceased animal — the one thing a grieving owner may write", async () => {
    // `createNoteAction` guards with `requirePetAccess`, not the alive variant,
    // and its own source says so with a `PARITY:` comment. Mirroring the five
    // clinical writers here instead would remove a memorial note from the
    // libreta and nothing would report it.
    control.access = () => ({
      kind: "owner",
      pet: petRow({ status: "deceased" }),
      holderRole: "owner",
    });
    const response = await call(A_NOTE);
    expect(response.status).toBe(201);
    expect(control.writes.map((w) => w.kind)).toEqual(["note"]);
  });

  it("refuses a clinical event for an org member without event.write — about the CALLER", async () => {
    control.access = orgAccess();
    control.capabilities = new Set();
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "event_forbidden" });
    expect(control.writes).toEqual([]);
  });

  it("ACCEPTS a nota from an org member without event.write — no capability gate on the web", async () => {
    control.access = orgAccess();
    control.capabilities = new Set();
    const response = await call(A_NOTE);
    expect(response.status).toBe(201);
  });

  it("ADMITS an org member WITH event.write, mirroring the web's own guard", async () => {
    control.access = orgAccess();
    const response = await call();
    expect(response.status).toBe(201);
  });

  it("admits any current holder on the person path, not just the titular", async () => {
    // `requireAlivePetAccess` never narrows to `owner`: a foster holding the
    // animal records its vaccines.
    control.access = () => ({ kind: "owner", pet: petRow(), holderRole: "foster" });
    const response = await call();
    expect(response.status).toBe(201);
  });

  it("answers 404 for a pet this caller may not see, exactly as a read does", async () => {
    control.access = () => ({ kind: "none" });
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(control.writes).toEqual([]);
  });
});

describe("POST .../events — the server owns the calendar", () => {
  it("refuses a day that has not happened yet", async () => {
    const response = await call({ ...A_VACCINE, occurredAt: "2099-01-01" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "event_date_future" });
    expect(control.writes).toEqual([]);
  });

  it("refuses a day before the animal was born, with its OWN code", async () => {
    // A DIFFERENT fix from the one above, which is why it is a different code:
    // either the date is wrong or the birth date on the record is, and only the
    // person can say which.
    const response = await call({ ...A_VACCINE, occurredAt: "2019-06-01" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "event_date_before_birth" });
  });

  it("refuses a well-shaped date that is not a real day", async () => {
    // "2026-02-31" gets past the wire regex and not past `Date`.
    const response = await call({ ...A_VACCINE, occurredAt: "2026-02-31" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("anchors the day the same way the web does, at noon UTC", async () => {
    await call();
    const occurredAt = control.writes[0]?.input.occurredAt as Date;
    expect(occurredAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });
});

describe("POST .../events — the same-day soft gate", () => {
  it("asks once when a vaccination of the same kind is already on that day", async () => {
    control.sameDay = true;
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "same_day_duplicate_suspected" });
    expect(control.writes).toEqual([]);
  });

  it("writes when the caller re-sends with the override — it is a prompt, not a rule", async () => {
    control.sameDay = true;
    const response = await call({ ...A_VACCINE, sameDayOverride: true });
    expect(response.status).toBe(201);
    expect(control.writes).toHaveLength(1);
  });

  it("does not probe for kinds the web never asks about", async () => {
    // Only vaccination and deworming carry the prompt on the web. A weight
    // recorded twice in a day is a re-weighing, not a suspected duplicate.
    control.sameDay = true;
    const response = await call({ kind: "weight", kg: 12.5, occurredAt: A_PAST_DAY });
    expect(response.status).toBe(201);
  });
});

describe("POST .../events — each writer's own shape", () => {
  it("normalizes a weight to two decimals, as the web does before its write", async () => {
    await call({ kind: "weight", kg: 12.345, occurredAt: A_PAST_DAY });
    expect(control.writes[0]?.input.kgStr).toBe("12.35");
  });

  it("refuses a weight over the shared ceiling at the schema, not at the ledger", async () => {
    const response = await call({ kind: "weight", kg: 500, occurredAt: A_PAST_DAY });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toEqual([]);
  });

  it("generates the dose schedule SERVER-side and reads the first dose as AR wall clock", async () => {
    const response = await call({
      kind: "medication_start",
      drugName: "Amoxicilina",
      dose: "250 mg",
      occurredAt: A_PAST_DAY,
      frequency: "twice_daily",
      durationDays: 2,
      firstDoseAt: "2026-08-20T08:00",
    });
    expect(response.status).toBe(201);
    const input = control.writes[0]?.input as Record<string, unknown>;
    // 08:00 in Argentina is 11:00Z — a dose at eight means eight where the
    // animal lives, and an offset-less parse on a UTC server fires it three
    // hours early.
    expect((input.firstDoseAt as Date).toISOString()).toBe("2026-08-20T11:00:00.000Z");
    // Twice daily for two days: ceil((2*24+1)/12) = 5 doses.
    expect((input.schedule as Date[]).length).toBe(5);
  });

  it("refuses a custom frequency with no interval", async () => {
    const response = await call({
      kind: "medication_start",
      drugName: "Amoxicilina",
      dose: "250 mg",
      occurredAt: A_PAST_DAY,
      frequency: "custom",
      firstDoseAt: "2026-08-20T08:00",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("refuses a medication END whose source is not a medication_started on THIS animal", async () => {
    // NOT 404: on this surface that code always means the PET, and answering it
    // here would tell a client its animal had vanished.
    control.medicationSource = null;
    const response = await call({
      kind: "medication_end",
      medicationStartedEventId: MED_ID,
      occurredAt: A_PAST_DAY,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "medication_source_invalid" });
    expect(control.writes).toEqual([]);
  });

  it("refuses a note category the owner-facing form does not offer", async () => {
    // NARROWER than the web, deliberately: the web's `<select>` cannot produce
    // a bad value, so its action drops one to `null`. A JSON client can, and a
    // typo filed as "no category" survives to the ledger.
    const response = await call({ ...A_NOTE, category: "comportamento" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("refuses the spine's `system` category, which no owner may sign", async () => {
    const response = await call({ ...A_NOTE, category: "system" });
    expect(response.status).toBe(400);
  });

  it("signs a person-path write as the owner, never as a verified professional", async () => {
    await call();
    expect(control.writes[0]?.input.eventAuthorship).toEqual({
      authorRole: "owner",
      authorOrganizationId: null,
      authorVerified: false,
    });
  });

  it("signs an org-path write with the membership's resolved authorship", async () => {
    control.access = orgAccess();
    await call();
    expect(control.writes[0]?.input.eventAuthorship).toEqual({
      authorRole: "shelter",
      authorOrganizationId: "org-1",
      authorVerified: false,
    });
  });

  it("carries no attachment on any path — there is no native upload yet", async () => {
    await call();
    const input = control.writes[0]?.input as Record<string, unknown>;
    expect(input.uploadedPath).toBeNull();
    expect(input.uploadedMimeType).toBeNull();
    expect(input.uploadedSize).toBeNull();
  });
});

describe("POST .../events — the envelope", () => {
  it("passes the caller's Idempotency-Key THROUGH, rather than demanding and dropping it", async () => {
    await call();
    expect(control.writes[0]?.input.clientIdempotencyKey).toBe(KEY);
  });

  it("refuses a missing key before it spends a rate-limit counter", async () => {
    const response = await call(A_VACCINE, { key: null });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "idempotency_key_required" });
    expect(control.limits).toEqual([]);
  });

  it("refuses a key that is not a UUID, with the SAME code as an absent one", async () => {
    // Joined deliberately: both mean "send a well-formed header". A non-UUID
    // would otherwise raise 22P02 inside the write and look retryable forever.
    const response = await call(A_VACCINE, { key: "not-a-uuid" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "idempotency_key_required" });
  });

  it("reports a REPLAY as a 201 that says so", async () => {
    control.writeResult = () => ({
      ok: true,
      value: { eventId: EVENT_ID, wasDuplicate: true },
      notifications: [],
    });
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ eventId: EVENT_ID, wasDuplicate: true });
  });

  it("maps a failed append to a retryable code, without leaking its prose", async () => {
    control.writeResult = () => ({ ok: false, error: "Error al guardar. Intentá de nuevo." });
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "event_failed" });
  });

  it("spends its own buckets, named for this surface", async () => {
    await call();
    expect(control.limits).toEqual([
      { endpoint: "api_v1_event_ip", identifier: expect.any(String) },
      { endpoint: "api_v1_event_user", identifier: OWNER_ID },
    ]);
  });

  it("answers 401 without a bearer, and never writes a counter for it", async () => {
    const response = await call(A_VACCINE, { authorization: null });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "auth_required" });
    expect(control.limits).toEqual([]);
  });

  it("refuses a body whose kind is not one the contract names", async () => {
    const response = await call({ kind: "death_recorded", occurredAt: A_PAST_DAY });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// WU-L — the four that crossed next, and the boundary they did not cross.
// ---------------------------------------------------------------------------

const A_MICROCHIP = { kind: "microchip", chipNumber: "982000123456789", occurredAt: A_PAST_DAY };
const A_STERILIZATION = { kind: "sterilization", procedure: "castration", occurredAt: A_PAST_DAY };
const A_VET_VISIT = { kind: "vet_visit", reason: "Control anual", occurredAt: A_PAST_DAY };
const A_CLINICAL_INFO = {
  kind: "clinical_info",
  subKind: "lab_work",
  title: "Hemograma completo",
  occurredAt: A_PAST_DAY,
};

const WU_L_KINDS: Array<[string, Record<string, unknown>]> = [
  ["microchip", A_MICROCHIP],
  ["sterilization", A_STERILIZATION],
  ["vet_visit", A_VET_VISIT],
  ["clinical_info", A_CLINICAL_INFO],
];

describe("POST .../events — the four WU-L kinds carry the ALIVE guard, each half proved", () => {
  // Every one of the four is `requireAlivePetAccess` on the web
  // (actions.ts:99 / :317 / :404, actions-medical.ts:335). Both halves of that
  // guard are asserted PER KIND rather than once for the group: a switch that
  // fell through for one of them would pass a test written only for the first.
  for (const [kind, body] of WU_L_KINDS) {
    it(`refuses ${kind} on a DECEASED animal — 409, about the animal`, async () => {
      control.access = () => ({
        kind: "owner",
        pet: petRow({ status: "deceased" }),
        holderRole: "owner",
      });
      const response = await call(body);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "event_not_allowed" });
      expect(control.writes).toEqual([]);
    });

    it(`refuses ${kind} for an org member without event.write — 403, about the caller`, async () => {
      control.access = orgAccess();
      control.capabilities = new Set();
      const response = await call(body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "event_forbidden" });
      expect(control.writes).toEqual([]);
    });

    it(`accepts ${kind} from a CARETAKER — the web's guard is not titular-only`, async () => {
      // `requireAlivePetAccess` composes `requirePetAccess`, which is
      // role-agnostic on the person path; only `requireTitularAccess` denies a
      // caretaker, and none of these four call it. Narrowing here would be this
      // endpoint inventing a rule the web does not have.
      control.access = () => ({ kind: "owner", pet: petRow(), holderRole: "caretaker" });
      const response = await call(body);
      expect(response.status).toBe(201);
      expect(control.writes.map((w) => w.kind)).toEqual([kind]);
    });
  }
});

describe("POST .../events — what the four WU-L kinds put on the spine", () => {
  it("passes a microchip's CANONICAL chip number, not a boolean", async () => {
    // The use-case needs the number: a boolean collapses "re-submitted the same
    // chip" and "implanted a different one" into one branch, and that branch
    // wrote the event while skipping the canonical row.
    control.canonicalChip = "982000111111111";
    const response = await call(A_MICROCHIP);
    expect(response.status).toBe(201);
    expect(control.writes[0].input.pet).toEqual({
      id: PET_ID,
      canonicalChipNumber: "982000111111111",
    });
    expect(control.writes[0].input.chipNumber).toBe("982000123456789");
  });

  it("passes null for a pet that carries no chip yet", async () => {
    await call(A_MICROCHIP);
    expect(control.writes[0].input.pet).toEqual({ id: PET_ID, canonicalChipNumber: null });
  });

  it("sends the two location fields as null, which is what an untouched web form stores", async () => {
    // NOT a narrowing: `parseLocationFromFormData` over a form nobody touched
    // yields all-null, and `normalizeLocationForWrite` resolves that to this
    // same pair. The app has no location affordance to send.
    for (const body of [A_VET_VISIT, A_CLINICAL_INFO]) {
      control.writes = [];
      await call(body);
      expect(control.writes[0].input.eventJurisdictionProvince).toBeNull();
      expect(control.writes[0].input.eventJurisdictionLocality).toBeNull();
    }
  });

  it("anchors every one of the four at the SAME noon-UTC instant the web uses", async () => {
    for (const [, body] of WU_L_KINDS) {
      control.writes = [];
      await call(body);
      expect((control.writes[0].input.occurredAt as Date).toISOString()).toBe(
        `${A_PAST_DAY}T12:00:00.000Z`,
      );
    }
  });

  it("carries the Idempotency-Key onto all four, and reports a replay as 201", async () => {
    for (const [, body] of WU_L_KINDS) {
      control.writes = [];
      await call(body);
      expect(control.writes[0].input.clientIdempotencyKey).toBe(KEY);
    }

    control.writeResult = () => ({
      ok: true,
      value: { eventId: EVENT_ID, wasDuplicate: true },
      notifications: [],
    });
    const replay = await call(A_STERILIZATION);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ eventId: EVENT_ID, wasDuplicate: true });
  });

  it("carries no attachment on any of the four", async () => {
    for (const [, body] of WU_L_KINDS) {
      control.writes = [];
      await call(body);
      expect(control.writes[0].input.uploadedPath).toBeNull();
    }
  });

  it("refuses a future date and a pre-birth date for all four, before writing", async () => {
    for (const [, body] of WU_L_KINDS) {
      control.writes = [];
      const future = await call({ ...body, occurredAt: "2099-01-01" });
      expect(future.status).toBe(400);
      expect(await future.json()).toEqual({ error: "event_date_future" });

      const beforeBirth = await call({ ...body, occurredAt: "2019-01-01" });
      expect(beforeBirth.status).toBe(400);
      expect(await beforeBirth.json()).toEqual({ error: "event_date_before_birth" });
      expect(control.writes).toEqual([]);
    }
  });

  it("never runs the same-day soft gate for the four — the web does not have one", async () => {
    // `findSameDayEventOfType` has exactly two callers on the web, vaccination
    // and deworming. Applying it here would be a refusal a web user never sees.
    control.sameDay = true;
    for (const [kind, body] of WU_L_KINDS) {
      control.writes = [];
      const response = await call(body);
      expect(response.status).toBe(201);
      expect(control.writes.map((w) => w.kind)).toEqual([kind]);
    }
  });

  it("refuses the vet-only clinical sub_kind, which is why the enum has five", async () => {
    // `disease_diagnosis` is a sixth `clinical_info_logged` sub_kind whose
    // writer does no ownership check at all — it authorizes on a verified
    // matrícula. An owner's bearer token must not be able to sign it.
    const response = await call({ ...A_CLINICAL_INFO, subKind: "disease_diagnosis" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toEqual([]);
  });

  it("refuses a sterilization procedure outside the web's two", async () => {
    const response = await call({ ...A_STERILIZATION, procedure: "neuter" });
    expect(response.status).toBe(400);
    expect(control.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// WU-M — síntoma, the eleventh kind, and the only write here that leaves the
// animal's own record.
// ---------------------------------------------------------------------------

const A_SYMPTOM = { kind: "symptom", freeText: "Decaído, no come desde ayer" };

describe("POST .../events — síntoma carries the ALIVE guard, each half proved", () => {
  // `createSymptomObservedAction` guards with `requireAlivePetAccess`
  // (actions.ts:690) — the same rule the other ten clinical kinds carry, which
  // is why the switch needed no new guard branch. Asserted anyway, and per
  // half, because "it fell into the default branch" and "it was checked" look
  // identical from the outside until one of them stops being true.
  it("refuses síntoma on a DECEASED animal — 409, about the animal", async () => {
    control.access = () => ({
      kind: "owner",
      pet: petRow({ status: "deceased" }),
      holderRole: "owner",
    });
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "event_not_allowed" });
    expect(control.writes).toEqual([]);
  });

  it("refuses síntoma for an org member without event.write — 403, about the caller", async () => {
    control.access = orgAccess();
    control.capabilities = new Set();
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "event_forbidden" });
    expect(control.writes).toEqual([]);
  });

  it("accepts síntoma from a CARETAKER — the web's guard is not titular-only", async () => {
    // The person watching the animal day to day is the one who notices. A
    // titular-only rule invented here would silence exactly the reporter this
    // kind exists for.
    control.access = () => ({ kind: "owner", pet: petRow(), holderRole: "caretaker" });
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(201);
    expect(control.writes.map((w) => w.kind)).toEqual(["symptom"]);
  });
});

describe("POST .../events — what a síntoma puts on the spine, and what it may not", () => {
  it("sends the free text and NOTHING the server decides for itself", async () => {
    await call({ ...A_SYMPTOM, severity: "moderate" });
    const input = control.writes[0]?.input as Record<string, unknown>;
    expect(input.freeText).toBe("Decaído, no come desde ayer");
    expect(input.severity).toBe("moderate");
    // The matcher, the outbreak signals, the outbox row and the recipients are
    // all resolved INSIDE the writer, off this text. A wire that carried a
    // disease code would be a phone filing a claim; one that carried a
    // recipient would be a phone choosing who gets woken up.
    expect(input).not.toHaveProperty("alertedDiseaseCodes");
    expect(input).not.toHaveProperty("matchedSymptomCodes");
    expect(input).not.toHaveProperty("signalEventIds");
  });

  it("reads the animal's surveillance context off the ACCESS query, not off the wire", async () => {
    control.access = () => ({
      kind: "owner",
      pet: petRow({ rabiesObservationStatus: "in_progress" }),
      holderRole: "owner",
    });
    await call(A_SYMPTOM);
    const input = control.writes[0]?.input as Record<string, unknown>;
    expect(input.petSpecies).toBe("dog");
    expect(input.petJurisdictionCountry).toBe("AR");
    expect(input.petJurisdictionProvince).toBe("La Pampa");
    expect(input.petJurisdictionLocality).toBe("Santa Rosa");
    // The escalation switch. A client that could set it would be able to
    // declare an antirrabic observation nobody opened.
    expect(input.rabiesObservationStatus).toBe("in_progress");
  });

  it("WIRES THE NOTIFICATION FLUSH — the fan-out's last leg", async () => {
    // The quietest possible regression: every signal still written, every row
    // still on the spine, and nobody told. The writer builds its notifications
    // inside the transaction and hands them to this dep afterwards; an endpoint
    // that passed no flush would drop them without failing anything.
    await call(A_SYMPTOM);
    expect(typeof control.symptomDeps[0]?.flushNotifications).toBe("function");
  });

  it("signs with the org path's resolved authorship, never re-derived", async () => {
    control.access = orgAccess();
    await call(A_SYMPTOM);
    expect(control.writes[0]?.input.eventAuthorship).toEqual({
      authorRole: "shelter",
      authorOrganizationId: "org-1",
      authorVerified: false,
    });
  });

  it("takes a síntoma with NO date at all, where every other kind requires one", async () => {
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(201);
    expect(control.writes[0]?.input.onsetAt).toBeNull();
  });

  it("holds a STATED onset to the animal's own record, both ways", async () => {
    const future = await call({ ...A_SYMPTOM, onsetAt: "2099-01-01" });
    expect(future.status).toBe(400);
    expect(await future.json()).toEqual({ error: "event_date_future" });
    expect(control.writes).toEqual([]);

    const beforeBirth = await call({ ...A_SYMPTOM, onsetAt: "2019-06-01" });
    expect(beforeBirth.status).toBe(400);
    expect(await beforeBirth.json()).toEqual({ error: "event_date_before_birth" });
    expect(control.writes).toEqual([]);
  });

  it("passes a stated onset THROUGH as the day string, not as an instant", async () => {
    // The writer anchors it at noon UTC with the web's own `parseDateInput`. An
    // endpoint that converted it here would be a second anchor.
    await call({ ...A_SYMPTOM, onsetAt: A_PAST_DAY });
    expect(control.writes[0]?.input.onsetAt).toBe(A_PAST_DAY);
  });

  it("never runs the same-day soft gate for a síntoma — the web has no such gate", async () => {
    control.sameDay = true;
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(201);
  });

  it("carries the Idempotency-Key onto it, and reports a replay as 201", async () => {
    // THE WHOLE REASON THIS KIND COULD CROSS. The exclusion that kept it out for
    // two work units said this writer took no key; it has taken one since the
    // W-1 fix of 2026-06-07 and branches to `insertEventIdempotent` on it.
    await call(A_SYMPTOM);
    expect(control.writes[0]?.input.clientIdempotencyKey).toBe(KEY);

    control.symptomResult = () => ({
      ok: true,
      symptomEventId: EVENT_ID,
      signalEventIds: [],
      wasDuplicate: true,
    });
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ eventId: EVENT_ID, wasDuplicate: true });
  });

  it("answers with the SYMPTOM's event id, never a signal's", async () => {
    // `signalEventIds` are system-authored rows about a DISEASE in a
    // jurisdiction. The asiento the owner wrote is the one they can open,
    // correct and see in their libreta; answering with a signal id would hand a
    // phone an identifier that resolves to somebody else's fact.
    control.symptomResult = () => ({
      ok: true,
      symptomEventId: EVENT_ID,
      signalEventIds: ["99999999-9999-4999-8999-999999999999"],
      wasDuplicate: false,
    });
    const response = await call(A_SYMPTOM);
    expect(await response.json()).toEqual({ eventId: EVENT_ID, wasDuplicate: false });
  });

  it("maps a failed síntoma to the same retryable code, without leaking its prose", async () => {
    control.symptomResult = () => ({ ok: false, error: "constraint pet_events_x violated" });
    const response = await call(A_SYMPTOM);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "event_failed" });
  });

  it("refuses a severity outside the web's three", async () => {
    const response = await call({ ...A_SYMPTOM, severity: "moderado" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toEqual([]);
  });

  it("refuses an empty description before it writes anything", async () => {
    const response = await call({ kind: "symptom", freeText: "   " });
    expect(response.status).toBe(400);
    expect(control.writes).toEqual([]);
  });
});
