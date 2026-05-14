// Generates the short, human-friendly public token printed on QR tags and used
// in /p/{token} URLs. Format: "DIM-XXXX-XXXX" where X is from an alphabet that
// excludes visually ambiguous characters (no 0/O, 1/I/l).
//
// Total entropy: 31^8 ≈ 8.5e11 combinations. Collision probability is
// negligible until we have a *lot* of pets; we'll add a uniqueness check + retry
// when adoption justifies it.

import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars

export function generatePublicToken(): string {
  const random = randomBytes(8);
  let token = "DIM-";
  for (let i = 0; i < 8; i++) {
    token += ALPHABET[random[i] % ALPHABET.length];
    if (i === 3) token += "-";
  }
  return token;
}
