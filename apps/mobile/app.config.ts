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
