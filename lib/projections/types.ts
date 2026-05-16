// Shared shape for projection inputs. Mirrors the columns + payload that
// every projection module reads, no more. Avoids importing the full pet_events
// type from db/schema (which carries fields like author_role that no projector
// needs).

export type ProjectionEvent = {
  id: string;
  eventType: string;
  occurredAt: Date | string;
  recordedAt: Date | string;
  payload: unknown;
};
