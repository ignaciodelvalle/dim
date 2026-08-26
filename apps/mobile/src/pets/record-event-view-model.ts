// Asentar — turning what a person typed into what the contract accepts.
//
// PURE, AND THAT IS THE WHOLE POINT. The screen owns text inputs and a `kind`;
// this owns the mapping from those strings to `RecordEventInput`, the es-AR
// sentence for every refusal, and the small amount of Argentine calendar a form
// needs to offer a sensible default. None of it touches the network, so all of
// it is testable without one.
//
// THE VALIDATION IS THE SERVER'S OWN SCHEMA, imported, not re-stated. The point
// of `@dim/contract/input` is that the two doors cannot disagree about what a
// weight or a frequency is; a second copy of "must be under 120" written here in
// the name of a nicer message would be the exact drift the package exists to
// stop. What lives here is the WORDS — the contract carries codes, the consumer
// owns its copy, the same division `intake.ts` states.

import {
  DEWORMING_TYPES,
  type DewormingType,
  MAX_CUSTOM_HOURS,
  MAX_DURATION_DAYS,
  MAX_WEIGHT_KG,
  MEDICATION_FREQUENCIES,
  type MedicationFrequency,
  NOTE_CATEGORIES,
  type NoteCategory,
  type RecordEventInput,
  type RecordEventInputCode,
  firstRecordEventInputCode,
  recordEventInputSchema,
} from "@dim/contract/input";

/**
 * The five kinds the "Asentar" picker offers.
 *
 * MEDICACIÓN FIN IS NOT AMONG THEM, and its absence is a decision rather than an
 * omission. Ending a treatment needs the `medication_started` event it ends, and
 * the only place a person already holds that identifier is the asiento itself —
 * so the affordance lives on THAT screen, where picking is not required. A
 * picker here would have to invent a list of open treatments, and a list built
 * from a second read is a second source for something the ledger already says.
 */
export const RECORD_KINDS = [
  "vaccination",
  "weight",
  "deworming",
  "medication_start",
  "note",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** Every kind this screen can write, including the one reached from an asiento. */
export type WritableKind = RecordKind | "medication_end";

const WRITABLE_KINDS: ReadonlySet<string> = new Set<WritableKind>([
  ...RECORD_KINDS,
  "medication_end",
]);

/**
 * Is this string one of the six?
 *
 * Used at the ROUTE boundary, where `kind` arrives from a URL. A deep link
 * carrying a kind this build does not know must land on the picker — which is
 * where the person was going — rather than render a form for `undefined`.
 */
export function isWritableKind(value: string): value is WritableKind {
  return WRITABLE_KINDS.has(value);
}

/** The title of the form for one kind. */
export function kindTitle(kind: WritableKind): string {
  switch (kind) {
    case "vaccination":
      return "Vacuna";
    case "weight":
      return "Peso";
    case "deworming":
      return "Antiparasitario";
    case "medication_start":
      return "Medicación · inicio";
    case "medication_end":
      return "Medicación · fin";
    case "note":
      return "Nota";
  }
}

/** One line under the title, saying what this asiento is for. */
export function kindSubtitle(kind: WritableKind): string {
  switch (kind) {
    case "vaccination":
      return "Una dosis aplicada. Queda en la libreta con la fecha del hecho.";
    case "weight":
      return "Un pesaje. Actualiza el peso que muestra la ficha.";
    case "deworming":
      return "Una desparasitación interna, externa o ambas.";
    case "medication_start":
      return "El comienzo de un tratamiento. Programa los recordatorios de cada dosis.";
    case "medication_end":
      return "El final de un tratamiento. Cancela los recordatorios que quedaban.";
    case "note":
      return "Algo que querés dejar anotado sobre tu mascota.";
  }
}

/** es-AR label for an antiparasitic route. */
export function dewormingTypeLabel(type: DewormingType): string {
  switch (type) {
    case "internal":
      return "Interno";
    case "external":
      return "Externo";
    case "both":
      return "Ambos";
  }
}

/**
 * es-AR label for a dosing frequency.
 *
 * The same six words the web's `FREQUENCY_LABELS` uses. Repeated here rather
 * than imported because that table lives in `lib/reference/`, which is server
 * code — and the interval each one MEANS is still the server's arithmetic, so
 * this is copy and not a rule.
 */
export function frequencyLabel(frequency: MedicationFrequency): string {
  switch (frequency) {
    case "once_daily":
      return "1 vez al día";
    case "twice_daily":
      return "2 veces al día";
    case "three_times_daily":
      return "3 veces al día";
    case "four_times_daily":
      return "4 veces al día";
    case "single_dose":
      return "Dosis única";
    case "custom":
      return "Personalizada";
  }
}

/** es-AR label for a note category. */
export function noteCategoryLabel(category: NoteCategory): string {
  switch (category) {
    case "comportamiento":
      return "Comportamiento";
    case "dieta":
      return "Dieta";
    case "grooming":
      return "Higiene";
    case "estado_de_animo":
      return "Estado de ánimo";
    case "otro":
      return "Otro";
  }
}

export const DEWORMING_TYPE_OPTIONS = DEWORMING_TYPES;
export const FREQUENCY_OPTIONS = MEDICATION_FREQUENCIES;
export const NOTE_CATEGORY_OPTIONS = NOTE_CATEGORIES;

/**
 * Today, as an Argentine calendar day.
 *
 * ARGENTINA IS UTC-3 ALL YEAR — no DST since 2009 — so a fixed offset is exact
 * and needs no zone database, which is the same reasoning
 * `parseArDatetimeLocal` records on the server. Computed rather than taken from
 * the device's own locale because a phone that travels with its owner would
 * otherwise offer "yesterday" as today's default from a plane over the Atlantic,
 * and the server would refuse a day the owner never chose.
 */
export function todayInAr(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The screen's raw text state. Every field is a string; empty means unstated. */
export type EventDraft = {
  occurredAt: string;
  notes: string;
  // vacuna
  vaccineName: string;
  brand: string;
  batch: string;
  administeredBy: string;
  nextDueAt: string;
  // peso
  kg: string;
  // antiparasitario
  product: string;
  dewormingType: DewormingType;
  // medicación
  drugName: string;
  dose: string;
  prescribedBy: string;
  frequency: MedicationFrequency;
  customHours: string;
  durationDays: string;
  firstDoseDay: string;
  firstDoseTime: string;
  reason: string;
  // nota
  text: string;
  category: NoteCategory | null;
};

/** A blank draft, dated today. */
export function emptyDraft(now: Date = new Date()): EventDraft {
  const today = todayInAr(now);
  return {
    occurredAt: today,
    notes: "",
    vaccineName: "",
    brand: "",
    batch: "",
    administeredBy: "",
    nextDueAt: "",
    kg: "",
    product: "",
    dewormingType: "internal",
    drugName: "",
    dose: "",
    prescribedBy: "",
    frequency: "once_daily",
    customHours: "",
    durationDays: "",
    firstDoseDay: today,
    firstDoseTime: "08:00",
    reason: "",
    text: "",
    category: null,
  };
}

/** `""` → `null`, so an untouched optional field is "not stated" and not "". */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `""` → `null`, otherwise the number — leaving the SCHEMA to judge it. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The draft as the contract's own shape, BEFORE validation.
 *
 * Deliberately not clever: it never decides a field is wrong — that is
 * `recordEventInputSchema`'s job and duplicating it here is how the app and the
 * server end up refusing different things. An unreadable weight still becomes
 * `NaN` here, because `kg` is a NUMBER on the wire and "abc" has no other
 * representation to send; what that `NaN` MEANS is settled by
 * `unreadableWeight` before the parse, for the reason written there.
 */
function draftToWire(
  kind: WritableKind,
  draft: EventDraft,
  sourceEventId: string | null,
  sameDayOverride: boolean,
): unknown {
  switch (kind) {
    case "vaccination":
      return {
        kind,
        vaccineName: draft.vaccineName,
        occurredAt: draft.occurredAt.trim(),
        brand: orNull(draft.brand),
        batch: orNull(draft.batch),
        administeredBy: orNull(draft.administeredBy),
        nextDueAt: orNull(draft.nextDueAt),
        notes: orNull(draft.notes),
        sameDayOverride,
      };
    case "weight":
      return {
        kind,
        kg: numberOrNull(draft.kg) ?? Number.NaN,
        occurredAt: draft.occurredAt.trim(),
        notes: orNull(draft.notes),
      };
    case "deworming":
      return {
        kind,
        product: draft.product,
        type: draft.dewormingType,
        occurredAt: draft.occurredAt.trim(),
        nextDueAt: orNull(draft.nextDueAt),
        notes: orNull(draft.notes),
        sameDayOverride,
      };
    case "medication_start":
      return {
        kind,
        drugName: draft.drugName,
        dose: draft.dose,
        prescribedBy: orNull(draft.prescribedBy),
        occurredAt: draft.occurredAt.trim(),
        frequency: draft.frequency,
        customHours: draft.frequency === "custom" ? numberOrNull(draft.customHours) : null,
        durationDays: numberOrNull(draft.durationDays),
        // The two halves the form collects separately, joined into the one
        // string the contract describes. A single free-text
        // "AAAA-MM-DDTHH:mm" field would ask a person to type a `T`.
        firstDoseAt: `${draft.firstDoseDay.trim()}T${draft.firstDoseTime.trim()}`,
        notes: orNull(draft.notes),
      };
    case "medication_end":
      return {
        kind,
        medicationStartedEventId: sourceEventId ?? "",
        occurredAt: draft.occurredAt.trim(),
        reason: orNull(draft.reason),
        notes: orNull(draft.notes),
      };
    case "note":
      return {
        kind,
        text: draft.text,
        occurredAt: draft.occurredAt.trim(),
        category: draft.category,
      };
  }
}

export type DraftResult =
  | { ok: true; input: RecordEventInput }
  | { ok: false; message: string; code: RecordEventInputCode | null };

/**
 * Is the weight field filled in with something that is not a number?
 *
 * THE ONE REFUSAL THE SCHEMA CANNOT WORD, and it took reading zod's own type
 * check to see why. `kg` is a NUMBER on the wire, so "abc" has no representation
 * to send and `draftToWire` sends `NaN` — and `z.number()` rejects `NaN` as an
 * INVALID TYPE, which is the very same issue a MISSING number raises. Both come
 * back `WEIGHT_REQUIRED`, so the person read "Falta el peso." underneath a field
 * with "abc" sitting visibly in it. The `WEIGHT_INVALID` refine below it never
 * runs, because a value that failed the type check never reaches a refinement.
 *
 * This is NOT the re-stated rule the file header warns about. The ceiling is
 * still `MAX_WEIGHT_KG` in the contract and the positivity is still the schema's
 * refine; what is decided here is whether the text is a number AT ALL — a fact
 * about the TEXT, which only the layer holding the text has. It answers with the
 * contract's own `WEIGHT_INVALID`, so there is still one vocabulary and one
 * message table.
 */
function unreadableWeight(kind: WritableKind, draft: EventDraft): boolean {
  if (kind !== "weight") return false;
  const trimmed = draft.kg.trim();
  return trimmed.length > 0 && numberOrNull(trimmed) === null;
}

/**
 * Validate a draft against the SERVER'S schema and hand back either the body to
 * send or the one sentence to show.
 *
 * One message, not a per-field map, because these forms are short enough that a
 * single line under the CTA is read and a scattered set is not — and because
 * `firstRecordEventInputCode` returns the issues in the schema's own declared
 * order, so the sentence names the first thing to fix rather than a random one.
 */
export function validateDraft(
  kind: WritableKind,
  draft: EventDraft,
  options: { sourceEventId?: string | null; sameDayOverride?: boolean } = {},
): DraftResult {
  if (unreadableWeight(kind, draft)) {
    return { ok: false, code: "WEIGHT_INVALID", message: inputCodeMessage("WEIGHT_INVALID") };
  }

  const wire = draftToWire(
    kind,
    draft,
    options.sourceEventId ?? null,
    options.sameDayOverride ?? false,
  );
  const parsed = recordEventInputSchema.safeParse(wire);
  if (parsed.success) return { ok: true, input: parsed.data };
  const code = firstRecordEventInputCode(parsed.error);
  return { ok: false, code, message: inputCodeMessage(code) };
}

/**
 * es-AR copy for every input code. Exhaustive: a code added to the contract is
 * a COMPILE error here, the same guarantee `apiErrorMessage` gives for the
 * failure vocabulary.
 */
export function inputCodeMessage(code: RecordEventInputCode | null): string {
  if (code === null) {
    // The parse failed on something the contract does not name — a client and a
    // contract out of step. Honest about being unable to say more.
    return "Revisá los datos: hay un campo que la app no pudo interpretar.";
  }
  switch (code) {
    case "KIND_REQUIRED":
      return "Esta versión de la app no puede registrar este tipo de asiento. Actualizá la app.";
    case "OCCURRED_AT_REQUIRED":
      return "Falta la fecha.";
    case "OCCURRED_AT_INVALID":
      return "La fecha no existe. Usá el formato AAAA-MM-DD.";
    case "VACCINE_NAME_REQUIRED":
      return "Falta el nombre de la vacuna.";
    case "NEXT_DUE_AT_INVALID":
      return "La fecha de la próxima dosis no existe. Usá el formato AAAA-MM-DD.";
    case "WEIGHT_REQUIRED":
      return "Falta el peso.";
    case "WEIGHT_INVALID":
      return "El peso tiene que ser un número mayor que cero.";
    case "WEIGHT_TOO_HIGH":
      return `El peso no puede superar los ${MAX_WEIGHT_KG} kg.`;
    case "PRODUCT_REQUIRED":
      return "Falta el nombre del producto.";
    case "DEWORMING_TYPE_INVALID":
      return "Elegí si el antiparasitario es interno, externo o ambos.";
    case "DRUG_NAME_REQUIRED":
      return "Falta el nombre del medicamento.";
    case "DOSE_REQUIRED":
      return "Falta la dosis.";
    case "FREQUENCY_INVALID":
      return "Elegí cada cuánto se da el medicamento.";
    case "CUSTOM_HOURS_INVALID":
      return `El intervalo tiene que estar entre 1 y ${MAX_CUSTOM_HOURS} horas.`;
    case "DURATION_DAYS_INVALID":
      return `La duración tiene que estar entre 1 y ${MAX_DURATION_DAYS} días.`;
    case "FIRST_DOSE_AT_REQUIRED":
      return "Falta la fecha y la hora de la primera dosis.";
    case "FIRST_DOSE_AT_INVALID":
      return "La fecha y hora de la primera dosis no existen. Usá AAAA-MM-DD y HH:mm.";
    case "MEDICATION_SOURCE_REQUIRED":
      // Reachable only if the app opened this form without the asiento it ends.
      return "No pudimos identificar la medicación que estás terminando. Abrila desde su asiento.";
    case "TEXT_REQUIRED":
      return "Falta el contenido de la nota.";
    case "NOTE_CATEGORY_INVALID":
      return "Esa categoría no existe. Elegí una de la lista.";
  }
}

/** The sentence shown after a successful append. */
export const RECORD_DONE_LABEL = "Asiento registrado.";

/**
 * The sentence for a REPLAY.
 *
 * Said out loud rather than folded into the success copy, because the two are
 * different facts and the second one explains something the owner can otherwise
 * only find confusing: they pressed Guardar again and the libreta did not grow.
 */
export const RECORD_DUPLICATE_LABEL =
  "Este asiento ya estaba registrado — no se duplicó. Abrí la libreta para verlo.";

/** The prompt for the same-day soft gate. */
export const SAME_DAY_PROMPT_LABEL =
  "Ya hay un registro igual para esta mascota en esta fecha. ¿Querés registrar otro?";

/**
 * The note the immutability of the ledger deserves, shown on every form.
 *
 * The web says the same thing on its own forms, and it is not decoration: a
 * person about to write into an append-only registry should know that before
 * they press the button, not after they want it back.
 */
export const RECORD_IMMUTABILITY_NOTE =
  "Los asientos no se editan ni se borran. Si te equivocás, se corrige agregando una corrección encima.";
