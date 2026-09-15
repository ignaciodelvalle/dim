import "server-only";

import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

import { PUSH_ANDROID_CHANNEL_ID } from "@dim/contract/input";

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

/**
 * The notification types whose title AND body may be rendered VERBATIM on a
 * lock screen, and therefore handed in plaintext to Expo.
 *
 * WHY THIS LIST EXISTS, AND WHY IT IS AN ALLOWLIST
 * ------------------------------------------------
 * Expo Push is a third-party processor in the United States, and the title and
 * body of a message travel through it in the clear: they sit in Expo's
 * infrastructure, they reach APNs/FCM, and they land on a LOCK SCREEN that
 * anybody holding the phone can read without unlocking it. The web leg has no
 * equivalent exposure — a Web Push payload is end-to-end encrypted to the
 * browser's own keys, so `web-push.ts` can send the row as written and this
 * file cannot. That asymmetry is why the declaration lives here and not in the
 * channel-neutral `push-eligibility.ts`: it is a property of the TRANSPORT, not
 * of the row. If the web leg ever stops being end-to-end encrypted, this moves.
 *
 * Some notification bodies are built from a third party's personal data. The
 * worst is `pet_in_possession`, whose body carries the finder's NAME, PHONE,
 * the LOCATION they are holding the animal at and their free-text message
 * (app/(public)/p/[publicToken]/encontre/action.ts:406-433). Under Ley 25.326
 * art. 12 that is an international transfer of personal data, and it is not the
 * kind of thing that may happen because nobody looked.
 *
 * THE DEFAULT IS CLOSED, AND THAT IS THE WHOLE POINT. A denylist of leaky types
 * would be a fence that enumerates FORMS, and this repo has already learned what
 * those cost: the one spelling nobody thought of is the one that ships. The
 * subject here is "may this text leave the building", so the answer defaults to
 * NO and a type earns `true` only by being read and argued. A notification type
 * invented next month — or an existing type whose body grows a new interpolated
 * variable — is generic until somebody comes back here, which is the failure
 * mode we want: a duller lock screen, not a leak.
 *
 * A TYPE IS ONLY AS SAFE AS ITS LEAST SAFE CREATION SITE. `vaccine_due` is the
 * worked example and the reason this list is short: one of its two writers
 * (lib/infra/outreach-reminders.ts:196-206) builds a body from the pet's name
 * and a day count, which is fine, and the other (lib/infra/notifications.ts:242)
 * passes `row.title` straight off a reminder the person typed themselves. Free
 * text cannot be argued about, so the TYPE is unsafe even though one of its
 * sites is not. Every entry below was checked against EVERY site that creates
 * it, not against the first one found.
 *
 * TWO EXCLUSION RULES DID MOST OF THE WORK, and they are written down so the
 * next person extends the list the same way rather than re-deciding:
 *
 *   1. FREE TEXT IS NEVER SAFE. A field somebody typed cannot be argued about,
 *      only read, and the next person to type in it has not read this comment.
 *      This is what disqualifies `pet_in_possession`, `pet_sighting` and
 *      `pet_found_report` (a finder's message), the two `closureNotes` rabies
 *      types, `decomiso_owner_lost_custody` (`judicialProceedingReference`,
 *      validated nowhere), `rabies_observation_completed_dead_authority` (the
 *      `facility` field, likewise) and `vaccine_due` — whose scheduled-scan
 *      writer passes `reminders.title` straight through
 *      (lib/infra/notifications.ts:244), a column a person can write.
 *
 *   2. AN ORGANISATION'S DISPLAY NAME COUNTS AS A NAME. A refugio or a
 *      veterinaria can be, and often is, one natural person trading under their
 *      own name, and the row's context — a seizure, a maltreatment report, a
 *      custody handover — is exactly what makes the pairing sensitive. So
 *      `welfare_org_side_critical_received`, `decomiso_handoff_proposed_receiver`,
 *      `chip_match_notification_owner`, `bite_reported_authority` and
 *      `custody_transfer_proposal_owner` stay off, even though each has at
 *      least one writer that names nobody. Cheap to give up; expensive to be
 *      wrong about.
 *
 * Verified 2026-09-15 against every writer of every type named here, by two
 * independent passes. Each entry names the site(s) read to justify it.
 */
const LOCK_SCREEN_SAFE_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  // Static title, static body — no interpolation at all. The one type on this
  // list whose safety needs no argument beyond reading it.
  // src/modules/events/application/surveillance/symptom-observed-use-case.ts:282-285
  "rabies_observation_escalation_owner",

  // Title is `… — ${pet.name}`; body interpolates only `windowPhrase(days)` (a
  // derived phrase like "de 10 días") and a formatted deadline date. A pet's
  // own name is not a third party's personal data. Both writers checked.
  // src/modules/surveillance/application/close-eligible-observations.ts:203-206
  // src/modules/surveillance/application/close-eligible-observations.ts:293-296
  "rabies_observation_pending_review",

  // Title is `Microchip fraud detected — ${pet.name}`; body interpolates the
  // pet name and `caseId`, a row UUID. Sole writer. Goes to admins, and names
  // no person — not the reporter, not the owner, not the previous keeper.
  // src/modules/pets/application/microchip/replace-microchip.ts:379-382
  "microchip_fraud_detected",

  // Body is `Motivo: ${parsed.reason}. …` where `reason` is a closed set of
  // reason codes off the zod schema, not prose. Sole writer.
  // src/modules/pets/application/microchip/replace-microchip.ts:440-453
  "microchip_updated_by_institution",

  // Title and body are built from a disease label, a species label, a
  // jurisdiction (locality/province — a PLACE, not an address) and two integer
  // match counts. No person and no organisation is named. Sole writer.
  // src/modules/events/application/clinical/route-outbreak-signal-notifications.ts:86-118
  "outbreak_signal_detected",

  // Disease label plus a jurisdiction name; the pet variant adds the pet's own
  // name. Both come off the reportable-disease reference table, not off a form.
  // src/modules/surveillance/application/process-eno-queue-batch.ts:149-165
  "eno_disease_diagnosis",
  // src/modules/surveillance/application/process-eno-queue-batch.ts:172-183
  "eno_pet_disease_diagnosis",

  // The strongest case on this list: title and body are CURATED LITERALS in
  // lib/reference/disease-public-alert-catalog.ts, and the renderer substitutes
  // exactly one placeholder — `{{pet_name}}` — with a regex that knows no other
  // (disease-public-alert-catalog.ts:130). Nothing a person typed can reach it.
  // lib/infra/owner-disease-alerts.ts:52-117
  "disease_public_alert",
]);

/**
 * What a notification looks like when its type has not earned a verbatim
 * render. Neutral enough to say nothing, specific enough to be worth tapping.
 *
 * "miMAR" is the public brand, and the casing the whole product is fenced on
 * (scripts/check-brand-casing.ts). The web leg's service worker falls back to
 * the same word for a payload with no title (public/sw.js:37) — though it still
 * spells it "MiMAR", which is a pre-existing casing bug in a file the fence's
 * globs do not reach, and NOT a licence to copy it here.
 */
const GENERIC_PUSH_TITLE = "miMAR";
const GENERIC_PUSH_BODY = "Tenés un aviso nuevo";

/**
 * What one notification looks like on the wire.
 *
 * THE DEEP LINK SURVIVES GENERICISATION, and it has to: `data.url` is not
 * rendered by the OS, the app reads it after the tap and then fetches the real
 * notification over an authenticated request. So the generic payload costs the
 * person one tap, not the content — the lock screen stops being a reading
 * surface and goes back to being a doorbell.
 */
function messageFor(token: string, row: ExpoPushCandidateRow): ExpoPushMessage {
  // `?? ""` rather than a truthiness test: a null type is a row that declared
  // nothing, which is exactly the case the closed default is for.
  const verbatim = LOCK_SCREEN_SAFE_NOTIFICATION_TYPES.has(row.notificationType ?? "");

  return {
    to: token,
    title: verbatim ? row.title : GENERIC_PUSH_TITLE,
    body: verbatim ? (row.body ?? undefined) : GENERIC_PUSH_BODY,
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
    // THE ANDROID CHANNEL, NAMED HERE BECAUSE A CHANNEL THE SERVER DOES NOT
    // ADDRESS IS A CHANNEL THAT DOES NOTHING.
    //
    // This file used to say — and the adapter's header still explained at
    // length — that creating a channel in the app "would be decoration unless
    // the server addressed it". That was true and it was half a design: the app
    // now creates `PUSH_ANDROID_CHANNEL_ID` and this line is the other half.
    // Without it every message lands in expo-notifications' unnamed fallback
    // channel, where the app's declaration of name, importance and vibration
    // applies to nothing and the person sees a channel called "Miscellaneous"
    // in their system settings.
    //
    // It does NOT raise anything. The channel is created at DEFAULT importance,
    // which is the Android analog of the `priority` decision immediately below
    // and is left at exactly the same conservative setting for exactly the same
    // reason. What it buys is that the setting is OURS to have made, and the
    // person's own override of it survives.
    //
    // iOS ignores the field.
    channelId: PUSH_ANDROID_CHANNEL_ID,
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
