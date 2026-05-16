// Projection: derive `pets.estimatedWeightKg` from the event log.
//
// Latest weight_recorded event's payload.kg, or null if none. Stored as a
// string column in the pets table (numeric in Drizzle round-trips as string);
// we return the string here so the rebuild script can compare without
// numeric-string parsing mismatches.

import type { ProjectionEvent } from "./types";

export type PetWeightProjection = {
  estimatedWeightKg: string | null;
};

export function replayPetWeight(events: ProjectionEvent[]): PetWeightProjection {
  // Iterate from the end so the first match is the latest event.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.eventType !== "weight_recorded") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const kg = payload.kg;
    if (typeof kg === "string" && kg.length > 0) return { estimatedWeightKg: kg };
    if (typeof kg === "number" && Number.isFinite(kg)) {
      return { estimatedWeightKg: kg.toString() };
    }
  }
  return { estimatedWeightKg: null };
}
