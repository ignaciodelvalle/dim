// Unit tests for the native (Expo) delivery leg — lib/infra/expo-push.ts.
//
// Covers the fail-soft send contract, which is the WEB leg's contract with one
// substitution (DeviceNotRegistered where web reads 404/410):
//   1. No EXPO_ACCESS_TOKEN → complete no-op, and NOT a throw.
//   2. The eligibility predicate gates this leg exactly as it gates the other.
//   3. A ticket with status 'ok' bumps last_used_at.
//   4. DeviceNotRegistered soft-revokes the target and is NOT reported.
//   5. Any other ticket error reports and leaves the row ALONE.
//   6. A whole-chunk transport failure reports and revokes NOTHING.
//   7. A token the SDK does not recognise never reaches the network.
//   8. Nothing ever throws to the caller, even when the device lookup fails.
//
// The SDK and the store are mocked, so this file needs no local stack and no
// Expo credential. What it CANNOT prove is that a real device lights up — only
// hardware answers that, and this file does not pretend otherwise.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: expo-server-sdk
//
// `chunkPushNotifications` is the real shape (one chunk here) rather than a
// pass-through stub, because the positional zip between messages and tickets is
// the thing most likely to break and a stub that never splits would hide it.
// ---------------------------------------------------------------------------

const sendPushNotificationsAsyncMock = vi.fn();

vi.mock("expo-server-sdk", () => {
  class FakeExpo {
    static isExpoPushToken(token: unknown): boolean {
      return typeof token === "string" && token.startsWith("ExponentPushToken[");
    }
    chunkPushNotifications(messages: unknown[]): unknown[][] {
      return messages.length === 0 ? [] : [messages];
    }
    sendPushNotificationsAsync(messages: unknown[]) {
      return sendPushNotificationsAsyncMock(messages);
    }
  }
  return { Expo: FakeExpo };
});

// ---------------------------------------------------------------------------
// Mock: @/lib/infra/report-error
// ---------------------------------------------------------------------------

const reportErrorMock = vi.fn();
vi.mock("@/lib/infra/report-error", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

// ---------------------------------------------------------------------------
// Mock: the store. Its own rules are tested against real Postgres in
// __tests__/push-target-store.test.ts; here it is a seam, so that a failure in
// THIS file names the sender rather than the database.
// ---------------------------------------------------------------------------

let mockTargets: Array<{ id: string; expoPushToken: string }> = [];
let lookupShouldThrow = false;
const markedUsed: string[] = [];
const revokedIds: string[] = [];

vi.mock("@/lib/infra/push-target-store", () => ({
  activePushTargetsForUser: async () => {
    if (lookupShouldThrow) throw new Error("db unavailable");
    return mockTargets;
  },
  markPushTargetUsed: async (id: string) => {
    markedUsed.push(id);
  },
  revokePushTargetById: async (id: string) => {
    revokedIds.push(id);
  },
}));

import { sendExpoPushForNotifications } from "@/lib/infra/expo-push";

const USER_ID = "user-0000-0000-0000-000000000001";
const URGENT = { userId: USER_ID, severity: "urgent" as const, title: "Hallazgo" };

function target(id: string, suffix = id) {
  return { id, expoPushToken: `ExponentPushToken[${suffix}]` };
}

function enableExpo() {
  vi.stubEnv("EXPO_ACCESS_TOKEN", "test-expo-access-token");
}

beforeEach(() => {
  mockTargets = [];
  lookupShouldThrow = false;
  markedUsed.length = 0;
  revokedIds.length = 0;
  sendPushNotificationsAsyncMock.mockReset().mockResolvedValue([{ status: "ok", id: "receipt-1" }]);
  reportErrorMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendExpoPushForNotifications — enablement", () => {
  it("no-ops when EXPO_ACCESS_TOKEN is absent", async () => {
    mockTargets = [target("t1")];
    await sendExpoPushForNotifications([URGENT]);
    expect(sendPushNotificationsAsyncMock).not.toHaveBeenCalled();
    // And it did not even look the devices up: a missing credential is not a
    // reason to spend a query.
    expect(markedUsed).toHaveLength(0);
  });

  it("no-ops when EXPO_ACCESS_TOKEN is present but blank", async () => {
    vi.stubEnv("EXPO_ACCESS_TOKEN", "   ");
    mockTargets = [target("t1")];
    await sendExpoPushForNotifications([URGENT]);
    expect(sendPushNotificationsAsyncMock).not.toHaveBeenCalled();
  });

  it("does NOT read the web channel's flag", async () => {
    // The whole point of the guard that moved out of `sendPushForNotifications`:
    // a deployment with web push off must still reach phones.
    enableExpo();
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([URGENT]);

    expect(sendPushNotificationsAsyncMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendExpoPushForNotifications — eligibility", () => {
  it("sends an urgent row", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    await sendExpoPushForNotifications([URGENT]);
    expect(sendPushNotificationsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it("skips a row that does not qualify, without looking anything up", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    await sendExpoPushForNotifications([{ userId: USER_ID, severity: "info", title: "Aviso" }]);
    expect(sendPushNotificationsAsyncMock).not.toHaveBeenCalled();
  });

  it("sends a warning-severity pet_sighting, the one type the filter names", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    await sendExpoPushForNotifications([
      {
        userId: USER_ID,
        severity: "warning",
        notificationType: "pet_sighting",
        title: "Avistaje de Pampa",
      },
    ]);
    expect(sendPushNotificationsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the person has no live device", async () => {
    enableExpo();
    mockTargets = [];
    await sendExpoPushForNotifications([URGENT]);
    expect(sendPushNotificationsAsyncMock).not.toHaveBeenCalled();
  });
});

describe("sendExpoPushForNotifications — what it puts on the wire", () => {
  it("carries the title, the body and the deep link as data", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([
      { ...URGENT, body: "Alguien tiene a Pampa", ctaUrl: "/mis-mascotas/DIM-PAMP-0001" },
    ]);

    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe("ExponentPushToken[t1]");
    expect(messages[0].title).toBe("Hallazgo");
    expect(messages[0].body).toBe("Alguien tiene a Pampa");
    expect(messages[0].data).toEqual({ url: "/mis-mascotas/DIM-PAMP-0001" });
  });

  it("sets collapseId from the dedupe key, so a retry replaces instead of stacking", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([{ ...URGENT, dedupeKey: "hallazgo:pampa:2026-09-11" }]);

    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(messages[0].collapseId).toBe("hallazgo:pampa:2026-09-11");
  });

  it("addresses every live device the person has", async () => {
    enableExpo();
    mockTargets = [target("t1"), target("t2")];

    await sendExpoPushForNotifications([URGENT]);

    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(messages.map((m) => m.to)).toEqual(["ExponentPushToken[t1]", "ExponentPushToken[t2]"]);
  });
});

describe("sendExpoPushForNotifications — what it does with the tickets", () => {
  it("bumps last_used_at on a delivered ticket", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([{ status: "ok", id: "r1" }]);

    await sendExpoPushForNotifications([URGENT]);

    expect(markedUsed).toEqual(["t1"]);
    expect(revokedIds).toHaveLength(0);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("soft-revokes on DeviceNotRegistered, and does NOT report it", async () => {
    enableExpo();
    mockTargets = [target("gone"), target("ok")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([
      { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
      { status: "ok", id: "r2" },
    ]);

    await sendExpoPushForNotifications([URGENT]);

    // The dead device is revoked and the live one is bumped — which together
    // prove the positional zip between messages and tickets holds.
    expect(revokedIds).toEqual(["gone"]);
    expect(markedUsed).toEqual(["ok"]);
    // An uninstall is the ordinary end of an install's life. Reporting it would
    // make every uninstall an incident.
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports any OTHER ticket error and leaves the row alone", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([
      { status: "error", message: "too big", details: { error: "MessageTooBig" } },
    ]);

    await sendExpoPushForNotifications([URGENT]);

    expect(revokedIds).toHaveLength(0);
    expect(markedUsed).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("expo-push/ticket");
  });

  it("does not revoke a device because OUR credential was refused", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([
      { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
    ]);

    await sendExpoPushForNotifications([URGENT]);

    // Revoking here would silence a working phone over a server-side problem,
    // and the person would have to reinstall to get notifications back.
    expect(revokedIds).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendExpoPushForNotifications — failure containment", () => {
  it("reports and revokes NOTHING when the whole request fails", async () => {
    enableExpo();
    mockTargets = [target("t1"), target("t2")];
    sendPushNotificationsAsyncMock.mockRejectedValueOnce(new Error("network down"));

    await sendExpoPushForNotifications([URGENT]);

    // A transport failure says nothing about whether these devices exist.
    expect(revokedIds).toHaveLength(0);
    expect(markedUsed).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("expo-push/send");
  });

  it("revokes a token the SDK does not recognise, without sending it", async () => {
    enableExpo();
    mockTargets = [{ id: "malformed", expoPushToken: "not-a-token" }];

    await sendExpoPushForNotifications([URGENT]);

    expect(sendPushNotificationsAsyncMock).not.toHaveBeenCalled();
    expect(revokedIds).toEqual(["malformed"]);
  });

  it("never throws even when the device lookup fails", async () => {
    enableExpo();
    lookupShouldThrow = true;

    await expect(sendExpoPushForNotifications([URGENT])).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("expo-push/send-all");
  });
});
