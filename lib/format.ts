// Spanish-language formatting helpers for dates, enums, and event labels.
// All UI strings live here so we can change copy without touching components.

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

export function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "pet_registered":
      return "Mascota registrada";
    case "pet_profile_updated":
      return "Perfil actualizado";
    case "vaccination_administered":
      return "Vacuna administrada";
    case "deworming_administered":
      return "Antiparasitario";
    case "medication_started":
      return "Inicio de medicación";
    case "medication_stopped":
      return "Fin de medicación";
    case "vet_visit_logged":
      return "Visita al veterinario";
    case "weight_recorded":
      return "Peso registrado";
    case "microchip_implanted":
      return "Microchip implantado";
    case "sterilization_performed":
      return "Esterilización";
    case "death_recorded":
      return "Fallecimiento";
    case "note_added":
      return "Nota";
    case "status_changed":
      return "Cambio de estado";
    case "credential_scanned":
      return "Credencial escaneada";
    case "symptom_observed":
      return "Síntoma observado";
    case "abandonment_reported":
      return "Abandono reportado";
    case "maltreatment_reported":
      return "Maltrato reportado";
    default:
      return eventType;
  }
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
