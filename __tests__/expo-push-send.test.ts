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
const getPushNotificationReceiptsAsyncMock = vi.fn();

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
    // The receipt half. Chunked the same way and for the same reason: one chunk
    // here, because splitting is the SDK's business and the code under test is
    // only required to consume whatever it is handed.
    chunkPushNotificationReceiptIds(ids: unknown[]): unknown[][] {
      return ids.length === 0 ? [] : [ids];
    }
    getPushNotificationReceiptsAsync(ids: unknown[]) {
      return getPushNotificationReceiptsAsyncMock(ids);
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
/** Every (target, receipt id) pair a successful ticket recorded. */
const recordedReceipts: Array<{ targetId: string; receiptId: string | undefined }> = [];
const revokedIds: string[] = [];
/** What `pendingPushReceipts` will answer, and the limit it was asked for. */
let mockPending: Array<{ targetId: string; receiptId: string; pendingSince: Date | null }> = [];
const pendingLimits: number[] = [];
const clearedReceipts: Array<{ targetId: string; receiptId: string }> = [];

vi.mock("@/lib/infra/push-target-store", () => ({
  // THE USER ID IS ASSERTED, not discarded. This stub used to be
  // `async () => mockTargets`, which answers the same list for every caller —
  // so an implementation that looked up the WRONG person's devices, or that
  // passed no id at all, passed every test in this file. A stub that drops its
  // arguments can only prove a function was reached.
  activePushTargetsForUser: async (userId: string) => {
    if (typeof userId !== "string" || userId.length === 0) {
      throw new Error(`activePushTargetsForUser called with no user id: ${String(userId)}`);
    }
    if (userId !== USER_ID) return [];
    if (lookupShouldThrow) throw new Error("db unavailable");
    return mockTargets;
  },
  markPushTargetUsed: async (id: string, receiptId?: string) => {
    markedUsed.push(id);
    recordedReceipts.push({ targetId: id, receiptId });
  },
  revokePushTargetById: async (id: string) => {
    revokedIds.push(id);
  },
  pendingPushReceipts: async (limit: number) => {
    pendingLimits.push(limit);
    return mockPending;
  },
  clearPendingPushReceipt: async (targetId: string, receiptId: string) => {
    clearedReceipts.push({ targetId, receiptId });
  },
}));

import { PUSH_ANDROID_CHANNEL_ID } from "@dim/contract/input";

import { reconcileExpoPushReceipts, sendExpoPushForNotifications } from "@/lib/infra/expo-push";

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
  getPushNotificationReceiptsAsyncMock.mockReset().mockResolvedValue({});
  recordedReceipts.length = 0;
  mockPending = [];
  pendingLimits.length = 0;
  clearedReceipts.length = 0;
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
  it("carries the title, the body and the deep link as data for a lock-screen-safe type", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([
      {
        ...URGENT,
        notificationType: "rabies_observation_escalation_owner",
        title: "URGENTE — posible signo de rabia en tu mascota",
        body: "Consultá al veterinario inmediatamente.",
        ctaUrl: "/mis-mascotas/DIM-PAMP-0001",
      },
    ]);

    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe("ExponentPushToken[t1]");
    expect(messages[0].title).toBe("URGENTE — posible signo de rabia en tu mascota");
    expect(messages[0].body).toBe("Consultá al veterinario inmediatamente.");
    expect(messages[0].data).toEqual({ url: "/mis-mascotas/DIM-PAMP-0001" });
  });

  it("addresses the Android channel the app creates, by the shared constant", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([URGENT]);

    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    // THE TWO HALVES ARE ONE DESIGN AND THIS IS WHERE THEY MEET. The app calls
    // `setNotificationChannelAsync(PUSH_ANDROID_CHANNEL_ID, …)` and declares a
    // name, a description and an importance; without this field every message
    // lands in expo-notifications' unnamed fallback channel and all three apply
    // to nothing. The failure is silent — the notification still arrives — which
    // is exactly why it is pinned rather than trusted.
    expect(messages[0].channelId).toBe(PUSH_ANDROID_CHANNEL_ID);
  });
});

// ---------------------------------------------------------------------------
// The lock-screen classification. Expo is a third-party processor in the United
// States and the title/body travel through it in the clear, so a type that has
// not been read and declared safe must not put its text on a lock screen.
//
// These assertions are about the DEFAULT, not about the three names currently
// on the allowlist: the ones that matter most are the two that use a type
// nobody has classified, because that is the shape a future type arrives in.
// ---------------------------------------------------------------------------

describe("sendExpoPushForNotifications — lock-screen PII (Ley 25.326 art. 12)", () => {
  function sentMessage(): Record<string, unknown> {
    const [messages] = sendPushNotificationsAsyncMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    return messages[0];
  }

  it("genericises a notification whose type carries a third party's personal data", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    // The real shape of a `pet_in_possession` body: the finder's name, their
    // phone, where they are holding the animal and what they typed.
    await sendExpoPushForNotifications([
      {
        userId: USER_ID,
        severity: "urgent",
        notificationType: "pet_in_possession",
        title: "Alguien tiene a Pampa",
        body: 'Laura Gómez dice que tiene a Pampa en Belgrano. Contactala al 11-5555-4444. Mensaje: "está en mi casa".',
        ctaUrl: "/mis-mascotas/DIM-PAMP-0001",
      },
    ]);

    const message = sentMessage();
    expect(message.title).toBe("miMAR");
    expect(message.body).toBe("Tenés un aviso nuevo");
    expect(JSON.stringify(message)).not.toContain("Laura");
    expect(JSON.stringify(message)).not.toContain("11-5555-4444");
    expect(JSON.stringify(message)).not.toContain("Belgrano");
    // The deep link survives: the app opens the right screen and fetches the
    // real content over an authenticated request.
    expect(message.data).toEqual({ url: "/mis-mascotas/DIM-PAMP-0001" });
  });

  it("genericises an UNKNOWN type — the default is closed, not open", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([
      {
        userId: USER_ID,
        severity: "urgent",
        notificationType: "some_type_invented_next_month",
        title: "Nombre de una persona",
        body: "Un dato personal de un tercero",
      },
    ]);

    expect(sentMessage().title).toBe("miMAR");
    expect(sentMessage().body).toBe("Tenés un aviso nuevo");
  });

  it("genericises a row with NO type at all", async () => {
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([URGENT]);

    expect(sentMessage().title).toBe("miMAR");
    expect(sentMessage().body).toBe("Tenés un aviso nuevo");
  });

  it("genericises pet_sighting, which is eligible to push but not safe to render", async () => {
    // The one type the eligibility filter names by hand is NOT on the
    // lock-screen allowlist: its body carries the finder's name and contact
    // (src/modules/pets/application/sighting/report-pet-sighting.ts:318-330).
    // Push-eligible and lock-screen-safe are two different questions.
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([
      {
        userId: USER_ID,
        severity: "warning",
        notificationType: "pet_sighting",
        title: "Avistaje de Pampa",
        body: "Laura Gómez dejó su contacto: 11-5555-4444.",
      },
    ]);

    expect(sentMessage().title).toBe("miMAR");
    expect(sentMessage().body).toBe("Tenés un aviso nuevo");
  });

  it("keeps collapseId unchanged when the payload is genericised", async () => {
    // Genericisation is about what a person READS. Replacing-instead-of-stacking
    // is about how many rows pile up, and the two must not move together.
    enableExpo();
    mockTargets = [target("t1")];

    await sendExpoPushForNotifications([
      {
        userId: USER_ID,
        severity: "urgent",
        notificationType: "pet_in_possession",
        title: "Alguien tiene a Pampa",
        body: "Laura Gómez dice que tiene a Pampa.",
        dedupeKey: "hallazgo:pampa:2026-09-15",
      },
    ]);

    expect(sentMessage().collapseId).toBe("hallazgo:pampa:2026-09-15");
    expect(sentMessage().title).toBe("miMAR");
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

// ---------------------------------------------------------------------------
// THE SECOND HALF OF A SEND — receipts
//
// A ticket says whether EXPO accepted the message. A receipt says what FCM and
// APNs did with it, and that is where `DeviceNotRegistered` arrives in the
// ordinary case, because Expo has not spoken to either store when it writes the
// ticket. Reading only tickets meant the revocation path existed and was almost
// never reached: dead rows accumulated forever and every send paid to address a
// phone that no longer exists.
// ---------------------------------------------------------------------------

/** Roughly an hour old: inside Expo's ~24h retention. */
function recently(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}

describe("the ticket records the receipt id", () => {
  it("carries the id a successful ticket handed back", async () => {
    enableExpo();
    mockTargets = [target("t1")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([{ status: "ok", id: "receipt-abc" }]);

    await sendExpoPushForNotifications([URGENT]);

    // Without this the receipt is unreachable: the id exists only in the ticket,
    // on the request path, and the answer it unlocks is not ready for minutes.
    expect(recordedReceipts).toEqual([{ targetId: "t1", receiptId: "receipt-abc" }]);
  });

  it("records nothing for a device the ticket refused", async () => {
    enableExpo();
    mockTargets = [target("gone")];
    sendPushNotificationsAsyncMock.mockResolvedValueOnce([
      { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
    ]);

    await sendExpoPushForNotifications([URGENT]);

    // There is no receipt to wait for, and the row is already revoked.
    expect(recordedReceipts).toHaveLength(0);
    expect(revokedIds).toEqual(["gone"]);
  });
});

describe("reconcileExpoPushReceipts", () => {
  it("no-ops without EXPO_ACCESS_TOKEN, and does not even read the queue", async () => {
    mockPending = [{ targetId: "t1", receiptId: "r1", pendingSince: recently() }];

    await expect(reconcileExpoPushReceipts()).resolves.toEqual({
      checked: 0,
      revoked: 0,
      expired: 0,
    });
    expect(pendingLimits).toHaveLength(0);
  });

  it("revokes the device whose receipt says the token is dead", async () => {
    enableExpo();
    mockPending = [
      { targetId: "alive", receiptId: "r-alive", pendingSince: recently() },
      { targetId: "dead", receiptId: "r-dead", pendingSince: recently() },
    ];
    getPushNotificationReceiptsAsyncMock.mockResolvedValueOnce({
      "r-alive": { status: "ok" },
      "r-dead": {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    });

    const result = await reconcileExpoPushReceipts();

    // THE WHOLE POINT: the same revocation the ticket path performs, reached
    // from the channel the signal actually arrives on.
    expect(revokedIds).toEqual(["dead"]);
    expect(result).toEqual({ checked: 2, revoked: 1, expired: 0 });
    // An uninstall is the ordinary end of an install's life, not an incident.
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("clears the pending id either way, so a row is asked about once", async () => {
    enableExpo();
    mockPending = [
      { targetId: "alive", receiptId: "r-alive", pendingSince: recently() },
      { targetId: "dead", receiptId: "r-dead", pendingSince: recently() },
    ];
    getPushNotificationReceiptsAsyncMock.mockResolvedValueOnce({
      "r-alive": { status: "ok" },
      "r-dead": {
        status: "error",
        message: "gone",
        details: { error: "DeviceNotRegistered" },
      },
    });

    await reconcileExpoPushReceipts();

    expect(clearedReceipts).toEqual([
      { targetId: "alive", receiptId: "r-alive" },
      { targetId: "dead", receiptId: "r-dead" },
    ]);
  });

  it("clears by RECEIPT id as well as row, so a newer send is not erased", async () => {
    // A push that lands while this job is running writes a newer id onto the
    // same row. The store's UPDATE matches on the id for that reason, and the
    // call has to carry it — asserted here because the alternative is silent:
    // an id nobody ever asked about, dropped with its answer.
    enableExpo();
    mockPending = [{ targetId: "t1", receiptId: "r-old", pendingSince: recently() }];
    getPushNotificationReceiptsAsyncMock.mockResolvedValueOnce({ "r-old": { status: "ok" } });

    await reconcileExpoPushReceipts();

    expect(clearedReceipts).toEqual([{ targetId: "t1", receiptId: "r-old" }]);
  });

  it("does NOT revoke over a failure that is not the device's fault", async () => {
    enableExpo();
    mockPending = [{ targetId: "t1", receiptId: "r1", pendingSince: recently() }];
    getPushNotificationReceiptsAsyncMock.mockResolvedValueOnce({
      r1: { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
    });

    const result = await reconcileExpoPushReceipts();

    // Same rule the ticket path states: revoking somebody's working phone
    // because OUR credential expired is the worst reading of a server problem.
    expect(revokedIds).toHaveLength(0);
    expect(result.revoked).toBe(0);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("expo-push/receipt");
  });

  it("drops an id Expo can no longer answer for, without spending a request", async () => {
    enableExpo();
    // Two days old. Expo keeps receipts for roughly one, so asking buys an empty
    // answer and a row that stays pending forever.
    mockPending = [
      {
        targetId: "stale",
        receiptId: "r-stale",
        pendingSince: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    ];

    const result = await reconcileExpoPushReceipts();

    expect(getPushNotificationReceiptsAsyncMock).not.toHaveBeenCalled();
    expect(clearedReceipts).toEqual([{ targetId: "stale", receiptId: "r-stale" }]);
    expect(result).toEqual({ checked: 0, revoked: 0, expired: 1 });
  });

  it("keeps the ids pending when the whole request fails", async () => {
    enableExpo();
    mockPending = [{ targetId: "t1", receiptId: "r1", pendingSince: recently() }];
    getPushNotificationReceiptsAsyncMock.mockRejectedValueOnce(new Error("network down"));

    const result = await reconcileExpoPushReceipts();

    // Nothing cleared and nothing revoked: these ids are still owed an answer,
    // and the next run asks again. That retry is the one thing this shape buys
    // over reading receipts inline, and losing it would be losing the feature.
    expect(clearedReceipts).toHaveLength(0);
    expect(revokedIds).toHaveLength(0);
    expect(result).toEqual({ checked: 0, revoked: 0, expired: 0 });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("expo-push/receipts");
  });

  it("ignores an answer for an id it never asked about", async () => {
    enableExpo();
    mockPending = [{ targetId: "t1", receiptId: "r1", pendingSince: recently() }];
    getPushNotificationReceiptsAsyncMock.mockResolvedValueOnce({
      r1: { status: "ok" },
      "r-somebody-elses": {
        status: "error",
        message: "gone",
        details: { error: "DeviceNotRegistered" },
      },
    });

    const result = await reconcileExpoPushReceipts();

    // The map from receipt id to row is what ties an answer to a device. Acting
    // without it would be revoking a device chosen by the response body.
    expect(revokedIds).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it("asks for a bounded batch rather than the whole table", async () => {
    enableExpo();
    mockPending = [];

    await reconcileExpoPushReceipts();

    expect(pendingLimits).toHaveLength(1);
    expect(pendingLimits[0]).toBeGreaterThan(0);
    // The job runs inside the daily dispatcher's shared 55 s budget; an
    // unbounded read is how one job starves the twenty-three others.
    expect(pendingLimits[0]).toBeLessThanOrEqual(1000);
  });
});
