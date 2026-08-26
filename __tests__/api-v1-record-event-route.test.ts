// `POST /api/v1/pets/{token}/events` — the six daily writers.
//
// WHAT THIS FILE HAS TO PROVE
// ---------------------------------------------------------------------------
//   1. THE GUARD IS NOT UNIFORM, and the asymmetry is the web's. Five kinds
//      mirror `requireAlivePetAccess` (deceased refuses, org path needs
//      `event.write`); NOTA mirrors `requirePetAccess` (neither). An endpoint
//      that tidied the six into one rule would silently take a memorial note
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
  /** Every use-case call. Empty means nothing was written. */
  writes: [] as Array<{ kind: string; input: Record<string, unknown> }>,
  writeResult: null as null | (() => unknown),
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
  control.writes = [];
  control.writeResult = null;
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

  it("refuses a body whose kind is not one of the six", async () => {
    const response = await call({ kind: "death_recorded", occurredAt: A_PAST_DAY });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toEqual([]);
  });
});
