// Use-case: updatePrivacyPrefForUser (handoff P3-3)
//
// Four boolean columns already live on profiles (added in P1-2):
//   - discloseNameCredential
//   - disclosePhoneCredential
//   - allowOrgContact
//   - allowLostAlertsInZone
//
// One toggle changes one row at a time, optimistic UI lives in the client
// wrapper. No cross-table side effects.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import { PRIVACY_PREF_KEYS, type PrivacyPrefKey } from "@/lib/privacy-prefs";

import type { UpdatePrivacyPrefResult } from "./types";

export async function updatePrivacyPrefForUser(
  userId: string,
  key: PrivacyPrefKey,
  next: boolean,
): Promise<UpdatePrivacyPrefResult> {
  if (!PRIVACY_PREF_KEYS.includes(key)) {
    return { error: "INVALID_KEY" };
  }

  const updated = await db
    .update(profiles)
    .set({ [key]: next, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });

  if (updated.length < 1) {
    return { error: "NOT_FOUND" };
  }

  return { ok: true };
}
