// Pure helpers backing the EventCatcher → CaptureBox handoff. Extracted from
// CaptureBox.tsx so vitest can parse them without pulling in JSX (the project
// tsconfig uses jsx: "preserve" for Next.js, which vitest's import-analysis
// plugin can't handle).

import type { EventType } from "@/db/schema";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "@/lib/events/event-capture-registry";

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

// Quick-action cards shown in the capture box grid. Each links to a form
// prefilled with `occurredAt=today` where applicable. Order is roughly by
// frequency of use.
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

// All loggable events and owner flows — the full discoverability list for the
// anotar surface (WP-7). Driven by the registry so it stays in sync. Entries
// with a `routeOverride` bypass the registry deeplink (management flows that
// open sheets or navigate to paths not in EVENT_CAPTURE_REGISTRY).
export type CaptureOption = {
  eventType: EventType;
  label: string;
  /** Human-readable category shown as a section header. */
  category: string;
  /** If set, link goes here instead of buildCaptureDeeplink. */
  routeOverride?: string;
};

export const ALL_CAPTURE_OPTIONS: CaptureOption[] = [
  // Eventos de salud
  { eventType: "vaccination_administered", label: "Registrar vacuna", category: "Salud" },
  { eventType: "deworming_administered", label: "Registrar antiparasitario", category: "Salud" },
  { eventType: "weight_recorded", label: "Registrar peso", category: "Salud" },
  { eventType: "vet_visit_logged", label: "Visita al veterinario", category: "Salud" },
  { eventType: "sterilization_performed", label: "Castración / esterilización", category: "Salud" },
  { eventType: "symptom_observed", label: "Reportar síntoma", category: "Salud" },
  { eventType: "medication_started", label: "Inicio de medicación", category: "Salud" },
  { eventType: "medication_stopped", label: "Fin de medicación", category: "Salud" },
  { eventType: "clinical_info_logged", label: "Información clínica / estudios", category: "Salud" },
  // Identificación
  {
    eventType: "microchip_implanted",
    label: "Colocación de microchip",
    category: "Identificación",
  },
  { eventType: "microchip_replaced", label: "Reemplazo de microchip", category: "Identificación" },
  { eventType: "tattoo_recorded", label: "Registrar tatuaje", category: "Identificación" },
  // Eventos de vida
  {
    eventType: "incident_reported",
    label: "Reportar mordedura / incidente",
    category: "Incidentes",
  },
  { eventType: "death_recorded", label: "Reportar fallecimiento", category: "Incidentes" },
  { eventType: "post_adoption_checkin", label: "Check-in post-adopción", category: "Adopción" },
  // Estado
  {
    eventType: "status_changed",
    label: "Marcar como perdida",
    category: "Estado",
    routeOverride: "?sheet=marcar-perdida",
  },
  {
    eventType: "status_changed",
    label: "Marcar como encontrada",
    category: "Estado",
    routeOverride: "?sheet=marcar-encontrada",
  },
  // Notas
  { eventType: "note_added", label: "Agregar nota", category: "Notas" },
  // Gestión del perfil
  {
    eventType: "status_changed",
    label: "Compartir libreta",
    category: "Perfil",
    routeOverride: "?sheet=compartir-libreta",
  },
  {
    eventType: "status_changed",
    label: "Transferir mascota",
    category: "Perfil",
    routeOverride: "?sheet=transferir-mascota",
  },
  {
    eventType: "status_changed",
    label: "Editar datos de la mascota",
    category: "Perfil",
    routeOverride: "?sheet=editar-mascota",
  },
  {
    eventType: "vaccination_administered",
    label: "Programar vacuna",
    category: "Perfil",
    routeOverride: "/vacunas/programar",
  },
  {
    eventType: "status_changed",
    label: "Buscar hogar (adopción)",
    category: "Perfil",
    routeOverride: "/buscar-hogar",
  },
];

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
