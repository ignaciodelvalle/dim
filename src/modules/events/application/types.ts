// Shared result and notification types for the events application layer.
// Mirrors src/modules/surveillance/application/types.ts — same shape, events domain.

export type NewNotification = {
  userId: string;
  notificationType: string;
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "urgent";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  relatedPetId?: string | null;
  relatedCaseId?: string | null;
  relatedEventId?: string | null;
  category?: string | null;
};

/**
 * Standard use-case result.
 * ok=true  → value T + zero-or-more pending notifications (callers flush post-tx).
 * ok=false → Spanish error string, no side-effects.
 */
export type UseCaseResult<T = void> =
  | { ok: true; value: T; notifications: NewNotification[] }
  | { ok: false; error: string };

/**
 * Shared dependency bag injected into every use-case.
 * Callers (actions.ts) build and pass this; use-cases never import db directly.
 */
export type Deps = {
  repo: import("../infrastructure/events-repository").EventsRepository;
};
