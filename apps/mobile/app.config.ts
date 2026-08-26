// The Expo app config — deep-link seam (M5 placeholder).
//
// The static values live in `app.json`; Expo hands them to this file as
// `config` and takes what this returns. The split is not decoration: the ONE
// thing this layer adds is the deep-link declaration, and that declaration
// needs paragraphs of explanation that JSON cannot carry. Anything with no
// commentary to attach belongs in `app.json`.
//
// ---------------------------------------------------------------------------
// WHAT IS WIRED TODAY: THE CUSTOM SCHEME
// ---------------------------------------------------------------------------
// `mimar://` (declared in app.json, filtered below). It is enough for what M1
// through M4 need — an OAuth/Supabase redirect back into the app, and a link
// from the app to itself — and it needs no coordination with anyone: the app
// claims the scheme by installing.
//
// It is NOT enough for the thing this product actually wants, which is invariant
// #1: the pet IS the credential, and a `DIM-XXXX-XXXX` token resolves to a
// QR-verifiable page. Today scanning that QR opens the browser at
// `https://…/p/{token}`. A custom scheme cannot change that — no phone camera
// will follow `mimar://p/{token}` from a QR it finds in the street, and it must
// not: any app could have claimed the scheme.
//
// ---------------------------------------------------------------------------
// WHAT IS NOT WIRED, AND WHY IT CANNOT BE WIRED IN THIS WORK UNIT (M5)
// ---------------------------------------------------------------------------
// Verified App Links / Universal Links — the mechanism that lets the INSTALLED
// app open `https://mimar.ar/p/{token}` directly while everyone else still gets
// the web page. That is the correct end state for the QR, and it is blocked on
// something no code in this repo can produce:
//
//   Android needs `https://{domain}/.well-known/assetlinks.json` to publish the
//   SHA-256 fingerprint of the certificate the APK is signed with. Under Play
//   App Signing that key is Google's, not ours — the fingerprint only exists
//   after the app is uploaded to a Play console that does not exist yet (no EAS
//   account as of 2026-08-25). Publishing a fingerprint we control instead
//   would verify a build Play will never ship, and the link would silently fall
//   back to the browser on every real install: the failure mode of App Links is
//   not an error, it is a page that quietly opens in Chrome.
//
//   iOS needs `https://{domain}/.well-known/apple-app-site-association` carrying
//   the Team ID, which likewise does not exist before the Apple enrolment.
//
// So M5 is: enrol, read the Play-signed fingerprint out of the console, serve
// both well-known files from the web app, THEN add the `autoVerify` filter
// below. Writing the filter first would ship a claim we cannot honour.
//
//   android: {
//     intentFilters: [
//       {
//         action: "VIEW",
//         autoVerify: true,                       // ← requires assetlinks.json
//         data: [{ scheme: "https", host: "mimar.ar", pathPrefix: "/p" }],
//         category: ["BROWSABLE", "DEFAULT"],
//       },
//     ],
//   },
//   ios: { associatedDomains: ["applinks:mimar.ar"] },   // ← requires Team ID
//
// The host is a placeholder too: the credential currently lives at
// `dim-staging.vercel.app`, and a verified link must point at the production
// domain, not at a preview host whose `.well-known` any Vercel deploy can move.
//
// ===========================================================================
// THE SECOND DECLARATION THAT NEEDS PARAGRAPHS: expo-updates
// ===========================================================================
// The header above says the ONE thing this layer adds is the deep-link
// declaration. That stopped being true here, and for the same reason: the
// update configuration is three keys whose meaning is entirely in what they
// FORBID, and JSON cannot say what a key forbids.
//
// THE POLICY, WHICH IS NOT "WE HAVE OTA NOW"
// ---------------------------------------------------------------------------
// Over-the-air updates are fenced to HOTFIXES by PO decision. OTA is not a
// release channel here; it is a way to un-break a build that is already on
// somebody's phone, between store releases. The full argument, the class of
// change that may never go out this way, and the procedure live in
// `docs/mobile/ota-policy.md`. Read it before running `eas update`.
//
// WHAT `runtimeVersion: { policy: "fingerprint" }` ACTUALLY DOES
// ---------------------------------------------------------------------------
// It is the only part of that policy that is a MECHANISM rather than a promise,
// and it is the reason this policy is enforceable at all.
//
// An OTA update replaces the JavaScript bundle. It cannot replace the native
// runtime that bundle runs against — the compiled Android/iOS binary with its
// linked native modules. Ship JS that calls into a native module the installed
// binary does not contain and the app does not degrade: it CRASHES, on launch,
// on every phone that took the update, and the fix cannot itself be shipped
// over the air because the broken build is the one that would have to download
// it. That is the failure mode OTA is famous for, and it bricks a fleet.
//
// `runtimeVersion` is the compatibility key: expo-updates only serves an update
// to a build whose runtime version matches. The `fingerprint` policy computes
// it by HASHING the things that determine the native runtime — the native
// dependency set, the config plugins, the app config that feeds prebuild. So:
//
//   Add expo-camera, change a plugin, bump the Expo SDK → the fingerprint
//   changes → the update is published under a runtime version no installed
//   build has → nobody receives it. The mistake becomes a delivery that reaches
//   zero devices instead of a crash that reaches all of them.
//
// The alternatives were considered and are worse HERE:
//
//   `appVersion` — ties the runtime version to `version` in app.json (0.0.1).
//       Two builds of 0.0.1 with different native modules share a runtime
//       version, so the crash above is fully available. It only works if a
//       human remembers to bump `version` on every native change, which is the
//       same "a rule enforced by nobody" shape `appVersionSource: remote`
//       exists to get rid of (see docs/mobile/eas-build-profiles.md).
//   `nativeVersion` / a hand-written string — same class, more typing.
//
// The cost of `fingerprint` is real and worth stating: the runtime version is
// an opaque hash nobody can read, computed rather than declared, so "why did
// this phone not get the update?" is answered by `eas update:list` and
// `npx expo-updates fingerprint:generate`, not by looking at a file. It also
// means a change that is genuinely JS-only but happens to touch the config can
// silently orphan the fleet from a hotfix. That is the correct direction to
// fail in.
//
// WHY `fallbackToCacheTimeout: 0`, i.e. NEVER BLOCK THE LAUNCH
// ---------------------------------------------------------------------------
// The alternative is to hold the splash screen while the app asks the update
// server whether anything is new. That taxes 100% of cold starts — including
// every start on the 4G-in-a-veterinary-waiting-room network this app is
// actually used on — to make a rare hotfix arrive one launch sooner.
//
// With 0, the update downloads in the background and applies on the NEXT
// launch. A hotfix therefore reaches a user on their second open after
// publication. That is the trade, stated plainly: slower hotfix propagation,
// bought with a launch that never waits on a network it may not have.
//
// WHAT IS NOT HERE
// ---------------------------------------------------------------------------
// No `channel`. It is not an app-config value — each build profile in
// `eas.json` declares its own, and that is what keeps a preview update from
// reaching a production install. Writing one here would apply to every build.
//
// Nothing has been published. `npx eas-cli whoami` answers `Not logged in` as
// of 2026-08-26, so no update, no channel and no runtime version has ever
// existed on the server. This is the declaration; none of it has run.

import { ANDROID_PACKAGE_NAME, IOS_BUNDLE_IDENTIFIER } from "@dim/contract/links";
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // `name`/`slug` come from app.json and are required by the ExpoConfig type;
  // the spread cannot prove that to TypeScript, so they are restated.
  name: config.name ?? "MiMAR",
  slug: config.slug ?? "mimar",
  // THE IDENTIFIERS COME FROM THE CONTRACT, not from app.json.
  //
  // `/.well-known/assetlinks.json`, served by the web app, publishes this exact
  // package name; Android's verifier compares it to the installed APK's and
  // rejects the association on any mismatch — silently, with the links simply
  // opening in Chrome forever. Two hand-maintained copies of a string in two
  // programs that never import each other is the drift `packages/contract`
  // exists to prevent, so the string has one home and both sides read it.
  // The EAS project this app builds under, created by the PO on 2026-08-25.
  //
  // Written by hand rather than by `eas init`, which needs interactive auth and
  // would rewrite this file — the one file here whose value is its commentary.
  // The result is identical: `eas build` reads `extra.eas.projectId` and nothing
  // else from the config to identify the project.
  //
  // `owner` is deliberately ABSENT. It names the account the project belongs to,
  // and `eas build` run by a logged-in member resolves the owner from the
  // session, so the PO's first builds work without it. A CI or robot build has
  // no session to resolve from and WILL need `owner: "<account slug>"` added
  // here — at the first such build, when the slug is actually known, rather than
  // guessed now.
  //
  // The spread of `config.extra` is not decoration: the expo-router plugin puts
  // its own `extra.router` there during config resolution, and replacing the
  // object instead of merging it would drop that silently.
  extra: { ...config.extra, eas: { projectId: "db4bebed-67f3-49a7-acf7-63c9f19ad511" } },
  // See "THE SECOND DECLARATION THAT NEEDS PARAGRAPHS" at the top of this file
  // for why each of these keys is the value it is, and for the one thing this
  // block does NOT declare (the channel — that is per build profile).
  //
  // THE PROJECT ID APPEARS TWICE IN THIS FILE and the second copy is here,
  // inside the URL, because Expo's update server addresses a project by id in
  // its path and takes no other form. The two cannot be allowed to drift: a URL
  // pointing at a project that does not exist produces an app that polls
  // forever, finds nothing, logs nothing and can never be hotfixed. Held
  // together by an assertion in src/release/release-config.test.ts rather than
  // by a comment asking nicely.
  updates: {
    url: "https://u.expo.dev/db4bebed-67f3-49a7-acf7-63c9f19ad511",
    enabled: true,
    // Ask on every cold start, but see `fallbackToCacheTimeout` — asking is
    // not the same as waiting for the answer.
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  // The fence. An update whose fingerprint differs from a build's is not served
  // to that build, which is what makes "no native changes over the air" a
  // property of the system rather than a line in a document.
  runtimeVersion: { policy: "fingerprint" },
  ios: { ...config.ios, bundleIdentifier: IOS_BUNDLE_IDENTIFIER },
  android: {
    ...config.android,
    package: ANDROID_PACKAGE_NAME,
    intentFilters: [
      // The custom scheme, declared explicitly rather than left to the implicit
      // filter Expo generates from `scheme`. When the verified `https` filter
      // above lands it becomes a SECOND entry in this same array, and a reader
      // comparing them should be able to see that one carries `autoVerify` and
      // the other cannot.
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "mimar" }],
      },
    ],
  },
});
