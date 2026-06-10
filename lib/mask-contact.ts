// Contact-masking helpers — used by public welfare report pages to show
// reporters their own data without exposing full PII to anyone who has
// the reference code.
//
// Design constraints:
//   - The reporter can still recognise their own info (1 char + domain for
//     email; last 3-4 digits for phone).
//   - Anyone who obtained the code by guessing or forwarding cannot harvest
//     a full email/phone.
//   - Handle malformed inputs defensively (no @, very short locals, short
//     phones) — never throw.

/**
 * Mask an email address, keeping only the first character of the local part
 * and the full domain.
 *
 * Examples:
 *   "juan.perez@gmail.com"  → "j•••@gmail.com"
 *   "a@example.com"         → "a•••@example.com"
 *   "noemail"               → "n•••"   (no domain — best-effort)
 *   ""                      → ""
 */
export function maskEmail(email: string): string {
  if (!email) return email;
  const atIndex = email.indexOf("@");
  if (atIndex === -1) {
    // No @ — mask all but the first character.
    const first = email.slice(0, 1);
    return `${first}•••`;
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex); // includes the "@"
  const first = local.slice(0, 1) || "•";
  return `${first}•••${domain}`;
}

/**
 * Mask a phone number, keeping only the last 3–4 digits.
 *
 * Examples:
 *   "+54 9 11 1234-5678"  → "•••• 5678"
 *   "0800 123 4321"       → "•••• 4321"
 *   "12"                  → "••"   (very short — mask all but last 2)
 *   ""                    → ""
 */
export function maskPhone(phone: string): string {
  if (!phone) return phone;
  // Strip everything that is not a digit to count significant digits.
  const digits = phone.replace(/\D/g, "");
  // Keep last 4 digits (or fewer when the number is very short).
  const keepCount = Math.min(4, Math.max(2, digits.length - 4));
  const visibleDigits = digits.slice(-keepCount);
  return `•••• ${visibleDigits}`;
}
