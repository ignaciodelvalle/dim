// THE error switch. One per app, not one per endpoint.
//
// This is `apiErrorMessage` and `apiV1ErrorCode`, lifted verbatim out of
// `credential/credential-api.ts` when the app grew a second caller. The lifting
// is the point: the switch is exhaustive over `API_V1_ERROR_CODES` with no
// `default` and no trailing return, so a code added to the contract is a COMPILE
// error here — and that guarantee is worth exactly as much as the number of
// copies of the switch, which must therefore be one.
//
// It has already earned its keep three times. It covered the three codes the
// vocabulary had when it was written; WU-A widened `API_V1_ERROR_CODES` from
// three to ten on a branch that did not contain this app and the two merged
// without touching a common file (git had nothing to report); WU-B added the
// three write codes; B9 added `session_shift_expired`. Every one of those was
// found by the typechecker and by nothing else.
//
// A FAILURE THAT MAPS TO NO MESSAGE renders as an empty `<Text>` under a "no se
// pudo" heading — a blank where an explanation should be, which is the same
// class of dishonesty as a blank `unavailable` section. Two things enforce that
// it cannot happen: the code is validated against the contract's CLOSED
// vocabulary at the parse boundary (`apiV1ErrorCode`) rather than merely
// asserted by a type, and the switch below is exhaustive.

import { API_V1_ERROR_CODES, type ApiV1ErrorCode } from "@dim/contract/api";

/**
 * The endpoint's error vocabulary, as a runtime set.
 *
 * `API_V1_ERROR_CODES` is exported by the contract as a frozen array precisely
 * so a client can do this instead of hard-coding the strings. Checking
 * MEMBERSHIP — not just `typeof === "string"` — is what keeps an unrecognised
 * code from flowing into a result union as a valid `ApiV1ErrorCode` it is not,
 * and then falling out of the message switch as a blank line on the screen.
 */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(API_V1_ERROR_CODES);

/** The declared error code, or `null` if the body does not carry a known one. */
export function apiV1ErrorCode(body: unknown): ApiV1ErrorCode | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" && KNOWN_ERROR_CODES.has(code) ? (code as ApiV1ErrorCode) : null;
}

/** es-AR copy for each API error code. Exhaustive: every code has a sentence. */
export function apiErrorMessage(code: ApiV1ErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "Demasiadas consultas. Esperá un momento y volvé a intentar.";
    case "not_found":
      return "No encontramos una credencial para este código.";
    case "temporarily_unavailable":
      return "El servidor no pudo responder. Volvé a intentar en unos segundos.";
    case "auth_required":
      return "Necesitás iniciar sesión para ver esto.";
    case "auth_expired":
      return "Tu sesión venció. Iniciá sesión de nuevo.";
    // One sentence for "no such account" and for "wrong password" alike — the
    // contract keeps the two byte-identical so this endpoint never becomes an
    // account-enumeration oracle, and copy that split them would undo that.
    case "invalid_credentials":
      return "El email o la contraseña no coinciden.";
    case "account_deactivated":
      return "Esta cuenta está desactivada. Contactate con tu organización.";
    case "account_erased":
      return "Esta cuenta ya no existe.";
    // B9. Deliberately NOT the `auth_expired` sentence, even though both are
    // 401s: that one says "tu sesión venció", which invites a refresh, and a
    // refresh here SUCCEEDS (the session is valid at GoTrue — the 8-hour
    // operator shift is our policy) and the retry is refused again, forever.
    // This copy has to send the person through a full sign-in.
    //
    // A citizen wallet has no operator surface, so nobody using this app should
    // ever see it. Answered because this function's contract is the whole
    // vocabulary, not one endpoint's subset.
    case "session_shift_expired":
      return "Tu turno de trabajo terminó. Volvé a iniciar sesión para seguir.";
    case "invalid_request":
      return "La app envió un pedido que el servidor no pudo leer. Actualizá la app.";
    case "signup_failed":
      return "No pudimos crear la cuenta. Volvé a intentar en unos minutos.";
    // Covers BOTH halves of the code: the header was absent, OR it was present
    // and not a UUID. They were joined into one code deliberately (see
    // `idempotency_key_required` in @dim/contract/api — the fix is the same
    // sentence either way).
    case "idempotency_key_required":
      return "La app envió un registro con una clave de reintento ausente o mal formada. Actualizá la app.";
    case "duplicate_pet_suspected":
      return "Ya tenés una mascota registrada con ese nombre. Revisá tu lista antes de crear otra.";
    case "pet_registration_failed":
      return "No pudimos completar el registro. Volvé a intentar en unos minutos.";
    // WU-J, the correction codes. A screen that got here has already been told
    // the specific reason — `PetEventDetailV1.amend.refusal` carries it — so
    // these are the sentences for a client that reached the door anyway.
    case "amend_forbidden":
      // The web's own words, verbatim: the person needs a capability granted,
      // and naming it is what lets them ask for the right thing.
      return "Necesitás el permiso 'Registrar eventos clínicos' (event.write). Pediselo a un administrador.";
    case "amend_not_allowed":
      // Covers both halves of the code — a type outside the allowlist, and a
      // deceased animal — because the client's move is the same either way and
      // the screen already holds the precise reason.
      return "Este registro no admite correcciones.";
    case "amend_failed":
      return "No pudimos guardar la corrección. Volvé a intentar en unos minutos.";
    // FI-7. Reachable only for an `admin` or `govt` profile — a rule about WHO
    // is asking, which no wire schema can check, so the refusal can only arrive
    // from the server and has to say what to do about it. A citizen wallet's
    // user never sees this; an administrator who also owns a pet does.
    case "amend_reason_required":
      return "Para corregir este registro tenés que indicar un motivo de al menos 5 caracteres.";
    // WU-K, the writer codes. Every one of these is reachable from an "Asentar"
    // form, and every sentence has to say what the person does NEXT — these are
    // shown under a filled-in form somebody is waiting to submit.
    case "event_forbidden":
      // The web's own words: the person needs a capability granted, and naming
      // it is what lets them ask for the right thing.
      return "Necesitás el permiso 'Registrar eventos clínicos' (event.write). Pediselo a un administrador.";
    case "event_not_allowed":
      // A closed life record. Deliberately says which asiento IS still
      // accepted, because the endpoint accepts it and a bare refusal would hide
      // the one thing left to do.
      return "Esta mascota está registrada como fallecida y no acepta nuevos registros clínicos. Sí podés dejar una nota.";
    case "event_date_future":
      return "La fecha no puede ser futura.";
    case "event_date_before_birth":
      // NOT folded into the sentence above, because the fix is different: either
      // the date is wrong or the birth date on the record is, and only the
      // person can say which.
      return "La fecha es anterior a la fecha de nacimiento registrada de la mascota.";
    case "same_day_duplicate_suspected":
      // A PROMPT, not a wall. The screen turns this code into a confirm
      // affordance that resends with the override; this sentence is the
      // fallback for anywhere that does not.
      return "Ya hay un registro igual para esta mascota en esta fecha.";
    case "medication_source_invalid":
      return "No pudimos identificar la medicación que estás terminando. Abrila desde su asiento en la libreta.";
    case "event_failed":
      return "No pudimos guardar el registro. Volvé a intentar en unos minutos.";
  }
}
