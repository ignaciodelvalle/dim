// Short reference code for anonymous welfare denuncias.
// Format: DEN-XXXX-XXXX using the same unambiguous alphabet as
// publicToken.ts (no 0/O, no 1/I/l). Entropy ~8.5e11 combinations —
// generation does collision-check + retry against the database.

import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars

export function generateReferenceCode(): string {
  const random = randomBytes(8);
  let code = "DEN-";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[random[i] % ALPHABET.length];
    if (i === 3) code += "-";
  }
  return code;
}

const FORMAT_RE = /^DEN-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

export function normalizeReferenceCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidReferenceCodeFormat(input: string): boolean {
  return FORMAT_RE.test(input);
}
