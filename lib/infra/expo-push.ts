import "server-only";

import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

import { isPushEligible } from "@/lib/infra/push-eligibility";
import {
  activePushTargetsForUser,
  markPushTargetUsed,
  revokePushTargetById,
} from "@/lib/infra/push-target-store";
import { reportError } from "@/lib/infra/report-error";

/**
 * The NATIVE delivery leg — Expo Push Service — sibling of `web-push.ts`.
 *
 * WHY EXPO AND NOT FCM/APNs DIRECTLY. The app is Expo-managed with EAS builds,
 * and Expo's service brokers to both stores: one server code path instead of
 * two, no APNs `.p8` to handle, no FCM service-account JSON in the server
 * environment. The design documents that say "FCM/APNs" were written before the
 * Expo app existed; they are not being overridden, they simply never considered
 * this.
 *
 * THIS FILE INHERITS WEB PUSH'S FRAGILITY ON PURPOSE. It runs on the request
 * path, awaited, with no retry beyond the revoke case below — exactly the
 * posture the web leg already has. That is a known and accepted shape, not a new
 * risk, and building the durable outbox instead would be a multi-week workstream
 * that swallowed this one.
 *
 * NOTHING HERE THROWS TO ITS CALLER. `createNotification` awaits the push seam
 * and must not fail because a lock screen did not light up (ARCH-P).
 */

/** Read once per call, not at module load, so a test can stub the env. */
function accessToken(): string | undefined {
  const raw = process.env.EXPO_ACCESS_TOKEN?.trim();
  return raw ? raw : undefined;
}

/**
 * True when this leg is configured.
 *
 * A MISSING TOKEN IS A NO-OP, NOT A THROW, exactly as `isWebPushEnabled()` makes
 * a missing VAPID key one. Most environments that run this code — a local stack,
 * a preview deploy, a test — have no Expo project credential and must not fail a
 * notification write because of it.
 *
 * IT DOES NOT READ THE WEB'S FLAG. `NEXT_PUBLIC_PUSH_ENABLED` gates the web leg
 * and only the web leg; a deployment that turns web push off has said nothing
 * about phones.
 */
export function isExpoPushEnabled(): boolean {
  return accessToken() !== undefined;
}

/** The subset of a notifications row this leg needs. Structurally compatible
 *  with `PushCandidateRow`, and deliberately not imported from the web leg. */
export type ExpoPushCandidateRow = {
  userId: string;
  severity?: "info" | "success" | "warning" | "urgent" | null;
  notificationType?: string | null;
  title: string;
  body?: string | null;
  ctaUrl?: string | null;
  dedupeKey?: string | null;
};

/** One message, and the row it must be reconciled against when tickets return. */
type Addressed = { targetId: string; message: ExpoPushMessage };

/**
 * Deliver every eligible row to every live device its addressee has.
 *
 * THE TICKETS COME BACK POSITIONALLY, which is the one thing about this API that
 * will bite somebody: `sendPushNotificationsAsync` answers an array whose nth
 * ticket belongs to the nth message, and the tickets carry no token of their own
 * on the success path. So the target id has to be carried alongside the message
 * and zipped back afterwards — reading the token out of a ticket works only for
 * errors and would silently stop bumping `last_used_at` the day it is relied on.
 *
 * CHUNKED THROUGH THE SDK'S OWN SPLITTER rather than a number chosen here. Expo
 * caps a request's message count and the cap is the SDK's to know; hardcoding
 * one would be a second copy of a limit that can move under us.
 */
/**
 * Build one message per (live device × eligible row), carrying the target id so
 * the tickets can be zipped back afterwards.
 *
 * ONE LOOKUP PER DISTINCT ADDRESSEE, not per row: a flush that wrote three
 * urgent rows for one person would otherwise read their device list three times
 * on the request path.
 */
async function addressMessages(rows: ExpoPushCandidateRow[]): Promise<Addressed[]> {
  const byUser = new Map<string, ExpoPushCandidateRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  const addressed: Addressed[] = [];
  for (const [userId, userRows] of byUser) {
    const targets = await activePushTargetsForUser(userId);
    for (const target of targets) {
      // A token the SDK does not recognise never reaches the network. It is
      // also not an error worth reporting: the contract already refuses a
      // malformed one at the endpoint, so reaching here means the shape changed
      // under us — revoke it and let the device re-register rather than
      // retrying it nightly forever.
      if (!Expo.isExpoPushToken(target.expoPushToken)) {
        await revokePushTargetById(target.id);
        continue;
      }
      for (const row of userRows) {
        addressed.push({ targetId: target.id, message: messageFor(target.expoPushToken, row) });
      }
    }
  }
  return addressed;
}

/** What one notification looks like on the wire. */
function messageFor(token: string, row: ExpoPushCandidateRow): ExpoPushMessage {
  return {
    to: token,
    title: row.title,
    body: row.body ?? undefined,
    // The deep link the notification opens, carried as data rather than in the
    // body: the OS renders title and body, the app reads this when the person
    // taps.
    data: row.ctaUrl ? { url: row.ctaUrl } : undefined,
    // `collapseId` is the cross-platform one — it becomes APNs's collapse-id
    // and FCM's collapse_key — and it plays the role the web leg gives `tag`: a
    // second notification carrying the same key REPLACES the first on the shade
    // instead of stacking, so a retried write does not double somebody's lock
    // screen. The Android-only `tag` field exists too and is deliberately not
    // used: one key, both stores.
    collapseId: row.dedupeKey ?? undefined,
    // NO `priority`, and that is a decision rather than an omission. Expo's
    // default maps to a normal-priority push, which Android's Doze can defer —
    // and these rows are urgent by definition, so "high" is tempting. It is
    // left alone because the WEB leg sets no urgency header either, and §3.3's
    // whole argument is that two channels disagreeing about what is urgent is
    // worse than both being conservative. Raising it is a product decision
    // about battery, taken once, for both legs.
  };
}

/**
 * Reconcile one chunk's tickets against the targets they were addressed to.
 *
 * THE TICKETS COME BACK POSITIONALLY, which is the one thing about this API that
 * will bite somebody: the nth ticket belongs to the nth message, and a SUCCESS
 * ticket carries no token of its own. So the target id travels alongside the
 * message and is zipped back here — reading the token out of a ticket works only
 * for errors and would silently stop bumping `last_used_at` the day it is
 * relied on.
 */
async function reconcileTickets(slice: Addressed[], tickets: ExpoPushTicket[]): Promise<void> {
  for (const [index, ticket] of tickets.entries()) {
    const target = slice[index];
    if (!target) continue;

    if (ticket.status === "ok") {
      await markPushTargetUsed(target.targetId);
      continue;
    }

    if (ticket.details?.error === "DeviceNotRegistered") {
      // The analog of web's 404/410: the app was uninstalled or the token was
      // invalidated. NOT reported — this is the ordinary end of an install's
      // life, and logging it would make every uninstall an incident.
      await revokePushTargetById(target.targetId);
      continue;
    }

    // Everything else — MessageTooBig, MessageRateExceeded, ProviderError,
    // InvalidCredentials — leaves the row alone. Only the first of those is
    // about this message; the rest are about us or about the store, and
    // revoking somebody's device because our credential expired would be the
    // worst possible reading of a server-side problem.
    reportError("expo-push/ticket", new Error(ticket.message), {
      expoError: ticket.details?.error ?? null,
      targetId: target.targetId,
    });
  }
}

/**
 * Deliver every eligible row to every live device its addressee has.
 *
 * CHUNKED THROUGH THE SDK'S OWN SPLITTER rather than a number chosen here. Expo
 * caps a request's message count and the cap is the SDK's to know; hardcoding
 * one would be a second copy of a limit that can move under us.
 */
export async function sendExpoPushForNotifications(rows: ExpoPushCandidateRow[]): Promise<void> {
  if (!isExpoPushEnabled()) return;

  const pushable = rows.filter(isPushEligible);
  if (pushable.length === 0) return;

  try {
    const addressed = await addressMessages(pushable);
    if (addressed.length === 0) return;

    const expo = new Expo({ accessToken: accessToken() });
    const chunks = expo.chunkPushNotifications(addressed.map((a) => a.message));

    let consumed = 0;
    for (const chunk of chunks) {
      const slice = addressed.slice(consumed, consumed + chunk.length);
      consumed += chunk.length;

      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        await reconcileTickets(slice, tickets);
      } catch (err) {
        // The whole chunk failed to POST — a network blip, a 5xx from Expo. No
        // row is revoked: nothing here says any of these devices is gone, and
        // revoking on a transport failure would silence a working phone.
        reportError("expo-push/send", err, { messages: chunk.length });
      }
    }
  } catch (err) {
    // Includes the device lookups and the revoke/bump writes: a DB blip in the
    // push leg must never surface to the action that wrote the notification.
    reportError("expo-push/send-all", err);
  }
}
