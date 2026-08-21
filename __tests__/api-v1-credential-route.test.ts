// GET /api/v1/pets/{publicToken}/credential — the first `/api/v1` endpoint.
//
// WHAT THIS FILE HAS TO PROVE, AND WHY EACH PART EXISTS
// ---------------------------------------------------------------------------
// The four-way union is already proved without a database in
// src/modules/pets/application/read/lookup-public-credential.test.ts. This file
// proves the things that are the ROUTE's own and that no other test can see:
//
//   1. The HTTP mapping (429 / 404 / 503 / 200) and the envelope §6 requires.
//   2. `cache-control: no-store` on EVERY branch. It is NOT inherited —
//      middleware stamps it from a path-prefix allowlist `/api/…` does not
//      match — so the only thing standing between this endpoint and the stale
//      "SE BUSCA + owner phone" class closed on 2026-07-07 is that every one of
//      four returns sets the header. A test that checks the happy path only
//      would have certified exactly the branch nobody forgets.
//   3. The per-lookup limiter runs BEFORE the door. A limiter placed after the
//      lookup bounds nothing, and the assertion is on ORDER, not presence.
//   4. THE ANTI-ORACLE PROPERTIES (§1.1 / §9 item 10), which are the reason this
//      surface gets a checklist at all. Three of them, each a real disclosure
//      someone could ship:
//        • a rate-limit response must not say whether the token exists;
//        • an ERASED subject's credential (PO-4 soft delete) must be
//          indistinguishable from a token that never existed;
//        • `not_found` and `throttled` must not differ in anything but the
//          status line and the error code.
//   5. The payload carries no internal id, no microchip number and nothing
//      DNI-shaped — measured against a REAL row, because the point is what the
//      projection does with data that exists, not what a fixture happened to
//      omit.
//
// HOW THE MOCKING WORKS, AND WHY IT IS A PASSTHROUGH
// ---------------------------------------------------------------------------
// Both mocks default to the REAL implementation and are switched to a stub only
// for the tests that need one. That is what lets the live-database cases in the
// last describe share a file with the mapped-status cases: a plain `vi.mock`
// factory would have replaced the door for the whole module graph, and the
// PO-4 erasure property can only be measured against Postgres.

import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  /** When set, replaces the door's answer. `null` = call the real one. */
  door: null as null | (() => unknown),
  /** When set, replaces the limiter (may throw). `null` = call the real one. */
  rateLimit: null as null | ((endpoint: string, identifier: string) => void),
  /** Every collaborator the handler reached, in order. */
  calls: [] as string[],
}));

vi.mock("@/src/modules/pets/application/read/lookup-public-credential", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/src/modules/pets/application/read/lookup-public-credential")
    >();
  return {
    ...actual,
    lookupPublicCredential: async (
      ...args: Parameters<typeof actual.lookupPublicCredential>
    ): Promise<Awaited<ReturnType<typeof actual.lookupPublicCredential>>> => {
      control.calls.push("door");
      if (control.door) return control.door() as never;
      return actual.lookupPublicCredential(...args);
    },
  };
});

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: async (endpoint: string, identifier: string, config: never) => {
      control.calls.push(`limit:${endpoint}`);
      if (control.rateLimit) {
        control.rateLimit(endpoint, identifier);
        return;
      }
      return actual.enforceRateLimit(endpoint, identifier, config);
    },
  };
});

import { type Pet, db, petIdentifications, pets } from "@/db";
import { RateLimitError } from "@/lib/infra/rate-limit";
import type { CredentialViewData } from "@/src/modules/pets/application/read/load-public-credential";
import { inArray } from "drizzle-orm";

import { PUBLIC_CREDENTIAL_STALE_AFTER_MS } from "@/app/api/v1/pets/[publicToken]/credential/payload";
import { GET } from "@/app/api/v1/pets/[publicToken]/credential/route";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// A fresh IP per RUN. The real limiter is a persistent DB counter with an
// hourly window, so a fixed address would accumulate across runs and start
// 429-ing the live cases on the fourth `pnpm test` of an afternoon — a failure
// that looks like a bug in the route and is not.
const CALLER_IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

async function get(publicToken: string, ip: string = CALLER_IP) {
  return GET(
    new Request(`http://test.local/api/v1/pets/${encodeURIComponent(publicToken)}/credential`, {
      headers: { "x-real-ip": ip },
    }),
    { params: Promise.resolve({ publicToken }) },
  );
}

/** Status + every header + the parsed body — the whole observable response. */
async function observe(response: Response) {
  return {
    status: response.status,
    headers: Object.fromEntries([...response.headers.entries()].sort()),
    body: await response.json(),
  };
}

beforeEach(() => {
  control.door = null;
  control.rateLimit = null;
  control.calls = [];
  // The degraded branches log one structured line through reportError.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Fixtures for the mapped-status cases
// ---------------------------------------------------------------------------

const TOKEN = "DIM-APIV1-TEST";

const ACTIVE_PET = {
  id: "00000000-0000-0000-0000-0000000000aa",
  publicToken: TOKEN,
  name: "Pampa",
  species: "dog",
  breed: "Mestizo",
  sex: "female",
  color: "marrón",
  distinguishingFeatures: "collar rojo",
  dateOfBirth: "2020-01-01",
  deceasedAt: null,
  status: "active",
  primaryPhotoId: null,
  emergencyInfoVisible: false,
  inCustodyDispute: false,
  potentiallyDangerousBreed: false,
  rabiesObservationStatus: null,
  permanentConditions: [],
  permanentConditionsOther: null,
  discloseConditionsPublicly: false,
  tier2PublicPermanent: false,
  tier2PublicEnabledUntil: null,
  allowFinderFormWhenLost: true,
  discloseFirstNameWhenLost: false,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: false,
  jurisdictionLocality: "Ushuaia",
} as unknown as Pet;

const VIEW_DATA = {
  canonicalIds: { microchip: null, tattoo: null },
  hasVaccinations: false,
  latestVaccinationRows: [],
  openCustodyEpisodeRows: [],
  rabiesEvents: [],
  serviceDog: undefined,
  lostContext: null,
  lostTattooPhotoUrl: null,
  registryClaim: { registryBacked: false, identityHeading: "Identidad registrada en miMAR" },
} as unknown as CredentialViewData;

const OK_LOOKUP = { status: "ok", pet: ACTIVE_PET, photoUrl: null, data: VIEW_DATA } as const;

/** The limiter stub that lets a request through while recording it. */
const ALLOW = () => {};

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

describe("GET /api/v1/pets/[publicToken]/credential — status mapping", () => {
  it("429s on the PER-LOOKUP limiter, before the door is ever reached", async () => {
    control.rateLimit = (endpoint) => {
      throw new RateLimitError(new Date(Date.now() + 60_000), endpoint);
    };

    const seen = await observe(await get(TOKEN));

    expect(seen.status).toBe(429);
    expect(seen.body).toEqual({ error: "rate_limited" });
    // ORDER, not presence: a limiter that runs after the lookup has already hit
    // the database bounds nothing. The door must not appear at all.
    expect(control.calls).toEqual(["limit:public_token_api_credential_lookup"]);
  });

  it("keys the per-lookup limiter by token AND caller (D3)", async () => {
    const keys: string[] = [];
    control.rateLimit = (_endpoint, identifier) => {
      keys.push(identifier);
    };
    control.door = () => ({ status: "not_found" });

    await get("DIM-AAAA-0001", "203.0.113.7");
    await get("DIM-BBBB-0002", "203.0.113.7");

    // Token-first so the counters read as "this credential, from this caller".
    // A key of the IP alone would duplicate the surface bucket; a key of the
    // TOKEN alone would let anyone burn a victim credential's global budget.
    expect(keys).toEqual(["DIM-AAAA-0001:203.0.113.7", "DIM-BBBB-0002:203.0.113.7"]);
  });

  it("429s on the SURFACE limiter with a byte-identical response", async () => {
    control.rateLimit = (endpoint) => {
      throw new RateLimitError(new Date(), endpoint);
    };
    const perLookup = await observe(await get(TOKEN));

    control.rateLimit = ALLOW;
    control.door = () => ({ status: "throttled" });
    const surface = await observe(await get(TOKEN));

    // Two limiters, ONE 429. A client that could tell them apart could probe
    // which budget it exhausted, and the difference has no legitimate use.
    expect(surface).toEqual(perLookup);
  });

  it("404s on not_found", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({ status: "not_found" });

    const seen = await observe(await get(TOKEN));

    expect(seen.status).toBe(404);
    expect(seen.body).toEqual({ error: "not_found" });
  });

  it("503s on degraded WITH the fields the degraded card renders", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({
      status: "degraded",
      publicToken: TOKEN,
      pet: { name: "Pampa", sex: "female", isLost: true, allowFinderForm: true },
    });

    const seen = await observe(await get(TOKEN));

    expect(seen.status).toBe(503);
    // NOT 404: a database outage is not "this token does not exist".
    expect(seen.body.error).toBe("temporarily_unavailable");
    expect(seen.body.identity).toEqual({
      status: "ok",
      data: { name: "Pampa", sex: "female", isLost: true, allowFinderForm: true },
    });
    // Every other section says it could not be loaded. NEVER an empty object:
    // a native client renders a blank section as "a valid credential with no
    // findings" (RN-8 #6), which is the failure this contract exists for.
    for (const section of ["status", "vaccination", "notices", "lost", "tier2"] as const) {
      expect(seen.body[section]).toEqual({ status: "unavailable" });
    }
    expect(seen.headers["retry-after"]).toBe("30");
  });

  it("503s on degraded BARE with identity unavailable too", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({ status: "degraded", publicToken: TOKEN });

    const seen = await observe(await get(TOKEN));

    expect(seen.status).toBe(503);
    // The pet ROW itself failed, so the token really is all that is known.
    // Saying so beats inventing a name.
    expect(seen.body.identity).toEqual({ status: "unavailable" });
    expect(seen.body.publicToken).toBe(TOKEN);
  });

  it("200s on ok with every section present and reporting ok", async () => {
    control.rateLimit = ALLOW;
    control.door = () => OK_LOOKUP;

    const seen = await observe(await get(TOKEN));

    expect(seen.status).toBe(200);
    for (const section of [
      "identity",
      "status",
      "vaccination",
      "notices",
      "lost",
      "tier2",
    ] as const) {
      expect(seen.body[section].status).toBe("ok");
    }
    expect(seen.body.identity.data).toMatchObject({
      name: "Pampa",
      species: "dog",
      breed: "Mestizo",
      sex: "female",
      hasMicrochip: false,
      hasTattoo: false,
      libretaCode: `LIB-AR-${TOKEN}`,
    });
    // "loaded, and this pet is not lost" — distinct from "could not load".
    expect(seen.body.lost).toEqual({ status: "ok", data: null });
    // The Tier-2 medical projection is a separate streamed read this door does
    // not make. It says so rather than rendering as an empty history.
    expect(seen.body.tier2.data.medical).toBe("not_included");
  });
});

// ---------------------------------------------------------------------------
// Envelope and headers — the two things §4 and §6 require on every response
// ---------------------------------------------------------------------------

describe("envelope and headers", () => {
  const branches = [
    ["per-lookup 429", () => ({ rateLimit: true }) as const],
    ["surface 429", () => ({ door: { status: "throttled" } }) as const],
    ["404", () => ({ door: { status: "not_found" } }) as const],
    ["503", () => ({ door: { status: "degraded", publicToken: TOKEN } }) as const],
    ["200", () => ({ door: OK_LOOKUP }) as const],
  ] as const;

  for (const [label, setup] of branches) {
    it(`sets cache-control: no-store on ${label}`, async () => {
      const config = setup() as { rateLimit?: boolean; door?: unknown };
      control.rateLimit = config.rateLimit
        ? (endpoint) => {
            throw new RateLimitError(new Date(), endpoint);
          }
        : ALLOW;
      if (config.door) control.door = () => config.door;

      const response = await get(TOKEN);

      // §4: middleware's no-store allowlist is a PATH PREFIX list and `/api/`
      // is not on it. Every branch sets it itself or the branch is a hole.
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
  }

  it("carries payloadVersion / issuedAt / staleAfter on a successful read", async () => {
    control.rateLimit = ALLOW;
    control.door = () => OK_LOOKUP;

    const body = await (await get(TOKEN)).json();

    expect(body.payloadVersion).toBe(1);
    expect(Number.isNaN(Date.parse(body.issuedAt))).toBe(false);
    expect(Date.parse(body.staleAfter) - Date.parse(body.issuedAt)).toBe(
      PUBLIC_CREDENTIAL_STALE_AFTER_MS,
    );
  });

  it("carries the same envelope on a DEGRADED read", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({ status: "degraded", publicToken: TOKEN });

    const body = await (await get(TOKEN)).json();

    // One parser for both. A degraded answer that dropped the envelope would
    // force a client to special-case 503 before it could even timestamp it.
    expect(body.payloadVersion).toBe(1);
    expect(Date.parse(body.staleAfter) - Date.parse(body.issuedAt)).toBe(
      PUBLIC_CREDENTIAL_STALE_AFTER_MS,
    );
  });

  it("omits payloadVersion from 404 and 429 — they carry no payload", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({ status: "not_found" });
    expect(Object.keys(await (await get(TOKEN)).json())).toEqual(["error"]);

    control.door = () => ({ status: "throttled" });
    expect(Object.keys(await (await get(TOKEN)).json())).toEqual(["error"]);
  });
});

// ---------------------------------------------------------------------------
// The anti-oracle properties (§1.1, §9 item 10)
// ---------------------------------------------------------------------------
//
// Shaped after __tests__/denuncia-access-timing-oracle.test.ts, which
// api-invariants.md names as the model: assert the PROPERTY (two responses are
// the same), never a restated constant.

describe("response equality — no existence oracle", () => {
  it("makes not_found and throttled differ ONLY in status and error code", async () => {
    control.rateLimit = ALLOW;

    control.door = () => ({ status: "not_found" });
    const notFound = await observe(await get(TOKEN));
    control.door = () => ({ status: "throttled" });
    const throttled = await observe(await get(TOKEN));

    expect(notFound.status).toBe(404);
    expect(throttled.status).toBe(429);
    expect(notFound.body).toEqual({ error: "not_found" });
    expect(throttled.body).toEqual({ error: "rate_limited" });
    // Everything else identical: same header set, same values, same body shape.
    // This is where a `Retry-After`, a `x-ratelimit-remaining`, or an
    // echoed-back token would show up — each of them a channel that says
    // something about the token the status code alone does not.
    expect(throttled.headers).toEqual(notFound.headers);
    expect(Object.keys(throttled.body)).toEqual(Object.keys(notFound.body));
  });

  it("answers a throttled caller identically whatever the token is", async () => {
    control.rateLimit = ALLOW;
    control.door = () => ({ status: "throttled" });

    const real = await observe(await get(TOKEN));
    const nonsense = await observe(await get("DIM-ZZZZ-ZZZZ"));

    // A 429 that varied with the token would turn the rate limiter itself into
    // the enumeration oracle it exists to prevent.
    expect(nonsense).toEqual(real);
  });
});

// ---------------------------------------------------------------------------
// Against the real database
// ---------------------------------------------------------------------------

describe("against a real pet row", () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const liveToken = `DIM-APIV1-${suffix}`;
  const erasedToken = `DIM-APIER-${suffix}`;
  // 15 digits, the ISO chip shape. It exists in the database, the credential
  // says "Microchip: Sí", and it must appear nowhere in the JSON.
  const chipCode = `900${Date.now()}`.slice(0, 15);
  const createdTokens = [liveToken, erasedToken];

  afterAll(async () => {
    const rows = await db
      .select({ id: pets.id })
      .from(pets)
      .where(inArray(pets.publicToken, createdTokens));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(petIdentifications).where(inArray(petIdentifications.petId, ids));
      await db.delete(pets).where(inArray(pets.id, ids));
    }
  });

  it("serves a live credential without a single internal id or DNI-shaped value", async () => {
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: liveToken,
        name: "Pampa API",
        species: "dog",
        sex: "female",
        status: "active",
      })
      .returning();
    await db.insert(petIdentifications).values({
      petId: pet.id,
      kind: "microchip_iso",
      code: chipCode,
      recordedAt: new Date().toISOString().slice(0, 10),
    });

    const response = await get(liveToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    // The chip is ON RECORD and the credential says so — which is the whole
    // point of measuring this against a real row rather than a fixture that
    // simply had no chip to leak.
    expect(body.identity.data.hasMicrochip).toBe(true);
    expect(serialized).not.toContain(chipCode);
    // No internal identifier of any kind: pet id, attachment id, case id.
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain(pet.id);
    // Nothing DNI-shaped on any string leaf (Ley 25.326 — and invariant #5,
    // which forbids a plaintext DNI anywhere, credential included).
    const leaves = stringLeaves(body);
    // NON-VACUITY: a `for` over an empty list passes loudly enough to look like
    // proof. If the walker stops descending, this is what says so.
    expect(leaves.length).toBeGreaterThan(5);
    expect(leaves).toContain("Pampa API");
    for (const leaf of leaves) {
      expect(leaf, `DNI-shaped leaf in the payload: ${leaf}`).not.toMatch(/^\d{7,8}$/);
    }
  });

  it("answers an ERASED pet exactly as it answers a token that never existed", async () => {
    await db.insert(pets).values({
      publicToken: erasedToken,
      name: "Erased",
      species: "cat",
      sex: "male",
      status: "active",
      deletedAt: new Date(),
    });

    const erased = await observe(await get(erasedToken));
    const neverExisted = await observe(await get(`DIM-NONE-${suffix}`));

    // PO-4 / Ley 25.326 art. 16: erasing a subject soft-deletes the pets in
    // their custody and the credential goes dark. If the two answers differed
    // by so much as a header, the erasure would be observable — which is the
    // one thing an erasure may never be.
    expect(erased).toEqual(neverExisted);
    expect(erased.status).toBe(404);
  });
});

/** Every string leaf of a parsed JSON value, depth-first. */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(stringLeaves);
  }
  return [];
}
