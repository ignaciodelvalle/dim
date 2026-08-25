// The wizard's draft → what the server accepts, judged by the SERVER'S schema.
//
// WHY `registerPetInputSchema` AND NOT A HAND-ROLLED CHECK
// ---------------------------------------------------------------------------
// Because the alternative is two definitions of "valid" drifting apart, which is
// the exact failure `packages/contract` exists to prevent. The route handler
// parses the body with `registerPetInputSchema` from `@dim/contract/input`; this
// module parses the draft with the SAME schema, the same zod, and therefore
// reaches the same verdict — including the parts nobody would reimplement the
// same way by accident:
//
//   · `ageYears` / `ageMonths` accept a string OR a number, clamp to [0, max],
//     truncate, and turn unparseable text into 0 rather than into a refusal.
//   · `sex` falls back to `"unknown"` via `.catch()` instead of failing.
//   · `acquisitionMethod` becomes `null` for anything outside the enum.
//   · every optional text field trims and collapses empty to `null`.
//
// A native form that "validated the same rules" would get at least one of those
// wrong, and the wrong ones would be invisible: the request would just be
// refused, or accepted with a value the user did not type.
//
// SO THE WIZARD HOLDS STRINGS and hands them here. That is not laziness — it is
// what a text input actually contains, and the schema is built to receive
// exactly that.
//
// THE STEP PREDICATES AT THE BOTTOM ARE CONVENIENCES, NOT AUTHORITY. They exist
// so "Siguiente" can be disabled before the last step; the verdict that decides
// whether a request is sent is always `toRegisterPetInput`.

import {
  type RegisterPetInput,
  type RegisterPetInputCode,
  firstRegisterPetInputCode,
  registerPetInputSchema,
} from "@dim/contract/input";

/** What the wizard holds: strings, because that is what inputs contain. */
export type PetDraft = {
  name: string;
  /** A `PetSpecies` value, or "" before the user has chosen. */
  species: string;
  /** A `PetSex` value, or "" — the schema turns anything else into "unknown". */
  sex: string;
  breed: string;
  provinceCode: string;
  localityName: string;
  ageYears: string;
  ageMonths: string;
  color: string;
  estimatedWeightKg: string;
  /** An `AcquisitionMethod` value, or "" — the schema turns anything else into null. */
  acquisitionMethod: string;
  /** Set only after the server answered 409 and the user chose to continue. */
  duplicateOverride: boolean;
};

export const EMPTY_DRAFT: PetDraft = {
  name: "",
  species: "",
  sex: "",
  breed: "",
  provinceCode: "",
  localityName: "",
  ageYears: "",
  ageMonths: "",
  color: "",
  estimatedWeightKg: "",
  acquisitionMethod: "",
  duplicateOverride: false,
};

export type DraftVerdict =
  | { ok: true; input: RegisterPetInput }
  | { ok: false; code: RegisterPetInputCode; message: string };

/**
 * es-AR copy for each refusal the schema can produce. Exhaustive.
 *
 * No `default` and no trailing return: a code added to
 * `REGISTER_PET_INPUT_CODES` without copy here is a compile error, not a
 * silently blank field label. Same discipline as the API error switch, for the
 * same reason — this repo has been bitten by a widened vocabulary arriving
 * through a branch merge that touched no common file.
 */
export function draftErrorMessage(code: RegisterPetInputCode): string {
  switch (code) {
    case "NAME_REQUIRED":
      return "Poné el nombre de tu mascota.";
    case "SPECIES_REQUIRED":
      return "Elegí qué animal es.";
    case "PROVINCE_REQUIRED":
      return "Elegí la provincia.";
    case "LOCALITY_REQUIRED":
      return "Elegí la localidad.";
  }
}

/**
 * The draft, judged.
 *
 * `duplicateOverride` rides in the body rather than in a header or a query
 * param because that is where the schema puts it, and because it is a property
 * of THIS registration — the user's answer to "ya tenés una con ese nombre" —
 * not of the transport.
 */
export function toRegisterPetInput(draft: PetDraft): DraftVerdict {
  const parsed = registerPetInputSchema.safeParse({
    name: draft.name,
    species: draft.species,
    sex: draft.sex,
    breed: draft.breed,
    provinceCode: draft.provinceCode,
    localityName: draft.localityName,
    ageYears: draft.ageYears,
    ageMonths: draft.ageMonths,
    color: draft.color,
    estimatedWeightKg: draft.estimatedWeightKg,
    acquisitionMethod: draft.acquisitionMethod,
    duplicateOverride: draft.duplicateOverride,
  });

  if (parsed.success) return { ok: true, input: parsed.data };

  // `firstRegisterPetInputCode` returns the first code in the CONTRACT'S order,
  // not zod's issue order, so the message the user sees is the first field of
  // the form rather than whichever rule happened to fail first.
  const code = firstRegisterPetInputCode(parsed.error);
  if (code === null) {
    // The schema refused for something outside the declared code list. That is a
    // contract violation, not a user error, and it must not be shown as a field
    // hint — it would blame the user for the app's bug.
    return {
      ok: false,
      code: "NAME_REQUIRED",
      message: "La app no pudo armar el registro. Actualizá la app.",
    };
  }
  return { ok: false, code, message: draftErrorMessage(code) };
}

// ---------------------------------------------------------------------------
// Step gating. Conveniences — see the header.
// ---------------------------------------------------------------------------

export const WIZARD_STEPS = [
  "nombre",
  "especie",
  "raza",
  "lugar",
  "detalles",
  "confirmar",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** es-AR title for each step. Exhaustive. */
export function stepTitle(step: WizardStep): string {
  switch (step) {
    case "nombre":
      return "¿Cómo se llama?";
    case "especie":
      return "¿Qué animal es?";
    case "raza":
      return "Raza";
    case "lugar":
      return "¿Dónde vive?";
    case "detalles":
      return "Detalles (opcional)";
    case "confirmar":
      return "Confirmar";
  }
}

/** Whether the wizard may advance past `step` with this draft. */
export function canAdvance(step: WizardStep, draft: PetDraft): boolean {
  switch (step) {
    case "nombre":
      return draft.name.trim().length > 0;
    case "especie":
      return draft.species.trim().length > 0;
    // Breed and the optional details are genuinely optional — the server takes
    // `null` for both. A step you cannot skip is a required field wearing a
    // different hat, and this form's whole point is that registering a pet takes
    // a name and a place.
    case "raza":
    case "detalles":
      return true;
    case "lugar":
      return draft.provinceCode.trim().length > 0 && draft.localityName.trim().length > 0;
    case "confirmar":
      return toRegisterPetInput(draft).ok;
  }
}
