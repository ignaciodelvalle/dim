// notifyOwnerOfFoundPetAction — the "encontré tu mascota" channel.
//
// WHAT THIS FILE IS ABOUT
// ---------------------------------------------------------------------------
// Someone scans the QR of a lost dog, types their phone number and presses
// send. This action is the ENTIRE circuit: it writes no event, no case, no
// sighting — the notification IS the only place the finder's phone number goes.
// So two failure modes here are not "a missed notification", they are the
// report itself disappearing while the person is told it arrived:
//
//   1. DURABILITY. The write used to be a bare `db.insert(notifications)`
//      inside a swallowing try/catch, with no dedupe key and no dead-letter. A
//      200 ms hiccup in the pool — a deploy, a pooler restart — and the insert
//      failed, the error was logged, and the action returned "listo". The
//      finder walked away certain the owner had been told. Nothing had been
//      written anywhere.
//   2. THE RECIPIENT. The owner was picked with an unranked `.limit(1)` over
//      every active ownership row, with no role filter. On a pet with an active
//      foster Postgres was free to hand back the foster, and the finder's phone
//      went to them instead of the titular. That exact bug was found and fixed
//      in the SIBLING flow (ROUTE-1, audit 2026-08-04) and the fix — ranked
//      recipients in lib/infra/pet-alert-recipients.ts — was never brought here.
//      Worse: a row held by an ORGANISATION has a null user id, and when one of
//      those came back first the action answered "No se encontró un dueño
//      activo" over a perfectly notifiable titular.
//
// WHY THE DEAD-LETTER ASSERTION USES THE REAL SERVICE. Asserting that the code
// "calls createNotificationsBulk" would prove a wiring diagram, not durability.
// These tests run the REAL lib/infra/notification-service over a mocked `@/db`,
// make the notifications insert throw, and then look for the finder's phone
// number in `notification_dead_letter` — where the retry cron can find it.
//
// Also covered (kept from the original file): the persistent rate-limit
// migration, the anonymous-report cases (PO 2026-07-24), and the rule that a
// rejected submission does not burn the (IP, token) budget.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_TOKEN = "DIM-PUBLIC-NOTIFY-001";
const PET_ID = "pet-pub-0000-0000-000000000001";
const OWNER_USER_ID = "user-pub-0000-0000-000000000001";
const FOSTER_USER_ID = "user-pub-0000-0000-000000000002";
const CARETAKER_USER_ID = "user-pub-0000-0000-000000000003";
const PREVIOUS_STATE = { ok: false as const, error: null };

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    // x-real-ip is the trusted edge IP — callerIp() prefers it over XFF.
    get: (key: string) => (key === "x-real-ip" ? "203.0.113.42" : null),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — allow by default; tests override per case.
// ---------------------------------------------------------------------------

const { MockRateLimitError, mockEnforceRateLimit } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    resetAt: Date;
    reason: string;
    constructor(resetAt: Date, reason: string) {
      super(`Rate limit exceeded: ${reason}`);
      this.name = "RateLimitError";
      this.resetAt = resetAt;
      this.reason = reason;
    }
  }
  return {
    MockRateLimitError,
    mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (endpoint: string, id: string, cfg: unknown) =>
      mockEnforceRateLimit(endpoint, id, cfg),
    RateLimitError: MockRateLimitError,
  };
});

// The push leg is a delivery channel, not a record. Stubbed so a test failure
// here can only ever be about what was PERSISTED.
vi.mock("@/lib/infra/web-push", () => ({
  sendPushForNotifications: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: @/db
//
// Table identity matters: the assertions are about WHICH table a row landed in
// (notifications vs notification_dead_letter), so the sentinels are distinct
// objects the mock can compare against, not the interchangeable `{}` they were.
// ---------------------------------------------------------------------------

const TABLES = vi.hoisted(() => ({
  pets: { __table: "pets" },
  ownerships: { __table: "ownerships" },
  notifications: { __table: "notifications" },
  notificationDeadLetter: { __table: "notification_dead_letter" },
}));

type Row = Record<string, unknown>;

let petRows: Row[] = [];
let holderRows: Row[] = [];
let notificationsInsertThrows = false;
let insertedNotifications: Row[] = [];
let deadLetteredRows: Row[] = [];

/**
 * A hand-rolled Drizzle builder double: every method returns the chain, and the
 * chain is thenable so `await` at any point yields rows — which is how the real
 * builder behaves, and what lets the production code await wherever it does.
 */
type Chain = any;

function selectChain(): Chain {
  let table: unknown = null;
  const rows = (): Row[] => {
    if (table === TABLES.pets) return petRows;
    if (table === TABLES.ownerships) return holderRows;
    return [];
  };
  const chain: Chain = {
    from: (t: unknown) => {
      table = t;
      return chain;
    },
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    // Thenable, so `await` on any point of the chain yields the rows — a real
    // Drizzle builder is thenable for exactly this reason.
    // biome-ignore lint/suspicious/noThenProperty: that is what makes it a builder double.
    then: (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(res, rej),
  };
  return chain;
}

function insertChain(table: unknown): Chain {
  const failing = table === TABLES.notifications && notificationsInsertThrows;
  const settle = (): Promise<Row[]> => {
    if (failing) return Promise.reject(new Error("pool blip: connection terminated"));
    return Promise.resolve([{ id: "notif-1" }]);
  };
  const chain: Chain = {
    values: (v: Row | Row[]) => {
      const rows = Array.isArray(v) ? v : [v];
      if (table === TABLES.notifications) insertedNotifications.push(...rows);
      if (table === TABLES.notificationDeadLetter) deadLetteredRows.push(...rows);
      return chain;
    },
    onConflictDoNothing: () => chain,
    returning: () => settle(),
    // biome-ignore lint/suspicious/noThenProperty: same builder double as above.
    then: (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej),
  };
  return chain;
}

const mockDb = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));

vi.mock("@/db", () => ({
  db: mockDb,
  pets: TABLES.pets,
  ownerships: TABLES.ownerships,
  notifications: TABLES.notifications,
  notificationDeadLetter: TABLES.notificationDeadLetter,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const BASE_FIELDS = {
  finderName: "Roberto Sánchez",
  finderContact: "11-9999-8888",
};

const LIVE_PET: Row = {
  id: PET_ID,
  name: "Pochi",
  status: "active",
  publicToken: PUBLIC_TOKEN,
  inCustodyDispute: false,
};

function reset(options: { petFound?: boolean; holders?: Row[] } = {}): void {
  petRows = options.petFound === false ? [] : [LIVE_PET];
  holderRows = options.holders ?? [
    { userId: OWNER_USER_ID, role: "owner", startedAt: new Date("2026-01-01") },
  ];
  notificationsInsertThrows = false;
  insertedNotifications = [];
  deadLetteredRows = [];
  mockEnforceRateLimit.mockReset().mockResolvedValue(undefined);
  mockDb.select.mockReset().mockImplementation(() => selectChain());
  mockDb.insert.mockReset().mockImplementation((t: unknown) => insertChain(t));
}

async function loadAction() {
  const mod = await import("@/app/actions/public");
  return mod.notifyOwnerOfFoundPetAction;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("notifyOwnerOfFoundPetAction — persistent rate-limit migration", () => {
  beforeEach(() => {
    reset();
  });

  it("happy path: inserts notification row when finder provides valid data", async () => {
    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(insertedNotifications).toHaveLength(1);
    expect(insertedNotifications[0].notificationType).toBe("pet_found_report");
    expect(insertedNotifications[0].severity).toBe("urgent");
    expect(insertedNotifications[0].userId).toBe(OWNER_USER_ID);
  });

  it("calls enforceRateLimit with the IP from x-forwarded-for", async () => {
    await (await loadAction())(PUBLIC_TOKEN, PREVIOUS_STATE, makeFormData(BASE_FIELDS));

    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("found_notify"),
      "203.0.113.42",
      expect.objectContaining({ maxPerMinute: 1, maxPerHour: 10 }),
    );
  });

  it("returns ok:false when enforceRateLimit throws RateLimitError", async () => {
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(
        new Date(Date.now() + 60_000),
        `found_notify:${PUBLIC_TOKEN}:203.0.113.42:minute`,
      ),
    );

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("poco");
    expect(insertedNotifications).toHaveLength(0);
  });

  it("returns ok:false when pet is not found", async () => {
    reset({ petFound: false });

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no encontrada");
  });

  it("accepts a report without finderName (anonymous, PO 2026-07-24) — body falls back to 'Alguien'", async () => {
    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData({ finderContact: "1111" }),
    );

    expect(result.ok).toBe(true);
    expect(insertedNotifications[0].body as string).toContain("Alguien");
    expect(insertedNotifications[0].body as string).toContain("1111");
  });

  it("a rejected submission (pet not found) does NOT consume the rate-limit budget (tester fix #6)", async () => {
    reset({ petFound: false });

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(false);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });

  it("accepts a report without finderContact — owner is told no contact was left", async () => {
    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData({ finderName: "Ana" }),
    );

    expect(result.ok).toBe(true);
    expect(insertedNotifications[0].body as string).toContain("Ana");
    expect(insertedNotifications[0].body as string).toContain("No dejó datos de contacto");
  });
});

describe("notifyOwnerOfFoundPetAction — the report survives a failed write", () => {
  beforeEach(() => {
    reset();
  });

  it("dead-letters the finder's phone number when the notifications insert throws", async () => {
    // THE BUG, exactly: a transient failure on the only write in this circuit.
    notificationsInsertThrows = true;

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    // Still "listo" for the finder — a stranger doing a favour must not be
    // handed a scary error, and an error invites a resend the dedupe key would
    // then swallow. The honesty lives in the dead-letter, not in the copy.
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    // And the report is somewhere the retry cron can replay it, with the phone
    // number intact. Without this the number existed only in a request that has
    // already returned.
    expect(deadLetteredRows).toHaveLength(1);
    const payload = deadLetteredRows[0].payload as Record<string, unknown>;
    expect(payload.userId).toBe(OWNER_USER_ID);
    expect(String(payload.body)).toContain("11-9999-8888");
    expect(deadLetteredRows[0].dedupeKey).toBeTruthy();
  });

  it("carries a dedupe key so the replay cannot double-notify", async () => {
    await (await loadAction())(PUBLIC_TOKEN, PREVIOUS_STATE, makeFormData(BASE_FIELDS));

    expect(insertedNotifications[0].dedupeKey).toBeTruthy();
  });

  it("NON-VACUITY: nothing is dead-lettered when the insert succeeds", async () => {
    await (await loadAction())(PUBLIC_TOKEN, PREVIOUS_STATE, makeFormData(BASE_FIELDS));

    expect(insertedNotifications).toHaveLength(1);
    expect(deadLetteredRows).toHaveLength(0);
  });
});

describe("notifyOwnerOfFoundPetAction — who hears it (ROUTE-1 ranking)", () => {
  it("notifies the TITULAR even when a foster row comes back first", async () => {
    // The unranked `.limit(1)` let Postgres return the foster, and the finder's
    // phone went to them while the titular never heard. Same bug, same pet
    // shape, as the one already fixed in the sibling flow.
    reset({
      holders: [
        { userId: FOSTER_USER_ID, role: "foster", startedAt: new Date("2026-02-01") },
        { userId: OWNER_USER_ID, role: "owner", startedAt: new Date("2026-01-01") },
      ],
    });

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(true);
    expect(insertedNotifications.map((n) => n.userId)).toContain(OWNER_USER_ID);
  });

  it("also reaches an active caretaker, with the same body", async () => {
    // The person physically minding the animal is a concurrent recipient, not a
    // fallback — the same decision the sibling flow made (proposal D2).
    reset({
      holders: [
        { userId: OWNER_USER_ID, role: "owner", startedAt: new Date("2026-01-01") },
        { userId: CARETAKER_USER_ID, role: "caretaker", startedAt: new Date("2026-02-01") },
      ],
    });

    await (await loadAction())(PUBLIC_TOKEN, PREVIOUS_STATE, makeFormData(BASE_FIELDS));

    const userIds = insertedNotifications.map((n) => n.userId);
    expect(userIds).toContain(OWNER_USER_ID);
    expect(userIds).toContain(CARETAKER_USER_ID);
    expect(new Set(insertedNotifications.map((n) => n.body)).size).toBe(1);
  });

  it("does not refuse a notifiable titular because an org-held row came first", async () => {
    // 229 rows in the local database are org-held custody with a null user id.
    // One of those first meant "No se encontró un dueño activo" over a titular
    // who was right there.
    reset({
      holders: [
        { userId: null, role: "shelter_custody", startedAt: new Date("2026-02-01") },
        { userId: OWNER_USER_ID, role: "owner", startedAt: new Date("2026-01-01") },
      ],
    });

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(true);
    expect(insertedNotifications.map((n) => n.userId)).toContain(OWNER_USER_ID);
  });

  it("still refuses when nobody can be notified at all", async () => {
    reset({ holders: [] });

    const result = await (await loadAction())(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FIELDS),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("dueño activo");
  });
});
