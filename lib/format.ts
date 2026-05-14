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
