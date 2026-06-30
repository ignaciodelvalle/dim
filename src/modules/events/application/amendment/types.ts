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
};

export type AmendEventResult =
  | { ok: true; amendmentEventId: string }
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
