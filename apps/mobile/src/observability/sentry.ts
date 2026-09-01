// Crash reporting — the answer to "the app closed itself and nobody knows why".
//
// WHY THIS EXISTS FOR THE PILOT: fourteen testers on unknown Android phones,
// none of whom will attach a logcat to an email. Without a crash reporter every
// native or JS crash is an unreproducible anecdote; with one it is a stack
// trace with a device model attached.
//
// WHERE THE DSN COMES FROM. `app.config.ts` reads `SENTRY_DSN` from the EAS
// build environment (it has no EXPO_PUBLIC_ prefix, so it never reaches
// `process.env` in the bundle) and carries it as `extra.sentryDsn`. A build
// without one — local dev, a fork, an emulator run — resolves to `null` and
// `initSentry` deliberately does nothing: an SDK initialized with a garbage
// DSN retries uploads forever, which is worse than absent.
//
// WHAT IS DELIBERATELY OFF:
//   · `sendDefaultPii` — stated even though it is the default. This product
//     hashes DNIs at the boundary (invariant #5); its crash reporter does not
//     get to be the one surface that ships identifying data by accident.
//   · Tracing (`tracesSampleRate: 0`) — the pilot's question is "does it
//     crash", not "is it fast". Performance spans multiply events against a
//     free-tier quota and can drown the one crash that mattered.

import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/** The DSN the build carried, or null when this build has none. */
export function sentryDsnFromConfig(): string | null {
  const dsn: unknown = Constants.expoConfig?.extra?.sentryDsn;
  return typeof dsn === "string" && dsn.length > 0 ? dsn : null;
}

/**
 * Initialize crash reporting, or refuse out loud in the return value.
 *
 * Returns whether the SDK actually started, so the caller can log the refusal
 * in dev instead of wondering why a test crash never arrived.
 */
export function initSentry(): boolean {
  const dsn = sentryDsnFromConfig();
  if (dsn === null) return false;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  return true;
}
