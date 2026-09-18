// Unsubscribe capability for the daily operator digest — "works without
// login, is unguessable, and cannot flip anyone else's account".
//
// SHAPE mirrors lib/infra/denuncia-reporter-token.ts / apply-intent.ts /
// microchip-force-token.ts / tattoo-ack-token.ts (one token shape to audit in
// this repo, not five): base64url(hex(hmac)), signed over a purpose string
// that binds the MAC to exactly one user and one action, so a token minted
// for THIS purpose can never be replayed as a session cookie or any other
// capability those siblings mint.
//
// NO TIMESTAMP / NO TTL, and that is a deliberate difference from the
// siblings above. An unsubscribe link has to keep working for as long as the
// digest keeps arriving — it rides in an email a person may open a week
// later — so there is no expiry to encode and nothing to check an age
// against. What makes it SAFE without a TTL is what the capability actually
// DOES: it can only ever flip `daily_digest_opt_out` to true for the ONE
// userId baked into the MAC. Replaying an old link is a no-op (idempotent —
// it just re-confirms "stop mailing me"), and it can never be used to opt
// someone ELSE out, read anything, or perform any other write. The only way
// to revoke every outstanding link at once is to rotate the signing key,
// which is the same global-revoke story the siblings tell.
//
// Signing key: DIGEST_UNSUBSCRIBE_SECRET → SUPABASE_SERVICE_ROLE_KEY → dev
// fallback, failing closed in production — same resolution order as every
// sibling token in this file's header comment.

import { createHmac, timingSafeEqual } from "node:crypto";

const PURPOSE = "daily_digest_unsubscribe";

function getSigningKey(): string {
  if (process.env.DIGEST_UNSUBSCRIBE_SECRET) return process.env.DIGEST_UNSUBSCRIBE_SECRET;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DIGEST_UNSUBSCRIBE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set in production.",
    );
  }
  return "dim-dev-fallback-key-not-for-production";
}

function payload(userId: string): string {
  return `${PURPOSE}:${userId}`;
}

/** Mint an unsubscribe capability for `userId`. Deterministic (no timestamp) —
 * the same link can be reissued into every digest without re-minting. */
export function generateDigestUnsubscribeToken(userId: string): string {
  const mac = createHmac("sha256", getSigningKey()).update(payload(userId)).digest("hex");
  return Buffer.from(mac, "hex").toString("base64url");
}

/**
 * True when `token` is a live unsubscribe capability for exactly `userId`.
 * Fails closed on every malformed input; comparison is timing-safe.
 */
export function validateDigestUnsubscribeToken(userId: string, token: string): boolean {
  try {
    if (!userId || !token) return false;
    const expectedMac = createHmac("sha256", getSigningKey()).update(payload(userId)).digest("hex");
    const expectedBuf = Buffer.from(expectedMac, "hex");
    const actualBuf = Buffer.from(token, "base64url");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
