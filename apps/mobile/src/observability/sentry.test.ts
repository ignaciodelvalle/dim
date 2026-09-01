// `sentry` — the two decisions worth pinning.
//
// Not "does the SDK work" (Sentry's problem) but: a DSN-less build must NEVER
// init (an SDK aimed at nothing retries uploads forever), and the init a real
// build runs must keep the privacy posture stated — no default PII, no
// tracing. Those are this product's decisions, and a dependency bump that
// flipped them would otherwise pass every other test.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInit = jest.fn<(options: Record<string, unknown>) => void>();
let mockExtra: Record<string, unknown> | undefined;

jest.mock("@sentry/react-native", () => ({
  init: (options: Record<string, unknown>) => mockInit(options),
}));

// The getter sits on `expoConfig`, not on `default`: the ES-module interop
// reads `.default` ONCE at import time, so a getter there would freeze the
// value the first test happened to see.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

import { initSentry, sentryDsnFromConfig } from "./sentry";

beforeEach(() => {
  mockInit.mockReset();
  mockExtra = undefined;
});

describe("the DSN comes from the build's manifest, or init refuses", () => {
  it("initializes with the DSN the build carried, and says it did", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/42" };
    expect(initSentry()).toBe(true);
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0]?.[0]?.dsn).toBe("https://key@o1.ingest.sentry.io/42");
  });

  it("does NOT init on a build with no DSN — null, empty, absent, or {}", () => {
    // `{}` is not hypothetical: Expo's config serialization turns the `null`
    // app.config.ts writes into an empty object by the time Constants reads
    // it (measured with `expo config --json`, 2026-09-01). The string check
    // is what keeps that shape from reaching Sentry.init as a DSN.
    for (const extra of [
      { sentryDsn: null },
      { sentryDsn: "" },
      { sentryDsn: {} },
      {},
      undefined,
    ]) {
      mockExtra = extra;
      expect(sentryDsnFromConfig()).toBeNull();
      expect(initSentry()).toBe(false);
    }
    expect(mockInit).not.toHaveBeenCalled();
  });
});

describe("the privacy posture is stated in the options, not assumed from defaults", () => {
  it("sends no default PII and runs no tracing", () => {
    // Invariant #5 hashes DNIs at the boundary; the crash reporter does not
    // get to be the surface that ships identifying data by accident. And the
    // pilot's question is "does it crash", not "is it fast".
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/42" };
    initSentry();
    const options = mockInit.mock.calls[0]?.[0];
    expect(options?.sendDefaultPii).toBe(false);
    expect(options?.tracesSampleRate).toBe(0);
  });
});
