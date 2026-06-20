// Spanish-language formatting helpers for dates, enums, and event labels.
// All UI strings live here so we can change copy without touching components.

import type { EventType } from "@/db/schema";

const SPANISH_DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const SPANISH_DATETIME_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SPANISH_DATE_FORMAT.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SPANISH_DATETIME_FORMAT.format(date);
}

// Parse a "YYYY-MM-DD" string from <input type="date"> into a Date anchored at
// noon UTC of that calendar day. Noon UTC stays on the same calendar date when
// rendered in any timezone within ±12 hours, so the user sees the date they
// picked instead of the previous day. Returns null if the string is empty or
// invalid.
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function speciesLabel(species: string): string {
  switch (species) {
    case "dog":
      return "Perro";
    case "cat":
      return "Gato";
    case "rabbit":
      return "Conejo";
    case "guinea_pig":
      return "Cobayo";
    case "ferret":
      return "Hurón";
    case "other":
      return "Otra";
    default:
      return species;
  }
}

export function sexLabel(sex: string): string {
  switch (sex) {
    case "male":
      return "Macho";
    case "female":
      return "Hembra";
    case "unknown":
      return "No especificado";
    default:
      return sex;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activa";
    case "lost":
      return "Perdida";
    case "deceased":
      return "Fallecida";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Sex-aware lost-mode copy (UI-4)
// ---------------------------------------------------------------------------
//
// The public credential and cockpit must gender the "lost" wording by the
// pet's recorded sex instead of guessing from the name ending. Three cases:
//   - male    → masculine ("perdido")
//   - female  → feminine  ("perdida")
//   - unknown → a sex-neutral phrasing that reads naturally in es-AR and never
//               assumes a gender ("Se perdió" / "Me perdí").
//
// Pure functions — no DOM, exported for unit testing.

export type PetSex = "male" | "female" | "unknown";

function normalizeSex(sex: string | null | undefined): PetSex {
  return sex === "male" || sex === "female" ? sex : "unknown";
}

/** Banner headline, e.g. "ESTÁ PERDIDO" / "ESTÁ PERDIDA" / "SE PERDIÓ". */
export function lostBannerHeadline(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "ESTÁ PERDIDO";
    case "female":
      return "ESTÁ PERDIDA";
    default:
      return "SE PERDIÓ";
  }
}

/** First-person hero line spoken by the pet, e.g. "Estoy perdido" / "Me perdí". */
export function lostFirstPersonLine(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "Estoy perdido";
    case "female":
      return "Estoy perdida";
    default:
      return "Me perdí";
  }
}

/** Third-person "está perdid{o|a}" / "se perdió" used in cockpit/share copy. */
export function lostThirdPersonPhrase(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "está perdido";
    case "female":
      return "está perdida";
    default:
      return "se perdió";
  }
}

/** Mark-found button / past-participle wording, e.g. "encontrado" / "encontrada". */
export function foundParticiple(sex: string | null | undefined): string {
  switch (normalizeSex(sex)) {
    case "male":
      return "encontrado";
    case "female":
      return "encontrada";
    default:
      // Neutral: "encontrada/o" reads as the inclusive form when sex is unknown.
      return "encontrada/o";
  }
}

// Exhaustive map — must have exactly one entry per EventType.
// If you add a new entry to EVENT_TYPES, TypeScript will fail here until
// you add a corresponding label. Use `satisfies` so inference stays narrow.
const EVENT_TYPE_LABELS = {
  // Lifecycle
  pet_registered: "Mascota registrada",
  pet_profile_updated: "Perfil actualizado",
  status_changed: "Cambio de estado",
  death_recorded: "Fallecimiento",
  // Preventive medicine
  vaccination_administered: "Vacuna administrada",
  deworming_administered: "Antiparasitario",
  sterilization_performed: "Esterilización",
  // Medication
  medication_started: "Inicio de medicación",
  medication_stopped: "Fin de medicación",
  // Clinical encounters
  vet_visit_logged: "Visita al veterinario",
  // Body metrics
  weight_recorded: "Peso registrado",
  // Identification & legal
  microchip_implanted: "Microchip implantado",
  microchip_replaced: "Reemplazo de microchip",
  tattoo_recorded: "Tatuaje registrado",
  tattoo_updated: "Tatuaje actualizado",
  dangerous_breed_attested: "Atestación de raza peligrosa",
  // Free-form
  note_added: "Nota",
  // System / observed
  credential_scanned: "Credencial escaneada",
  incident_reported: "Incidente reportado",
  rabies_observation_started: "Observación antirrábica iniciada",
  rabies_observation_ended: "Observación antirrábica finalizada",
  // Medication adherence
  medication_dose_taken: "Dosis administrada",
  // Non-owner reporting
  symptom_observed: "Síntoma observado",
  abandonment_reported: "Abandono reportado",
  maltreatment_reported: "Maltrato reportado",
  // Unified clinical information
  clinical_info_logged: "Información clínica",
  // Custody & adoption
  shelter_intake_recorded: "Ingreso al refugio",
  foster_assigned: "Tránsito asignado",
  foster_ended: "Tránsito finalizado",
  adoption_application_submitted: "Postulación de adopción enviada",
  adoption_application_resolved: "Postulación de adopción resuelta",
  adoption_finalized: "Adopción finalizada",
  post_adoption_checkin: "Seguimiento post-adopción",
  adoption_reversed: "Adopción revertida",
  custody_transferred: "Custodia transferida",
  ownership_claimed: "Mascota reclamada",
  // Lost & Found
  custody_transfer_proposed: "Propuesta de devolución",
  custody_transfer_cancelled: "Propuesta de devolución cancelada",
  // Custody disputes
  custody_dispute_raised: "Disputa de custodia iniciada",
  custody_dispute_resolved: "Disputa de custodia resuelta",
  // Foster volunteers pool
  foster_proposed: "Propuesta de tránsito",
  foster_proposal_resolved: "Propuesta de tránsito resuelta",
  foster_co_foster_allowed: "Co-tránsito habilitado",
  // Adoption eligibility
  adoption_eligibility_set: "Elegibilidad para adopción actualizada",
  // Surveillance
  outbreak_signal: "Señal de brote",
  disease_reported: "Enfermedad reportada",
  // Correction by amendment — Wave 2 Item 15 (principle #2, 2026-06-19)
  event_amended: "Corrección registrada",
} satisfies Record<EventType, string>;

export function eventTypeLabel(eventType: EventType): string {
  return EVENT_TYPE_LABELS[eventType];
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "ahora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "ayer";
  if (diffDay < 7) return `hace ${diffDay} días`;
  if (diffDay < 30) return `hace ${Math.floor(diffDay / 7)} sem`;
  return formatDate(date);
}

export function notificationSeverityLabel(severity: string): string {
  switch (severity) {
    case "info":
      return "Info";
    case "success":
      return "Listo";
    case "warning":
      return "Atención";
    case "urgent":
      return "Urgente";
    default:
      return severity;
  }
}

// ---------------------------------------------------------------------------
// Phone normalization for tel: hrefs (UI-4 fix 6)
// ---------------------------------------------------------------------------
//
// Produces a dialable value for a tel: href from a raw, human-entered AR phone.
// Conservative: when confident, returns E.164 (+54…); otherwise returns the
// digits-only form so the link still dials something rather than choking on
// spaces/dashes/parens. The display string can keep its pretty form.
//
// Rules (best-effort, AR-centric):
//   - Already starts with "+": strip non-digits after the leading +, keep it.
//   - Starts with "00": treat as international prefix → "+" + rest.
//   - Starts with "0" (national trunk) or "15" handling is intentionally NOT
//     attempted (mobile 15 prefixes are ambiguous without an area code split);
//     we only confidently prepend +54 when the local number, after dropping a
//     single leading 0, has a plausible AR length (10 digits).
//   - Otherwise: return digits only (no guessing).
export function normalizePhoneForTel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // International, explicit "+".
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  // International access code "00…" → "+…".
  if (trimmed.startsWith("00")) {
    const digits = trimmed.slice(2).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Already carries the AR country code.
  if (digits.startsWith("54")) {
    return `+${digits}`;
  }

  // National form with leading trunk "0": drop it. A plausible AR national
  // significant number is 10 digits (area code + subscriber). Only then are we
  // confident enough to stamp +54.
  if (digits.startsWith("0")) {
    const national = digits.replace(/^0+/, "");
    if (national.length === 10) return `+54${national}`;
    return national; // digits-only fallback — not confidently AR.
  }

  // Bare 10-digit national number (no trunk, no country code) → +54.
  if (digits.length === 10) return `+54${digits}`;

  // Anything else: conservative digits-only fallback.
  return digits;
}

// ---------------------------------------------------------------------------
// Death-cause labels (es-AR) — item 3.4 UX audit
//
// Maps DEATH_CAUSES enum values (English keys, from death-rules.ts) to their
// Spanish display labels. The underlying values are NEVER changed here.
// ---------------------------------------------------------------------------

const DEATH_CAUSE_LABELS: Record<string, string> = {
  known: "Causa conocida",
  unknown: "Causa desconocida",
  natural: "Muerte natural",
  disease: "Enfermedad",
  accident: "Accidente",
  euthanasia: "Eutanasia",
  sudden: "Muerte súbita",
  violent: "Causa violenta",
  other: "Otra causa",
};

/**
 * Returns the es-AR display label for a death cause value.
 * Falls back to the raw value if unrecognized (forward-compat).
 */
export function deathCauseLabel(cause: string | null | undefined): string {
  if (!cause) return "—";
  return DEATH_CAUSE_LABELS[cause] ?? cause;
}

// ---------------------------------------------------------------------------
// Disposition-method labels (es-AR) — item 3.4 UX audit
//
// Maps DispositionMethod enum values (English keys) to Spanish display labels.
// ---------------------------------------------------------------------------

const DISPOSITION_METHOD_LABELS: Record<string, string> = {
  cremation_collective: "Cremación colectiva",
  cremation_individual_ashes: "Cremación individual con cenizas",
  authorized_cemetery: "Cementerio habilitado",
  owner_burial: "Entierro en domicilio",
  household_waste: "Residuos domiciliarios",
  rendering: "Reciclaje sanitario",
  unknown: "Sin especificar",
};

/**
 * Returns the es-AR display label for a disposition method value.
 * Falls back to the raw value if unrecognized (forward-compat).
 */
export function dispositionMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return DISPOSITION_METHOD_LABELS[method] ?? method;
}

// ---------------------------------------------------------------------------
// Notification-type labels (es-AR) — item 3.4 UX audit
//
// Maps notification_type string values (English snake_case keys stored in DB)
// to human-readable Spanish labels for the NotificationCard chip.
// Only types that actually reach the notification surface are mapped here;
// any unknown type falls back gracefully to the raw code.
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  // Adoption
  adoption_application_approved: "Adopción aprobada",
  adoption_application_closed: "Adopción cerrada",
  adoption_application_received: "Postulación recibida",
  adoption_application_rejected: "Adopción rechazada",
  adoption_application_withdrawn: "Postulación retirada",
  adoption_finalized: "Adopción finalizada",
  adoption_info_requested: "Info de adopción solicitada",
  // Amendments
  admin_event_amended: "Evento corregido por admin",
  // Appointments
  appointment_cancelled_by_org: "Turno cancelado por la organización",
  appointment_cancelled_by_owner: "Turno cancelado",
  // Approval requests
  approval_request_approved: "Solicitud aprobada",
  approval_request_auto_expired: "Solicitud vencida automáticamente",
  approval_request_pending_authority: "Solicitud pendiente de aprobación",
  approval_request_proposed_authority: "Nueva solicitud de aprobación",
  approval_request_rejected: "Solicitud rechazada",
  approval_request_submitted_self: "Solicitud enviada",
  // Bites
  bite_reported_authority: "Mordedura reportada a autoridad",
  bite_reported_by_org_owner: "Mordedura reportada por organización",
  // Capabilities
  capability_granted: "Permiso otorgado",
  capability_request: "Solicitud de permiso",
  capability_approved: "Permiso aprobado",
  capability_rejected: "Permiso rechazado",
  // Chip
  chip_match_notification_owner: "Coincidencia de microchip detectada",
  microchip_duplicate_detected: "Microchip duplicado detectado",
  microchip_fraud_detected: "Posible fraude de microchip",
  microchip_updated_by_institution: "Microchip actualizado por institución",
  // Cross-org transfers
  cross_org_transfer_accepted_receiver: "Transferencia aceptada",
  cross_org_transfer_accepted_sender: "Transferencia aceptada por receptor",
  cross_org_transfer_cancelled_receiver: "Transferencia cancelada",
  cross_org_transfer_proposed_receiver: "Propuesta de transferencia recibida",
  cross_org_transfer_proposed_sender: "Propuesta de transferencia enviada",
  cross_org_transfer_rejected_sender: "Transferencia rechazada",
  // Custody
  custody_dispute_party_added: "Disputa de custodia: parte agregada",
  custody_dispute_raised_against_you: "Disputa de custodia iniciada en tu contra",
  custody_dispute_raised_by_you: "Disputa de custodia iniciada por vos",
  custody_dispute_resolved: "Disputa de custodia resuelta",
  custody_dispute_stale: "Disputa de custodia sin movimiento",
  custody_received: "Custodia recibida",
  custody_transfer_accepted_owner_side: "Devolución aceptada por el dueño",
  custody_transfer_auto_cancelled: "Devolución cancelada automáticamente",
  custody_transfer_proposal_owner: "Propuesta de devolución",
  // Decomiso
  decomiso_confirmed_admin: "Decomiso confirmado (admin)",
  decomiso_confirmed_govt: "Decomiso confirmado",
  decomiso_handoff_accepted_govt: "Handoff de decomiso aceptado",
  decomiso_handoff_accepted_receiver: "Handoff de decomiso aceptado por receptor",
  decomiso_handoff_proposed_receiver: "Propuesta de handoff de decomiso recibida",
  decomiso_handoff_rejected_govt: "Handoff de decomiso rechazado",
  decomiso_handoff_stale: "Handoff de decomiso sin movimiento",
  decomiso_owner_lost_custody: "Animal decomisado — custodia transferida",
  // ENO / disease
  eno_disease_diagnosis: "Diagnóstico ENO registrado",
  eno_pet_disease_diagnosis: "Diagnóstico ENO en tu mascota",
  outbreak_signal_detected: "Señal de brote detectada",
  // Foster
  foster_assigned: "Tránsito asignado",
  foster_converted_to_owner: "Tránsito convertido en adopción",
  foster_ended: "Tránsito finalizado",
  foster_ended_by_adoption: "Tránsito finalizado por adopción",
  foster_ended_by_death: "Tránsito finalizado por fallecimiento",
  foster_ended_by_transfer: "Tránsito finalizado por transferencia",
  foster_proposal_accepted_org: "Propuesta de tránsito aceptada",
  foster_proposal_auto_cancelled_org: "Propuesta de tránsito cancelada automáticamente",
  foster_proposal_cancelled_volunteer: "Propuesta de tránsito cancelada por voluntario",
  foster_proposal_expired: "Propuesta de tránsito vencida",
  foster_proposal_received: "Propuesta de tránsito recibida",
  foster_proposal_rejected_org: "Propuesta de tránsito rechazada",
  foster_volunteer_reenroll_prompt: "Recordatorio para re-inscribirse como tránsito",
  // Govt / institutional
  admin_deactivated: "Cuenta admin desactivada",
  govt_deactivated: "Cuenta govt desactivada",
  govt_locality_assigned: "Localidad asignada",
  govt_locality_revoked: "Localidad revocada",
  govt_self_deactivated_admin_notice: "Auto-baja de operador govt",
  govt_self_deactivated_cascade_notice: "Cuenta govt dada de baja en cascada",
  institutional_account_created: "Cuenta institucional creada",
  operator_credentials_reset: "Credenciales de operador reseteadas",
  // Lost & Found
  lost_episode_resolved_broadcast: "Mascota encontrada — difusión",
  lost_episode_resolved_owner: "Mascota encontrada",
  lost_pet_broadcast: "Alerta de mascota perdida",
  pet_found_report: "Reporte de mascota encontrada",
  pet_in_possession: "Mascota en posesión",
  // Org
  free_pet_claimed: "Mascota libre reclamada",
  org_invitation_accepted: "Invitación a organización aceptada",
  org_invitation_created: "Invitación a organización enviada",
  org_membership_removed: "Salida de la organización",
  org_verification_granted: "Verificación de organización otorgada",
  org_verification_revoked: "Verificación de organización revocada",
  // Pet transfers
  pet_transfer_accepted: "Transferencia de mascota aceptada",
  pet_transfer_cancelled: "Transferencia de mascota cancelada",
  pet_transfer_expired: "Transferencia de mascota vencida",
  pet_transfer_initiated: "Transferencia de mascota iniciada",
  pet_transfer_received: "Transferencia de mascota recibida",
  pet_transfer_rejected: "Transferencia de mascota rechazada",
  // Post-adoption
  post_adoption_checkin_due: "Seguimiento post-adopción pendiente",
  post_adoption_checkin_missed: "Seguimiento post-adopción no realizado",
  post_adoption_checkin_received: "Seguimiento post-adopción recibido",
  // PPP / breed rules
  ppp_breed_list_updated_now_applies: "Lista de razas PPP actualizada — aplica a tu mascota",
  ppp_registration_reminder: "Recordatorio: registrá tu mascota PPP",
  // Pregnancy
  pregnancy_ended_owner: "Gestación finalizada",
  pregnancy_started_owner: "Gestación registrada",
  // Profile
  profile_self_updated: "Perfil actualizado",
  self_resignation_confirmed: "Baja confirmada",
  stub_profile_claimed: "Perfil reclamado",
  // Rabies observation
  rabies_observation_completed_dead_authority: "Observación antirrábica: animal fallecido",
  rabies_observation_completed_negative_owner: "Observación antirrábica finalizada — negativo",
  rabies_observation_completed_professional_owner: "Observación antirrábica finalizada",
  rabies_observation_escalation_owner: "Observación antirrábica: requiere atención",
  rabies_observation_pending_review: "Observación antirrábica pendiente de revisión",
  rabies_observation_started_owner: "Observación antirrábica iniciada",
  // Revocations / service
  revocation_executed_org: "Revocación de verificación ejecutada",
  revocation_executed_vet: "Revocación de matrícula ejecutada",
  service_dog_credential_revoked: "Credencial de perro de asistencia revocada",
  service_offering_approved: "Servicio aprobado",
  service_offering_pending_authority: "Servicio pendiente de aprobación",
  service_offering_rejected: "Servicio rechazado",
  service_offering_submitted: "Servicio enviado para revisión",
  shelter_intake_confirmed: "Ingreso al refugio confirmado",
  // Welfare
  welfare_denuncia_stale_govt: "Denuncia de bienestar sin movimiento",
  welfare_org_intervention_note: "Nota de intervención de bienestar",
  welfare_org_intervention_returned: "Devolución post-intervención registrada",
  welfare_org_intervention_taken: "Mascota tomada en custodia por intervención",
  welfare_org_side_confirmed_reporter: "Denuncia de bienestar confirmada",
  welfare_org_side_critical_received: "Denuncia de bienestar crítica recibida",
  welfare_report_derived_to_org: "Denuncia derivada a organización",
  welfare_report_rederived_away: "Denuncia re-derivada a otra organización",
  welfare_report_status_changed: "Estado de denuncia actualizado",
  // Vaccines
  vaccine_due: "Vacuna próxima a vencer",
  // Rehome
  rehome_request_received: "Solicitud de re-hogar recibida",
};

/**
 * Returns the es-AR human label for a notification_type code.
 * Falls back to the raw code for unknown types (forward-compat).
 */
export function notificationTypeLabel(notificationType: string | null | undefined): string {
  if (!notificationType) return "—";
  return NOTIFICATION_TYPE_LABELS[notificationType] ?? notificationType;
}

export function ageFromDateOfBirth(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < dob.getDate())) {
    years -= 1;
    months += 12;
  }
  if (years > 0) {
    return `${years} año${years === 1 ? "" : "s"}`;
  }
  if (months > 0) {
    return `${months} mes${months === 1 ? "" : "es"}`;
  }
  return "menos de un mes";
}
