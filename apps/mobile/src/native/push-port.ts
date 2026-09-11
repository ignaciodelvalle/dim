// The PUSH SEAM — everything this app can write without the EAS build.
//
// WHY A SEAM AND NOT AN IMPORT
// ---------------------------------------------------------------------------
// Asking for notification permission and reading a push token needs
// `expo-notifications`, which is a NATIVE module. Under `runtimeVersion:
// { policy: "fingerprint" }` (app.config.ts) adding one changes the fingerprint,
// which means a new EAS build and a store release. That pipeline is PO-gated,
// and — unlike the image picker, which was written against a build that had not
// been cut yet — the build that is on Play TODAY was cut on 2026-09-11 WITHOUT
// this module. So every device in the closed test is running a binary where this
// port's default is the only answer, and that has to be the truthful one rather
// than a crash.
//
// The arrangement is the one `image-picker-port.ts` and `lib/observability/sink.ts`
// already use: an interface, a DEFAULT that says honestly that the module is not
// in this build, and one `setPushPort()` call at app start. The adapter is the
// ONLY file allowed to import `expo-notifications`, because that import evaluates
// a native module at import time and throws in a process that has none.
//
// WHAT AN ADAPTER MUST PROMISE
// ---------------------------------------------------------------------------
//   · `denied` is NOT an error. A person who declines the OS prompt has made a
//     choice, and the app must stop asking rather than retry. It is also not
//     recoverable in-app on either platform: iOS asks once, and Android 13+
//     stops showing the dialog after a refusal. Whatever calls this must not
//     offer "try again" for `denied`.
//   · A token is only meaningful ON A DEVICE. Simulators and emulators can
//     return one on Android and cannot on iOS, so an adapter must map "no token
//     available here" to `unavailable` rather than inventing a string.
//   · The default port answers `unavailable` and nothing else, and
//     `available: false` is what a caller reads BEFORE it offers anything.

/** What one permission request produced. */
export type PushPermissionResult =
  /** The OS will deliver notifications to this install. */
  | { outcome: "granted" }
  /** The person (or a policy) said no. Not an error, and not retryable. */
  | { outcome: "denied" }
  /** The module is not in this build. The honest default's only answer. */
  | { outcome: "unavailable" }
  | { outcome: "failed"; detail: string };

/** What one token read produced. */
export type PushTokenResult =
  | { outcome: "token"; expoPushToken: string }
  /** Permission is not granted, so there is no token to read. */
  | { outcome: "denied" }
  /**
   * No token is obtainable here: the module is absent, or this is a simulator,
   * or the project has no push credential configured. Distinguished from
   * `failed` because none of those is something to retry or report.
   */
  | { outcome: "unavailable" }
  | { outcome: "failed"; detail: string };

export type PushPort = {
  /** Stable identifier, e.g. "module-missing" or "expo-notifications". */
  readonly name: string;
  /**
   * Whether push can possibly work in this build. A caller reads this to decide
   * whether to ASK AT ALL — showing somebody a permission prompt whose only
   * outcome is `unavailable` spends the one prompt iOS ever gives, on nothing.
   */
  readonly available: boolean;
  requestPermission(): Promise<PushPermissionResult>;
  getExpoPushToken(): Promise<PushTokenResult>;
};

/**
 * The default: this build carries no notifications module, and says so.
 *
 * NOT a no-op and NOT a promise. A default that returned a fake token would
 * register a row that can never receive anything, and the person would see push
 * as "on" in an app that cannot deliver. `available: false` is the truthful
 * answer to "can this build receive a push", and it stays the answer until an
 * EAS build with `expo-notifications` ships and `setPushPort()` runs at app
 * start. Today that is EVERY installed build.
 */
export const moduleMissingPush: PushPort = {
  name: "module-missing",
  available: false,
  requestPermission: async () => ({ outcome: "unavailable" }),
  getExpoPushToken: async () => ({ outcome: "unavailable" }),
};

let activePort: PushPort = moduleMissingPush;

/**
 * Installs the process-wide port. Called once during app bootstrap
 * (`app/_layout.tsx`). Returns the port it replaced so a test can restore it.
 */
export function setPushPort(port: PushPort): PushPort {
  const previous = activePort;
  activePort = port;
  return previous;
}

/** The currently installed port. */
export function getPushPort(): PushPort {
  return activePort;
}

/**
 * One permission request, with the "never throws" half of the contract ACTUALLY
 * ENFORCED.
 *
 * WHY THIS EXISTS. `image-picker-port.ts` learned this the expensive way: the
 * port promised a member of its result union and no other outcome, that promise
 * was enforced nowhere, and one TypeError escaping an adapter turned it into a
 * rejected promise that stranded a screen on a spinner with no sentence and no
 * retry. The fix there closed one instance; this closes the CLASS for push,
 * before there is an adapter to get it wrong — including for a fake a test
 * installs.
 */
export async function requestPushPermissionSafely(): Promise<PushPermissionResult> {
  try {
    return await activePort.requestPermission();
  } catch (error) {
    return {
      outcome: "failed",
      // Diagnostic, never shown. The prefix names the port so a breadcrumb says
      // WHICH implementation broke its promise.
      detail: `${activePort.name} threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** One token read, with the same enforcement and for the same reason. */
export async function getExpoPushTokenSafely(): Promise<PushTokenResult> {
  try {
    return await activePort.getExpoPushToken();
  } catch (error) {
    return {
      outcome: "failed",
      detail: `${activePort.name} threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Restores the honest default. Primarily for tests. */
export function resetPushPort(): void {
  activePort = moduleMissingPush;
}
