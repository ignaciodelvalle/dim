// THE ADAPTER'S MAPPING, shape by shape, against a mocked native module.
//
// This is §7 item 6 of docs/handoff/push-notifications.md: "every shape
// `expo-notifications` can return, mapped onto your port's outcome union".
//
// WHAT THIS FILE CAN AND CANNOT PROVE, stated first so nobody reads a green run
// as more than it is. It proves the TRANSLATION: for every status object and
// every rejection the module can produce, which member of
// `PushPermissionResult` / `PushTokenResult` comes out. It proves NOTHING about
// whether a real phone shows the dialog, whether Expo's servers issue a token,
// or whether a notification ever arrives. Those live behind the native module
// this file replaces, and the only instrument for them is a development build
// on a device — see the report's "what a person can actually do" section.
//
// WHY THE MODULE IS MOCKED AT ALL: importing `expo-notifications` touches the
// native runtime at import time and throws in a jest process. The adapter's own
// header explains why that import stays at module scope; the price is that its
// test hoists a `jest.mock` for it.
//
// MUTATIONS THAT MUST GO RED HERE (applied while writing, then reverted):
//   · `if (status.granted)` → `if (status.status === "granted")` — the
//     provisional-authorization test, which is the whole reason it reads the
//     boolean.
//   · dropping the `canAskAgain` guard in `requestPermission` — the "does not
//     re-ask after a permanent refusal" test.
//   · `unavailable` → `failed` for the two configuration codes, and the
//     converse for `E_REGISTRATION_FAILED` — the token-failure table.
//   · dropping the prefix check — the "refuses a token of the wrong shape"
//     test.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The `mock` prefix is required: jest's factories may not close over an
// unprefixed outer binding. The factories DELEGATE rather than handing the mock
// over, because `jest.mock` is hoisted above every `const` here and passing the
// binding directly would capture it inside its temporal dead zone.
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
let mockExpoConfig: unknown = { extra: { eas: { projectId: "db4bebed-test" } } };

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => mockGetPermissionsAsync(),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

import {
  IOS_PERMISSION_REQUEST,
  expoProjectId,
  expoPush,
  interpretPermission,
  interpretTokenFailure,
} from "./expo-push-adapter";

/**
 * A permissions status, with the two fields the adapter actually reads.
 *
 * The real object carries a dozen more (iOS alert styles, Android importance).
 * They are omitted because the adapter never touches them, and a fixture that
 * transcribed them would suggest it did.
 */
function status(over: {
  granted: boolean;
  canAskAgain: boolean;
  status?: string;
}): never | object {
  return {
    granted: over.granted,
    canAskAgain: over.canAskAgain,
    status: over.status ?? (over.granted ? "granted" : "denied"),
    expires: "never",
  };
}

/** An Expo `CodedError`, as the module rejects with one. */
function coded(code: string, message = "something went wrong"): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const GOOD_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

beforeEach(() => {
  mockGetPermissionsAsync.mockReset();
  mockRequestPermissionsAsync.mockReset();
  mockGetExpoPushTokenAsync.mockReset();
  mockExpoConfig = { extra: { eas: { projectId: "db4bebed-test" } } };
});

describe("the port's identity", () => {
  it("claims the module is available and names itself", () => {
    // The name rides every `failed.detail` the safe wrappers produce, so a
    // breadcrumb says WHICH implementation broke its promise.
    expect(expoPush.name).toBe("expo-notifications");
    expect(expoPush.available).toBe(true);
  });
});

describe("interpretPermission — every status shape the module can return", () => {
  it("maps a plain grant to granted", () => {
    expect(interpretPermission(status({ granted: true, canAskAgain: false }) as never)).toEqual({
      outcome: "granted",
    });
  });

  it("maps an iOS PROVISIONAL authorization to granted, though its status string is not 'granted'", () => {
    // THE REASON THE ADAPTER READS `granted` AND NOT `status`. A provisional
    // authorization delivers quietly to Notification Center — the token is real
    // and registration is correct. Switching on the string would throw away a
    // working install for failing a comparison.
    const provisional = status({ granted: true, canAskAgain: false, status: "provisional" });
    expect(interpretPermission(provisional as never)).toEqual({ outcome: "granted" });
  });

  it("maps a refusal that cannot be asked again to denied", () => {
    expect(interpretPermission(status({ granted: false, canAskAgain: false }) as never)).toEqual({
      outcome: "denied",
    });
  });

  it("maps 'undetermined but still askable' to failed, NOT to denied", () => {
    // iOS defers the prompt when the request is made off the foreground and
    // answers undetermined without showing anything. Nobody said no; mapping it
    // to `denied` would permanently stop asking somebody who was never asked.
    const result = interpretPermission(
      status({ granted: false, canAskAgain: true, status: "undetermined" }) as never,
    );
    expect(result.outcome).toBe("failed");
    expect(result).toMatchObject({ detail: expect.stringContaining("undetermined") as never });
  });
});

describe("requestPermission — reading before asking", () => {
  it("answers granted from the existing state WITHOUT showing a second dialog", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );

    expect(await expoPush.requestPermission()).toEqual({ outcome: "granted" });
    // The load-bearing assertion: Android would draw a real prompt here.
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("does NOT re-ask after a permanent refusal", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: false }) as never,
    );

    expect(await expoPush.requestPermission()).toEqual({ outcome: "denied" });
    // The OS would show nothing; calling anyway would be a round trip whose
    // answer we already had, and it would hide the fact that we knew.
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks when the dialog is still available, and passes the iOS options", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: true, status: "undetermined" }) as never,
    );
    mockRequestPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );

    expect(await expoPush.requestPermission()).toEqual({ outcome: "granted" });
    expect(mockRequestPermissionsAsync).toHaveBeenCalledWith(IOS_PERMISSION_REQUEST);
  });

  it("asks for alert, badge and sound — and for nothing else", () => {
    // Pinned against literals, not against the adapter's own constant read back
    // through itself. `allowProvisional` and `allowCriticalAlerts` are absent on
    // purpose; see the constant's header.
    expect(IOS_PERMISSION_REQUEST).toEqual({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  });

  it("maps a refusal given at the dialog to denied", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: true, status: "undetermined" }) as never,
    );
    mockRequestPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: false }) as never,
    );

    expect(await expoPush.requestPermission()).toEqual({ outcome: "denied" });
  });

  it("maps a throwing read to failed, naming which call threw", async () => {
    mockGetPermissionsAsync.mockRejectedValue(coded("ERR_X", "no permissions module") as never);

    const result = await expoPush.requestPermission();
    expect(result.outcome).toBe("failed");
    expect(result).toMatchObject({ detail: expect.stringContaining("getPermissions") as never });
  });

  it("maps a throwing request to failed, naming the other call", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: true, status: "undetermined" }) as never,
    );
    mockRequestPermissionsAsync.mockRejectedValue(new Error("activity is gone") as never);

    const result = await expoPush.requestPermission();
    expect(result.outcome).toBe("failed");
    expect(result).toMatchObject({
      detail: expect.stringContaining("requestPermissions") as never,
    });
  });
});

describe("getExpoPushToken", () => {
  it("returns the token when permission is held", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );
    mockGetExpoPushTokenAsync.mockResolvedValue({ type: "expo", data: GOOD_TOKEN } as never);

    expect(await expoPush.getExpoPushToken()).toEqual({
      outcome: "token",
      expoPushToken: GOOD_TOKEN,
    });
  });

  it("passes the projectId from app.config's extra.eas", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );
    mockGetExpoPushTokenAsync.mockResolvedValue({ type: "expo", data: GOOD_TOKEN } as never);

    await expoPush.getExpoPushToken();

    // Inferring it instead would raise ERR_NOTIFICATIONS_NO_EXPERIENCE_ID with
    // a sentence about the bare workflow; passing it keeps the failure readable.
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "db4bebed-test" });
  });

  it("does NOT spend a network round trip when permission is not held", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: false, canAskAgain: true }) as never,
    );

    expect(await expoPush.getExpoPushToken()).toEqual({ outcome: "denied" });
    // `getExpoPushTokenAsync` is a request to Expo's servers, not a local read.
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("answers unavailable when the build carries no projectId, without calling the module", async () => {
    mockExpoConfig = { extra: {} };
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );

    expect(await expoPush.getExpoPushToken()).toEqual({ outcome: "unavailable" });
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("refuses a token of the wrong shape rather than registering one the server would reject", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );
    mockGetExpoPushTokenAsync.mockResolvedValue({ type: "expo", data: "fcm-raw-token" } as never);

    const result = await expoPush.getExpoPushToken();
    expect(result.outcome).toBe("failed");
    // The token must NOT appear in the detail — it is a delivery address and
    // `detail` is written to logs. Its length may.
    expect(result).toMatchObject({ detail: expect.not.stringContaining("fcm-raw-token") as never });
    expect(result).toMatchObject({ detail: expect.stringContaining("13 chars") as never });
  });

  it("maps a rejection through the failure table", async () => {
    mockGetPermissionsAsync.mockResolvedValue(
      status({ granted: true, canAskAgain: false }) as never,
    );
    mockGetExpoPushTokenAsync.mockRejectedValue(coded("ERR_NOTIFICATIONS_NETWORK_ERROR") as never);

    expect((await expoPush.getExpoPushToken()).outcome).toBe("failed");
  });

  it("maps a throwing permissions read to failed rather than to denied", async () => {
    // `denied` would be a lie: nobody refused anything, the module broke.
    mockGetPermissionsAsync.mockRejectedValue(new Error("module gone") as never);

    expect((await expoPush.getExpoPushToken()).outcome).toBe("failed");
  });
});

describe("interpretTokenFailure — every rejection the token path can produce", () => {
  it("maps a missing experience id to unavailable", () => {
    expect(interpretTokenFailure(coded("ERR_NOTIFICATIONS_NO_EXPERIENCE_ID"))).toEqual({
      outcome: "unavailable",
    });
  });

  it("maps a missing application id to unavailable", () => {
    expect(interpretTokenFailure(coded("ERR_NOTIFICATIONS_NO_APPLICATION_ID"))).toEqual({
      outcome: "unavailable",
    });
  });

  it("maps E_REGISTRATION_FAILED to failed, NOT to unavailable", () => {
    // THE DECISION THIS TEST EXISTS TO PIN. An emulator without Play Services
    // and a real phone with a broken FCM config produce the same string from
    // JS. `unavailable` would silence both; the second is a production channel
    // that cannot obtain a single token, and it must stay visible.
    const result = interpretTokenFailure(
      coded("E_REGISTRATION_FAILED", "Fetching the token failed"),
    );
    expect(result.outcome).toBe("failed");
    expect(result).toMatchObject({
      detail: expect.stringContaining("E_REGISTRATION_FAILED") as never,
    });
  });

  it("maps the network and server codes to failed, carrying the code", () => {
    for (const code of ["ERR_NOTIFICATIONS_NETWORK_ERROR", "ERR_NOTIFICATIONS_SERVER_ERROR"]) {
      const result = interpretTokenFailure(coded(code));
      expect(result.outcome).toBe("failed");
      expect(result).toMatchObject({ detail: expect.stringContaining(code) as never });
    }
  });

  it("maps a bare Error, with no code at all, to failed", () => {
    const result = interpretTokenFailure(new Error("kaboom"));
    expect(result).toEqual({ outcome: "failed", detail: "kaboom" });
  });

  it("maps a thrown non-Error to failed without crashing on it", () => {
    // A native bridge can reject with a string. `error.message` on one is
    // `undefined`, and a detail of "undefined" tells a reader nothing.
    expect(interpretTokenFailure("not even an Error")).toEqual({
      outcome: "failed",
      detail: "not even an Error",
    });
  });
});

describe("expoProjectId", () => {
  it("reads extra.eas.projectId", () => {
    expect(expoProjectId()).toBe("db4bebed-test");
  });

  it("answers null when the key is absent, and when it is empty", () => {
    mockExpoConfig = { extra: { eas: {} } };
    expect(expoProjectId()).toBeNull();

    // An empty string would pass a naive truthiness check in some shapes and
    // reach the module as a projectId, which fails three layers away.
    mockExpoConfig = { extra: { eas: { projectId: "" } } };
    expect(expoProjectId()).toBeNull();
  });

  it("answers null when there is no expoConfig at all", () => {
    mockExpoConfig = null;
    expect(expoProjectId()).toBeNull();
  });
});
