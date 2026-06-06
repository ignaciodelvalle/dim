// Short reference code for anonymous welfare denuncias.
// Format: DEN-XXXX-XXXX using an unambiguous alphabet (no 0/O, no 1/I/l).
// Entropy ~8.5e11 combinations — generation does collision-check + retry at
// the repository layer (insertReportWithRetry handles 23505 loops).
//
// Uses Web Crypto (globalThis.crypto.getRandomValues) instead of node:crypto
// so this module can also be imported by client components (the
// /denuncias/buscar form imports the normalize + format-validate helpers).
// Web Crypto is available in Node 20+ and all modern browsers.
//
// Extracted verbatim from lib/welfare-codes.ts; lib/welfare-codes.ts becomes
// a re-export shim of this file.

/** Unambiguous alphabet: uppercase, no 0/O, no 1/I/l. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars

/**
 * Generate a candidate reference code of the shape DEN-XXXX-XXXX.
 * Uniqueness is NOT guaranteed here — the repository layer handles the
 * collision-retry loop (ON CONFLICT / pg 23505).
 */
export function generateReferenceCode(): string {
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  let code = "DEN-";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[random[i] % ALPHABET.length];
    if (i === 3) code += "-";
  }
  return code;
}

/** Regex for the canonical DEN-XXXX-XXXX format. Only uppercase allowed. */
const FORMAT_RE = /^DEN-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

/**
 * Normalize user input to the canonical code shape:
 *  - trim whitespace
 *  - uppercase
 *  - collapse internal whitespace (handles "DEN - ABCD - EFGH" → "DEN-ABCD-EFGH")
 */
export function normalizeReferenceCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Returns true if `input` matches the DEN-XXXX-XXXX format with the
 * unambiguous alphabet (uppercase, no 0/O, no 1/I/l).
 */
export function isValidReferenceCodeFormat(input: string): boolean {
  return FORMAT_RE.test(input);
}
