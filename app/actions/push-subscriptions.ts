"use server";

// Push subscription lifecycle — Web Push v1 (owner-side, feature-flagged).
//
// Called from the /cuenta "Notificaciones push" card:
//   - savePushSubscriptionAction: upsert the browser's PushSubscription for
//     the logged-in user (re-subscribing the same endpoint re-activates it and
//     re-keys it, including after a browser key rotation).
//   - revokePushSubscriptionAction: soft-revoke (revoked_at) — the row stays
//     for auditability; the send path only ever reads revoked_at IS NULL rows.
//
// Auth: requireUserOrRedirect on both — a subscription always belongs to the
// session user; the endpoint is scoped to user_id on revoke so one user can
// never revoke another user's registration.

import { db, pushSubscriptions } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { reportError } from "@/lib/infra/report-error";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export type PushSubscriptionActionResult = { ok: true } | { ok: false; error: string };

// Shape of PushSubscription.toJSON() (minus expirationTime, which we ignore:
// the push service signals expiry with 410 at send time and the send path
// soft-revokes then).
const subscriptionSchema = z.object({
  // Push service endpoints are always https URLs; cap length defensively.
  endpoint: z.string().url().max(2000).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function savePushSubscriptionAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<PushSubscriptionActionResult> {
  const { user } = await requireUserOrRedirect();

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "La suscripción recibida no es válida." };
  }

  // Best-effort browser identification for a future device list. Truncated so
  // a forged header can never be a payload-size vector.
  const { headers } = await import("next/headers");
  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 300) || null;

  try {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      })
      .onConflictDoUpdate({
        // Same browser re-subscribing (or a new user on the same browser):
        // re-key, re-own, and re-activate the existing endpoint row.
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent,
          revokedAt: null,
        },
      });
    return { ok: true };
  } catch (err) {
    reportError("push/subscribe", err, { userId: user.id });
    return { ok: false, error: "No pudimos activar las notificaciones. Probá de nuevo." };
  }
}

export async function revokePushSubscriptionAction(
  endpoint: string,
): Promise<PushSubscriptionActionResult> {
  const { user } = await requireUserOrRedirect();

  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { ok: false, error: "La suscripción recibida no es válida." };
  }

  try {
    await db
      .update(pushSubscriptions)
      .set({ revokedAt: new Date() })
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
    return { ok: true };
  } catch (err) {
    reportError("push/revoke", err, { userId: user.id });
    return { ok: false, error: "No pudimos desactivar las notificaciones. Probá de nuevo." };
  }
}
