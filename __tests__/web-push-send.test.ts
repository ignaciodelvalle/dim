// Unit tests for the Web Push delivery leg (lib/infra/web-push.ts).
//
// Verifies the fail-soft send contract:
//   1. Disabled (flag off / missing VAPID keys) → complete no-op.
//   2. Enabled → sends to every ACTIVE subscription and bumps last_used_at.
//   3. 410/404 from the push service → subscription soft-revoked (revoked_at).
//   4. Other send failures → reportError, subscription left untouched.
//   5. sendPushForNotifications pushes URGENT rows only (v1 scope).
//   6. Nothing ever throws to the caller, even when the DB lookup fails.
//
// DB and web-push are fully mocked so no local stack is required.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: web-push
// ---------------------------------------------------------------------------

const sendNotificationMock = vi.fn();
vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/infra/report-error
// ---------------------------------------------------------------------------

const reportErrorMock = vi.fn();
vi.mock("@/lib/infra/report-error", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

// ---------------------------------------------------------------------------
// Mock: @/db — select returns the fixture subscriptions; update captures the
// set() payloads so tests can assert revocation vs last-used bumps. The
// pushSubscriptions table object is the REAL schema export so the drizzle
// operators (eq/and/isNull) in the module under test receive real columns.
// ---------------------------------------------------------------------------

let mockSubs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = [];
let selectShouldThrow = false;
const updateSetCalls: Array<Record<string, unknown>> = [];

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  return {
    pushSubscriptions: schema.pushSubscriptions,
    db: {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => {
            if (selectShouldThrow) throw new Error("db unavailable");
            return mockSubs;
          },
        }),
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => {
          updateSetCalls.push(values);
          return { where: async () => undefined };
        },
      })),
    },
  };
});

import { PUSH_ELIGIBLE_NOTIFICATION_TYPE, isPushEligible } from "@/lib/infra/push-eligibility";
import { sendPushForNotifications, sendWebPush } from "@/lib/infra/web-push";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = "user-0000-0000-0000-000000000001";

function activeSub(id: string) {
  return {
    id,
    endpoint: `https://push.example.com/reg/${id}`,
    p256dh: "p256dh-key",
    auth: "auth-secret",
  };
}

function enablePushEnv() {
  vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "1");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
}

beforeEach(() => {
  mockSubs = [];
  selectShouldThrow = false;
  updateSetCalls.length = 0;
  sendNotificationMock.mockReset().mockResolvedValue({ statusCode: 201 });
  reportErrorMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// sendWebPush
// ---------------------------------------------------------------------------

describe("sendWebPush", () => {
  it("no-ops when the feature flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pk");
    vi.stubEnv("VAPID_PRIVATE_KEY", "sk");
    mockSubs = [activeSub("sub-1")];

    await sendWebPush(USER_ID, { title: "Hola" });

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("no-ops when VAPID keys are missing even with the flag on", async () => {
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
    mockSubs = [activeSub("sub-1")];

    await sendWebPush(USER_ID, { title: "Hola" });

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends to every active subscription and bumps last_used_at", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-1"), activeSub("sub-2")];

    await sendWebPush(USER_ID, { title: "Avistaje de Pampa", body: "Cerca tuyo", url: "/x" });

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const [subscription, body] = sendNotificationMock.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
    ];
    expect(subscription.endpoint).toBe("https://push.example.com/reg/sub-1");
    expect(subscription.keys).toEqual({ p256dh: "p256dh-key", auth: "auth-secret" });
    expect(JSON.parse(body)).toMatchObject({ title: "Avistaje de Pampa", url: "/x" });
    // One last_used_at bump per successful send, no revocations.
    expect(updateSetCalls).toHaveLength(2);
    for (const set of updateSetCalls) {
      expect(set).toHaveProperty("lastUsedAt");
      expect(set).not.toHaveProperty("revokedAt");
    }
  });

  it("soft-revokes a subscription when the push service answers 410", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-gone"), activeSub("sub-ok")];
    sendNotificationMock
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }))
      .mockResolvedValueOnce({ statusCode: 201 });

    await sendWebPush(USER_ID, { title: "Hola" });

    // First sub revoked, second delivered + bumped.
    expect(updateSetCalls).toHaveLength(2);
    expect(updateSetCalls[0]).toHaveProperty("revokedAt");
    expect(updateSetCalls[1]).toHaveProperty("lastUsedAt");
    // 410 is an expected lifecycle event, not an error.
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("soft-revokes on 404 as well", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-404")];
    sendNotificationMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { statusCode: 404 }),
    );

    await sendWebPush(USER_ID, { title: "Hola" });

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toHaveProperty("revokedAt");
  });

  it("reports (not revokes) on other send failures", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-1")];
    sendNotificationMock.mockRejectedValueOnce(
      Object.assign(new Error("server error"), { statusCode: 500 }),
    );

    await sendWebPush(USER_ID, { title: "Hola" });

    expect(updateSetCalls).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("web-push/send");
  });

  it("never throws even when the subscription lookup fails", async () => {
    enablePushEnv();
    selectShouldThrow = true;

    await expect(sendWebPush(USER_ID, { title: "Hola" })).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("web-push/send-all");
  });
});

// ---------------------------------------------------------------------------
// sendPushForNotifications — the seam filter (urgent, plus pet_sighting)
// ---------------------------------------------------------------------------

describe("sendPushForNotifications", () => {
  it("pushes urgent rows only (v1 scope)", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-1")];

    await sendPushForNotifications([
      { userId: USER_ID, severity: "info", title: "Bienvenida" },
      { userId: USER_ID, severity: "warning", title: "Vacuna próxima" },
      { userId: USER_ID, severity: "success", title: "Listo" },
      {
        userId: USER_ID,
        severity: "urgent",
        title: "Alguien encontró a Pampa",
        body: "Contactalo ya",
        ctaUrl: "/mis-mascotas/DIM-PAMP-0001",
        dedupeKey: "found:abc",
      },
    ]);

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const [, body] = sendNotificationMock.mock.calls[0] as [unknown, string];
    expect(JSON.parse(body)).toEqual({
      title: "Alguien encontró a Pampa",
      body: "Contactalo ya",
      url: "/mis-mascotas/DIM-PAMP-0001",
      tag: "found:abc",
    });
  });

  it("pushes a warning-severity pet_sighting row (taxonomy: avistaje ≠ hallazgo)", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-1")];

    await sendPushForNotifications([
      {
        userId: USER_ID,
        severity: "warning",
        notificationType: "pet_sighting",
        title: "Avistaje de Pampa",
      },
      // A warning row of any OTHER type still does not push.
      { userId: USER_ID, severity: "warning", notificationType: "vaccine_due", title: "Vacuna" },
    ]);

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const [, body] = sendNotificationMock.mock.calls[0] as [unknown, string];
    expect(JSON.parse(body).title).toBe("Avistaje de Pampa");
  });

  it("skips rows without a severity (defaults are not urgent)", async () => {
    enablePushEnv();
    mockSubs = [activeSub("sub-1")];

    await sendPushForNotifications([{ userId: USER_ID, title: "Sin severidad" }]);

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("no-ops entirely when push is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "");
    await sendPushForNotifications([{ userId: USER_ID, severity: "urgent", title: "X" }]);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The predicate itself, tested directly rather than only through the web leg.
//
// WHY BOTH. The block above exercises the filter through `sendPushForNotifications`,
// which is the web channel's path and mocks a transport to observe it. A second
// channel now asks the same question, so the rule needs a test that survives
// either sender being rewritten: these assertions touch no database, no
// transport and no feature flag.
//
// The severities are enumerated EXHAUSTIVELY and pinned as literals. The point
// is not that three of them happen to be false today — it is that a person
// widening the filter has to walk past four assertions that each name the value
// they are changing the answer for.
// ---------------------------------------------------------------------------

describe("isPushEligible", () => {
  it("qualifies an urgent row", () => {
    expect(isPushEligible({ severity: "urgent" })).toBe(true);
  });

  it("rejects every severity that is not urgent", () => {
    expect(isPushEligible({ severity: "info" })).toBe(false);
    expect(isPushEligible({ severity: "success" })).toBe(false);
    expect(isPushEligible({ severity: "warning" })).toBe(false);
  });

  it("rejects a row with no severity at all", () => {
    expect(isPushEligible({})).toBe(false);
    expect(isPushEligible({ severity: null })).toBe(false);
  });

  it("qualifies pet_sighting despite its warning severity (avistaje ≠ hallazgo)", () => {
    expect(isPushEligible({ severity: "warning", notificationType: "pet_sighting" })).toBe(true);
  });

  it("qualifies pet_sighting even with no severity, because the type carries it", () => {
    expect(isPushEligible({ notificationType: "pet_sighting" })).toBe(true);
  });

  it("rejects a non-urgent row of any other type — the list is exactly one type long", () => {
    expect(isPushEligible({ severity: "warning", notificationType: "pet_lost" })).toBe(false);
    expect(isPushEligible({ severity: "info", notificationType: "vaccine_due" })).toBe(false);
    expect(isPushEligible({ severity: "warning", notificationType: "transfer_pending" })).toBe(
      false,
    );
  });

  it("names the one non-urgent type as a literal, so widening the list is visible in a diff", () => {
    expect(PUSH_ELIGIBLE_NOTIFICATION_TYPE).toBe("pet_sighting");
  });

  it("is the same rule the web leg applies", () => {
    // Guards the extraction itself: if somebody re-inlines a divergent copy into
    // `sendPushForNotifications`, the block above keeps passing and this fails.
    const rows = [
      { userId: USER_ID, severity: "urgent" as const, title: "a" },
      {
        userId: USER_ID,
        severity: "warning" as const,
        notificationType: "pet_sighting",
        title: "b",
      },
      { userId: USER_ID, severity: "info" as const, title: "c" },
    ];
    expect(rows.filter(isPushEligible).map((r) => r.title)).toEqual(["a", "b"]);
  });
});
