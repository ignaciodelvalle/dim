// Pure helpers for PetCurrentStateSection — extracted to a separate .ts file
// so they can be unit-tested without a JSX transformer.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Subset of the Pet record needed by PetCurrentStateSection.
 * tattooCode / tattooLocation are required as of #125 (tattoo-identifier merged
 * to develop 2026-05-22) — both columns exist on every pet row.
 */
export interface CurrentStatePet {
  microchipId: string | null;
  microchipImplantedAt: string | null;
  tattooCode: string | null;
  tattooLocation: string | null;
  estimatedWeightKg: string | null;
  knownAllergies: string[] | null;
  trainingLevel: string | null;
  favouriteFoods: string[] | null;
  pregnancyStatus: string | null;
  rabiesObservationStatus: string | null;
}

export interface CurrentStateEvent {
  eventType: string;
  occurredAt: Date | string;
}

export interface CurrentStateFields {
  weight: { kg: string; lastRecordedAt: Date | null } | null;
  microchip: { id: string; implantedAt: string | null } | null;
  tattoo: { code: string; location: string | null } | null;
  sterilized: boolean;
  allergies: string[] | null;
  trainingLevel: string | null;
  favouriteFoods: string[] | null;
  pregnancy: { status: string } | null;
  rabiesObservation: { status: string } | null;
}

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

/**
 * Derives which CurrentStateSection fields to render from a pet + its events.
 * Pure function — no side effects. Used by both the component and its tests.
 */
export function deriveCurrentStateFields(
  pet: CurrentStatePet,
  events: CurrentStateEvent[],
): CurrentStateFields {
  // Weight: last weight_recorded event for the "hace X" suffix.
  const weightEvents = events
    .filter((e) => e.eventType === "weight_recorded")
    .sort((a, b) => {
      const aTime =
        a.occurredAt instanceof Date ? a.occurredAt.getTime() : new Date(a.occurredAt).getTime();
      const bTime =
        b.occurredAt instanceof Date ? b.occurredAt.getTime() : new Date(b.occurredAt).getTime();
      return bTime - aTime;
    });
  const lastWeightEvent = weightEvents[0] ?? null;
  const lastWeightDate = lastWeightEvent
    ? lastWeightEvent.occurredAt instanceof Date
      ? lastWeightEvent.occurredAt
      : new Date(lastWeightEvent.occurredAt)
    : null;

  // Sterilization: has any sterilization_performed event.
  const sterilized = events.some((e) => e.eventType === "sterilization_performed");

  return {
    weight: pet.estimatedWeightKg
      ? { kg: pet.estimatedWeightKg, lastRecordedAt: lastWeightDate }
      : null,
    microchip: pet.microchipId
      ? { id: pet.microchipId, implantedAt: pet.microchipImplantedAt }
      : null,
    tattoo: pet.tattooCode ? { code: pet.tattooCode, location: pet.tattooLocation ?? null } : null,
    sterilized,
    allergies: pet.knownAllergies?.length ? pet.knownAllergies : null,
    trainingLevel: pet.trainingLevel ?? null,
    favouriteFoods: pet.favouriteFoods?.length ? pet.favouriteFoods : null,
    pregnancy: pet.pregnancyStatus ? { status: pet.pregnancyStatus } : null,
    rabiesObservation: pet.rabiesObservationStatus ? { status: pet.rabiesObservationStatus } : null,
  };
}

// ---------------------------------------------------------------------------
// Display helpers (also pure — shared with component)
// ---------------------------------------------------------------------------

export function tattooLocationLabel(location: string | null): string {
  if (!location) return "";
  const MAP: Record<string, string> = {
    inner_ear_left: "oreja izquierda (interior)",
    inner_ear_right: "oreja derecha (interior)",
    groin: "ingle",
    abdomen: "abdomen",
    neck: "cuello",
  };
  return MAP[location] ?? location.replace(/_/g, " ");
}

export function trainingLevelLabel(level: string): string {
  switch (level) {
    case "none":
      return "Ninguno";
    case "basic":
      return "Básico";
    case "intermediate":
      return "Intermedio";
    case "advanced":
      return "Avanzado";
    case "professional":
      return "Profesional";
    default:
      return level;
  }
}

export function pregnancyStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "En curso";
    case "completed_live_birth":
      return "Completada (parto)";
    case "completed_stillbirth":
      return "Completada (nacido muerto)";
    case "completed_miscarriage":
      return "Completada (aborto)";
    case "completed_termination":
      return "Interrumpida";
    default:
      return status.replace(/_/g, " ");
  }
}

export function hacoLabel(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "hace 1 día";
  if (diffDays < 30) return `hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "hace 1 mes";
  if (diffMonths < 12) return `hace ${diffMonths} meses`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "hace 1 año" : `hace ${diffYears} años`;
}
