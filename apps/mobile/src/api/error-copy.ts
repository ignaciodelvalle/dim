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
    // WU-M, modo perdida. These arrive while somebody is looking for an animal,
    // which is the worst moment to read a sentence that does not say what to do,
    // so every one of them names the next move.
    case "lost_already":
      return "Esta mascota ya está marcada como perdida. Abrí su búsqueda para actualizar dónde la vieron.";
    case "pet_not_lost":
      // Covers the honest case (somebody else already marked it found) and the
      // stale one (the app's copy of the status is old). Both fix the same way.
      return "Esta mascota no está marcada como perdida. Actualizá la pantalla para ver su estado.";
    case "lost_episode_closed":
      // NOT the sentence above, because the animal IS lost and the fix is
      // specific and available: reopen the search, then update.
      return "La búsqueda de esta mascota se cerró por inactividad. Reactivala para volver a cargar avistajes.";
    case "lost_forbidden":
      // Two cases, one sentence, because the person's position is the same in
      // both: they hold the animal and this particular decision is not theirs.
      return "Esta acción es solo del titular de la mascota.";
    case "lost_microchip_invalid":
      return "El número de microchip no tiene un formato válido. Revisalo o dejalo vacío.";
    case "lost_report_target_invalid":
      // The item the person tapped is not on this animal's feed any more —
      // somebody else already reported it, or the screen is holding an old copy
      // of the list. Both fix by re-reading, and neither is the person's fault,
      // so the sentence says what to do and does not accuse them of anything.
      return "Ese mensaje ya no está en la búsqueda. Actualizá la pantalla para ver el listado al día.";
    case "lost_failed":
      return "No pudimos completar la acción. Volvé a intentar en unos minutos.";
    case "share_forbidden":
      // Covers three different web refusals — a caretaker, an org member with no
      // `ownerships` row, and a holder who did not create the link they are
      // trying to revoke. The sentence names the rule rather than the identity,
      // because the screen already knows which control was pressed.
      return "No tenés permiso para esta acción de compartir.";
    case "share_limit_reached":
      return "Llegaste al máximo de links activos. Revocá uno para crear otro.";
    case "tier2_not_allowed":
      return "No se puede mostrar la libreta en la credencial pública de una mascota fallecida.";
    // WU-O, transferencias. These land on a screen where somebody is about to
    // give away an animal or take one, so every sentence names the next move and
    // none of them implies a retry that cannot work.
    case "transfer_forbidden":
      // Three different rules behind one code — not the current owner, not the
      // addressee, not the sender. The sentence names the SITUATION rather than
      // which rule refused, because saying which would describe somebody else's
      // proposal, and because the fix is the same in all three: re-read.
      return "Esta propuesta no es tuya para responder. Actualizá la pantalla.";
    case "transfer_self":
      return "No podés transferirte una mascota a vos mismo/a. Revisá el email del receptor.";
    case "transfer_not_allowed":
      // Four situations, one sentence, and the screen can do better: the pet
      // payload it already holds carries `status` and the rehome banner, so a
      // client that re-reads names the real obstacle. This is the fallback.
      return "La situación de esta mascota no permite transferirla ahora. Abrí su ficha para ver por qué.";
    case "transfer_pending_exists":
      return "Ya hay una transferencia pendiente para esta mascota. Cancelala antes de enviar otra.";
    case "transfer_already_resolved":
      // AMBIGUOUS AFTER A TIMEOUT, and the copy must not pretend otherwise: the
      // first attempt may well have landed. "Actualizá" is the honest
      // instruction; "volvé a intentar" would be wrong advice.
      return "Esta propuesta ya fue respondida o cancelada. Actualizá la pantalla para ver cómo quedó.";
    case "transfer_expired":
      // NOT the sentence above. Nothing was decided — the seven days ran out —
      // and the fix is specific and available: ask for a new proposal.
      return "La propuesta venció. Pedile a quien te la envió que la vuelva a iniciar.";
    case "transfer_failed":
      // NO retry advice, unlike `event_failed`. Without an idempotency key a
      // blind retry of "aceptar" cannot be told from a second attempt.
      return "No pudimos completar la operación. Actualizá la pantalla para ver cómo quedó.";
    // WU-P, cuidador temporal. Two audiences read these: a titular arranging for
    // somebody to look after their animal, and a person deciding whether to take
    // that on. Neither is in a crisis, but both are about to be responsible for a
    // living thing, so no sentence here may leave the next move unsaid.
    case "caretaker_forbidden":
      // Four different rules behind one code — you are the caretaker and not the
      // titular, you did not grant this invitation, or it is not addressed to
      // you. The sentence names the SITUATION and not which rule refused, because
      // saying which would describe somebody else's arrangement.
      return "Esta acción no es tuya para hacer. Actualizá la pantalla para ver cómo quedó.";
    case "caretaker_self":
      return "No podés designarte a vos mismo/a como cuidador/a. Revisá el correo de la persona.";
    case "caretaker_period_invalid":
      // One sentence for four date refusals, because the move is one move. The
      // screen holds `CARETAKER_MAX_DURATION_DAYS` and bounds its own picker, so
      // reaching this code means the dates were wrong in a way the picker could
      // not prevent.
      return "Revisá las fechas del cuidado: tienen que ser reales, futuras y dentro del máximo permitido.";
    case "caretaker_grant_exists":
      return "Esta mascota ya tiene un cuidado en curso. Terminá o retirá el que está antes de invitar a alguien más.";
    case "caretaker_already_resolved":
      // AMBIGUOUS AFTER A TIMEOUT, exactly like `transfer_already_resolved`: the
      // first attempt may well have landed. "Actualizá" is the honest
      // instruction; "volvé a intentar" would be wrong advice.
      return "Este cuidado ya no está en ese estado. Actualizá la pantalla para ver cómo quedó.";
    case "caretaker_expired":
      // NOT the sentence above. Nothing was decided — the period the invitation
      // offers is simply over — and the fix is specific: ask for new dates.
      return "El período de este cuidado ya terminó. Pedile al titular que te invite de nuevo con fechas nuevas.";
    case "caretaker_granter_not_titular":
      // The one refusal on this surface where re-reading is a DEAD END: the
      // invitation still reads pending, and the person who sent it can no longer
      // re-send it. The sentence has to redirect the person to somebody else.
      return "Quien te invitó ya no es titular de esta mascota. Pedile al titular actual que te invite de nuevo.";
    case "caretaker_failed":
      // NO retry advice, for the same reason `transfer_failed` gives none.
      return "No pudimos completar la operación. Actualizá la pantalla para ver cómo quedó.";
    case "photo_forbidden":
      // Today this reaches only an org-path caller without `event.write`. The
      // sentence names the permission the way the web names it, so the person
      // can repeat it to whoever administers their organización.
      return "No tenés permiso para cambiar la foto de esta mascota. Pedile a un administrador el permiso «Registrar eventos clínicos».";
    case "photo_not_an_image":
      // The file, not the request. "Volvé a intentar" would be wrong advice:
      // the same file will fail again.
      return "Ese archivo no es una foto que podamos usar. Elegí una imagen JPG, PNG o WebP.";
    case "photo_failed":
      // The ONE arm on this surface where retrying is honestly safe: a photo is
      // a value, not an append, so setting it twice is setting it once.
      return "No pudimos guardar la foto. Volvé a intentar.";
    // Editar datos y contactos de emergencia. The screen reads `capabilities`
    // and does not offer a control it may not use, so reaching either refusal
    // below means the arrangement changed under the person's feet — somebody
    // transferred the animal, or a cuidado started — and "actualizá" is the
    // honest instruction rather than "pedí permiso".
    case "profile_forbidden":
      // TWO rules behind one code (see the contract). The sentence names
      // neither, because which one refused describes somebody else's role.
      return "Esta acción no es tuya para hacer. Actualizá la pantalla para ver cómo quedó.";
    case "profile_breed_invalid":
      // The FIELD, not the request. The picker offers the catalog, so this
      // reaches a person only when the value did not come from it.
      return "Esa raza no está en el catálogo. Elegí una de la lista o dejá el campo vacío.";
    case "profile_failed":
      // Retrying IS safe: an edit is a value, not an append, and repeating one
      // that already landed appends nothing at all.
      return "No pudimos guardar los cambios. Volvé a intentar.";
    // Privacidad — los dos derechos de la Ley 25.326 desde el teléfono.
    case "erasure_reason_required":
      // The screen already disables its button below five characters, so this
      // reaches a person only if their build is out of step with the contract.
      // It still names the FIELD rather than the request, because that is the
      // one thing they can act on.
      return "Contanos brevemente por qué querés darte de baja (mínimo 5 caracteres).";
    case "export_failed":
      // Retrying is safe — the export writes nothing the subject can see.
      return "No pudimos armar el archivo con tus datos. Volvé a intentar.";
    case "erasure_failed":
      // DELIBERATELY DOES NOT SAY "no se borró nada". This arm is reached when
      // the RPC itself refused, so the data really is intact — but a later step
      // failing never reaches here (it logs and still reports success), and copy
      // that promised an untouched account would be a promise this code cannot
      // keep for the case it does not cover. "Volvé a intentar" is true in both.
      return "No pudimos completar la baja. Volvé a intentar en unos minutos.";
  }
}
