// Unit tests for recordPostAdoptionCheckinAction.
//
// Covers:
//   1. Non-owner access gate → error returned.
//   2. Adopter mismatch → error returned (adoptionPayload.adopter_user_id !== user.id).
//   3. Happy path: inserts post_adoption_checkin event, closes soonest reminder,
//      notifies refugio admins.
//   4. Idempotency: clientIdempotencyKey + wasNoop=true → no double insert, no noop
//      notification.
//   5. Province canonicalization: raw ISO code "AR-C" → stored as "CABA".
//
// Mocking strategy follows __tests__/finder-in-possession-action.test.ts:
//   - Mock @/db (db + table references) with a queryable fake.
//   - Mock @/lib/pet-access (requirePetAccess) so we control who's accessing.
//   - Mock @/lib/uploads (uploadAttachmentIfPresent) to avoid storage calls.
//   - Mock @/lib/event-idempotency (insertEventIdempotent) to control wasNoop.
//   - Mock @/lib/event-schemas (validateEventPayload) to pass through input.
//   - Mock next/navigation so redirect() doesn't throw in tests.
//   - Mock next/cache so revalidatePath is a no-op.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_TOKEN = "DIM-CHK-TEST-001";
const PET_ID = "pet-chk0-0000-0000-000000000001";
const OWNER_USER_ID = "user-chk0-0000-0000-000000000001";
const OTHER_USER_ID = "user-chk0-0000-0000-000000000002";
const ORG_ID = "org-chk0-0000-0000-000000000001";
const ORG_TOKEN = "ORG-CHK-TOKEN-001";
const ADMIN_USER_ID = "user-chk0-0000-0000-000000000003";
const INSERTED_EVENT_ID = "evt-chk0-0000-0000-000000000001";
const REMINDER_ID = "rem-chk0-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// Mock: next/navigation — redirect() is called on success and throws in tests.
// Intercept it so we can detect a successful path without an uncaught throw.
// ---------------------------------------------------------------------------

const mockRedirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// ---------------------------------------------------------------------------
// Mock: next/cache
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/pet-access — controlled per test.
// ---------------------------------------------------------------------------

const mockRequirePetAccess = vi.fn();
vi.mock("@/lib/pet-access", () => ({
  requirePetAccess: (token: string) => mockRequirePetAccess(token),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/uploads
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();
vi.mock("@/lib/uploads", () => ({
  uploadAttachmentIfPresent: (_sb: unknown, file: unknown, _bucket: unknown) => mockUpload(file),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/event-idempotency
// ---------------------------------------------------------------------------

const mockInsertEventIdempotent = vi.fn();
vi.mock("@/lib/event-idempotency", () => ({
  insertEventIdempotent: (values: unknown, tx: unknown) => mockInsertEventIdempotent(values, tx),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/event-schemas — pass through the payload as-is.
// ---------------------------------------------------------------------------

vi.mock("@/lib/event-schemas", () => ({
  validateEventPayload: (_eventType: string, payload: unknown) => payload,
}));

// ---------------------------------------------------------------------------
// Mock: @/db
//
// The action calls (in order inside the transaction):
//   1. db.select().from(petEvents).where(...).orderBy(...).limit(1)  → adoption row
//   2. tx.insert(attachments).values(...)                            → optional attachment
//   3. tx.select().from(reminders).where(...).orderBy(...).limit(1)  → soonest reminder
//   4. tx.update(reminders).set(...).where(...)                      → complete reminder
//   5. tx.select().from(organizations).where(...).limit(1)           → org public token
//   6. tx.select().from(organizationMemberships).where(...)          → admins list
//   7. tx.insert(notifications).values(...)                          → admin notifications
//
// Captured inserts/updates are tracked via module-level variables.
// ---------------------------------------------------------------------------

let capturedEventInsert: Record<string, unknown> | null = null;
let capturedAttachmentInsert: Record<string, unknown> | null = null;
let capturedReminderUpdate: Record<string, unknown> | null = null;
let capturedNotificationInsert: unknown[] | null = null;

// Controls the tx.select chain responses per query order.
// Incremented each time a SELECT chain is consumed (.limit() called or
// the 3rd select's .where() is awaited directly). Sequential and deterministic.
let txSelectCallCount = 0;

// tx SELECT query order (from action source):
//   1 — soonest open reminder  → .select().from().where().orderBy().limit(1)
//   2 — org public token       → .select().from().where().limit(1)
//   3 — admin memberships      → .select().from().where()   (no .limit!)
function makeTxSelectRows(n: number, reminderExists: boolean, adminCount: number): unknown[] {
  if (n === 1) return reminderExists ? [{ id: REMINDER_ID }] : [];
  if (n === 2) return [{ publicToken: ORG_TOKEN }];
  if (n === 3)
    return Array.from({ length: adminCount }, (_, i) => ({
      userId: i === 0 ? ADMIN_USER_ID : `user-extra-admin-${i}`,
    }));
  return [];
}

function buildTxChain(reminderExists = true, adminCount = 1): Record<string, unknown> {
  // Each call to tx.select() creates a fresh chain context. The 3rd select
  // query ends at .where() (no trailing .limit()), so the chain returned by
  // .where() must itself be a Promise (not just a chainable object) to make
  // `await tx.select().from().where()` resolve correctly.
  //
  // We do NOT use a `.then` property (Biome noThenProperty). Instead, on the
  // 3rd select we return a real Promise from .where() so the Drizzle-like
  // chain is awaitable without an explicit .limit().
  const txSelectIdx = 0;

  function makeSelectChain(): Record<string, unknown> {
    // Each new select chain captures its own index at consumption time.
    let myIdx = 0;

    function consume(): Promise<unknown[]> {
      if (!myIdx) {
        txSelectCallCount++;
        myIdx = txSelectCallCount;
      }
      return Promise.resolve(makeTxSelectRows(myIdx, reminderExists, adminCount));
    }

    // Chain with .limit() — for queries 1 and 2.
    const limitableChain: Record<string, unknown> = {
      from: vi.fn(() => limitableChain),
      where: vi.fn(() => {
        // For the 3rd select, return a real Promise so `await .where()` resolves
        // to the admin rows without a trailing .limit() call.
        // At the point .where() is called, txSelectCallCount has NOT yet been
        // incremented — we peek ahead by adding 1.
        const nextIdx = txSelectCallCount + 1;
        if (nextIdx === 3) {
          txSelectCallCount++;
          myIdx = txSelectCallCount;
          return Promise.resolve(makeTxSelectRows(myIdx, reminderExists, adminCount));
        }
        return limitableChain;
      }),
      orderBy: vi.fn(() => limitableChain),
      limit: vi.fn(() => consume()),
    };
    return limitableChain;
  }

  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => {
      capturedReminderUpdate = { completedAt: "set" };
    }),
  };

  const insertChain = {
    values: vi.fn((data: unknown) => {
      if (Array.isArray(data)) {
        capturedNotificationInsert = data as unknown[];
      } else {
        capturedAttachmentInsert = data as Record<string, unknown>;
      }
      return insertChain;
    }),
  };

  return {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
  };
}

// Top-level db used for the pre-transaction adoption lookup.
let adoptionPayload: Record<string, unknown> = {
  adopter_user_id: OWNER_USER_ID,
  previous_owner_organization_id: ORG_ID,
};

const mockDb: Record<string, unknown> = {
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
};

function setupMockDb(txOptions?: { reminderExists?: boolean; adminCount?: number }) {
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => selectChain),
    limit: vi.fn(async () => {
      // adoption_finalized lookup (pre-tx)
      return [{ payload: adoptionPayload }];
    }),
  };

  mockDb.select = vi.fn(() => selectChain);

  const tx = buildTxChain(txOptions?.reminderExists ?? true, txOptions?.adminCount ?? 1);
  mockDb.transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    txSelectCallCount = 0;
    await fn(tx);
  });
}

vi.mock("@/db", () => ({
  db: mockDb,
  petEvents: {},
  reminders: {},
  notifications: {},
  attachments: {},
  organizationMemberships: {},
  organizations: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePetAccessSuccess(overrides?: {
  accessPath?: "owner" | "org";
  userId?: string;
  petStatus?: string;
}): Record<string, unknown> {
  return {
    ok: true,
    supabase: { storage: { from: vi.fn(() => ({ remove: vi.fn() })) } },
    user: { id: overrides?.userId ?? OWNER_USER_ID },
    pet: {
      id: PET_ID,
      name: "Luna",
      status: overrides?.petStatus ?? "active",
      publicToken: PUBLIC_TOKEN,
    },
    accessPath: overrides?.accessPath ?? "owner",
    error: null,
  };
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const BASE_FORM: Record<string, string> = {
  notes: "Todo bien con la mascota.",
};

const PREVIOUS_STATE = { error: null };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordPostAdoptionCheckinAction", () => {
  beforeEach(() => {
    capturedEventInsert = null;
    capturedAttachmentInsert = null;
    capturedReminderUpdate = null;
    capturedNotificationInsert = null;
    txSelectCallCount = 0;
    adoptionPayload = {
      adopter_user_id: OWNER_USER_ID,
      previous_owner_organization_id: ORG_ID,
    };
    mockUpload.mockClear();
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });
    // IMPORTANT: clear call history so mock.calls[0] always refers to the
    // current test's call, not a prior test's accumulated call.
    mockInsertEventIdempotent.mockClear();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });
    mockRequirePetAccess.mockClear();
    setupMockDb();
  });

  // ── Access gate ────────────────────────────────────────────────────────────

  it("returns error when requirePetAccess fails (non-owner access)", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue({ ok: false, error: "Sesión expirada." });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const result = await recordPostAdoptionCheckinAction(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FORM),
    );

    expect(result.error).toBeTruthy();
    expect(mockInsertEventIdempotent).not.toHaveBeenCalled();
  });

  it("returns error when accessPath is not 'owner'", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess({ accessPath: "org" }));
    setupMockDb();

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const result = await recordPostAdoptionCheckinAction(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FORM),
    );

    expect(result.error).toMatch(/adoptante/i);
    expect(mockInsertEventIdempotent).not.toHaveBeenCalled();
  });

  // ── Adopter mismatch ───────────────────────────────────────────────────────

  it("returns error when logged-in user is not the registered adopter", async () => {
    vi.resetModules();
    // Logged in as OTHER_USER_ID, but adoption was for OWNER_USER_ID.
    mockRequirePetAccess.mockResolvedValue(
      makePetAccessSuccess({ accessPath: "owner", userId: OTHER_USER_ID }),
    );
    adoptionPayload = {
      adopter_user_id: OWNER_USER_ID, // mismatch with OTHER_USER_ID
      previous_owner_organization_id: ORG_ID,
    };
    setupMockDb();

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const result = await recordPostAdoptionCheckinAction(
      PUBLIC_TOKEN,
      PREVIOUS_STATE,
      makeFormData(BASE_FORM),
    );

    expect(result.error).toMatch(/adoptante/i);
    expect(mockInsertEventIdempotent).not.toHaveBeenCalled();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("happy path: calls insertEventIdempotent, closes reminder, notifies admins, then redirects", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");

    let threw: unknown = null;
    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, makeFormData(BASE_FORM));
    } catch (e) {
      threw = e;
    }

    // Successful path ends in redirect(), which throws NEXT_REDIRECT.
    expect(threw).toBeTruthy();
    expect((threw as Error).message).toContain("NEXT_REDIRECT");

    // Event was inserted.
    expect(mockInsertEventIdempotent).toHaveBeenCalledOnce();
    const [insertValues] = mockInsertEventIdempotent.mock.calls[0] as [Record<string, unknown>];
    expect(insertValues.eventType).toBe("post_adoption_checkin");
    expect(insertValues.recordedByUserId).toBe(OWNER_USER_ID);
    expect(insertValues.authorRole).toBe("owner");
    const payload = insertValues.payload as Record<string, unknown>;
    expect(payload.related_organization_id).toBe(ORG_ID);

    // Reminder was closed.
    expect(capturedReminderUpdate).not.toBeNull();

    // Admin notification was inserted.
    expect(capturedNotificationInsert).not.toBeNull();
    expect(Array.isArray(capturedNotificationInsert)).toBe(true);
    const notif = (capturedNotificationInsert as Array<Record<string, unknown>>)[0];
    expect(notif.userId).toBe(ADMIN_USER_ID);
    expect(notif.notificationType).toBe("post_adoption_checkin_received");
    expect(notif.relatedPetId).toBe(PET_ID);
    expect(notif.relatedEventId).toBe(INSERTED_EVENT_ID);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("wasNoop=true when clientIdempotencyKey deduplicates: no reminder close, no notification", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    // Simulate the idempotency guard firing (duplicate key).
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: true,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const fd = makeFormData({
      ...BASE_FORM,
      clientIdempotencyKey: "key-abc-123",
    });

    let threw: unknown = null;
    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);
    } catch (e) {
      threw = e;
    }

    // Still redirects (noop is treated as success).
    expect((threw as Error).message).toContain("NEXT_REDIRECT");

    // No reminder closed, no notification sent (noop path returns early).
    expect(capturedReminderUpdate).toBeNull();
    expect(capturedNotificationInsert).toBeNull();
  });

  it("passes clientIdempotencyKey through to insertEventIdempotent", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const idemKey = "client-key-xyz-999";
    const fd = makeFormData({ ...BASE_FORM, clientIdempotencyKey: idemKey });

    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);
    } catch {
      // redirect
    }

    const [insertValues] = mockInsertEventIdempotent.mock.calls[0] as [Record<string, unknown>];
    expect(insertValues.clientIdempotencyKey).toBe(idemKey);
  });

  // ── Province canonicalization ──────────────────────────────────────────────

  it("canonicalizes provinceCode 'AR-C' to 'CABA' in the event payload (guards #586/#590 fix class)", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const fd = makeFormData({
      ...BASE_FORM,
      provinceCode: "AR-C",
      localityName: "Palermo",
    });

    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);
    } catch {
      // redirect
    }

    const [insertValues] = mockInsertEventIdempotent.mock.calls[0] as [Record<string, unknown>];
    const payload = insertValues.payload as Record<string, unknown>;
    // "AR-C" must be resolved to the canonical display name "CABA", not stored raw.
    expect(payload.jurisdiction_province).toBe("CABA");
    expect(payload.jurisdiction_locality).toBe("Palermo");
  });

  it("stores null for unrecognized province codes (guards raw write regression)", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const fd = makeFormData({
      ...BASE_FORM,
      provinceCode: "AR-BOGUS",
    });

    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);
    } catch {
      // redirect
    }

    const [insertValues] = mockInsertEventIdempotent.mock.calls[0] as [Record<string, unknown>];
    const payload = insertValues.payload as Record<string, unknown>;
    expect(payload.jurisdiction_province).toBeNull();
  });

  it("canonicalizes 'AR-B' → 'Buenos Aires'", async () => {
    vi.resetModules();
    mockRequirePetAccess.mockResolvedValue(makePetAccessSuccess());
    setupMockDb();
    mockInsertEventIdempotent.mockResolvedValue({
      event: { id: INSERTED_EVENT_ID },
      wasNoop: false,
    });

    const { recordPostAdoptionCheckinAction } = await import("@/app/actions/checkin");
    const fd = makeFormData({ ...BASE_FORM, provinceCode: "AR-B" });

    try {
      await recordPostAdoptionCheckinAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);
    } catch {
      // redirect
    }

    const [insertValues] = mockInsertEventIdempotent.mock.calls[0] as [Record<string, unknown>];
    const payload = insertValues.payload as Record<string, unknown>;
    expect(payload.jurisdiction_province).toBe("Buenos Aires");
  });
});
