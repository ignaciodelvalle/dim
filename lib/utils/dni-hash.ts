// DNI hashing helper — Wave 5 Item 25a.
//
// No DNI in plaintext rule (Ley 25.326 / Mi Argentina premise): the application
// never stores a DNI number in cleartext after migration 0106. Instead it stores:
//   - `dni_hash`  — HMAC-SHA256(dni, DNI_HASH_PEPPER) hex — equality-matching only.
//   - `dni_last4` — right(dni, 4) — human disambiguation in operator UI only.
//
// Pepper: DNI_HASH_PEPPER env var (server-side only, never shipped to the client).
// For local development and tests use DNI_HASH_PEPPER="dim-test-pepper-v1".
// The production value MUST be a secret set in the deployment environment /
// KMS — if it is leaked the hash table can be reversed via rainbow table for
// the finite Argentine DNI space (7–8 digits).
//
// TODO(25b): once the Mi Argentina OIDC callback lands, `verifyDniForUser` and
// `completeIdentityAction` will be replaced by the OAuth claim path. The helper
// here stays — the same HMAC logic is used in both the legacy and OIDC paths.

import { createHmac } from "node:crypto";

// Fallback pepper for local development / tests. MUST NOT be used in prod.
const DEV_TEST_PEPPER = "dim-test-pepper-v1";

function getPepper(): string {
  const pepper = process.env.DNI_HASH_PEPPER;
  if (pepper) return pepper;
  // Fail closed in production (deploy-readiness audit 2026-07-04 B1): the dev
  // pepper is PUBLIC (committed above), and the Argentine DNI space is small
  // enough (7-8 digits) that a known pepper makes every stored hash reversible
  // by rainbow table. Silently falling back would poison every hash written
  // until someone noticed — better to refuse to boot the identity path.
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error(
      "DNI_HASH_PEPPER is not set. Refusing to hash DNIs with the public dev pepper in production.",
    );
  }
  return DEV_TEST_PEPPER;
}

/**
 * Computes HMAC-SHA256(dni, pepper) and returns the hex digest.
 *
 * Deterministic: same dni + pepper always produces the same hash.
 * Used for equality checks in DB queries (WHERE dni_hash = hashDni(input)).
 *
 * @param dni - The raw DNI string (digits only, 7–8 chars).
 */
export function hashDni(dni: string): string {
  const pepper = getPepper();
  return createHmac("sha256", pepper).update(dni).digest("hex");
}

/**
 * Returns the last 4 digits of a DNI for display in operator UI.
 * Never use this value as an identifier — it is for human disambiguation only.
 */
export function dniLast4(dni: string): string {
  return dni.slice(-4);
}
