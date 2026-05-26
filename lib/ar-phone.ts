// Argentine phone-number heuristics.
//
// The regex below recognizes the most common written forms in Argentina:
//   +54 9 11 1234-5678 | +5491112345678 | 011 15-1234-5678 | 11 1234-5678
//
// We use it ONLY as a soft client-side hint — not as server-side rejection.
// Older landlines, satellite phones, foreign numbers, etc. should all save
// without error; the warning just nudges the user to double-check.

export const AR_PHONE_RE =
  /^(\+?54\s?9?\s?\d{2,4}[\s-]?\d{4}[\s-]?\d{4}|0\d{2,4}\s?(?:15[\s-]?)?\d{4}[\s-]?\d{4}|\d{2,4}[\s-]?\d{4}[\s-]?\d{4})$/;

export function looksLikeArPhone(value: string): boolean {
  const trimmed = value.replace(/\s/g, " ").trim();
  return trimmed === "" || AR_PHONE_RE.test(trimmed);
}
