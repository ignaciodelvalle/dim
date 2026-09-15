// The two ceilings a password-recovery request spends, derived ONCE.
//
// ===========================================================================
// WHY THIS FILE IS HERE AND NOT IN `lib/infra/api-v1-limits.ts`
// ===========================================================================
// That file is named for the surface it bounds: it holds the per-IP families of
// `/api/v1`, and its fence (`__tests__/api-v1-rate-limit-families.test.ts`)
// collects `api_v1_*` bucket literals out of `app/api/v1/**/route.ts`. These two
// buckets are neither. They are spent INSIDE the use-case, by both transports,
// and they are named `auth_password_reset_*` for the same reason `auth_login_ip`
// and `auth_signup_ip` are: the ceiling belongs to the ACT, not to the door the
// act came through.
//
// That is the load-bearing property and it is worth stating plainly, because it
// is the one a second endpoint quietly breaks. `api-v1-limits.ts` puts it in one
// sentence about a different bucket — "a ceiling that belongs to the transport is
// a ceiling a caller escapes by using the other door" — and a phone is now the
// other door. An attacker who exhausts an address's recovery budget on
// `/recuperar` does not get a fresh one at `POST /api/v1/auth/password-reset`,
// and vice versa, because there is one `requestPasswordReset` and it spends these
// two before GoTrue is touched.
//
// ===========================================================================
// THE DERIVATION
// ===========================================================================
// Both numbers moved when the phone arrived (WU-R-1). They were 3/min · 15/hr per
// IP and 5/hr per email, and both were derived for a BROWSER — one person, one
// residential or office address, one tab. The per-email half survives that change
// unaltered and the per-IP half does not, for a reason `api-v1-limits.ts` spent a
// whole section on and this file only has to apply.
//
// ---------------------------------------------------------------------------
// PER EMAIL: 5/hr — UNCHANGED, and it is the anchor everything else hangs off
// ---------------------------------------------------------------------------
// This is the bucket that bounds a PERSON, and it is immune to carrier NAT for a
// structural reason rather than a lucky one: a gateway shares addresses, not
// mailboxes. Five recovery mails an hour to one address is already more than
// anybody legitimately needs — the flow is "ask once, read the mail" — and it is
// what stops the endpoint being a mail-bomb aimed at somebody's inbox.
//
// It is keyed on `emailRateLimitKey(email)`, the SHA-256 of the normalized
// address, so `rate_limit_buckets` never holds a cleartext address. The key is
// the same one `auth_login_email` uses, which is what makes "this account is
// under attack" a fact the two surfaces share rather than two half-counts.
//
// NO PER-MINUTE WINDOW, deliberately, and it is not an omission. GoTrue enforces
// its own `max_frequency` between two recovery mails to the same address
// (supabase/config.toml), so the sub-minute case is already bounded a layer down;
// adding a second counter here would be a second, weaker copy of a rule that is
// not ours.
//
// ---------------------------------------------------------------------------
// PER IP: 3/min → 12/min, 15/hr → 60/hr
// ---------------------------------------------------------------------------
// TWELVE SIMULTANEOUS LEGITIMATE CALLERS, in both windows. The multiple is
// `API_V1_ACCOUNT_SECURITY_IP_LIMIT`'s and so is the argument: the per-email
// bucket is where the thinking is, so the per-IP bucket's job is to stay far
// enough above it that the EMAIL bucket is the binding constraint for any
// plausible number of simultaneous legitimate resetters behind one address.
//
// WHAT TWELVE IS MULTIPLIED BY IS NOT THE SAME NUMBER IN BOTH WINDOWS, and the
// docblocks in `api-v1-limits.ts` record what happens when that difference gets
// rounded into a single factor in prose ("12× the per-user ceiling", flat, when
// only the per-minute half was):
//
//   per hour     60 = 12 × 5    twelve mailboxes at their full hourly ceiling
//   per minute   12 = 12 × 1    twelve people, one request each, same minute
//
// The per-minute anchor is 1 and not 5 because of what the ACT is: you ask once
// and then go read your mail. A second request inside the same minute is a person
// who did not see the first one land, not a person using the feature — and
// GoTrue's own `max_frequency` refuses it a layer down anyway.
//
// WHY IT HAD TO MOVE AT ALL, which is the part that is about a phone. The old
// 15/hr was sized against a browser and it refused the SIXTEENTH person behind
// one carrier gateway — and the act it refuses is the one that gets a locked-out
// person back in. `/me/revoke-sessions` records the identical finding for the
// identical reason ("a limiter sized against an office is sized against the wrong
// caller"), and its failure mode is the twin of this one: there, you cannot sign
// out of the phone you lost; here, you cannot get back into the phone you still
// have. A closed-testing group onboarding onto one mobile carrier in one
// afternoon is not a hypothetical shape — it is the shape this work unit exists
// for.
//
// WHAT IT GIVES UP, stated rather than hidden. One address can now trigger 60
// recovery mails an hour instead of 15. That is 4× the mail volume from a single
// source and it is a real cost, paid to a mail reputation we do not own. Three
// things bound what it buys an attacker, and none of them is this bucket:
//
//   1. MAIL-BOMBING ONE PERSON IS UNCHANGED. 60/hr per address requires at least
//      twelve DISTINCT mailboxes, because each is independently capped at 5/hr.
//      The bucket that protects a victim did not move.
//   2. ENUMERATION IS UNCHANGED, and it was never this bucket's job. The response
//      is byte-identical for an address with an account and one without — see
//      `request-password-reset.ts`, where the GoTrue error is ignored ON PURPOSE
//      — so spending the budget faster buys an attacker nothing but 429s.
//   3. GoTrue's OWN `email_sent` ceiling sits underneath both of these and is not
//      ours to raise from here.
//
// WHAT WOULD RE-DERIVE IT: real telemetry. The adoption figure `api-v1-limits.ts`
// sizes its families against (10% of subscribers behind a gateway) is a guess
// about a product that has not launched, and it is the first thing to revisit
// when there is a measurement. This file does not use that figure — it is
// anchored on the per-email ceiling instead, which is why it is the sturdier of
// the two derivations and why it does not need to move when adoption does.

import type { RateLimitConfig } from "@/lib/infra/rate-limit";

/**
 * Per caller IP. Twelve simultaneous legitimate callers, in both windows — 60/hr
 * is twelve mailboxes at their full hourly ceiling, 12/min is twelve people
 * asking once each. See the header for why the two anchors differ.
 *
 * Keyed on `callerIp(headers)` — the trusted edge value (`x-real-ip` / the LAST
 * `x-forwarded-for` hop), never the spoofable first segment. A client that could
 * choose its own key would make this decoration.
 */
export const PASSWORD_RESET_IP_LIMIT: RateLimitConfig = {
  maxPerMinute: 12,
  maxPerHour: 60,
};

/**
 * Per email address — the anchor, and the bucket that bounds a PERSON.
 *
 * Keyed on `emailRateLimitKey(email)` so no cleartext address is persisted in
 * `rate_limit_buckets`.
 */
export const PASSWORD_RESET_EMAIL_LIMIT: RateLimitConfig = {
  maxPerHour: 5,
};

/**
 * How many simultaneous legitimate callers behind one address the per-IP ceiling
 * is sized for. Named rather than transcribed into two places.
 *
 * `__tests__/api-v1-auth-password-reset-route.test.ts` asserts the RELATIONSHIP
 * rather than the two constants, so that raising the per-email anchor without
 * raising the per-IP ceiling — which would put the IP bucket back in front of the
 * email one and invert the whole derivation — fails loudly instead of quietly
 * narrowing the surface that gets a locked-out person back in.
 */
export const PASSWORD_RESET_SIMULTANEOUS_CALLERS = 12;

/**
 * What ONE legitimate caller spends in a minute: one request. The per-minute
 * anchor, spelled out because it is not the per-email hourly ceiling and a reader
 * re-deriving `12` will otherwise reach for the only other number in the file.
 */
export const PASSWORD_RESET_REQUESTS_PER_CALLER_PER_MINUTE = 1;

// ===========================================================================
// THE REDEMPTION HALF: code guesses on the WEB (verify-password-reset-code.ts)
// ===========================================================================
// A different act from the request above, so different buckets — spending a
// guess must not eat the budget that mails a fresh code, or a person who
// mistyped twice could no longer ask for a new one.
//
// WHY OURS AT ALL. The phone redeems against GoTrue directly, where GoTrue's own
// `token_verifications` ceiling is keyed on the phone's address. The web redeems
// from OUR server, so every browser reaches GoTrue from one egress address and
// that ceiling becomes a pool all web users share. The per-attacker bound on
// guesses has to be spent here, before GoTrue is touched.
//
// PER EMAIL: 5/min · 15/hr — the anchor, and the bucket that bounds guesses
// against ONE account's code. A legitimate person types one code, perhaps
// mistypes it once or twice, perhaps asks for another one: 15 an hour is several
// full retries on top of that. Against a six-digit code (10^6) it caps a
// targeted guesser at 15 tries per hour per address, and the address can only be
// sent 5 codes an hour (PASSWORD_RESET_EMAIL_LIMIT). The per-minute window stops
// a burst from spending the whole hour before the person can react.
//
// PER IP: 12 × the per-email anchor in both windows, the same "twelve
// simultaneous legitimate callers behind one gateway" multiple the request
// buckets use, and for the same reason — the per-email bucket is where the
// thinking is, so the IP bucket must stay far enough above it that the email
// bucket is the binding one for real people behind a carrier NAT. It bounds a
// spray across many addresses; each guess there succeeds with probability 10^-6.

const VERIFY_GUESSES_PER_EMAIL_PER_MINUTE = 5;
const VERIFY_GUESSES_PER_EMAIL_PER_HOUR = 15;

/** Per hashed email address — the anchor. Keyed on `emailRateLimitKey(email)`. */
export const PASSWORD_RESET_VERIFY_EMAIL_LIMIT: RateLimitConfig = {
  maxPerMinute: VERIFY_GUESSES_PER_EMAIL_PER_MINUTE,
  maxPerHour: VERIFY_GUESSES_PER_EMAIL_PER_HOUR,
};

/** Per trusted caller IP — twelve simultaneous callers at the per-email ceiling. */
export const PASSWORD_RESET_VERIFY_IP_LIMIT: RateLimitConfig = {
  maxPerMinute: PASSWORD_RESET_SIMULTANEOUS_CALLERS * VERIFY_GUESSES_PER_EMAIL_PER_MINUTE,
  maxPerHour: PASSWORD_RESET_SIMULTANEOUS_CALLERS * VERIFY_GUESSES_PER_EMAIL_PER_HOUR,
};
