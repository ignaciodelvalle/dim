// Projection: derive `pets.rabiesObservationStatus` from the event log.
//
// The 10-day rabies observation lifecycle (Decreto 4669/1973 PBA, etc.) is
// driven by two event types:
//   - rabies_observation_started → status 'in_progress'
//   - rabies_observation_ended   → status 'completed_{...}' via outcomeToStatus
//     (negative | positive_rabies | dead | lost_to_followup)
//
// All three writer paths dual-write pets.rabies_observation_status:
//   - reportBite / reportBiteFromOrg          → in_progress (started)
//   - owner/professional close-observation    → ended (outcomeToStatus)
//   - death_recorded CASCADE C                → ALSO emits rabies_observation_ended
//     (outcome=dead) before flipping to completed_dead, so death-during-
//     observation is fully event-derivable.
//
// A pet can be bitten more than once over its life, so the CHRONOLOGICALLY LAST
// observation event (started or ended) determines the current cache value.
//
// null when no observation event exists.
//
// Pure function. Caller orders events ascending by (occurredAt, recordedAt, id).

import { outcomeToStatus } from "@/src/modules/surveillance/domain/rabies-observation";
import type { RabiesObservationOutcome } from "@/src/modules/surveillance/domain/rabies-observation";
import type { ProjectionEvent } from "./types";

export type PetRabiesObservationProjection = {
  rabiesObservationStatus: string | null;
};

const VALID_OUTCOMES: readonly RabiesObservationOutcome[] = [
  "negative",
  "positive_rabies",
  "dead",
  "lost_to_followup",
];

export function replayPetRabiesObservation(
  events: ProjectionEvent[],
): PetRabiesObservationProjection {
  // Iterate from the end so the first observation-relevant match is the latest.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.eventType === "rabies_observation_started") {
      return { rabiesObservationStatus: "in_progress" };
    }
    if (e.eventType === "rabies_observation_ended") {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const outcome = payload.outcome;
      if (typeof outcome === "string" && (VALID_OUTCOMES as readonly string[]).includes(outcome)) {
        return {
          rabiesObservationStatus: outcomeToStatus(outcome as RabiesObservationOutcome),
        };
      }
      // Malformed ended event (no/invalid outcome) — keep scanning backwards.
    }
  }
  return { rabiesObservationStatus: null };
}
