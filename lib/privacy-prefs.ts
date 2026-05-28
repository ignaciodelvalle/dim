// Privacy preference keys + shared types (handoff P3-3).
//
// Lives outside `app/actions/*` because the action file is `"use server"` —
// Next.js only allows async-function exports from server-action modules.

export const PRIVACY_PREF_KEYS = [
  "discloseNameCredential",
  "disclosePhoneCredential",
  "allowOrgContact",
  "allowLostAlertsInZone",
] as const;

export type PrivacyPrefKey = (typeof PRIVACY_PREF_KEYS)[number];
