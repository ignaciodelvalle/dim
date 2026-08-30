// What a person may spend submitting adoption applications, derived once.
//
// THE BOARD ASKED FOR THIS BY NAME. `docs/agents/open-work.md`'s WU-U row reads
// "The application flow earns its own rate limit here", and the emphasis is on
// FLOW: until now neither door had one. The web action has spent no budget
// since the surface shipped, so the ceiling below is not a native-only control
// bolted onto a native-only endpoint — it lives in the USE-CASE, and the web
// form and the phone spend the same counter. A ceiling that belongs to the
// transport is a ceiling a caller escapes by using the other door.
//
// ===========================================================================
// WHAT THE ACT IS, WHICH IS WHY NO EXISTING FAMILY FITS
// ===========================================================================
// Every write already on `/api/v1` acts on the CALLER'S OWN records: their
// animal's identity, their inbox, their session list, their account. This one
// writes into somebody else's working queue. One submission
//
//   · appends an `adoption_application_submitted` row to the spine,
//   · opens a `case` (or joins an open one),
//   · fans out up to 25 notification rows to the shelter's admins and
//     coordinators — `findOrgMembersForNotify` caps at 25, and that cap IS the
//     write's real cost per request,
//   · and lands a free-text letter about a stranger in a review queue a human
//     has to read.
//
// The last clause is the one no cost model captures and it is what the ceiling
// is really for. The abuse here is not hammering: a duplicate application for
// the SAME pet is refused by `findExistingApplication`, so spamming one animal
// is already impossible. The abuse is BREADTH — one account applying to every
// listed animal in the country, which fills every shelter's queue at once and
// costs each of them the one resource this product cannot give them back, which
// is somebody's attention. A rate limit is the only instrument that touches it.
//
// ===========================================================================
// THE PER-USER ANCHOR: 5/min · 15/hr · 30/day
// ===========================================================================
// PER MINUTE — 5. What a person does here is fill a form: a housing type, a
// prior-pets answer, and a motivation the domain requires be at least thirty
// characters of hand-written Spanish. Nobody produces two of those in a minute.
// The five is not for the person, it is for the RETRIES — a submit on 4G that
// timed out, the tap that did not register, the second attempt after a
// `temporarily_unavailable`. Three would also cover that and five costs nothing:
// the binding window here is the day.
//
// PER HOUR — 15. Somebody browsing the catalogue in one evening and applying to
// the animals that resonate. Three or four is already a lot of letters; fifteen
// is generous for a person and short of a script by an order of magnitude.
//
// PER DAY — 30, AND THIS IS THE ONE THAT BINDS. A carpet-bomb is not bounded by
// its best minute — it is a slow loop, and the hourly window resets 24 times
// while it runs. Thirty applications in a day is not a person choosing a
// companion animal; it is somebody filling queues. The failure mode of being
// refused is a 429 with a `retry-after` on an act that is deliberate and not
// urgent — unlike a lost pet, nothing gets worse while you wait.
//
// TIGHTER THAN EVERY OTHER PER-USER WRITE ON THE SURFACE, on purpose. The
// current floor is `API_V1_MEDIA_UPLOAD_USER_LIMIT` (12/min · 48/hr · 120/day),
// whose docblock calls itself "the tightest per-user WRITE budget on this
// surface" and derives that from ≈15 MB of object-store traffic per photo. This
// one is tighter on all three windows, and the reason is not that it costs us
// more — it costs us less. It is that the resource being spent is not ours.
//
// ===========================================================================
// THE PER-IP CEILING: 60/min · 180/hr
// ===========================================================================
// Twelve simultaneous callers at their own full per-user rate, flat on both
// windows — `API_V1_SIMULTANEOUS_CALLERS`, the same twelve
// `API_V1_ACCOUNT_SECURITY_IP_LIMIT` and `API_V1_INBOX_STATE_IP_LIMIT` use, and
// FLAT for their reason rather than the write family's split one: the per-user
// pair (5/min, 15/hr) is already proportionate, so 12× on both windows preserves
// its shape instead of propagating a deliberate narrowing.
//
// The per-IP bucket's job on this surface is NOT to bound the act — the per-user
// one does that, and carrier NAT cannot dilute it because identities are not
// shared. It is to refuse an unauthenticated hammer before the GoTrue round-trip
// runs. Twelve people behind one carrier gateway submitting adoption
// applications inside the same minute is already a stretch; being refused at the
// thirteenth is a bound, not a shape.
//
// WHAT IT GIVES UP, stated as `lib/infra/api-v1-limits.ts` states it for every
// sibling: the IP bucket runs BEFORE the liveness guard, so 60/min is 60 GoTrue
// round-trips a minute a caller holding a well-formed but invalid token can
// force from one address. That is the lowest exposure of any bucket on the
// surface, which is where it belongs.
//
// ===========================================================================
// WHERE THE PER-IP HALF BELONGS, AND WHY IT IS TEMPORARILY HERE
// ===========================================================================
// `API_V1_ADOPTION_APPLICATION_IP_LIMIT` BELONGS IN `lib/infra/api-v1-limits.ts`
// AND IS NOT THERE. That file is another worktree lane's territory in this
// window (declaring its own buckets is that lane's blocking task), and editing
// it from here would collide on the one file the whole `/api/v1` surface shares.
// So the constant is defined beside its use-case with the derivation above, and
// the move is a hand-off rather than a decision left open.
//
// `__tests__/api-v1-rate-limit-families.test.ts` IS RED UNTIL THAT MOVE HAPPENS,
// deliberately and with a green build: the fence collects every `api_v1_*`
// bucket a route spends on `callerIp(` and requires each to be declared in
// `API_V1_IP_BUCKET_FAMILIES`. The three this lane adds are not, because that
// map is in the file above. The exact hand-off is written in the lane's summary
// and repeated here so it survives the summary:
//
//   1. MOVE `API_V1_ADOPTION_APPLICATION_IP_LIMIT` below into
//      `lib/infra/api-v1-limits.ts` verbatim, with a docblock pointing back
//      here for the per-user anchor (the shape
//      `API_V1_ACCOUNT_SECURITY_IP_LIMIT` already uses for `revoke-sessions`).
//   2. ADD `"adoption-application"` to `ApiV1IpFamily` and to
//      `API_V1_IP_FAMILIES`.
//   3. ADD three entries to `API_V1_IP_BUCKET_FAMILIES`:
//        api_v1_adoptions_read_ip:            "authenticated-read"
//        api_v1_adoption_apply_ip:            "adoption-application"
//        api_v1_me_adoption_applications_ip:  "authenticated-read"
//   4. In `__tests__/api-v1-rate-limit-families.test.ts`: add
//      `API_V1_ADOPTION_APPLICATION_IP_LIMIT: "adoption-application"` to
//      `FAMILY_OF_SHARED_CEILING`, add `"adoption-application"` to
//      `WRITE_FAMILIES`, and move the aggregate pin from 10.224 to 11.484
//      (+600 catalogue/ficha read, +600 mis-postulaciones read, +60 apply).
//   5. Raise `MIN_V1_ROUTE_FILES` in `scripts/check-api-v1-envelope.ts` by the
//      number of route files that landed — this lane adds three, and its own
//      raise is in the same commit as the routes.
//
// Until step 1, the ROUTE spends this constant and `familyFromCeiling` resolves
// it to `route-local`. That is the honest reading — the route does own its own
// number today — and it is exactly what the fence is built to refuse. Naming the
// bucket something other than `api_v1_*` to slip past the collector was
// considered and rejected: it would make the fence quiet about a real gap, which
// is the failure `public-token-throttle.ts` records and this repo keeps paying
// for.

import type { RateLimitConfig } from "@/lib/infra/rate-limit";

/**
 * ONE bucket for both transports, keyed on the applicant.
 *
 * Not `api_v1_…`, for the reason `SUBJECT_DATA_ERASURE_USER_BUCKET` and
 * `REVOKE_SESSIONS_USER_BUCKET` give: a name that says `api_v1` on a call from a
 * web form reads like a different budget, and the whole point is that it is not
 * one.
 */
export const ADOPTION_APPLICATION_USER_BUCKET = "adoption_application_user";

/**
 * The bucket that actually bounds a PERSON, spent inside
 * `submitAdoptionApplication` so the web form and the bearer door share it.
 *
 * Full derivation in the header. The DAY window is the binding one and the only
 * one that touches the abuse this exists for; the two shorter windows are there
 * so a runaway client cannot spend the day's budget in ninety seconds.
 */
export const ADOPTION_APPLICATION_USER_LIMIT: RateLimitConfig = {
  maxPerMinute: 5,
  maxPerHour: 15,
  maxPerDay: 30,
};

/**
 * Per IP — 12× the per-user anchor, flat on both windows.
 *
 * TEMPORARILY IN THIS FILE. Its home is `lib/infra/api-v1-limits.ts`; see the
 * five-step hand-off in the header for why it is not there yet and exactly what
 * moving it requires.
 */
export const API_V1_ADOPTION_APPLICATION_IP_LIMIT: RateLimitConfig = {
  maxPerMinute: 60,
  maxPerHour: 180,
};

/**
 * The multiple the ceiling above is derived from — the same twelve
 * `API_V1_SIMULTANEOUS_CALLERS` names, restated here rather than imported so
 * that this file's arithmetic is readable on its own and so that moving the
 * constant to `api-v1-limits.ts` is a copy rather than an untangling.
 *
 * `adoption-application-limits.test.ts` asserts the relationship rather than the
 * digits: a per-USER raise must not silently carry a twelvefold per-IP raise
 * with it, which is `login-limits.ts`'s own reason for keeping both as literals
 * and pinning the product.
 */
export const ADOPTION_APPLICATION_SIMULTANEOUS_CALLERS = 12;

/** The es-AR sentence both surfaces show when the budget is spent. */
export const ADOPTION_APPLICATION_RATE_LIMITED_COPY =
  "Enviaste varias postulaciones seguidas. Esperá un rato y volvé a intentar.";
