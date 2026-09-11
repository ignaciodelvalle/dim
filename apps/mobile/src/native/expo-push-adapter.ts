// THE REAL NOTIFICATIONS MODULE, bound to the seam `push-port.ts` declares.
//
// WHY THIS BINDING IS ITS OWN FILE, and why nothing but `app/_layout.tsx` may
// import it: `expo-notifications` is a NATIVE module whose JS entry point is not
// inert — it registers listeners and touches the native runtime at import time,
// which throws in a process without one. That is the same argument
// `expo-image-picker-adapter.ts` records, and the same arrangement: the port's
// TYPE and every decision made from it stay in native-free modules, and the one
// file that touches the native import lives alone, so importing it is an
// explicit opt-in to the native dependency.
//
// AND HERE THAT IS NOT THEORETICAL. The build on Play today was cut on
// 2026-09-11 WITHOUT this module. Every device in the closed test runs a binary
// where this file is absent and `moduleMissingPush` is the only answer — which
// is exactly why the default had to be honest rather than optimistic.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
// Three things a reader will look for and not find. All three are absences on
// purpose, and each would be a decision this unit was not handed:
//
//   · NO `setNotificationHandler`. That governs whether a notification is drawn
//     while the app is in the FOREGROUND, which is a display decision about an
//     app the person is already looking at. Scope (§2.4) is the module, the
//     port, the permission, the token, and registration on sign-in — delivery,
//     not presentation.
//   · NO Android notification channel. Android 8+ needs one to draw anything,
//     and expo-notifications falls back to its own default when a message names
//     none — which is what the server sends, since `expo-push.ts` sets no
//     `channelId`. Creating one here would be decoration unless the server
//     addressed it, and a channel's IMPORTANCE IS IMMUTABLE ONCE CREATED: the
//     app can never raise it afterwards, only the person can. That makes it
//     precisely the class of decision §3.3 already settled for `priority` —
//     "how loud is this allowed to be" is a product call taken once, for both
//     legs, not a default invented by whoever wired the token first.
//   · NO `expo-device` check for "is this a simulator". It is a fourth native
//     module, and the question it answers arrives anyway as a rejection from
//     the registration path below.
//
// ---------------------------------------------------------------------------
// WHAT THIS ADAPTER PROMISES — the contract restated from the port's header
// ---------------------------------------------------------------------------
//   · `denied` means a decision was made and must not be retried or re-asked.
//   · `unavailable` means no token is obtainable here and nothing is wrong.
//   · `failed.detail` is DIAGNOSTIC, never shown to a person. It carries the
//     module's error CODE when there is one, because that code is the only
//     thing that tells a reader of a breadcrumb which of the module's many
//     refusals actually happened.

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { EXPO_PUSH_TOKEN_PREFIX } from "@dim/contract/input";

import type { PushPermissionResult, PushPort, PushTokenResult } from "./push-port";

/**
 * The iOS authorization this app asks for.
 *
 * ALERT, BADGE AND SOUND — the three an ordinary notification needs, and no
 * more. Two omissions are deliberate:
 *
 *   · NO `allowProvisional`. Provisional authorization skips the prompt and
 *     delivers QUIETLY, straight to Notification Center with no banner and no
 *     sound. For the one thing this channel carries — an urgent sighting of
 *     somebody's lost animal — silent delivery is the failure mode, not the
 *     considerate option. It would also make the port's `granted` mean two very
 *     different things.
 *   · NO `allowCriticalAlerts`. It breaks through Do Not Disturb and needs an
 *     entitlement Apple grants case by case. Neither is ours to assume.
 *
 * Android ignores this block entirely — there the permission is the single
 * `POST_NOTIFICATIONS` runtime grant, and the module asks for it with no
 * options of its own.
 */
export const IOS_PERMISSION_REQUEST = {
  ios: { allowAlert: true, allowBadge: true, allowSound: true },
} as const;

/**
 * The real module, as a port.
 *
 * `available: true` is a claim about the BUILD, not about the moment: this
 * module is only ever installed by `app/_layout.tsx`, which only exists in a
 * binary compiled with the native module linked in. A build without it never
 * runs this file at all — it keeps the honest default.
 */
export const expoPush: PushPort = {
  name: "expo-notifications",
  available: true,
  requestPermission,
  getExpoPushToken,
};

/**
 * The EAS project this install belongs to, or `null`.
 *
 * WHY IT IS PASSED EXPLICITLY rather than left for the module to infer.
 * `getExpoPushTokenAsync` infers it from the manifest and throws
 * `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID` when it cannot — which is a rejection
 * carrying a sentence about the bare workflow, three layers from anything a
 * reader of this repo would recognise. Reading it here turns that into one
 * named condition with a detail that says which key was missing.
 *
 * `extra.eas.projectId` and not `easConfig`: that is the key `app.config.ts`
 * actually writes (and the one `eas build` reads), so this looks where this
 * repo puts it rather than where a second mechanism might also have put it.
 */
export function expoProjectId(): string | null {
  const raw: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Ask for notification permission — or answer from what is already known.
 *
 * IT READS BEFORE IT ASKS, and that is not an optimisation. `canAskAgain:
 * false` means the OS will no longer show the dialog: iOS asks once ever, and
 * Android 13+ stops after a refusal. Calling `requestPermissionsAsync` in that
 * state returns the same refusal without showing anything, so reading first
 * changes no outcome — it changes what this app KNOWS about the outcome, which
 * is the difference between a caller that stops asking and one that retries a
 * dialog nobody will ever see.
 */
async function requestPermission(): Promise<PushPermissionResult> {
  let current: Notifications.NotificationPermissionsStatus;
  try {
    current = await Notifications.getPermissionsAsync();
  } catch (error) {
    return { outcome: "failed", detail: `getPermissions: ${failureDetail(error)}` };
  }

  // Already settled in our favour. Asking again would be a second prompt on
  // Android for a grant that is already held.
  if (current.granted) return { outcome: "granted" };

  // Settled against us, permanently. No dialog left to show.
  if (!current.canAskAgain) return { outcome: "denied" };

  let answered: Notifications.NotificationPermissionsStatus;
  try {
    answered = await Notifications.requestPermissionsAsync(IOS_PERMISSION_REQUEST);
  } catch (error) {
    return { outcome: "failed", detail: `requestPermissions: ${failureDetail(error)}` };
  }

  return interpretPermission(answered);
}

/**
 * One permissions status, as a member of the port's union.
 *
 * EXPORTED SO THE MAPPING CAN BE TESTED AS A MAPPING — §7 item 6 asks for every
 * shape the module can return, and enumerating them through two mocked async
 * calls each would test the plumbing far more than the translation.
 *
 * `granted` IS READ AND `status` IS NOT, deliberately. The module computes
 * `granted` per platform, and on iOS that includes PROVISIONAL and EPHEMERAL
 * authorizations whose `status` string is not `"granted"`. Those DO deliver, so
 * a token is real and registration is correct; switching on `status` would
 * discard a working install for failing a string comparison.
 */
export function interpretPermission(
  status: Notifications.NotificationPermissionsStatus,
): PushPermissionResult {
  if (status.granted) return { outcome: "granted" };

  // A refusal the person made, or one a device policy made for them. Either
  // way it is a decision, and the port's header forbids offering a retry.
  if (!status.canAskAgain) return { outcome: "denied" };

  // UNDECIDED AFTER BEING ASKED, and this member is the one worth arguing
  // about. It is reachable: iOS defers the prompt when the request is made
  // while the app is not foregrounded, and answers `undetermined` without
  // showing anything. That is NOT `denied` — nobody said no, and mapping it
  // there would permanently stop asking somebody who was never asked. It is
  // not `granted` and it is not `unavailable` either. `failed` is the only
  // member left that means "no answer this time, and the state is worth
  // reading in a breadcrumb"; it shows nothing to anybody, which is right,
  // because nothing happened to them.
  return { outcome: "failed", detail: `permission undecided after request (${status.status})` };
}

/**
 * Read this install's Expo push token.
 *
 * PERMISSION IS CHECKED FIRST because the token call is a NETWORK ROUND TRIP to
 * Expo's servers — it is not a local read. Making it without permission spends
 * a request to learn something the local permissions state already knew, and on
 * iOS the underlying remote-notification registration fails anyway.
 */
async function getExpoPushToken(): Promise<PushTokenResult> {
  let permission: Notifications.NotificationPermissionsStatus;
  try {
    permission = await Notifications.getPermissionsAsync();
  } catch (error) {
    return { outcome: "failed", detail: `getPermissions: ${failureDetail(error)}` };
  }
  if (!permission.granted) return { outcome: "denied" };

  const projectId = expoProjectId();
  if (projectId === null) {
    // Not retryable and not reportable as an incident: this build was
    // assembled without the key, and no amount of asking again will add one.
    return { outcome: "unavailable" };
  }

  let token: Notifications.ExpoPushToken;
  try {
    token = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    return interpretTokenFailure(error);
  }

  // THE SHAPE IS CHECKED HERE so the round trip is not spent on a registration
  // the server would refuse. `push-registration.ts` rejects anything without
  // this prefix with `EXPO_PUSH_TOKEN_MALFORMED`, which would reach the phone
  // as a 400 it can do nothing with. A string that is not an Expo token means
  // the module changed under us, and that belongs in a breadcrumb.
  if (!token.data.startsWith(EXPO_PUSH_TOKEN_PREFIX)) {
    return {
      outcome: "failed",
      // The token is NOT interpolated. It is a delivery address for this
      // person's device and `detail` is written to logs; its length is enough
      // to tell a malformed shape from an empty one.
      detail: `token did not start with ${EXPO_PUSH_TOKEN_PREFIX} (${token.data.length} chars)`,
    };
  }

  return { outcome: "token", expoPushToken: token.data };
}

/**
 * One rejection from the token path, as a member of the port's union.
 *
 * THE SPLIT IS BETWEEN "THIS BUILD CANNOT" AND "THIS ATTEMPT DID NOT", and the
 * only honest instrument for it is the error CODE. Exported for the same reason
 * `interpretPermission` is.
 */
export function interpretTokenFailure(error: unknown): PushTokenResult {
  const code = errorCode(error);

  // The project or the application id is missing from this build's config.
  // Permanent, silent, nothing to retry — the definition of `unavailable`.
  // (The first of these should be unreachable: `getExpoPushToken` passes the
  // project id explicitly and refuses earlier when it has none. It is mapped
  // anyway because the module can also raise it from the id it derives itself.)
  if (
    code === "ERR_NOTIFICATIONS_NO_EXPERIENCE_ID" ||
    code === "ERR_NOTIFICATIONS_NO_APPLICATION_ID"
  ) {
    return { outcome: "unavailable" };
  }

  // EVERYTHING ELSE IS `failed`, INCLUDING `E_REGISTRATION_FAILED`, AND THAT IS
  // THE DECISION IN THIS FILE MOST LIKELY TO BE ARGUED WITH.
  //
  // `E_REGISTRATION_FAILED` (android/.../PushTokenModule.kt) is what an
  // emulator without Play Services produces — and it is ALSO what a real phone
  // produces when the FCM configuration is broken. From JS the two are one
  // string; the Kotlin interpolates FCM's own message into it and nothing
  // more. Mapping it to `unavailable` would silence the emulator noise, which
  // is tempting, and would ALSO silence a production build that cannot obtain
  // a single token — a capability reported as working while only its plumbing
  // is. Of the two available wrong answers, the one that stays visible is the
  // better wrong answer. The cost is real and is stated rather than hidden:
  // every emulator launch produces one breadcrumb that means nothing.
  //
  // The network and server codes belong here on their own merits: Expo's own
  // documentation says to catch them and retry when the device is back online.
  return {
    outcome: "failed",
    detail: code === null ? failureDetail(error) : `${code}: ${messageOf(error)}`,
  };
}

/** The `code` of an Expo `CodedError`, when there is one. */
function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A diagnostic line for `failed.detail` — never a sentence for a person.
 *
 * Expo's `CodedError` carries the part worth keeping (`ERR_NOTIFICATIONS_
 * NETWORK_ERROR`, and so on); its `message` alone is often the generic half.
 */
function failureDetail(error: unknown): string {
  const code = errorCode(error);
  const message = messageOf(error);
  return code === null ? message : `${code}: ${message}`;
}
