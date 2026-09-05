// The completar-registro form's draft → what the server accepts, judged by the
// SERVER'S schema.
//
// WHY `completeIdentityInputSchema` AND NOT A HAND-ROLLED CHECK
// ---------------------------------------------------------------------------
// `signup-input.ts` gives the reason one door earlier and it is the same reason:
// the alternative is two definitions of "valid" drifting apart, which is exactly
// what `packages/contract` exists to prevent. `POST /api/v1/me/identity` parses
// the body with `completeIdentityInputSchema`; this module parses the draft with
// the SAME schema and therefore reaches the same verdict — including the two
// parts nobody would reimplement identically by accident:
//
//   · both halves are TRIMMED before they are measured, so `"  "` is empty and
//     `" Ana "` is three characters, not five. A form that measured the raw
//     string would enable its own button for a name the server refuses.
//   · the per-half ceiling is DERIVED from the shared `display_name` bound
//     (`IDENTITY_NAME_MAX_LENGTH`), not chosen here. Hard-coding 40 in the app
//     would be an app that disagrees with the column the day the column moves.
//
// WHAT IT DOES NOT CHECK, DELIBERATELY: whether the resulting name still reads as
// PROVISIONAL. That rule compares the joined name against the caller's own email
// local part (`isIdentityPending`), and this screen does not have the address —
// `MeV1User` carries no email, on purpose, and fetching one to validate a form
// would widen what a stolen token buys in order to save a round trip. The server
// answers `identity_name_provisional` for it and the screen renders that
// sentence like any other refusal.

import {
  type CompleteIdentityInput,
  type CompleteIdentityInputCode,
  IDENTITY_NAME_MAX_LENGTH,
  completeIdentityInputSchema,
  firstCompleteIdentityInputCode,
} from "@dim/contract/input";

/** What the form holds. Two strings, because that is what it asks for. */
export type IdentityDraft = { firstName: string; lastName: string };

export const EMPTY_IDENTITY_DRAFT: IdentityDraft = { firstName: "", lastName: "" };

export type IdentityDraftVerdict =
  | { ok: true; input: CompleteIdentityInput }
  | { ok: false; code: CompleteIdentityInputCode; field: keyof IdentityDraft; message: string };

/**
 * es-AR copy for each refusal the schema can produce. Exhaustive.
 *
 * No `default` and no trailing return: a code added to
 * `COMPLETE_IDENTITY_INPUT_CODES` without copy here is a COMPILE error, not a
 * silently blank hint. Same discipline as `apiErrorMessage` and
 * `signupErrorMessage`, and for the same measured reason — this repo has been
 * bitten by a vocabulary widened on a branch that touched no common file.
 */
export function identityErrorMessage(code: CompleteIdentityInputCode): string {
  switch (code) {
    case "FIRST_NAME_REQUIRED":
      return "Escribí tu nombre.";
    case "LAST_NAME_REQUIRED":
      return "Escribí tu apellido.";
    case "NAME_TOO_LONG":
      return `El nombre y el apellido pueden tener hasta ${IDENTITY_NAME_MAX_LENGTH} caracteres cada uno.`;
  }
}

/** The draft, judged. */
export function toIdentityInput(draft: IdentityDraft): IdentityDraftVerdict {
  const parsed = completeIdentityInputSchema.safeParse({
    firstName: draft.firstName,
    lastName: draft.lastName,
  });
  if (parsed.success) return { ok: true, input: parsed.data };

  const code = firstCompleteIdentityInputCode(parsed.error);
  if (code === null) {
    // The schema refused for something outside the declared code list. That is a
    // CONTRACT violation, not a user error, and it must not be shown as a field
    // hint — it would blame the person for the app's bug.
    return {
      ok: false,
      code: "FIRST_NAME_REQUIRED",
      field: "firstName",
      message: "La app no pudo armar tus datos. Actualizá la app.",
    };
  }

  // WHICH BOX GETS THE RED BORDER. The length code is shared between the two
  // fields, so it is resolved against the draft rather than against the code:
  // the first half that actually overflows is the one the person is looking at.
  const field: keyof IdentityDraft =
    code === "LAST_NAME_REQUIRED" ||
    (code === "NAME_TOO_LONG" && draft.firstName.trim().length <= IDENTITY_NAME_MAX_LENGTH)
      ? "lastName"
      : "firstName";

  return { ok: false, code, field, message: identityErrorMessage(code) };
}

/**
 * Whether the submit button may be enabled. A CONVENIENCE, NOT AUTHORITY — the
 * verdict that decides whether a request is sent is always `toIdentityInput`.
 *
 * PRESENCE ONLY, exactly like `canSubmitSignup`, and for the reason stated there:
 * disabling the button for a name that is too LONG would hide the sentence that
 * says why, and a person staring at a dead button with no explanation cannot tell
 * whether the app is broken or they are. Let them press it, then say what is
 * wrong.
 */
export function canSubmitIdentity(draft: IdentityDraft): boolean {
  return draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0;
}
