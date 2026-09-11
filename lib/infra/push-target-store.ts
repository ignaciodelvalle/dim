import "server-only";

import { db, pushTargets } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Reads and writes for `push_targets` — the native (Expo) push destinations.
 *
 * WHY A STORE AND NOT DRIZZLE CALLS AT THE CALL SITES. Three of the four
 * operations below encode a rule that is easy to get subtly wrong and
 * impossible to see wrong from the outside: the registration upsert's conflict
 * target, the fact that revocation is an UPDATE and never a DELETE, and the
 * `revoked_at IS NULL` filter the send path depends on. Spread across a route
 * handler and a sender, those three become three places to forget. Here they
 * are one place to read.
 *
 * NOTHING IN THIS FILE CATCHES. A database failure in the push leg is the
 * caller's to swallow — `web-push.ts` wraps its whole send in one try/catch for
 * exactly that reason (ARCH-P: a blip in a best-effort second delivery leg must
 * never surface to the action that wrote the notification). A store that
 * swallowed its own errors would make that impossible to honour, because the
 * caller could no longer tell a failed write from a successful no-op.
 */

/** What the app sends when it registers or refreshes a device. */
export type PushTargetRegistration = {
  userId: string;
  /** The install identity the app minted once and keeps in expo-secure-store. */
  deviceId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  appVersion?: string | null;
};

/** One active destination, as the sender needs it. */
export type ActivePushTarget = {
  id: string;
  expoPushToken: string;
};

/**
 * Register or refresh one device, keyed on `device_id`.
 *
 * THE CONFLICT TARGET IS `device_id`, NOT THE TOKEN, and that is the whole
 * design. Expo tokens rotate; conflicting on the token would insert a second row
 * on every rotation and leave the first orphaned with no install identity to
 * reconcile against. One install is one row, for the life of the install.
 *
 * `user_id` IS IN THE UPDATE SET ON PURPOSE. If a second person signs in on the
 * same phone, the row's owner flips to them and the first person stops receiving
 * pushes there. That is correct: the device's lock screen belongs to whoever is
 * signed in on it, not to whoever signed in first. Leaving `user_id` out of the
 * SET would keep delivering the first person's notifications to a phone that is
 * now somebody else's — the failure this line exists to prevent.
 *
 * `revoked_at` IS CLEARED. Re-registering is how a person turns push back on
 * after a sign-out revoked the row; without this, a device could be revoked once
 * and never speak again.
 */
export async function registerPushTarget(input: PushTargetRegistration): Promise<void> {
  await db
    .insert(pushTargets)
    .values({
      userId: input.userId,
      deviceId: input.deviceId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
    })
    .onConflictDoUpdate({
      target: pushTargets.deviceId,
      set: {
        userId: input.userId,
        expoPushToken: input.expoPushToken,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        revokedAt: null,
      },
    });
}

/**
 * Sign-out: stop delivering to this device.
 *
 * SCOPED BY `user_id` AS WELL AS `device_id`, which is not redundant. Without
 * it, anybody who learned a device_id could silence somebody else's phone by
 * calling the unregister endpoint with it. With it, the statement matches
 * nothing unless the caller is the row's current owner.
 *
 * An UPDATE, never a DELETE: the row keeps an auditable trail, the purge in
 * `data-lifecycle.ts` removes it after the TTL, and `erase_subject_data` removes
 * it immediately on an art. 16 request. The table has no DELETE policy at all,
 * so a client could not delete it even if this function tried.
 *
 * Returns the number of rows revoked — 0 is a legitimate answer (already
 * revoked, or never registered) and the caller must not treat it as an error.
 */
export async function revokePushTarget(userId: string, deviceId: string): Promise<number> {
  const rows = await db
    .update(pushTargets)
    .set({ revokedAt: new Date() })
    .where(and(eq(pushTargets.userId, userId), eq(pushTargets.deviceId, deviceId)))
    .returning({ id: pushTargets.id });
  return rows.length;
}

/**
 * The send path's read: every device this person has that is still live.
 *
 * `revoked_at IS NULL` is the filter `push_targets_user_active_idx` is partial
 * on, so this is an index scan over the live population only.
 */
export async function activePushTargetsForUser(userId: string): Promise<ActivePushTarget[]> {
  return db
    .select({ id: pushTargets.id, expoPushToken: pushTargets.expoPushToken })
    .from(pushTargets)
    .where(and(eq(pushTargets.userId, userId), isNull(pushTargets.revokedAt)));
}

/** Delivery succeeded. Same contract as the web leg's `last_used_at` bump. */
export async function markPushTargetUsed(id: string): Promise<void> {
  await db.update(pushTargets).set({ lastUsedAt: new Date() }).where(eq(pushTargets.id, id));
}

/**
 * Expo said `DeviceNotRegistered`: the app was uninstalled, or the token was
 * invalidated. Soft-revoke so the send path stops trying.
 *
 * This is the analog of the web leg's 404/410 handling, and like it, it is NOT
 * an error — it is the ordinary end of an install's life. The caller must not
 * `reportError` on this path, or every uninstall becomes a logged incident.
 *
 * Scoped by id because the sender already holds the row it just failed to
 * deliver to; no user scoping is needed or wanted here, since this runs
 * server-side on the sender's own read.
 */
export async function revokePushTargetById(id: string): Promise<void> {
  await db.update(pushTargets).set({ revokedAt: new Date() }).where(eq(pushTargets.id, id));
}
