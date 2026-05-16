// Projection: derive the 5-field microchip block on `pets` from the event log.
//
// EARLIEST microchip_implanted event wins. This matches the AGENTS.md rule
// "never overwrite existing chip data" — once a chip is recorded, that is
// the binding fact. If a future correction event ships, it will be a NEW
// event type (e.g. `microchip_corrected`) handled here in a new branch.

import type { ProjectionEvent } from "./types";

export type PetMicrochipProjection = {
  microchipId: string | null;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
};

const EMPTY: PetMicrochipProjection = {
  microchipId: null,
  microchipCountryCode: null,
  microchipImplantedAt: null,
  microchipImplantedBy: null,
  microchipLocation: null,
};

export function replayPetMicrochip(events: ProjectionEvent[]): PetMicrochipProjection {
  // Iterate from the start so the first match is the earliest event.
  for (const e of events) {
    if (e.eventType !== "microchip_implanted") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const chipNumber = strOrNull(payload.chip_number);
    if (!chipNumber) continue; // a chip event with no number is malformed; skip
    // implant_date_known is the flag the writers (createPetAction +
    // createMicrochipAction) use to mark whether the user actually knew
    // the implant date. When false, occurredAt defaulted to `now` (the
    // recordedAt) and is NOT a real implant date. Surface null in that
    // case to match what createPetAction stored on the pets row.
    const dateKnown = payload.implant_date_known === true;
    return {
      microchipId: chipNumber,
      microchipCountryCode: strOrNull(payload.country_code),
      microchipImplantedAt: dateKnown ? formatDate(e.occurredAt) : null,
      microchipImplantedBy: strOrNull(payload.implanted_by),
      microchipLocation: strOrNull(payload.location_on_body),
    };
  }
  return EMPTY;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
