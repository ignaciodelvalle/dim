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
//   · It is a griefing primitive. Still true, and bounded rather than denied:
//       1. The per-address bucket runs FIRST, so one address spends at most its
//          own 10/hr of the animal's 30. Silencing an animal for an hour takes
//          three addresses working the whole hour.
//       2. Every surface has its own bucket, so a flood of fake sightings cannot
//          silence a "la tengo conmigo".
//       3. The refusal says what still works (below) instead of the per-address
//          copy "ya enviaste un aviso", which is false for a caller who sent
//          nothing.
//     And the alternative is not "no griefing": without a cap the same griefer
//     buries the real report under an unlimited number of false ones, and the
//     owner cannot find the one that matters. The cap makes the flood finite.
//
// ---------------------------------------------------------------------------
// THE NUMBERS — anchored on the per-(address, token) bucket all four spend
// ---------------------------------------------------------------------------
//   per minute    5 = five different people reporting the same animal inside
//                     the same sixty seconds, at their own 1/min each
//   per hour     30 = 3 × one address's hourly 10 — the fewest addresses that
//                     can exhaust it together is three
//
// So what an owner can receive from anonymous reporters, per surface, is at
// most thirty notifications an hour — and for the three that write, thirty
// rows on the spine or the case timeline — instead of 10 × however many
// addresses somebody can rent.
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

import type { RateLimitConfig } from "@/lib/infra/rate-limit";

/** Per token, no address. One bucket per surface; derivation above. */
export const ANONYMOUS_REPORT_TOKEN_LIMIT: RateLimitConfig = {
  maxPerMinute: 5,
  maxPerHour: 30,
};

/**
 * Refusal when the ANIMAL's ceiling is full — sightings and dispute tips. Says
 * nothing about the caller, who may have sent nothing.
 */
export const ANONYMOUS_REPORT_TOKEN_BUSY =
  "Recibimos muchos avisos sobre esta mascota en la última hora. Probá de nuevo más tarde.";

/**
 * The same refusal for the two reports whose sender HAS the animal: it has to
 * say what still works without us.
 */
export const ANONYMOUS_REPORT_TOKEN_BUSY_WITH_ANIMAL =
  "Recibimos muchos avisos sobre esta mascota en la última hora y no podemos enviar otro ahora. " +
  "Si la credencial muestra un teléfono, llamá directamente; si no, una veterinaria o un refugio " +
  "puede leer su microchip. Probá de nuevo más tarde.";
