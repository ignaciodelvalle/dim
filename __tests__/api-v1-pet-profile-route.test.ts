// `/api/v1/pets/{token}/profile` — EDITAR: the two commands, and the read that
// says which of them this caller may send.
//
// WHAT THIS FILE HAS TO PROVE
// ---------------------------------------------------------------------------
//   1. THE GUARDS ARE THE WEB'S, AND THEY ARE TWO GUARDS, NOT ONE. Identity is
//      `requireTitularAccess` — a caretaker refused, a CO-OWNER and a FOSTER and
//      the ORG path admitted. Contacts are the LEGAL owner alone: co-owner,
//      foster and org all refused, which is narrower than titular and cannot be
//      expressed as it. A single rule would be wrong for somebody either way.
//   2. THE READ AND THE WRITE AGREE. The capability flags the read reports are
//      the same two booleans the write enforces, so a client can never be
//      offered a control that answers 403.
//   3. THE CONTACTS ARE NOT EVEN READABLE by a holder who is not the owner —
//      `null`, not an empty draft. They are the titular's own phone numbers.
//   4. THE SPECIES AND JURISDICTION ARE UNREACHABLE from this door, and the
//      breed is validated against the PERSISTED species.
//   5. `changed` IS MEASURED. A no-op edit reports `false`.
//   6. NOTHING IS WRITTEN when any gate refuses.
//   7. THE REFUSALS CARRY THE RIGHT STATUS PER WHOSE FACT THEY ARE: 403 for the
//      CALLER, 400 for the request, 404 for anything a caller may not see.

import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PET_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "DIM-PAMP-0001";

const control = vi.hoisted(() => ({
  live: null as null | (() => unknown),
  access: null as null | (() => unknown),
  /** The caller's ACCOUNT-level contact defaults. */
  accountContacts: null as null | Record<string, unknown>,
  /** What the emergency-contacts writer answers. */
  contactsResult: { ok: true } as Record<string, unknown>,
  /** What `updatePet` answers. */
  updateResult: { ok: true, notifications: [] } as Record<string, unknown>,
  /** Every writer call. Empty means nothing was written. */
  writes: [] as Array<{ command: string; input: Record<string, unknown> }>,
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
  return { ...actual, enforceRateLimit: async () => {} };
});

vi.mock("@/lib/infra/pet-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/pet-access")>();
  return {
    ...actual,
    resolvePetHolderAccess: async () =>
      control.access ? control.access() : { kind: "owner", pet: petRow(), holderRole: "owner" },
  };
});

vi.mock("@/src/modules/pets/application/read/owner-pet-detail-queries", () => ({
  readViewerContacts: async () => control.accountContacts,
}));

vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: async () => ({ microchip: null }),
}));

// PARTIAL is not available here and not wanted: the PPP resolver reads business
// rules from the database. What matters for this file is that the value it
// returns reaches `updatePet` unchanged, which the capture below shows.
vi.mock("@/lib/infra/ppp-classification", () => ({
  resolvePppClassificationForJurisdiction: async () => false,
}));

vi.mock("@/src/modules/pets/application/update-pet", () => ({
  updatePet: async (input: Record<string, unknown>) => {
    control.writes.push({ command: "edit_identity", input });
    return control.updateResult;
  },
}));

vi.mock("@/src/modules/pets/application/profile/update-emergency-contacts", () => ({
  updateEmergencyContactsForPet: async (
    userId: string,
    publicToken: string,
    input: Record<string, unknown>,
  ) => {
    control.writes.push({
      command: "set_emergency_contacts",
      input: { userId, publicToken, ...input },
    });
    return control.contactsResult;
  },
}));

vi.mock("@/lib/supabase/bearer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/bearer")>();
  return {
    ...actual,
    createClientFromBearer: (header: string | null) =>
      header ? { ok: true, supabase: {}, token: "tok" } : { ok: false, reason: "MISSING" },
  };
});

import { GET, POST } from "@/app/api/v1/pets/[publicToken]/profile/route";

function petRow(over: Record<string, unknown> = {}) {
  return {
    id: PET_ID,
    publicToken: TOKEN,
    name: "Pampa",
    species: "dog",
    sex: "female",
    breed: "Caniche",
    dateOfBirth: "2021-03-04",
    birthDateIsEstimated: false,
    color: "Atigrada",
    estimatedWeightKg: "18.50",
    favouriteFoods: null,
    knownAllergies: null,
    trainingLevel: null,
    insuranceCompany: null,
    insurancePolicyNumber: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "San Carlos de Bariloche",
    acquisitionMethod: "adopted",
    emergencyInfoVisible: false,
    permanentConditions: [],
    permanentConditionsOther: null,
    discloseConditionsPublicly: false,
    potentiallyDangerousBreed: false,
    preferredVetName: "Vet Norte",
    preferredVetPhone: "1122334455",
    emergencyContactName: null,
    emergencyContactPhone: null,
    status: "active",
    ...over,
  };
}

function read(headers: HeadersInit = { authorization: "Bearer t" }) {
  return GET(new Request("https://x.test/api/v1/pets/DIM-PAMP-0001/profile", { headers }), {
    params: Promise.resolve({ publicToken: TOKEN }),
  });
}

function send(body: unknown, headers: HeadersInit = { authorization: "Bearer t" }) {
  return POST(
    new Request("https://x.test/api/v1/pets/DIM-PAMP-0001/profile", {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers as Record<string, string>) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ publicToken: TOKEN }) },
  );
}

const asRole = (holderRole: string) => () => ({
  kind: "owner",
  pet: petRow(),
  holderRole,
});

const asOrg = () => () => ({
  kind: "org",
  pet: petRow(),
  organization: { id: "org-1" },
  membership: {},
  eventAuthorship: { authorRole: "shelter", authorOrganizationId: "org-1", authorVerified: false },
});

const IDENTITY = { command: "edit_identity", name: "Pampita", breed: "Caniche", color: "Blanca" };
const CONTACTS = {
  command: "set_emergency_contacts",
  preferredVetName: "Vet Sur",
  preferredVetPhone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

beforeEach(() => {
  control.live = null;
  control.access = null;
  control.accountContacts = null;
  control.contactsResult = { ok: true };
  control.updateResult = { ok: true, notifications: [] };
  control.writes = [];
});

describe("GET — what the form pre-fills with", () => {
  it("refuses without a bearer, and never says whether the pet exists", async () => {
    const response = await read({});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "auth_required" });
  });

  it("answers 404 for a pet this caller may not reach — the same as one that does not exist", async () => {
    control.access = () => ({ kind: "none" });
    const response = await read();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("sets cache-control: no-store", async () => {
    expect((await read()).headers.get("cache-control")).toContain("no-store");
  });

  it("carries the three identity fields and the pet-level contact override", async () => {
    const body = await (await read()).json();
    expect(body.identity).toEqual({ name: "Pampa", breed: "Caniche", color: "Atigrada" });
    // EMPTY STRINGS, not nulls — the distinction is what makes a cleared field
    // mean "clear the override" on the way back.
    expect(body.emergencyContacts).toEqual({
      preferredVetName: "Vet Norte",
      preferredVetPhone: "1122334455",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
  });

  it("carries the species so a client can ask for the right breed catalog", async () => {
    expect((await (await read()).json()).species).toBe("dog");
  });

  it("reports the account defaults a cleared field would fall back to", async () => {
    control.accountContacts = {
      preferredVetName: null,
      preferredVetPhone: null,
      emergencyContactName: "Mamá",
      emergencyContactPhone: "1199887766",
      displayName: "Ana",
    };
    const body = await (await read()).json();
    expect(body.emergencyAccountDefault.emergencyContactName).toBe("Mamá");
    // The display name is the caller's OWN and has no business in this payload.
    expect(body.emergencyAccountDefault.displayName).toBeUndefined();
  });

  it("gives a CO-OWNER the identity half and withholds the contacts entirely", async () => {
    control.access = asRole("co_owner");
    const body = await (await read()).json();
    expect(body.capabilities).toEqual({
      canEditIdentity: true,
      canEditEmergencyContacts: false,
    });
    // NULL, not an empty draft: these are the titular's own numbers.
    expect(body.emergencyContacts).toBeNull();
    expect(body.emergencyAccountDefault).toBeNull();
  });

  it("gives a FOSTER the same answer as a co-owner — a holder, not the owner", async () => {
    control.access = asRole("foster");
    const body = await (await read()).json();
    expect(body.capabilities.canEditIdentity).toBe(true);
    expect(body.capabilities.canEditEmergencyContacts).toBe(false);
    expect(body.emergencyContacts).toBeNull();
  });

  it("refuses a CARETAKER the identity half — deny-list row identity-field-edits", async () => {
    control.access = asRole("caretaker");
    const body = await (await read()).json();
    expect(body.capabilities).toEqual({
      canEditIdentity: false,
      canEditEmergencyContacts: false,
    });
  });

  it("admits the ORG path to the identity half, as requireTitularAccess does", async () => {
    control.access = asOrg();
    const body = await (await read()).json();
    // The org path has no ownership row, so `holderRole` is null by
    // construction and requireTitularAccess is a no-op there.
    expect(body.capabilities.canEditIdentity).toBe(true);
    expect(body.capabilities.canEditEmergencyContacts).toBe(false);
  });
});

describe("POST — editar identidad", () => {
  it("writes through updatePet and reports the change", async () => {
    const response = await send(IDENTITY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ command: "edit_identity", changed: true });
    expect(control.writes).toHaveLength(1);
    expect(control.writes[0].input).toMatchObject({ petId: PET_ID });
  });

  it("lays the edit over the animal's current state instead of nulling the rest", async () => {
    // The failure this guards: a three-field request reaching a
    // seventeen-column writer and wiping the fourteen it did not name.
    await send(IDENTITY);
    const parsed = control.writes[0].input.parsed as Record<string, unknown>;
    expect(parsed.name).toBe("Pampita");
    expect(parsed.estimatedWeightKg).toBe("18.50");
    expect(parsed.acquisitionMethod).toBe("adopted");
    expect(parsed.dateOfBirth).toBe("2021-03-04");
  });

  it("never lets the request move the species or the jurisdiction", async () => {
    // FULL-LOCK, PO decision #40. Extra keys are stripped by the schema before
    // they reach any writer; the values that arrive are the persisted ones.
    await send({ ...IDENTITY, species: "cat", jurisdictionProvince: "CABA" });
    const parsed = control.writes[0].input.parsed as Record<string, unknown>;
    expect(parsed.species).toBe("dog");
    expect(parsed.jurisdictionProvince).toBe("Buenos Aires");
  });

  it("reports changed:false for an edit that changes nothing", async () => {
    // The values the pet already holds, posted back verbatim. `updatePet` would
    // short-circuit before opening a transaction; the ack must say so rather
    // than congratulate somebody on a write that did not happen.
    const body = await (
      await send({ command: "edit_identity", name: "Pampa", breed: "Caniche", color: "Atigrada" })
    ).json();
    expect(body).toEqual({ command: "edit_identity", changed: false });
  });

  it("refuses a breed the species catalog does not carry, naming the field", async () => {
    const response = await send({ ...IDENTITY, breed: "Persa" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "profile_breed_invalid" });
    expect(control.writes).toHaveLength(0);
  });

  it("accepts the animal's OWN stored breed even when the catalog has lost it", async () => {
    // QA A5: a legacy value survives an unrelated name edit rather than being
    // wiped by a picker that never offered it.
    control.access = () => ({
      kind: "owner",
      pet: petRow({ breed: "Ovejero Inventado" }),
      holderRole: "owner",
    });
    const response = await send({ ...IDENTITY, breed: "Ovejero Inventado" });
    expect(response.status).toBe(200);
    expect((control.writes[0].input.parsed as Record<string, unknown>).breed).toBe(
      "Ovejero Inventado",
    );
  });

  it("refuses a CARETAKER, and writes nothing", async () => {
    control.access = asRole("caretaker");
    const response = await send(IDENTITY);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "profile_forbidden" });
    expect(control.writes).toHaveLength(0);
  });

  it("admits a co-owner and a foster, as the web does", async () => {
    for (const role of ["co_owner", "foster"]) {
      control.writes = [];
      control.access = asRole(role);
      expect((await send(IDENTITY)).status).toBe(200);
      expect(control.writes).toHaveLength(1);
    }
  });

  it("answers 500 without echoing the use-case's own sentence", async () => {
    control.updateResult = { ok: false, error: "No se pudo actualizar: detalle interno" };
    const response = await send(IDENTITY);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "profile_failed" });
  });

  it("refuses an empty name at the schema, before any guard work", async () => {
    const response = await send({ ...IDENTITY, name: "   " });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toHaveLength(0);
  });
});

describe("POST — contactos de emergencia", () => {
  it("writes through the web's own use-case, unchanged", async () => {
    const response = await send(CONTACTS);
    expect(response.status).toBe(200);
    expect(control.writes).toHaveLength(1);
    expect(control.writes[0]).toEqual({
      command: "set_emergency_contacts",
      input: {
        userId: OWNER_ID,
        publicToken: TOKEN,
        preferredVetName: "Vet Sur",
        preferredVetPhone: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
      },
    });
  });

  it("reports the change when a cleared field actually clears something", async () => {
    // `preferredVetPhone` held "1122334455" and is being emptied.
    expect(await (await send(CONTACTS)).json()).toEqual({
      command: "set_emergency_contacts",
      changed: true,
    });
  });

  it("reports changed:false when the four values already matched", async () => {
    const body = await (
      await send({
        command: "set_emergency_contacts",
        preferredVetName: "Vet Norte",
        preferredVetPhone: "1122334455",
        emergencyContactName: "",
        emergencyContactPhone: "",
      })
    ).json();
    expect(body).toEqual({ command: "set_emergency_contacts", changed: false });
  });

  it("refuses a CO-OWNER — narrower than titular, and the writer agrees", async () => {
    control.access = asRole("co_owner");
    const response = await send(CONTACTS);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "profile_forbidden" });
    expect(control.writes).toHaveLength(0);
  });

  it("refuses a FOSTER — a holder is not the person whose phone number this is", async () => {
    control.access = asRole("foster");
    expect((await send(CONTACTS)).status).toBe(403);
    expect(control.writes).toHaveLength(0);
  });

  it("refuses the ORG path, which the identity half admits", async () => {
    // The one place the two commands visibly disagree about the same caller.
    control.access = asOrg();
    expect((await send(CONTACTS)).status).toBe(403);
    expect((await send(IDENTITY)).status).toBe(200);
  });

  it("answers 404 when the ownership row moved between the guard and the write", async () => {
    control.contactsResult = { error: "NOT_FOUND" };
    const response = await send(CONTACTS);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("maps the writer's own validation refusal to 400, not 500", async () => {
    control.contactsResult = { error: "VALIDATION_ERROR: Máximo 80 caracteres" };
    const response = await send(CONTACTS);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});

describe("POST — the request itself", () => {
  it("refuses without a bearer", async () => {
    const response = await send(IDENTITY, {});
    expect(response.status).toBe(401);
    expect(control.writes).toHaveLength(0);
  });

  it("refuses an unknown command", async () => {
    const response = await send({ command: "delete_pet" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(control.writes).toHaveLength(0);
  });

  it("answers 404 for a pet this caller may not touch, before reading the command", async () => {
    control.access = () => ({ kind: "none" });
    const response = await send(IDENTITY);
    expect(response.status).toBe(404);
    expect(control.writes).toHaveLength(0);
  });
});
