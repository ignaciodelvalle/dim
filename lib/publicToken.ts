// Generates short, human-friendly prefixed tokens used in QR tags and public
// URLs. Format: "PREFIX-XXXX-XXXX" where X is from an alphabet that excludes
// visually ambiguous characters (no 0/O, 1/I/l).
//
// Total entropy per chunk: 31^4. Two chunks: 31^8 ≈ 8.5e11 combinations.
// Collision probability is negligible until we have a *lot* of records; add
// a uniqueness check + retry per table when adoption justifies it.
//
// Known prefixes:
//   DIM  — pet credential public token (pets.public_token)
//   LBR  — libreta share token (libreta_share_tokens.share_token)
//   APR  — approval request public token (approval_requests.public_token)

import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars

function randomChunk(len: number): string {
  const random = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[random[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Generate a prefixed, URL-safe identifier in the format `PREFIX-XXXX-XXXX`.
 * Each prefix has its own uniqueness scope (its own table's unique index).
 */
export function generatePrefixedToken(prefix: string): string {
  return `${prefix}-${randomChunk(4)}-${randomChunk(4)}`;
}

/** Backward-compat wrapper — generates a DIM-XXXX-XXXX pet public token. */
export function generatePublicToken(): string {
  return generatePrefixedToken("DIM");
}

/** Generates a LBR-XXXX-XXXX libreta share token. */
export function generateLibretaShareToken(): string {
  return generatePrefixedToken("LBR");
}

/** Generates an APR-XXXX-XXXX approval request public token. */
export function generateApprovalRequestToken(): string {
  return generatePrefixedToken("APR");
}
