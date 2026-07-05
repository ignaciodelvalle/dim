// Amendment domain — Wave 2 Item 15 (2026-06-19).
//
// Implements AGENTS.md core principle #2: "Corrections are new events that
// reference earlier ones. No event is ever edited or deleted."
//
// This module owns:
//   - AMENDABLE_EVENT_TYPES allowlist (D4)
//   - canAmendEvent() — pure capability check (D3)
//   - applyAmendments() — projection helper (D2)
//   - getAmendmentsForEvents() — DB query helper used by the libreta view
//
// Writers (server action) live in app/actions/amendment.ts.

import type { EventType } from "@/db/schema";
import { upcastPayload } from "@/lib/events/event-upcasters";

// ---------------------------------------------------------------------------
// D4 — Allowlist of amendable event types
// ---------------------------------------------------------------------------
//
// Only clinical routine events can be amended via event_amended. Events with
// their own reversal flows or legal/forensic weight are NOT amendable:
//   - death_recorded       → has no reversal path; forensic.
//   - incident_reported    → legal record; welfare/rabies flow owns corrections.
//   - rabies_observation_* → legal 10-day observation; outcome immutable.
//   - disease_reported     → govt surveillance; corrected via official channels.
//   - adoption/custody     → own dedicated flows (adoption_reversed, custody_*).
export const AMENDABLE_EVENT_TYPES: ReadonlyArray<EventType> = [
  "vaccination_administered",
  "deworming_administered",
  "weight_recorded",
  "vet_visit_logged",
  "clinical_info_logged",
  "medication_started",
  "note_added",
  "sterilization_performed",
  // Movilidad jurisdiccional (R1.5): a wrong jurisdiction, CVI number, or
  // travel date is regulatory-stakes and correctable by amendment — never by
  // editing or deleting the original row.
  "movement_recorded",
] as const;

const AMENDABLE_SET: ReadonlySet<string> = new Set(AMENDABLE_EVENT_TYPES);

/** Returns true if the event type is in the amendable allowlist (D4). */
export function isAmendableEventType(eventType: string): boolean {
  return AMENDABLE_SET.has(eventType);
}

// ---------------------------------------------------------------------------
// D3 — Capability check
// ---------------------------------------------------------------------------
//
// "Whoever can write that event_type can amend their own."
// For v1 the rule is: if the viewer owns the pet (owner path), they can amend.
// Admin/govt amendment is handled separately via the sensitive amendment path (D5).
//
// This is a pure function — actual DB-based ownership is checked in the server
// action (requireAlivePetAccess). This helper gates the UI affordance.

export type AmendCapabilityInput = {
  eventType: string;
  /** True when the current viewer has write access to pet events (owner path). */
  viewerCanWriteEvents: boolean;
};

/**
 * Returns true when the viewer should see the "Corregir" button for this event.
 * Pure — no DB calls.
 */
export function canAmendEvent({ eventType, viewerCanWriteEvents }: AmendCapabilityInput): boolean {
  return isAmendableEventType(eventType) && viewerCanWriteEvents;
}

// ---------------------------------------------------------------------------
// D2 — Projection: apply latest amendment to an event row
// ---------------------------------------------------------------------------
//
// The libreta view applies the latest amendment overlay to the original event
// so the "current value" is always displayed. The original event row is never
// touched. In /historial the original is shown in full alongside the amendment.

export type ChangeEntry = {
  field: string;
  old: unknown;
  new: unknown;
};

export type AmendmentRow = {
  id: string;
  targetEventId: string;
  occurredAt: Date | string;
  reason: string | null;
  changes: ChangeEntry[];
  actorRole: string;
};

/**
 * Given an event payload and a list of amendment rows (sorted oldest → newest),
 * returns the projected payload with the latest amendment applied.
 *
 * Each change entry in the latest amendment overwrites the corresponding field.
 * Only the LAST amendment is applied — earlier amendments are still in the log
 * but the projection always shows the most-recent correction.
 */
export function applyAmendments(
  payload: Record<string, unknown>,
  amendments: AmendmentRow[],
): Record<string, unknown> {
  if (amendments.length === 0) return payload;
  // Latest amendment wins.
  const latest = amendments[amendments.length - 1];
  const result = { ...payload };
  for (const change of latest.changes) {
    result[change.field] = change.new;
  }
  return result;
}

/**
 * Returns the latest amendment for an event, or null if none.
 * Convenience wrapper for callers that only need the latest.
 */
export function latestAmendment(amendments: AmendmentRow[]): AmendmentRow | null {
  return amendments.length > 0 ? amendments[amendments.length - 1] : null;
}

// ---------------------------------------------------------------------------
// D2 at the read boundary — overlay a whole event stream in one pass
// ---------------------------------------------------------------------------

type OverlayableEvent = {
  id: string;
  eventType: string;
  occurredAt: Date | string;
  payload: unknown;
};

/**
 * Project a fetched event stream so amended events carry their CORRECTED
 * payload (D2: "the current value is always displayed") plus `amendedAt`.
 *
 * This is THE single mechanism every TypeScript read boundary applies
 * (projection-cron audit 2026-07-03 A — applyAmendments existed but no
 * boundary called it, so timelines and KPIs read pre-correction values).
 * Pure and zero-query: callers include `event_amended` rows in the stream
 * they already fetch; this derives the per-target overlay from them.
 *
 *  - `event_amended` rows pass through untouched (the correction itself is a
 *    visible, append-only timeline entry) — they are never upcast.
 *  - Every non-amendment row is first UPCAST (upcastPayload — no-op unless the
 *    event type has a registered v(N+1) upcaster) so a `payload_version` bump
 *    can't silently hand a reader a stale-shaped payload; this makes
 *    overlayAmendments the single payload-access boundary that ALWAYS upcasts
 *    (WAVE D1 / finding 27-#11). The amendment correction is applied ON TOP of
 *    the upcast payload.
 *  - Targeted rows get `payload` projected via the LATEST amendment (chains
 *    are flattened by amend-event.ts: every amendment targets the original)
 *    and `amendedAt` set to that amendment's occurredAt.
 *  - Untargeted rows get `amendedAt: null`.
 */
export function overlayAmendments<T extends OverlayableEvent>(
  events: T[],
): Array<T & { amendedAt: Date | string | null }> {
  // Latest amendment per target — a single pass over the stream.
  const latestByTarget = new Map<string, { occurredAt: Date | string; changes: ChangeEntry[] }>();
  for (const e of events) {
    if (e.eventType !== "event_amended") continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const targetId = typeof p.target_event_id === "string" ? p.target_event_id : null;
    if (!targetId) continue;
    const existing = latestByTarget.get(targetId);
    if (!existing || new Date(e.occurredAt) > new Date(existing.occurredAt)) {
      latestByTarget.set(targetId, {
        occurredAt: e.occurredAt,
        changes: Array.isArray(p.changes) ? (p.changes as ChangeEntry[]) : [],
      });
    }
  }

  return events.map((e) => {
    // The correction itself is an append-only timeline entry — never upcast or
    // projected. (event_amended has no schema upcaster anyway.)
    if (e.eventType === "event_amended") return { ...e, amendedAt: null };

    // Upcast first so the reader always sees the latest payload shape, then
    // layer the correction on top.
    const upcast = upcastPayload(e.eventType as EventType, e.payload) as Record<string, unknown>;
    const amendment = latestByTarget.get(e.id);
    if (!amendment) return { ...e, payload: upcast, amendedAt: null };

    const projected = { ...upcast };
    for (const change of amendment.changes) {
      projected[change.field] = change.new;
    }
    return { ...e, payload: projected, amendedAt: amendment.occurredAt };
  });
}

// ---------------------------------------------------------------------------
// Notification type constant (D5)
// ---------------------------------------------------------------------------
//
// Admin/govt amendments send the owner a notification of this type.
// The notifications.notification_type column is free-text (no migration needed
// per AGENTS.md Notifications schema).
export const ADMIN_AMENDMENT_NOTIFICATION_TYPE = "admin_event_amended" as const;
