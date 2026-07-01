// Pure helpers for the refactored PetHealthTimeline.
// Extracted for unit testing without a JSX / DOM transformer.

import type { PetEventMetadata } from "@/lib/analytics/owner-dashboard";

export const MAX_TIMELINE_EVENTS = 5;

/**
 * Returns the display label for a timeline event.
 * Mirrors the mapping used by the existing page.tsx eventTitleFromRow.
 */
export function timelineEventLabel(eventType: string, summary: string | null): string {
  if (summary) return summary;
  const MAP: Record<string, string> = {
    vaccination_administered: "Vacunación",
    vet_visit_logged: "Visita veterinaria",
    weight_recorded: "Pesaje",
    medication_started: "Medicación iniciada",
    medication_dose_taken: "Dosis tomada",
    incident_reported: "Incidente reportado",
    rabies_observation_started: "Observación antirrábica iniciada",
    sterilization_performed: "Esterilización",
    microchip_implanted: "Microchip implantado",
    microchip_recorded: "Microchip registrado",
    tattoo_recorded: "Tatuaje registrado",
    note_added: "Nota agregada",
    clinical_info_logged: "Información clínica",
  };
  return MAP[eventType] ?? eventType.replace(/_/g, " ");
}

/**
 * Formats a date for display in the timeline summary chip.
 * Returns "DD/MM" format.
 */
export function formatTimelineDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/**
 * Returns the most recent event from a list, or null.
 */
export function latestEvent(events: PetEventMetadata[]): PetEventMetadata | null {
  if (events.length === 0) return null;
  return events.reduce((latest, e) =>
    e.occurredAt.getTime() > latest.occurredAt.getTime() ? e : latest,
  );
}

/**
 * Caps the events list at MAX_TIMELINE_EVENTS (safety net on top of the DB query).
 */
export function capRecentFive(events: PetEventMetadata[]): PetEventMetadata[] {
  return events.slice(0, MAX_TIMELINE_EVENTS);
}
