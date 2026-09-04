// "Acerca de miMAR" — the read-only answer to "¿qué versión tenés?".
//
// WHY THIS EXISTS: the OTA-rehearsal prep found no screen naming the app
// version, the running update's id, or its channel, and `expo-updates` was
// never imported anywhere in app code — logcat was the only way to know
// what a given phone was running. During the pilot the first support
// question is "¿qué versión tenés?", so this sits at the bottom of Ajustes:
// read-only, no copy button, nothing to interact with.
//
// THE PAIRING THIS WAS BRIEFED FOR DOES NOT EXIST ON THIS SDK
// ---------------------------------------------------------------------------
// `Constants.nativeApplicationVersion` / `Constants.nativeBuildVersion` were
// removed from `expo-constants` years ago (its own CHANGELOG: "Remove
// deprecated ... nativeAppVersion, nativeBuildVersion ... properties") and
// are not in this app's ~57 typings at all — verified against
// node_modules/expo-constants/build/Constants.types.d.ts, which only
// mentions `nativeBuildVersion` once, inside a `@deprecated` pointer on a
// DIFFERENT, unrelated field. Their replacement lives in `expo-application`
// (`Application.nativeApplicationVersion` / `nativeBuildVersion`), a package
// this app does NOT depend on — adding it is a NEW native module, a
// different cost than importing `expo-updates` (already linked): it changes
// the fingerprint (`runtimeVersion: { policy: "fingerprint" }`,
// app.config.ts) and needs a native rebuild, exactly the class of cost
// `PrivacyScreen.tsx`'s own header already ruled out for a small addition
// ("adding either means a native module, which means an EAS build — the
// pipeline that cost six builds and five distinct root causes for the pet
// photo"). There is no config value to fall back to either:
// `eas.json`'s `appVersionSource: "remote"` means the native build number is
// assigned by EAS at build time and is never written into app.json.
//
// So this shows the version fact that IS real and already available —
// `app.json`'s `expo.version`, read via `Constants.expoConfig` — and leans on
// `expo-updates` (already a dependency; importing it in JS changes nothing
// native) for the finer-grained facts an OTA rehearsal actually needs: which
// update is running, and on which channel.
//
// WHY THIS IS A COMPONENT IN `src/account/` AND NOT INLINE IN `app/ajustes.tsx`
// ---------------------------------------------------------------------------
// Jest's `roots` is `<rootDir>/src` (jest.config.js) — nothing under `app/`
// is reachable by a test, the same reason `AccountDeletionCard` lives here
// instead of inside the screen it renders on.

import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { Body, Card, Row } from "../ui/components";

/** Enough of an update id to tell two updates apart in a screenshot, without
 * asking a tester to read out a full UUID over WhatsApp. */
const UPDATE_ID_PREFIX_LENGTH = 8;

function appInfo(): { version: string; update: string; channel: string } {
  const version = Constants.expoConfig?.version ?? "—";

  // "integrada" covers two different facts with one honest word: either this
  // IS the build's own embedded code (no OTA update has ever applied), or
  // expo-updates is disabled altogether (the dev client, where `updateId` is
  // always null) — in neither case is a truncated UUID a fact worth showing.
  const updateId = Updates.updateId;
  const update =
    Updates.isEmbeddedLaunch || updateId === null || updateId === ""
      ? "integrada"
      : updateId.slice(0, UPDATE_ID_PREFIX_LENGTH);

  const channel = Updates.channel ?? "—";

  return { version, update, channel };
}

export function AboutSection() {
  const { version, update, channel } = appInfo();
  return (
    <Card title="Acerca de miMAR">
      <Row label="Versión" value={version} />
      <Row label="Actualización" value={update} />
      <Row label="Canal" value={channel} />
      <Body>Decinos esto si nos escribís por un problema.</Body>
    </Card>
  );
}
