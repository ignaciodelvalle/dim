// Use-case types for amendment actions (strangler migration 27/61).
// Moved verbatim from app/actions/amendment.ts.

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export type AmendEventInput = {
  publicToken: string;
  targetEventId: string;
  reason: string | null;
  changes: Array<{ field: string; old: unknown; new: unknown }>;
  /**
   * A caller-supplied idempotency key, when the transport has one.
   *
   * ABSENT ON THE WEB, AND THAT IS THE DEFAULT: a form post has no header to
   * carry one, so the writer derives its own from (target, actor, changes) —
   * which dedupes a double-clicked "Corregir" and nothing else. That derived key
   * is unchanged and still the fallback.
   *
   * PRESENT ON `/api/v1`, where `Idempotency-Key` is REQUIRED, because the
   * client this endpoint exists for is a phone on a subway: the retry that
   * matters is the one after a timeout, where the first request may well have
   * committed and the phone never heard the answer. The derived key cannot help
   * there — it dedupes identical CORRECTIONS, not identical REQUESTS, so an
   * owner who corrects a lot number, sees a timeout, and re-sends the same
   * correction is deduped by accident rather than by contract.
   *
   * The cost of honouring it, stated: the uniqueness index is
   * `(pet_id, event_type, client_idempotency_key)`, so a client that reused ONE
   * key for two DIFFERENT corrections on the same animal would silently no-op
   * the second. That is the standard idempotency contract — same key means same
   * request — and it is why the native client scopes its key to one correction
   * ATTEMPT rather than to a screen.
   */
  clientIdempotencyKey?: string | null;
};

export type AmendEventResult =
  | {
      ok: true;
      amendmentEventId: string;
      /**
       * True when the idempotency key resolved to a correction that ALREADY
       * existed, so nothing was appended and no side effect ran.
       *
       * Reported rather than swallowed: a replay and a first write are different
       * facts, and a caller that cannot tell them apart re-fires whatever it
       * does on success. The web ignores it (its form only branches on `ok`);
       * `/api/v1` puts it on the wire, which is where a retrying phone needs it.
       */
      wasDuplicate: boolean;
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Query helper type
// ---------------------------------------------------------------------------

export type AmendmentSummary = {
  targetEventId: string;
  amendmentId: string;
  occurredAt: Date;
  reason: string | null;
  actorRole: string;
  changes: Array<{ field: string; old: unknown; new: unknown }>;
};
