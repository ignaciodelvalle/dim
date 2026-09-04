// Redaction for crash reports — the native twin of `lib/observability/redact.ts`.
//
// WHY THIS EXISTS, AND WHY `sendDefaultPii: false` WAS NOT IT
// ---------------------------------------------------------------------------
// `sendDefaultPii: false` tells the SDK not to ATTACH identifying data of its
// own — IP address, cookies, the user object. It says nothing about the strings
// the app itself throws. Every `Error` message, every breadcrumb, every `extra`
// this app produces went to Sentry verbatim, and this product's error paths
// interpolate exactly the values the schema refuses to hold in cleartext: a DNI
// typed into the claim wizard, the e-mail an account was created with, the
// phone number on a lost-pet form, an access token echoed by a fetch failure.
// The web has answered that since task #56b; the phone had the posture and not
// the mechanism.
//
// The rules are the web's, minus two and plus one, and each difference is
// deliberate:
//
//   · NOT COPIED — `CREDENTIAL_TOKEN_PREFIXES`. The web keeps a hand-written
//     list of twelve namespace prefixes and `redact-prefix-coverage.test.ts`
//     re-derives the true set from the repo on every run so the list cannot go
//     stale in silence. A SECOND transcription, in a package that fence does not
//     scan, would be the stale list without the alarm — the exact failure that
//     file's own docblock warns about. So this module bans the SHAPE instead of
//     enumerating the namespaces (`XX-XXXX-XXXX`), which needs no list and
//     covers a prefix nobody has minted yet.
//   · NOT COPIED — `CAPABILITY_PATH_SEGMENTS`. Same reason, worse: that list is
//     derived from the ROUTER, and the web's fence names what is missing. A copy
//     here would answer for routes it cannot see. What survives of it is the
//     query-parameter rule below, which is shape-based.
//   · KEPT — the JWT and `Authorization` rules, even though the brief for this
//     module named only DNI, e-mail and phone. This app HOLDS a Supabase access
//     token and hands it to every `/api/v1` call, so a fetch failure that echoes
//     its own request headers is the most likely way a live credential reaches a
//     vendor's index from a phone.
//
// FAIL-CLOSED IS THE SAME TRADE the web file records: a run of 7+ digits is
// redacted, which covers the Argentine DNI space (7-8) and bare local phone
// numbers (10), and also eats epoch-millisecond timestamps and large line
// offsets in a stack. A less readable crash report is cheaper than a citizen's
// DNI in someone else's database. Note what it does NOT eat: an Android
// `versionCode`, a build number, a year, an HTTP status — all under seven
// digits, and all of them the things a reader actually needs.

/**
 * Applied IN ORDER; earlier, more specific rules win over later, broader ones.
 *
 * The ordering is load-bearing exactly as it is on the web: the digit catch-all
 * would otherwise consume the digits inside a separated phone number and leave
 * `[redacted:digits]` where `[redacted:phone]` belongs, destroying the one bit
 * of signal a reader needs — what KIND of value was there.
 */
const SCRUB_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // E-mail addresses. Same pattern as the web's.
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: "[redacted:email]",
  },
  // Product credential codes, by SHAPE rather than by namespace list: two to
  // four letters, then two groups of four. Covers every prefix minted today and
  // any minted tomorrow, which is what a copy of the web's list could not do.
  {
    pattern: /\b[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi,
    replacement: "[redacted:credential]",
  },
  // Care-grant tokens: a prefix plus 32 hex. A different shape from every other
  // token in the product, so no credential rule matches it — and the page it
  // opens shows a pet's name, photo and the titular's display name to anybody
  // holding the link.
  {
    pattern: /\bCG-[0-9a-f]{32}\b/gi,
    replacement: "[redacted:grant]",
  },
  // JWTs. Supabase access and refresh tokens are JWTs and this app holds both.
  // The signature segment is NOT optional here: matching only `header.payload`
  // would leave the signature trailing in cleartext, and that is the half that
  // makes the token forgeable.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+/g,
    replacement: "[redacted:jwt]",
  },
  // An unsigned or malformed JWT — still a bearer-shaped blob. A second rule
  // rather than an optional group, so the signed case above can never be
  // satisfied by a prefix of itself.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    replacement: "[redacted:jwt]",
  },
  // `Authorization: Bearer …` echoed into a fetch error message.
  {
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: "[redacted:authorization]",
  },
  // Sensitive URL query / fragment parameters — the value goes, the key stays,
  // so the shape of the failing request is still legible.
  {
    pattern:
      /([?&#][A-Za-z0-9_-]*(?:token|secret|key|password|passwd|pass|auth|session|signature|sig|pepper|code)[A-Za-z0-9_-]*=)[^&#\s"'<>]*/gi,
    replacement: "$1[redacted]",
  },
  // Phone numbers in international / separated form (+54 9 11 1234-5678).
  {
    pattern: /\+\d[\d\s().-]{7,17}\d/g,
    replacement: "[redacted:phone]",
  },
  // Fail-closed catch-all: any bare run of 7+ digits. DNI (7-8) and bare local
  // phone numbers (10). See the header for the accepted collateral.
  {
    pattern: /(?<!\d)\d{7,}(?!\d)/g,
    replacement: "[redacted:digits]",
  },
];

/** Scrubs PII-shaped substrings out of free text (a message, a stack). */
export function redactText(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SCRUB_RULES) {
    // Every rule carries /g; `replace` resets `lastIndex` for us, because these
    // shared instances are never driven with `.exec`.
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Scrubs one context value. Only primitives survive: a string is scrubbed, a
 * finite number / boolean passes through, and anything else (object, array,
 * function, symbol) is dropped.
 *
 * Dropping objects is the point, and it is the web's rule verbatim: an object
 * cannot be scrubbed with confidence — its keys are unknown, it may be a whole
 * session, a `Response`, or a React synthetic event — so the reporter refuses
 * to guess.
 */
export function redactContextValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

/** A bag of caller-supplied context: keys kept, values scrubbed or dropped. */
function redactBag(bag: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bag)) {
    const scrubbed = redactContextValue(value);
    // An undropped key with no value would read as "this field was empty"
    // rather than "this field was refused", so the key goes with it.
    if (scrubbed !== undefined) out[key] = scrubbed;
  }
  return out;
}

/**
 * The breadcrumb shape this module touches. Structural on purpose — naming
 * Sentry's own type here would make the redactor untestable without the SDK,
 * and the SDK is mocked in this package's tests.
 */
export type RedactableBreadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
};

/** The event shape this module touches. Same reasoning as the breadcrumb. */
export type RedactableEvent = {
  message?: string;
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string; type?: string }> };
  breadcrumbs?: RedactableBreadcrumb[];
};

/**
 * Scrub a breadcrumb in place and hand it back.
 *
 * IN PLACE, and returning the same object, because the SDK's `beforeBreadcrumb`
 * hook takes the return value as the breadcrumb: a fresh object would silently
 * drop every field this module does not name (`category`, `level`, `timestamp`,
 * `type`), which are what make a breadcrumb readable.
 */
export function redactBreadcrumb<T extends RedactableBreadcrumb>(breadcrumb: T): T {
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactText(breadcrumb.message);
  }
  if (breadcrumb.data && typeof breadcrumb.data === "object") {
    breadcrumb.data = redactBag(breadcrumb.data);
  }
  return breadcrumb;
}

/**
 * Scrub an event in place and hand it back.
 *
 * Covers the four channels an app-authored string reaches Sentry through: the
 * event `message`, the `value` and `type` of every exception in the chain, the
 * `extra` bag, and the breadcrumb trail attached to the event. The stack FRAMES
 * are deliberately untouched — a frame is a file path plus a function name plus
 * two integers, none of it app-authored text, and scrubbing the integers would
 * destroy the only thing a stack is for.
 *
 * In place, and returning the same object, for the reason `redactBreadcrumb`
 * gives: `beforeSend` takes the return value as the event.
 */
export function redactEvent<T extends RedactableEvent>(event: T): T {
  if (typeof event.message === "string") {
    event.message = redactText(event.message);
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === "string") value.value = redactText(value.value);
      // The exception TYPE too. It is usually a class name, but a thrown string
      // and some SDK adapters land arbitrary text here.
      if (typeof value.type === "string") value.type = redactText(value.type);
    }
  }
  if (event.extra && typeof event.extra === "object") {
    event.extra = redactBag(event.extra);
  }
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) redactBreadcrumb(breadcrumb);
  }
  return event;
}
