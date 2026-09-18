// The IP-less ceiling on the anonymous reports a stranger can file about ONE
// animal (audit A03-2, re-filed from the prior audit as still open):
//
//   src/modules/pets/application/sighting/report-pet-sighting.ts    `sighting_token`
//   src/modules/pets/application/public/notify-owner-of-found-pet.ts `found_notify_token`
//   app/(public)/p/[publicToken]/encontre/action.ts                  `finder_possession_token`
//   src/modules/custody-disputes/application/report-dispute-tip.ts   `dispute_tip_token`
//
// WHAT WAS MISSING. Each is keyed `(surface:token, ip)` at 1/min + 10/hr and
// nothing else. A lost pet's token is public on purpose — posters, WhatsApp,
// the /perdidas board — so anyone with N addresses could send its owner 10 × N
// urgent notifications an hour and append 10 × N rows to the animal's
// append-only spine, with no ceiling keyed on the animal itself. The shape that
// closes it was already in the repo: submit-org-contact.ts pairs its per-IP
// bucket with an IP-less `org_contact_org:<org>` one.
//
// ---------------------------------------------------------------------------
// WHY A PER-TOKEN CAP IS RIGHT HERE WHEN IT WAS REJECTED FOR THE CREDENTIAL
// ---------------------------------------------------------------------------
// app/api/v1/pets/[publicToken]/credential/limits.ts considered a token-only
// cap on the credential READ and rejected it twice, for two reasons. Both were
// weighed again for these WRITES:
//
//   · It cannot tell abuse from the success case. For a read, the viral poster
//     IS one token from thousands of addresses. For a report it is not: a
//     report is somebody who saw the animal typing a form, and thirty distinct
//     reports about one animal inside one hour is already a crowd around it.
//   · It is a griefing primitive. Still true — and cheaper than this file first
//     claimed. It used to say "silencing an animal for an hour takes three
//     addresses working the whole hour". The windows are FIXED CLOCK WINDOWS
//     (lib/infra/rate-limit.ts, `Math.floor(now / 3_600_000)`), not sliding
//     ones, and the per-address bucket allows 1/min, so the real arithmetic is:
//
//       five addresses × 1/min each = 5/min, which is also the token's minute
//       cap → 30 reports land in 30 / 5 = 6 minutes. Fired at hh:00, that
//       leaves ~54 minutes of the hour with the animal's bucket full. Three
//       addresses need 10 minutes (3/min; 10 each is exactly their hourly
//       cap). Neither needs to work the whole hour.
//
//     And addresses are cheap: before callerIp() grouped IPv6 by /64 one host
//     had effectively unlimited ones, and even grouped, a hosting account
//     hands out a /48 — 65 536 /64s. So a HARD refusal on the token bucket is a
//     denial of rescue: a stranger who read the token off /perdidas posts ~30
//     fake "la tengo conmigo" at the top of each hour, every REAL finder is
//     refused for the rest of it, and the owner receives only the fakes.
//     Before the cap the same flood buried the real report, but the real report
//     still ARRIVED, with the finder's contact on it.
//
//     So the cap does two different things depending on what silencing costs:
//
//       1. SIGHTINGS AND DISPUTE TIPS REFUSE. A sighting is one of many ("vi un
//          perro así en la plaza"), and a tip goes to a reviewing authority, not
//          to the family; losing one for the rest of an hour costs little, and
//          the refusal copy says so honestly (ANONYMOUS_REPORT_TOKEN_BUSY).
//       2. THE TWO "I HAVE THE ANIMAL" REPORTS DEGRADE, NEVER REFUSE
//          (`found_notify_token`, `finder_possession_token`). Over the ceiling
//          the report is still accepted and written exactly as it would be
//          otherwise — the event on the spine, the notification with the
//          finder's contact — but the owner's copy stops ringing: it is written
//          at OVER_CEILING_REPORT_DELIVERY (no push), and the owner gets ONE
//          notice per animal per clock hour saying reports are piling up
//          (anonymousReportOverflowNotices, below). The finder sees the normal
//          success screen. What the cap bounds here is the INTERRUPTIONS —
//          thirty pushes an hour — not the reports, because the one real
//          report inside a flood is the whole reason the surface exists.
//
//     What is still true from the original list: the per-address bucket runs
//     FIRST and still refuses one noisy address outright, and every surface has
//     its own token bucket, so a flood of fake sightings cannot touch a
//     "la tengo conmigo".
//
// ---------------------------------------------------------------------------
// THE NUMBERS — anchored on the per-(address, token) bucket all four spend
// ---------------------------------------------------------------------------
//   per minute    5 = five different people reporting the same animal inside
//                     the same sixty seconds, at their own 1/min each
//   per hour     30 = 3 × one address's hourly 10 — the fewest addresses that
//                     can exhaust it together is three
//
// So what an owner can be INTERRUPTED by from anonymous reporters, per surface,
// is at most thirty pushes an hour, instead of 10 × however many addresses
// somebody can rent. For sightings and dispute tips that is also the ceiling on
// rows written. For the two degrading surfaces it is not: rows past the ceiling
// still land (quietly, plus one overflow notice an hour), because a ceiling on
// rows there is a ceiling on rescue.
//
// NO DAY WINDOW, deliberately. It would bound a sustained campaign harder, and
// it would stretch a griefer's silence from an hour to a day, on the surface
// whose whole point is that a report arrives while the animal is still there.
//
// WHERE IT RUNS IN EACH ACTION: after the lookup and the refusals that do not
// write anything (unknown token, not lost, under dispute, nobody to notify),
// immediately before the first write. Two reasons. A submission that is going
// to be refused anyway must not spend the animal's budget. And a caller walking
// random tokens must not double the limiter's write amplification: the
// per-address bucket already writes a fresh pair of rows for every token it is
// handed, and a second bucket ahead of the lookup would write another pair for
// tokens that do not exist. The per-address bucket stays where it is — first,
// before the lookup — because it is what bounds the existence oracle.

import type { CreateNotificationInput } from "@/lib/infra/notification-service";
import type { RateLimitConfig } from "@/lib/infra/rate-limit";

/** Per token, no address. One bucket per surface; derivation above. */
export const ANONYMOUS_REPORT_TOKEN_LIMIT: RateLimitConfig = {
  maxPerMinute: 5,
  maxPerHour: 30,
};

/**
 * Refusal when the ANIMAL's ceiling is full — sightings and dispute tips only.
 * Says nothing about the caller, who may have sent nothing. The two "I have the
 * animal" surfaces never show a refusal for this bucket; see above.
 */
export const ANONYMOUS_REPORT_TOKEN_BUSY =
  "Recibimos muchos avisos sobre esta mascota en la última hora. Probá de nuevo más tarde.";

/**
 * How the owner's copy of a report is delivered once the animal's bucket is
 * full, on the two degrading surfaces. Still written, still carrying the
 * finder's contact, still in the Bandeja under Perdidas — but `warning` rather
 * than `urgent`, which is what keeps it off both push legs
 * (lib/infra/push-eligibility.ts pushes `urgent` and `pet_sighting` only), and
 * `suppressPush` so that stays true even if eligibility later widens.
 */
export const OVER_CEILING_REPORT_DELIVERY = {
  severity: "warning",
  suppressPush: true,
} as const satisfies Pick<CreateNotificationInput, "severity" | "suppressPush">;

/** Notification type of the once-an-hour "reports are piling up" notice. */
export const ANONYMOUS_REPORT_OVERFLOW_NOTIFICATION_TYPE = "anonymous_reports_overflow";

const HOUR_MS = 3_600_000;

/**
 * The owner-side notice that the animal's ceiling was crossed, one row per
 * recipient. Called on EVERY over-ceiling report; the dedupe key is what makes
 * it once per animal per clock hour: `found_overflow:{token}:{hourStart}:{user}`
 * with `hourStart` floored exactly as rate-limit.ts floors the hour bucket, so
 * the notice's hour is the bucket's hour. Shared by both degrading surfaces on
 * purpose — the owner needs to hear "look at the list" once, not once per form.
 *
 * Not a push, like the reports it summarises: the owner has already had up to
 * thirty this hour, and a thirty-first adds nothing but noise.
 */
export function anonymousReportOverflowNotices(input: {
  publicToken: string;
  petId: string;
  petName: string;
  recipientUserIds: readonly string[];
  nowMs: number;
}): CreateNotificationInput[] {
  const hourStart = new Date(Math.floor(input.nowMs / HOUR_MS) * HOUR_MS).toISOString();
  const body = [
    `Llegaron muchos avisos sobre ${input.petName} en la última hora.`,
    "Para no llenarte de alertas, los que sigan llegando hasta que termine la hora se guardan sin sonar:",
    `revisá tus notificaciones de Perdidas y el historial de ${input.petName} para verlos todos.`,
  ].join(" ");
  return input.recipientUserIds.map((userId) => ({
    userId,
    notificationType: ANONYMOUS_REPORT_OVERFLOW_NOTIFICATION_TYPE,
    title: `Muchos avisos sobre ${input.petName}`,
    body,
    ...OVER_CEILING_REPORT_DELIVERY,
    category: "perdidas",
    relatedPetId: input.petId,
    ctaLabel: "Ver mascota",
    ctaUrl: `/mis-mascotas/${input.publicToken}`,
    dedupeKey: `found_overflow:${input.publicToken}:${hourStart}:${userId}`,
  }));
}
