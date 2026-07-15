// lib/metrics/novedades-feed-links.ts — client-safe slice of the Novedades feed.
//
// The feed's event-type set and queue routing are pure data with no DB access,
// but they used to live inside novedades-feed.ts, which is `server-only`
// (it queries the DB). When NovedadesCard became a client component (collapse
// toggle), importing `feedQueueHref` from there turned into a hard build error.
// This module holds the shared, import-anywhere pieces; novedades-feed.ts
// re-exports them so server callers keep their existing import path.

import type { EventType } from "@/db/schema";

/**
 * The bounded set of pet_event types the feed surfaces — the queue-feeding,
 * operator-actionable types, each grounded in an existing gob queue that
 * consumes it. See novedades-feed.ts for the inclusion/exclusion rationale
 * and the index that serves the scan.
 */
export const FEED_EVENT_TYPES = [
  "outbreak_signal",
  "disease_reported",
  "rabies_observation_started",
  "incident_reported",
  "custody_dispute_raised",
] as const satisfies readonly EventType[];

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

/** The gob queue page that handles each feed event type (admin+govt guarded). */
const FEED_QUEUE_HREF: Record<FeedEventType, string> = {
  outbreak_signal: "/gob/vigilancia",
  disease_reported: "/gob/vigilancia",
  rabies_observation_started: "/gob/vigilancia",
  incident_reported: "/gob/vigilancia",
  custody_dispute_raised: "/gob/disputas",
};

/** Route to the queue page that handles a feed event type ("Ver en su cola →"). */
export function feedQueueHref(eventType: FeedEventType): string {
  return FEED_QUEUE_HREF[eventType];
}
