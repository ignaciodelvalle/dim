// Redaction layer for client-side error reports (task #56b).
//
// WHY THIS EXISTS, AND WHY IT IS NOT OPTIONAL
// ---------------------------------------------------------------------------
// The moment `lib/observability/report-error.ts` forwards anything to a third
// party, every string in the report leaves Argentina's jurisdiction and lands
// in someone else's database. A stack trace is NOT obviously PII-free: it
// carries function arguments, the URL of the page (path segments AND query
// string), and whatever a thrown `Error` chose to interpolate into its message.
// This repo handles citizen DNIs, home addresses, phone numbers and pet health
// data bound to named people, so the checklist in AGENTS.md
// (§ Privacidad y manejo de datos) applies to the telemetry path exactly as it
// applies to a public route:
//
//   - Rule 1, "No DNI in plaintext" — migration 0106 dropped
//     `profiles.dni_number` so the DNI cannot be read from the database. A DNI
//     interpolated into an error message would reintroduce, in a third-party
//     SaaS, precisely the cleartext the schema refuses to hold.
//   - Rule 3, "Never return raw event payloads" — the same reasoning applies to
//     a raw context blob: project the fields you need, never ship the bag.
//   - Rule 4, "Privacy predicates in the query, not the render layer" — the
//     structural analogue here is that redaction happens in this module, once,
//     before the sink is handed anything. Not at each call site, and never
//     inside a provider's SDK config.
//
// THE TWO MECHANISMS, AND WHY THERE ARE TWO
// ---------------------------------------------------------------------------
// Free text (`message`, `stack`) cannot be allowlisted — it is authored by
// whatever threw. So it gets a *scrubber*: a denylist of PII shapes, applied
// fail-closed.
//
// Structured context is caller-supplied and CAN be allowlisted, so it is:
// `report-error.ts` keeps a closed set of keys. Keys are allowlisted
// (structure), values are still scrubbed (content). Both, because either alone
// leaks: an allowlisted `homeHref` really does carry a live capability token
// today (`app/org/[orgToken]/error.tsx` passes `/org/${orgToken}`), and a
// scrubber alone would let any new call site attach a whole user object.
//
// FAIL-CLOSED IS A DELIBERATE TRADE
// ---------------------------------------------------------------------------
// A run of 7+ digits is redacted. That covers the Argentine DNI space (7–8
// digits) and bare phone numbers (10), and it also eats epoch-millisecond
// timestamps and very large line offsets that happen to appear in a stack. That
// collateral is accepted on purpose: the cost of a false positive is a less
// readable log line, and the cost of a false negative is a citizen's DNI in a
// vendor's index. Those are not comparable, so the rule does not try to be
// clever about telling them apart.

/** Applied in order; earlier, more specific rules win over later, broader ones. */
const SCRUB_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Email addresses.
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: "[redacted:email]",
  },
  // Product credential codes: DIM- (pet public token), CAS- (case), DEN-
  // (denuncia). Format is `PREFIX-XXXX-XXXX` — see db/schema.ts:462.
  {
    pattern: /\b(?:DIM|CAS|DEN)-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi,
    replacement: "[redacted:credential]",
  },
  // JWTs (Supabase access/refresh tokens are JWTs and DO reach the browser).
  {
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]+)?/g,
    replacement: "[redacted:jwt]",
  },
  // `Authorization: Bearer …` / `Basic …` echoed into a fetch error message.
  {
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: "[redacted:authorization]",
  },
  // Capability tokens carried as a URL PATH segment. These are the unguessable
  // bearer strings behind `/libreta/compartir/:shareToken`, `/org/:orgToken`,
  // `/cuidado/:token` — holding the string IS the authorization, so a leaked
  // one is a live grant, not merely an identifier.
  {
    pattern: /\/(org|cuidado|compartir|adoptar|mis-mascotas|p)\/[A-Za-z0-9_-]{6,}/gi,
    replacement: "/$1/[redacted:token]",
  },
  // Sensitive URL query/fragment parameters — value replaced, key kept so the
  // shape of the failing request is still legible.
  {
    pattern:
      /([?&#][A-Za-z0-9_-]*(?:token|secret|key|password|passwd|pass|auth|session|signature|sig|pepper|code)[A-Za-z0-9_-]*=)[^&#\s"'<>]*/gi,
    replacement: "$1[redacted]",
  },
  // Phone numbers written in international / separated form (+54 9 11 1234-5678).
  {
    pattern: /\+\d[\d\s().-]{7,17}\d/g,
    replacement: "[redacted:phone]",
  },
  // Fail-closed catch-all: any bare run of 7+ digits. Covers DNI (7–8) and bare
  // local phone numbers (10). See the header note on the accepted trade.
  {
    pattern: /(?<!\d)\d{7,}(?!\d)/g,
    replacement: "[redacted:digits]",
  },
];

/**
 * Scrubs PII-shaped substrings out of free text (an error message or stack).
 *
 * Order-dependent by construction: specific shapes are consumed before the
 * broad digit catch-all can fragment them.
 */
export function redactText(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SCRUB_RULES) {
    // Each rule carries the /g flag; `replace` resets lastIndex for us because
    // we never call `.exec` on these shared instances.
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Scrubs a single context value. Only primitives survive: a string is scrubbed,
 * a finite number / boolean passes through, and anything else (object, array,
 * function, symbol) is dropped to `undefined`.
 *
 * Dropping objects is the point. An object cannot be scrubbed with confidence —
 * its keys are unknown, it may be a React synthetic event, a whole `profile`
 * row, or a `Response` — so the reporter refuses to guess.
 */
export function redactContextValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}
