import type { EventType } from "@/db/schema";

/**
 * Registry that maps a `pet_events.event_type` to the UI form route that
 * captures it. Single source of truth for:
 *
 *   - which route handles each event type
 *   - which `searchParams` slots the form pre-fills with
 *   - a short es-AR description used by the captura-rápida matcher
 *     (`lib/event-capture-matcher.ts`) and — if/when a conversational
 *     LLM agent lands — by its tool-use surface
 *
 * Naming: the original "agent" wording was confusing because no LLM
 * exists yet. The registry powers the deterministic Captura rápida
 * feature today; the LLM agent is a deferred future layer.
 *
 * Adding a new event-creation form? Add its registry entry in the same
 * PR. Lib-level tests enforce route validity and slot consistency.
 */
export type EventCaptureEntry = {
  /** Route relative to `/mis-mascotas/{publicToken}`. */
  route: string;
  /**
   * One-line Spanish description for matcher ranking and LLM intent
   * matching. Describe what the *user said* that maps here (NOT what the
   * system does). Examples:
   *   - "El usuario está registrando una vacunación administrada a su mascota"
   *   - "El usuario está reportando el peso actual de su mascota"
   * Keep under 120 chars. Avoid jargon.
   */
  description: string;
  /**
   * Query-param names the form accepts via `searchParams` for prefill.
   * MUST match the actual `name=""` attributes the form's inputs use.
   * Empty array means the form is reachable via deeplink (intent
   * detection works) but does NOT pre-fill any field — used for forms
   * whose slot extraction needs LLM-level parsing (medication, symptom,
   * incident, clinical).
   */
  prefillSlots: readonly string[];
};

export const EVENT_CAPTURE_REGISTRY: Partial<Record<EventType, EventCaptureEntry>> = {
  weight_recorded: {
    route: "/eventos/nuevo/peso",
    description: "El usuario está reportando el peso actual de su mascota",
    prefillSlots: ["kg", "occurredAt", "notes"],
  },
  vaccination_administered: {
    route: "/eventos/nuevo/vacuna",
    description: "El usuario registra una vacuna que le administraron a su mascota",
    prefillSlots: ["vaccineName", "occurredAt", "notes"],
  },
  deworming_administered: {
    route: "/eventos/nuevo/antiparasitario",
    description: "El usuario registra un antiparasitario o desparasitación",
    prefillSlots: ["drugName", "occurredAt", "notes"],
  },
  sterilization_performed: {
    route: "/eventos/nuevo/esterilizacion",
    description: "El usuario registra la esterilización (castración) de su mascota",
    prefillSlots: ["occurredAt", "notes"],
  },
  vet_visit_logged: {
    route: "/eventos/nuevo/vet",
    description: "El usuario registra una visita al veterinario",
    prefillSlots: ["occurredAt", "notes"],
  },
  microchip_implanted: {
    route: "/eventos/nuevo/microchip",
    description: "El usuario registra la colocación del microchip",
    prefillSlots: ["microchipId", "occurredAt", "notes"],
  },
  note_added: {
    route: "/eventos/nuevo/nota",
    description: "El usuario agrega una nota libre sobre su mascota",
    prefillSlots: ["body", "occurredAt"],
  },
  death_recorded: {
    route: "/eventos/nuevo/fallecimiento",
    description: "El usuario reporta el fallecimiento de su mascota",
    prefillSlots: ["occurredAt", "notes"],
  },
  post_adoption_checkin: {
    route: "/eventos/nuevo/checkin",
    description: "El adoptante reporta un check-in post-adopción",
    prefillSlots: ["occurredAt", "notes"],
  },
  // ---- Forms reachable, slots not pre-filled (parsing needs LLM) ----
  medication_started: {
    route: "/eventos/nuevo/medicacion-inicio",
    description: "El usuario empezó a darle una medicación a su mascota",
    prefillSlots: [],
  },
  medication_stopped: {
    route: "/eventos/nuevo/medicacion-fin",
    description: "El usuario terminó una medicación de su mascota",
    prefillSlots: [],
  },
  incident_reported: {
    route: "/eventos/nuevo/mordedura",
    description: "El usuario reporta una mordedura u otro incidente de la mascota",
    prefillSlots: [],
  },
  symptom_observed: {
    route: "/eventos/nuevo/sintoma",
    description: "El usuario reporta un síntoma observado en su mascota",
    prefillSlots: [],
  },
  clinical_info_logged: {
    route: "/eventos/nuevo/clinico",
    description: "El usuario registra información clínica de su mascota",
    prefillSlots: [],
  },
};

/**
 * Build a deeplink to the creation form for an event_type, given a
 * pet's publicToken and an optional slot payload. Returns null if the
 * event_type has no registry entry yet.
 *
 * Usage:
 *   const url = buildCaptureDeeplink('weight_recorded', 'DIM-3K4F-9P2X', {
 *     kg: '12.5', occurredAt: '2026-05-16'
 *   });
 *   // → '/mis-mascotas/DIM-3K4F-9P2X/eventos/nuevo/peso?kg=12.5&occurredAt=2026-05-16'
 *
 * Slot keys not declared in `prefillSlots` are silently dropped (forms
 * with empty `prefillSlots` therefore always produce a bare URL).
 */
export function buildCaptureDeeplink(
  eventType: EventType,
  publicToken: string,
  slots: Record<string, string | number | null | undefined> = {},
): string | null {
  const entry = EVENT_CAPTURE_REGISTRY[eventType];
  if (!entry) return null;
  const base = `/mis-mascotas/${publicToken}${entry.route}`;
  const params = new URLSearchParams();
  for (const slot of entry.prefillSlots) {
    const value = slots[slot];
    if (value !== null && value !== undefined && value !== "") {
      params.set(slot, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
