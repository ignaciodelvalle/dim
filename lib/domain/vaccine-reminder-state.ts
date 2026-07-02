// Shared helper: pure functions to derive ReminderCard display state.
// No DB access — all inputs are pre-loaded by the call site.

/**
 * Cinco variantes de visualización para un recordatorio de vacuna.
 *
 * - upcoming          → vence en 8+ días.
 * - due_soon          → vence en 1–7 días.
 * - overdue           → vencida hace 0–30 días.
 * - overdue_critical  → vencida hace >30 días Y la vacuna es reportable
 *                       (rabia, parvo, distemper en perro; rabia, panleucopenia en gato).
 * - success           → recordatorio resuelto (vacuna registrada).
 */
export type ReminderVariant = "upcoming" | "due_soon" | "overdue" | "overdue_critical" | "success";

/**
 * Deriva la variante de visualización a partir de los días hasta el vencimiento.
 *
 * @param daysUntilDue - Días hasta el vencimiento. Negativo = ya vencida.
 * @param isReportable - True cuando la vacuna pertenece a `REPORTABLE_VACCINES_BY_SPECIES`
 *                       para la especie del pet. El caller lo resuelve con `isVaccineReportable`.
 *
 * Reglas de borde:
 *  - daysUntilDue = 8  → upcoming  (techo exclusivo de due_soon).
 *  - daysUntilDue = 1  → due_soon  (techo exclusivo de overdue).
 *  - daysUntilDue = 0  → overdue   (vence hoy = ya vencida semánticamente).
 *  - daysUntilDue = -30 → overdue  (el umbral crítico es >30, no >=30).
 *  - daysUntilDue = -31 → overdue_critical (si isReportable=true), overdue si no.
 */
export function getReminderVariant(daysUntilDue: number, isReportable: boolean): ReminderVariant {
  if (daysUntilDue >= 8) return "upcoming";
  if (daysUntilDue >= 1) return "due_soon";
  if (daysUntilDue > -30) return "overdue";
  // Vencida hace más de 30 días.
  return isReportable ? "overdue_critical" : "overdue";
}

/**
 * Deriva la variante `success` cuando el recordatorio está marcado como completado.
 *
 * Decisión de API (C1): el caller pasa un booleano `completed` en lugar de `completedAt`
 * porque la comparación de fechas ya ocurrió en `loadActiveRemindersForUser` (C3) al filtrar
 * filas. El helper solo necesita saber si el recordatorio fue resuelto.
 *
 * @param completed - True cuando `reminders.completed_at IS NOT NULL`.
 */
export function getCompletedVariant(completed: boolean): ReminderVariant | null {
  return completed ? "success" : null;
}

// ---------------------------------------------------------------------------
// Catálogo de vacunas reportables (hardcoded — decisión C-D2)
//
// TODO(eno): reemplazar por `getReportableVaccines(species, jurisdiction)` importado
// desde `lib/disease-public-alert-catalog.ts` una vez que el diseño
// `docs/superpowers/specs/2026-05-19-eno-vet-direct-report-and-owner-alerts-design.md`
// sea implementado. La API pública ya acepta `jurisdiction` por lo que el swap
// es no-breaking (decisión C-D2).
// ---------------------------------------------------------------------------

const REPORTABLE_VACCINES_BY_SPECIES: Record<string, readonly string[]> = {
  dog: ["rabia", "parvo", "distemper"],
  cat: ["rabia", "panleucopenia"],
};

// Internal matching roots, diacritics-free. "rabi" covers both "rabia" and "antirrábica"
// ("antirrabica".includes("rabia") = false because the embedded root is "rrabica", not "rabia").
// These roots are not exposed — they only drive isVaccineReportable substring matching.
const REPORTABLE_MATCH_ROOTS_BY_SPECIES: Record<string, readonly string[]> = {
  dog: ["rabi", "parvo", "distemper"],
  cat: ["rabi", "panleucopenia"],
};

/**
 * Retorna la lista de vacunas reportables para una especie y jurisdicción.
 *
 * @param species      - Especie del pet ("dog", "cat", etc.)
 * @param _jurisdiction - Jurisdicción (ignorada en esta versión hardcoded; se usará
 *                        en la implementación de `disease-public-alert-catalog.ts`).
 * @returns Array de strings con los nombres de vacunas reportables. Vacío si la especie
 *          no tiene vacunas reportables registradas.
 */
export function getReportableVaccines(species: string, _jurisdiction: string): readonly string[] {
  return REPORTABLE_VACCINES_BY_SPECIES[species] ?? [];
}

/**
 * Normaliza un string para comparación: lowercase + elimina diacríticos (NFD decompose + strip marks).
 * Permite que "Antirrábica" matchee "rabia": "antirrabica".includes("rabia") → true.
 *
 * Exportada para reuso fuera de este módulo (ej: matching case/accent-insensitive
 * de títulos de recordatorios de vacuna en vaccination-use-case.ts, ya que no existe
 * una clave estructural de tipo-de-vacuna en `reminders` — el título es texto libre).
 */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Determina si una vacuna es reportable (obligatoria por ley) para una especie y jurisdicción.
 *
 * La comparación es case-insensitive y diacritic-insensitive, busca por substring.
 * Por ejemplo, "Antirrábica" matchea "rabia": normalize("Antirrábica") = "antirrabica",
 * que contiene normalize("rabia") = "rabia".
 *
 * @param vaccineName  - Nombre de la vacuna como aparece en el registro (ej: "Antirrábica anual").
 * @param species      - Especie del pet.
 * @param jurisdiction - Jurisdicción del pet (CABA, PROV_BA, etc.).
 */
export function isVaccineReportable(
  vaccineName: string,
  species: string,
  jurisdiction: string,
): boolean {
  const roots = REPORTABLE_MATCH_ROOTS_BY_SPECIES[species] ?? [];
  const normalizedName = normalize(vaccineName);
  return roots.some((root) => normalizedName.includes(normalize(root)));
}
