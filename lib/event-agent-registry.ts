import type { EventType } from "@/db/schema";

/**
 * Maps a pet_events event_type to the UI surface a future conversational
 * agent would deeplink to. Single source of truth for:
 *
 *  - which form route handles an event_type
 *  - the slot names the form accepts as `searchParams` for prefill
 *  - a short Spanish-language description for LLM intent matching
 *
 * See AGENTS.md → Open questions / future work → "Conversational
 * event-capture agent" for the forward-compat rules this registry
 * operationalizes.
 *
 * Adding a new event-creation form? Add its registry entry in the same
 * PR. Lib-level test enforces every entry has a valid EventType key.
 */
export type EventAgentEntry = {
  /** Route relative to /mis-mascotas/{publicToken}. */
  route: string;
  /**
   * One-line Spanish description for LLM intent matching. Describe what
   * the *user said* that maps here (NOT what the system does). Examples:
   *   - "El usuario está registrando una vacunación administrada a su mascota"
   *   - "El usuario está reportando el peso actual de su mascota"
   * Keep under 120 chars. Avoid jargon — the LLM uses this directly.
   */
  description: string;
  /**
   * Query-param names the form accepts via `searchParams` for prefill.
   * MUST match the actual `name=""` attributes in the form. The agent
   * builds the deeplink from these; if they drift, the prefill silently
   * stops working.
   */
  prefillSlots: readonly string[];
};

export const EVENT_AGENT_REGISTRY: Partial<Record<EventType, EventAgentEntry>> = {
  weight_recorded: {
    route: "/eventos/nuevo/peso",
    description: "El usuario está reportando el peso actual de su mascota",
    prefillSlots: ["kg", "occurredAt", "notes"],
  },
  // Add other event types as their forms gain URL-prefill support.
  // See app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/peso/ for the
  // canonical reference implementation.
};

/**
 * Build a fully-qualified deeplink to the creation form for an event_type,
 * given a pet's publicToken and an optional slot payload. Returns null if
 * the event_type has no registry entry yet.
 *
 * Usage (future agent):
 *   const url = buildAgentDeeplink('weight_recorded', 'DIM-3K4F-9P2X', {
 *     kg: '12.5', occurredAt: '2026-05-16'
 *   });
 *   // → '/mis-mascotas/DIM-3K4F-9P2X/eventos/nuevo/peso?kg=12.5&occurredAt=2026-05-16'
 */
export function buildAgentDeeplink(
  eventType: EventType,
  publicToken: string,
  slots: Record<string, string | number | null | undefined> = {},
): string | null {
  const entry = EVENT_AGENT_REGISTRY[eventType];
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
