// Libreta sanitaria — projection over pet_events filtered to medical entries.
//
// Canonical source of truth: AGENTS.md → "Libreta sanitaria".
//
// Every new EventType added to db/schema.ts → EVENT_TYPES must explicitly
// declare whether it belongs to the libreta. The test in
// lib/libreta-sanitaria.test.ts will fail if a new EventType is not
// classified (either listed below as part of the libreta, or listed in
// NON_LIBRETA_EVENT_TYPES as deliberate exclusion).

import { sql } from "drizzle-orm";

import { EVENT_TYPES, type EventType } from "@/db/schema";

// Event types that are part of the dueño's libreta sanitaria — the medical
// record the vet writes and the dueño carries. Surfaces: pet profile section,
// the dedicated /libreta route in Parte B, and the shareable Tier-2 route in
// Parte C.
export const LIBRETA_SANITARIA_EVENT_TYPES = [
  "vaccination_administered",
  "deworming_administered",
  "sterilization_performed",
  "medication_started",
  "medication_stopped",
  "medication_dose_taken",
  "vet_visit_logged",
  "weight_recorded",
  "clinical_info_logged",
  "lab_work_performed",
  "imaging_performed",
  "surgery_performed",
  "allergy_detected",
  "microchip_implanted",
  "incident_reported",
  "symptom_observed",
  "death_recorded",
] as const satisfies readonly EventType[];

// Event types deliberately OUTSIDE the libreta sanitaria — identity / admin /
// custody / welfare / system entries. Exhaustive together with
// LIBRETA_SANITARIA_EVENT_TYPES: every EVENT_TYPES value must appear in
// exactly one of the two.
export const NON_LIBRETA_EVENT_TYPES = [
  "pet_registered",
  "pet_profile_updated",
  "status_changed",
  "credential_scanned",
  "dangerous_breed_attested",
  "custody_transferred",
  "shelter_intake_recorded",
  "foster_assigned",
  "foster_ended",
  "adoption_application_submitted",
  "adoption_application_reviewed",
  "adoption_application_approved",
  "adoption_application_rejected",
  "adoption_finalized",
  "post_adoption_checkin",
  "adoption_revoked",
  "abandonment_reported",
  "maltreatment_reported",
  "note_added",
] as const satisfies readonly EventType[];

const LIBRETA_SET: ReadonlySet<string> = new Set(LIBRETA_SANITARIA_EVENT_TYPES);

export function isLibretaSanitariaEvent(eventType: string): boolean {
  return LIBRETA_SET.has(eventType);
}

// Drizzle SQL clause that restricts a pet_events query to libreta entries
// only. Use inside an `and(...)` WHERE clause. Postgres handles ANY() on an
// array literal efficiently; event_type is indexed.
//
// Example:
//   const events = await db
//     .select()
//     .from(petEvents)
//     .where(and(eq(petEvents.petId, pet.id), libretaSanitariaClause()))
//     .orderBy(desc(petEvents.occurredAt));
export function libretaSanitariaClause() {
  const typesArray = `{${LIBRETA_SANITARIA_EVENT_TYPES.join(",")}}`;
  return sql`event_type = ANY(${typesArray}::text[])`;
}

// Filter chips for the EventTimeline when mounted in a libreta context.
// Co-located here so the libreta-specific subset travels with the concept.
export const LIBRETA_FILTER_CHIPS: ReadonlyArray<{ type: EventType; label: string }> = [
  { type: "vaccination_administered", label: "Vacunas" },
  { type: "deworming_administered", label: "Antiparasitarios" },
  { type: "sterilization_performed", label: "Esterilización" },
  { type: "vet_visit_logged", label: "Visitas" },
  { type: "weight_recorded", label: "Peso" },
  { type: "medication_started", label: "Medicación · inicio" },
  { type: "medication_stopped", label: "Medicación · fin" },
  { type: "medication_dose_taken", label: "Dosis dadas" },
  { type: "microchip_implanted", label: "Microchip" },
  { type: "clinical_info_logged", label: "Información clínica" },
  { type: "symptom_observed", label: "Síntomas" },
  { type: "incident_reported", label: "Incidentes" },
  { type: "death_recorded", label: "Fallecimiento" },
];
