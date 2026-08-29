// Editar — turning the server's answer into what a person reads, and what they
// typed into what the contract accepts.
//
// PURE, like every other view-model in this app. It owns the es-AR sentence for
// every state and every refusal, and the mapping from a draft to a
// `PetProfileCommandInput`. Nothing here touches the network.
//
// THE VALIDATION IS THE SERVER'S OWN SCHEMA, imported and not re-stated — the
// rule `shares-view-model.ts` and `lost-view-model.ts` both follow. What lives
// here is the WORDS: the contract carries codes, the consumer owns its copy.
//
// THE CAPABILITIES ARE THE SERVER'S TOO, AND THIS FILE NEVER RECOMPUTES THEM.
// `payload.capabilities` carries TWO booleans because the two halves of this
// screen answer to two different rules — identity is every holder except a
// caretaker, the contacts are the legal owner alone. A screen that derived
// either from "this pet is mine" would show a foster in transit the titular's
// own vet and phone number, which is exactly the fix the web made in its M2
// review and exactly what this app must not undo.

import type { PetProfileEditV1 } from "@dim/contract/api";
import type { PetProfileCommandInput, PetProfileCommandInputCode } from "@dim/contract/input";
import {
  EMERGENCY_CONTACT_NAME_MAX,
  EMERGENCY_CONTACT_PHONE_MAX,
  PET_COLOR_MAX,
  PET_NAME_MAX,
  firstPetProfileCommandInputCode,
  petProfileCommandInputSchema,
} from "@dim/contract/input";
import { breedsForSpecies } from "@dim/contract/reference";

/** The identity form's fields, as strings — what a `TextInput` actually holds. */
export type IdentityDraft = {
  name: string;
  breed: string;
  color: string;
};

/** The contacts form's fields. Empty means "clear the override". */
export type EmergencyDraft = {
  preferredVetName: string;
  preferredVetPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

/** The caps the two forms put on their own inputs, from the contract. */
export const FIELD_LIMITS = {
  name: PET_NAME_MAX,
  color: PET_COLOR_MAX,
  contactName: EMERGENCY_CONTACT_NAME_MAX,
  contactPhone: EMERGENCY_CONTACT_PHONE_MAX,
} as const;

/** The server's current values, as the form should start. */
export function identityDraftFrom(payload: PetProfileEditV1): IdentityDraft {
  return {
    name: payload.identity.name,
    breed: payload.identity.breed ?? "",
    color: payload.identity.color ?? "",
  };
}

/**
 * The contacts form's starting values, or `null` when this caller may not have
 * them.
 *
 * `null` IS NOT AN EMPTY DRAFT and the difference is the whole point: the server
 * sends `emergencyContacts: null` for anybody but the legal owner, and a screen
 * that turned that into four blank inputs would be offering a form whose save
 * can only be refused.
 */
export function emergencyDraftFrom(payload: PetProfileEditV1): EmergencyDraft | null {
  if (payload.emergencyContacts === null) return null;
  return { ...payload.emergencyContacts };
}

/**
 * The breed options to offer: the species catalog, plus the animal's CURRENT
 * stored breed when the catalog does not contain it.
 *
 * THE APPENDED VALUE IS THE PARITY BIT, not a nicety. `resolveBreedForWrite`
 * grandfathers a stored off-catalog breed so a legacy value survives an
 * unrelated edit (QA A5), and the web's edit form appends it as its own
 * `<option>` for exactly that reason. Without this, a picker that only ever
 * offered the catalog would leave the owner of a pet recorded as something the
 * catalog no longer lists with two choices — pick a different breed, or leave —
 * and the "leave" one is the one that silently wipes the value the moment they
 * correct the name.
 */
export function breedChoicesFor(species: string, storedBreed: string | null): string[] {
  const catalog = breedsForSpecies(species);
  const stored = storedBreed?.trim() ?? "";
  if (stored.length === 0 || catalog.includes(stored)) return catalog;
  return [stored, ...catalog];
}

/** Why the identity form is not offered, or `null` when it is. */
export function identityBlockedReason(payload: PetProfileEditV1): string | null {
  if (payload.capabilities.canEditIdentity) return null;
  // The one refusal behind this flag today: a caretaker. The sentence names the
  // ARRANGEMENT rather than the permission, because "no tenés permiso" over an
  // animal somebody is genuinely looking after reads as a bug.
  return "Sos cuidador/a de esta mascota. Editar sus datos es solo del titular.";
}

/** Why the contacts form is not offered, or `null` when it is. */
export function contactsBlockedReason(payload: PetProfileEditV1): string | null {
  if (payload.capabilities.canEditEmergencyContacts) return null;
  // NOT the same sentence as above, and not "solo el titular" either: a co-owner
  // and a foster both reach this, and both ARE holders. What they are not is the
  // person whose phone number this is.
  return "Estos son el veterinario y el contacto de quien figura como dueño/a. Solo esa persona puede cambiarlos.";
}

/**
 * What a person will see if they clear a field — the account-level default, or
 * an honest "nada".
 *
 * The pair (name + phone) falls back TOGETHER, never mixed across levels: that
 * is `lib/domain/emergency-contacts.ts`, the server's one implementation, and
 * this function reports its inputs rather than re-deriving its rule. It answers
 * per PAIR for the same reason.
 */
export function accountFallbackLabel(payload: PetProfileEditV1, pair: "vet" | "emergency"): string {
  const fallback = payload.emergencyAccountDefault;
  if (fallback === null) return "";
  const name = pair === "vet" ? fallback.preferredVetName : fallback.emergencyContactName;
  const phone = pair === "vet" ? fallback.preferredVetPhone : fallback.emergencyContactPhone;
  const parts = [name, phone].filter((v): v is string => v !== null && v.trim().length > 0);
  if (parts.length === 0) {
    return "Si dejás los dos campos vacíos no se muestra nada: tu cuenta tampoco tiene uno cargado.";
  }
  return `Si dejás los dos campos vacíos mostramos el de tu cuenta: ${parts.join(" · ")}.`;
}

export type CommandResult =
  | { ok: true; input: PetProfileCommandInput }
  | { ok: false; message: string; code: PetProfileCommandInputCode | null };

function validated(wire: unknown): CommandResult {
  const parsed = petProfileCommandInputSchema.safeParse(wire);
  if (parsed.success) return { ok: true, input: parsed.data };
  const code = firstPetProfileCommandInputCode(parsed.error);
  return { ok: false, code, message: petProfileInputCodeMessage(code) };
}

/**
 * EDITAR LOS DATOS.
 *
 * An empty `breed` or `color` travels as `null`, which CLEARS the field — the
 * contract's own semantics, and the reason the two are required keys rather
 * than optional ones. A person who empties the colour box means to empty it.
 */
export function buildIdentityEdit(draft: IdentityDraft): CommandResult {
  return validated({
    command: "edit_identity",
    name: draft.name,
    breed: draft.breed.trim() || null,
    color: draft.color.trim() || null,
  });
}

/** GUARDAR LOS CONTACTOS. All four fields travel every time; empty clears. */
export function buildEmergencyContacts(draft: EmergencyDraft): CommandResult {
  return validated({
    command: "set_emergency_contacts",
    preferredVetName: draft.preferredVetName,
    preferredVetPhone: draft.preferredVetPhone,
    emergencyContactName: draft.emergencyContactName,
    emergencyContactPhone: draft.emergencyContactPhone,
  });
}

/** es-AR copy for each input code. Exhaustive: every code has a sentence. */
export function petProfileInputCodeMessage(code: PetProfileCommandInputCode | null): string {
  if (code === null) {
    // The parse failed on something the contract does not name — a client and a
    // contract out of step. Honest about being unable to say more.
    return "Revisá los datos: hay un campo que la app no pudo interpretar.";
  }
  switch (code) {
    case "COMMAND_REQUIRED":
      return "La app no pudo armar la acción. Volvé a intentar.";
    case "NAME_REQUIRED":
      return "El nombre no puede quedar vacío.";
    case "NAME_TOO_LONG":
      return `El nombre es demasiado largo (máximo ${PET_NAME_MAX} caracteres).`;
    case "COLOR_TOO_LONG":
      return `El color es demasiado largo (máximo ${PET_COLOR_MAX} caracteres).`;
    case "CONTACT_NAME_TOO_LONG":
      return `Ese nombre es demasiado largo (máximo ${EMERGENCY_CONTACT_NAME_MAX} caracteres).`;
    case "CONTACT_PHONE_TOO_LONG":
      return `Ese teléfono es demasiado largo (máximo ${EMERGENCY_CONTACT_PHONE_MAX} caracteres).`;
  }
}

/**
 * What the screen says after a save landed.
 *
 * A NO-OP IS A SUCCESS and "listo" would be true but unhelpful. The server
 * measures `changed` against the values it already held, so a person who opened
 * the form, changed their mind and pressed Guardar gets told that nothing
 * needed saving rather than being congratulated on a write that did not happen.
 */
export function savedLabel(command: PetProfileCommandInput["command"], changed: boolean): string {
  if (!changed) {
    return command === "edit_identity"
      ? "No había nada que cambiar: ya estaba así."
      : "No había nada que cambiar: los contactos ya estaban así.";
  }
  return command === "edit_identity"
    ? "Listo. El cambio queda registrado en la libreta."
    : "Listo. Guardamos los contactos de esta mascota.";
}
