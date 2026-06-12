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
