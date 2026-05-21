// Pure helpers backing the EventCatcher → CaptureBox handoff. Extracted from
// CaptureBox.tsx so vitest can parse them without pulling in JSX (the project
// tsconfig uses jsx: "preserve" for Next.js, which vitest's import-analysis
// plugin can't handle).

import type { EventType } from "@/db/schema";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "@/lib/event-capture-registry";

// Builds the URL EventCatcher uses to hand off typed text + chosen kind to
// the matcher page. Pure function, lives outside EventCatcher.tsx so the
// vitest import-analysis can parse it without JSX.
export function buildAnotarUrl(
  publicToken: string,
  opts: { text?: string; kind?: EventType },
): string {
  const base = `/mis-mascotas/${publicToken}/anotar`;
  const params = new URLSearchParams();
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.text) params.set("text", opts.text);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// Quick-action cards. Each links to a form prefilled with `occurredAt=today`
// where applicable. Order is roughly by frequency of use.
export const QUICK_ACTIONS: Array<{ eventType: EventType; label: string }> = [
  { eventType: "vaccination_administered", label: "Vacuna" },
  { eventType: "deworming_administered", label: "Antiparasit." },
  { eventType: "weight_recorded", label: "Peso" },
  { eventType: "vet_visit_logged", label: "Visita al vet" },
  { eventType: "sterilization_performed", label: "Castración" },
  { eventType: "microchip_implanted", label: "Microchip" },
  { eventType: "note_added", label: "Nota" },
  { eventType: "symptom_observed", label: "Síntoma" },
];

export type QuickAction = (typeof QUICK_ACTIONS)[number];

export function findQuickAction(kind: string | undefined): QuickAction | undefined {
  if (!kind) return undefined;
  return QUICK_ACTIONS.find((qa) => qa.eventType === kind);
}

export function getNoteSlotKey(eventType: EventType): "notes" | "text" | null {
  const entry = EVENT_CAPTURE_REGISTRY[eventType];
  if (!entry) return null;
  if (entry.prefillSlots.includes("notes")) return "notes";
  if (entry.prefillSlots.includes("text")) return "text";
  return null;
}

export function buildKindDeeplink(
  eventType: EventType,
  publicToken: string,
  text?: string,
): string | null {
  const entry = EVENT_CAPTURE_REGISTRY[eventType];
  if (!entry) return null;
  const slots: Record<string, string> = {};
  if (entry.prefillSlots.includes("occurredAt")) {
    slots.occurredAt = new Date().toISOString().slice(0, 10);
  }
  const noteKey = getNoteSlotKey(eventType);
  if (text && noteKey) {
    slots[noteKey] = text;
  }
  return buildCaptureDeeplink(eventType, publicToken, slots);
}
