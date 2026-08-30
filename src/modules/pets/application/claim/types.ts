// Exported types for the claim use-cases.

/**
 * WHY a claim step refused, next to the es-AR sentence that says it in words.
 *
 * THE SENTENCE IS FOR A BROWSER; THE CODE IS FOR EVERYTHING ELSE. Both writers
 * below have always answered `{ error: string }` — Spanish prose written for the
 * claim wizard's own error paragraph — and that is api-invariants.md §3's
 * "untyped failure arm", the thing `/api/v1` routes cannot put on a wire. A
 * second door over the same use-case would otherwise have to MATCH THE PROSE to
 * pick a status code, and a copy edit would then silently turn a 409 into a 500.
 *
 * ADDITIVE, and the browser's behaviour is byte-identical: `ClaimWizard` reads
 * `result.error` and nothing else, so the field it does not know about changes no
 * pixel. What the REQUIRED (not optional) field buys is that a new refusal arm
 * cannot land without deciding which of these five it is — the compiler asks.
 *
 * Same instrument `AmendEventFailureCode` is, for the same reason and after the
 * same finding (WU-J review FI-7): before it, every refusal that use-case
 * produced was a 500 because prose was all there was to go on.
 *
 * - `rate_limited`      — the shared `claim_lookup` budget, spent by the lookup
 *                         and the claim TOGETHER so a burst of probes counts as
 *                         one. The web spends the same one.
 * - `identifier_invalid`— the value cannot resolve to anything: empty, or a
 *                         microchip that is not exactly fifteen digits. Refused
 *                         before any budget is spent and before any transaction.
 * - `not_found`         — the identifier resolved to no active row. Deliberately
 *                         indistinguishable from an erased pet (art. 16).
 * - `not_claimable`     — the animal exists and is not free: deceased, lost, in
 *                         an open custody dispute, or already held by somebody
 *                         under a custody of ANY role.
 * - `failed`            — the transaction itself failed. Nothing is half written.
 */
export const CLAIM_FAILURE_CODES = [
  "rate_limited",
  "identifier_invalid",
  "not_found",
  "not_claimable",
  "failed",
] as const;

export type ClaimFailureCode = (typeof CLAIM_FAILURE_CODES)[number];

/** A refusal, in words for a browser and in a code for everybody else. */
export type ClaimRefusal = { error: string; code: ClaimFailureCode };

export type ClaimLookupVariant =
  | { variant: "not_found" }
  | { variant: "active_owner"; petToken: string; petName: string; ownerInitials: string | null }
  | { variant: "lost"; petToken: string; petName: string }
  | { variant: "deceased"; petName: string }
  | { variant: "free"; petToken: string; petName: string };

export type ClaimLookupResult = ClaimLookupVariant | ClaimRefusal;

// The dispute is authorized by the PRIVATE identifier, never by a pet token.
// A public token is not evidence: /perdidas lists every lost animal with a link
// to /p/{token} and no login, so tokens harvest in bulk, while /p/[publicToken]
// deliberately renders "Microchip: Sí/No" and never the number. Carrying the
// identifier here mirrors submitFreeClaimForUser, the sibling step of the SAME
// wizard, which already resolves its pet from the identifier and calls that
// "the evidence". The dispute step was the outlier.
export type ClaimDisputeInput = {
  identifierKind: "microchip" | "tattoo";
  identifierValue: string;
  reason: string;
};

// `petToken` is the token RESOLVED from the identifier server-side — callers
// revalidate with this, never with a caller-supplied value.
export type ClaimDisputeResult = { disputeToken: string; petToken: string } | { error: string };

export type FreeClaimResult = { petToken: string; petName: string } | ClaimRefusal;
