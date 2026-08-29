// `/api/v1/me/appointments` — the read's clock rules, and the write's refusals.
//
// WHAT THIS FILE IS ACTUALLY ABOUT
// ---------------------------------------------------------------------------
// Three facts on this payload are functions of the SERVER'S clock — which of the
// three sections a row is in, whether it can still be cancelled, whether its
// check-in QR is still good — and the whole reason they are on the wire is that a
// phone's clock cannot be trusted with them. So most of this file is a clock:
// fixed `now`, rows placed either side of it, and assertions about which bucket
// and which capability came back.
//
// The second half is the refusal table. `cancelAppointmentByOwner` answers es-AR
// prose, and this endpoint has to translate it into the contract's closed code
// vocabulary. `every sentence the writer can return is in the table` is the test
// that keeps the two from drifting: the table matches sentences EXACTLY, so a
// reworded refusal silently degrades to a 500 for something that is not a server
// failure, and this is what makes that loud.
//
// THE DB IS STUBBED, THE USE-CASE IS NOT. `listAppointmentsForUser` is what does
// the bucketing, so mocking it would delete the subject of half this file. What
// is stubbed is the drizzle chain under it, which hands back rows.

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

const NOW = new Date("2026-08-29T15:00:00.000Z");

const control = vi.hoisted(() => ({
  live: null as null | (() => unknown),
  /** Rows the stubbed drizzle chain resolves with. */
  rows: [] as Array<Record<string, unknown>>,
  /** What the cancel writer answers. */
  cancelResult: { ok: true } as Record<string, unknown>,
  /** Every call the cancel writer received. */
  cancelCalls: [] as Array<{ token: string; userId: string }>,
}));

vi.mock("@/lib/infra/live-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/live-user")>();
  return {
    ...actual,
    requireLiveUser: async () =>
      control.live ? control.live() : { ok: true, supabase: {}, user: { id: ME }, profile: null },
  };
});

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, enforceRateLimit: async () => {} };
});

vi.mock("@/lib/supabase/bearer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/bearer")>();
  return {
    ...actual,
    createClientFromBearer: (header: string | null) =>
      header ? { ok: true, supabase: {}, token: "tok" } : { ok: false, reason: "MISSING" },
  };
});

// A drizzle SELECT chain that answers `control.rows`.
//
// `where` is the TERMINAL call in the use-case's one query, so it is the method
// that resolves; every other builder just hands the chain back. A thenable would
// have been shorter and is banned (`noThenProperty`) for good reason — an object
// with a `then` is awaited by anything that touches it, including a stray
// `Promise.resolve(chain)` somewhere in the stack — and naming the terminal call
// is better documentation anyway: change the query's shape and this stub stops
// resolving, loudly, instead of quietly answering the old rows.
const chain: Record<string, unknown> = vi.hoisted(() => {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "from", "innerJoin", "leftJoin", "orderBy", "limit"]) {
    self[method] = () => self;
  }
  self.where = async () => control.rows;
  return self;
});

// A PARTIAL mock: only `db` is replaced. The table objects stay real, because
// the use-case builds a drizzle query out of them and because half the app's
// infra transitively imports this module for tables this file has never heard of
// — a hand-written object would report a missing export as a broken FILE, which
// is the one red `/CLAUDE.md` says may never be committed.
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, db: chain };
});

vi.mock("@/src/modules/events/application/booking/cancel-appointment-by-owner", () => ({
  cancelAppointmentByOwner: async (token: string, userId: string) => {
    control.cancelCalls.push({ token, userId });
    return control.cancelResult;
  },
}));

import { APPOINTMENT_REFUSAL_RULES } from "@/app/api/v1/me/appointments/commands";
import { GET, POST } from "@/app/api/v1/me/appointments/route";
import type { MyAppointmentV1, MyAppointmentsV1 } from "@dim/contract/api";

/** Minutes either side of the frozen `now`, as a Date. */
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function row(over: Record<string, unknown> = {}) {
  return {
    appointmentToken: "APT-7K2M-9QX4",
    status: "confirmed",
    organizationId: ORG_ID,
    startsAt: at(60),
    endsAt: at(75),
    offeringName: "Campaña antirrábica — Plaza San Martín",
    serviceKind: "vaccination_rabies",
    durationMinutes: 15,
    priceArs: null,
    petPublicToken: "DIM-PAMP-0001",
    petName: "Pampa",
    orgDisplayName: "Zoonosis Bariloche",
    orgPhone: "+54 294 442-0000",
    orgLocality: "San Carlos de Bariloche",
    providerDisplayName: null,
    providerMatricula: null,
    providerPhone: null,
    ...over,
  };
}

function get() {
  return GET(new Request("https://x/api/v1/me/appointments", { headers: { authorization: "b" } }));
}

function post(body: unknown) {
  return POST(
    new Request("https://x/api/v1/me/appointments", {
      method: "POST",
      headers: { authorization: "b", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function payloadOf(response: Response): Promise<MyAppointmentsV1> {
  return (await response.json()) as MyAppointmentsV1;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  control.live = null;
  control.rows = [];
  control.cancelResult = { ok: true };
  control.cancelCalls = [];
});

describe("GET — the three sections are the server's clock, not the client's", () => {
  it("files a confirmed turno that has not finished under `upcoming`, soonest first", async () => {
    control.rows = [
      row({ appointmentToken: "APT-LATER", startsAt: at(600), endsAt: at(615) }),
      row({ appointmentToken: "APT-SOONER", startsAt: at(30), endsAt: at(45) }),
    ];

    const body = await payloadOf(await get());

    expect(body.upcoming.map((a) => a.appointmentToken)).toEqual(["APT-SOONER", "APT-LATER"]);
    expect(body.past).toEqual([]);
    expect(body.cancelled).toEqual([]);
  });

  it("keeps a turno IN PROGRESS under `upcoming`, which is where its QR is looked for", async () => {
    // THE ONE DELIBERATE DIVERGENCE FROM THE WEB. The browser buckets on
    // `starts_at >= now`, so a consultation that began ten minutes ago is filed
    // under "Pasados" while its check-in QR is still valid — somebody arriving
    // late goes looking under the wrong heading for the code they need.
    control.rows = [row({ startsAt: at(-10), endsAt: at(5) })];

    const body = await payloadOf(await get());

    expect(body.upcoming).toHaveLength(1);
    const item = body.upcoming[0] as MyAppointmentV1;
    expect(item.section).toBe("upcoming");
    // Still checkable in, no longer cancellable. That is the honest state of a
    // consultation in progress, and it is why the two flags are separate.
    expect(item.capabilities).toEqual({ canCancel: false, canCheckIn: true });
  });

  it("moves a confirmed turno to `past` once its slot has ENDED, with both flags off", async () => {
    control.rows = [row({ startsAt: at(-120), endsAt: at(-105) })];

    const body = await payloadOf(await get());

    expect(body.upcoming).toEqual([]);
    expect(body.past).toHaveLength(1);
    expect((body.past[0] as MyAppointmentV1).capabilities).toEqual({
      canCancel: false,
      canCheckIn: false,
    });
  });

  it("files attended under `past` and the three terminal states under `cancelled`", async () => {
    control.rows = [
      row({ appointmentToken: "APT-ATT", status: "attended", startsAt: at(-1440) }),
      row({ appointmentToken: "APT-OWN", status: "cancelled_by_owner", startsAt: at(-60) }),
      row({ appointmentToken: "APT-ORG", status: "cancelled_by_org", startsAt: at(-30) }),
      row({ appointmentToken: "APT-NOS", status: "no_show", startsAt: at(-90) }),
    ];

    const body = await payloadOf(await get());

    expect(body.past.map((a) => a.appointmentToken)).toEqual(["APT-ATT"]);
    // Newest first.
    expect(body.cancelled.map((a) => a.appointmentToken)).toEqual([
      "APT-ORG",
      "APT-OWN",
      "APT-NOS",
    ]);
  });

  it("never offers a capability on a terminal row, whatever the clock says", async () => {
    // A turno the clinic cancelled whose slot is still in the FUTURE. The naive
    // predicate — "the slot has not started, so you may cancel" — would offer
    // Cancelar on something already cancelled and a QR for a turno nobody holds.
    control.rows = [
      row({ status: "cancelled_by_org", startsAt: at(120), endsAt: at(135) }),
      row({ status: "no_show", startsAt: at(120), endsAt: at(135) }),
    ];

    const body = await payloadOf(await get());

    for (const item of body.cancelled) {
      expect(item.capabilities).toEqual({ canCancel: false, canCheckIn: false });
    }
  });

  it("drops a row whose status the CHECK constraint cannot produce, rather than defaulting it", async () => {
    // The web's detail page used to fall through an unrecognised status to the
    // green "Confirmado" badge (state-honesty audit). Saying nothing about a row
    // we cannot classify is the honest answer; bucketing it as confirmed is not.
    control.rows = [row({ status: "cancelled" }), row({ status: "rescheduled" })];

    const body = await payloadOf(await get());

    expect(body.upcoming).toEqual([]);
    expect(body.past).toEqual([]);
    expect(body.cancelled).toEqual([]);
  });
});

describe("GET — what each row carries", () => {
  it("resolves an org-booked turno to the organization arm, phone included", async () => {
    control.rows = [row()];
    const [item] = (await payloadOf(await get())).upcoming;

    expect(item?.provider).toEqual({
      kind: "organization",
      displayName: "Zoonosis Bariloche",
      phone: "+54 294 442-0000",
      locality: "San Carlos de Bariloche",
    });
  });

  it("resolves an independent vet to the professional arm and never to the org one", async () => {
    control.rows = [
      row({
        organizationId: null,
        orgDisplayName: null,
        orgPhone: null,
        orgLocality: null,
        providerDisplayName: "Ana Beatriz Rossi",
        providerMatricula: "MP 4821",
        providerPhone: "+54 294 415-1111",
      }),
    ];
    const [item] = (await payloadOf(await get())).upcoming;

    expect(item?.provider).toEqual({
      kind: "professional",
      displayName: "Ana Beatriz Rossi",
      matriculaNumber: "MP 4821",
      phone: "+54 294 415-1111",
    });
  });

  it("answers `unknown` when the LEFT join found nobody, instead of inventing a name", async () => {
    control.rows = [row({ orgDisplayName: null, orgPhone: null, orgLocality: null })];
    const [item] = (await payloadOf(await get())).upcoming;

    expect(item?.provider).toEqual({ kind: "unknown" });
  });

  it("keeps a free service as null and never as zero", async () => {
    // `Number(null)` is 0, and "Gratuito" and "$0" are different claims — the
    // first is a campaign, the second is a price somebody set.
    control.rows = [
      row({ priceArs: null }),
      row({ appointmentToken: "APT-P", priceArs: "1500.00" }),
    ];
    const items = (await payloadOf(await get())).upcoming;

    expect(items.find((i) => i.appointmentToken === "APT-7K2M-9QX4")?.priceArs).toBe(null);
    // And the numeric column's STRING arrives as a number, once, here.
    expect(items.find((i) => i.appointmentToken === "APT-P")?.priceArs).toBe(1500);
  });

  it("labels a known service kind and answers null for one outside the catalogue", async () => {
    control.rows = [
      row({ serviceKind: "vaccination_rabies" }),
      row({ appointmentToken: "APT-X", serviceKind: "seeded_outside_the_catalogue" }),
    ];
    const items = (await payloadOf(await get())).upcoming;

    expect(items.find((i) => i.appointmentToken === "APT-7K2M-9QX4")?.serviceKindLabel).toBe(
      "Vacunación antirrábica",
    );
    // NOT the raw code echoed back. A client that printed a snake_case string at
    // somebody is the shape the buscar page was fixed for (QA S3-F07).
    expect(items.find((i) => i.appointmentToken === "APT-X")?.serviceKindLabel).toBe(null);
  });

  it("carries no owner notes at all — neither plaintext column is selected", async () => {
    control.rows = [row({ notesFromOwner: "mi perro muerde", notesFromOrg: "revisar cadera" })];
    const raw = JSON.stringify(await payloadOf(await get()));

    expect(raw).not.toContain("muerde");
    expect(raw).not.toContain("cadera");
  });
});

describe("the Art. 16 join — an erased animal's turno is not a third party's to read", () => {
  it("joins pets on `deleted_at IS NULL`, which a stubbed driver cannot prove", () => {
    // AN ANCHOR OVER ONE LINE, and it is labelled as one rather than dressed up
    // as a behavioural test: the predicate is SQL, the driver here is a stub, and
    // proving it needs a live database — which is the integration suite's job.
    // What this catches is the edit that deletes the guard, which is the way it
    // would actually be lost. `bookSlotAction` accepts any active ownership role,
    // so a foster holds appointments that OUTLIVE the owner's erasure; without
    // this predicate an erased animal surfaces to a live third party.
    const source = readFileSync(
      "src/modules/events/application/booking/list-appointments-for-user.ts",
      "utf8",
    );
    expect(source).toContain("isNull(pets.deletedAt)");
    expect(source).toMatch(/innerJoin\(\s*pets,\s*and\(/);
  });
});

describe("POST — the one command, and who it acts as", () => {
  it("cancels and acks, passing the caller id from the SESSION and not from the body", async () => {
    const response = await post({
      command: "cancel",
      appointmentToken: "APT-7K2M-9QX4",
      // A client trying to name somebody else. The route never reads it.
      ownerUserId: "99999999-9999-4999-8999-999999999999",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      command: "cancel",
      changed: true,
      appointmentToken: "APT-7K2M-9QX4",
    });
    expect(control.cancelCalls).toEqual([{ token: "APT-7K2M-9QX4", userId: ME }]);
  });

  it("refuses a provider command with invalid_request and never reaches the writer", async () => {
    // `attend`, `no_show` and `cancel_by_org` are the clinic's, behind
    // `/org/{token}/agenda`. A citizen wallet that could run one would be doing
    // something the owner's browser cannot.
    for (const command of ["attend", "no_show", "cancel_by_org", "book"]) {
      const response = await post({ command, appointmentToken: "APT-7K2M-9QX4" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(control.cancelCalls).toEqual([]);
  });

  it("maps each of the writer's refusals to its own code and status", async () => {
    const expected: Array<[string, string, number]> = [
      ["Turno no encontrado.", "not_found", 404],
      ["Este turno no te pertenece.", "appointment_forbidden", 403],
      ["El turno ya fue procesado.", "appointment_already_resolved", 409],
      ["No podés cancelar un turno que ya pasó.", "appointment_past", 409],
    ];

    for (const [sentence, code, status] of expected) {
      control.cancelResult = { error: sentence };
      const response = await post({ command: "cancel", appointmentToken: "APT-7K2M-9QX4" });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    }
  });

  it("falls through an unrecognised sentence to a 500 rather than granting anything", async () => {
    control.cancelResult = { error: "Una frase que nadie tradujo." };
    const response = await post({ command: "cancel", appointmentToken: "APT-7K2M-9QX4" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "appointment_failed" });
  });

  it("has a table entry for EVERY sentence the writer can return", async () => {
    // THE DRIFT GUARD. The table matches sentences exactly, so a reworded refusal
    // in the writer degrades silently to a 500 for something that is not a server
    // failure. This reads the writer's own source and demands the table covers it.
    const source = readFileSync(
      "src/modules/events/application/booking/cancel-appointment-by-owner.ts",
      "utf8",
    );
    const sentences = [...source.matchAll(/return \{ error: "([^"]+)" \}/g)].map((m) => m[1]);

    // Non-vacuity: a regex that stopped matching would make this pass over nothing.
    expect(sentences.length).toBeGreaterThanOrEqual(4);

    const mapped = new Set(APPOINTMENT_REFUSAL_RULES.map((r) => r.sentence));
    for (const sentence of sentences) {
      expect(mapped.has(sentence as string)).toBe(true);
    }
  });
});

describe("the door itself", () => {
  it("answers auth_required with no bearer, on both methods", async () => {
    const read = await GET(new Request("https://x/api/v1/me/appointments"));
    expect(read.status).toBe(401);
    expect(await read.json()).toEqual({ error: "auth_required" });

    const write = await POST(
      new Request("https://x/api/v1/me/appointments", { method: "POST", body: "{}" }),
    );
    expect(write.status).toBe(401);
  });

  it("stamps the envelope §6 requires, with `now` taken once for the whole response", async () => {
    control.rows = [row()];
    const body = await payloadOf(await get());

    expect(body.payloadVersion).toBe(1);
    expect(body.issuedAt).toBe(NOW.toISOString());
    expect(new Date(body.staleAfter).getTime()).toBe(NOW.getTime() + 60_000);
  });

  it("sets cache-control: no-store, which /api is not on middleware's allowlist for", async () => {
    const response = await get();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
