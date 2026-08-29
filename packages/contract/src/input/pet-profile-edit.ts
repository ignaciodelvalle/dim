// Client-input contract for EDITAR —
// `POST /api/v1/pets/{publicToken}/profile`.
//
// TWO COMMANDS, ONE ENDPOINT, TWO DIFFERENT GUARDS. The read's contract
// (`@dim/contract/api`'s `pet-profile-edit.ts`) states the guards at length and
// this file does not restate them, because two copies of a rule is how the
// copies disagree. What matters here is that the split into two COMMANDS is not
// cosmetic: one appends a `pet_profile_updated` event to the spine, the other
// moves four preference columns and appends nothing, and they are authorized by
// different rules. A single "save everything" command would have had to pick
// one guard for both.
//
// THE REFERENCE POINTS, cited at the GUARD CALL rather than at the function
// that contains it:
//
//   editar identidad     `updatePetAction`                 src/modules/pets/actions.ts:398
//   contactos            `updateEmergencyContactsAction`   app/actions/profile.ts:81
//                        + `updateEmergencyContactsForPet` …/profile/update-emergency-contacts.ts:70
//
// WHAT THE SERVER STILL DECIDES AFTER THIS SCHEMA PASSES
// ---------------------------------------------------------------------------
//   · THE BREED. `resolveBreedForWrite` (lib/domain/breed-validation.ts) folds
//     and aliases the submitted label against the catalog for the PERSISTED
//     species and rejects anything that does not land in it — a dog may not be
//     saved as "Persa". A client picks from `breedsForSpecies` to avoid the
//     round trip; it does not decide.
//   · THE PPP FLAG. `potentially_dangerous_breed` is re-resolved against the
//     animal's jurisdiction on every write. It is legally load-bearing state and
//     no client input reaches it.
//   · WHETHER ANYTHING CHANGED. A no-op edit appends no event.
//
// WHY `breed` CARRIES NO LENGTH CAP AND THE OTHER TEXT FIELDS DO
// ---------------------------------------------------------------------------
// The grandfather rule (QA A5): `resolveBreedForWrite` accepts a submitted value
// UNCHANGED when it equals the breed already stored on the animal, so a legacy
// off-catalog value survives an unrelated edit instead of being silently wiped
// by a picker. A cap here would break exactly that: an animal whose stored breed
// happens to be longer than the number would have every future name correction
// refused, which is the failure QA A5 exists to prevent, reintroduced one layer
// up. Every OTHER value the breed field can carry is a catalog label, and the
// catalog bounds itself.
//
// The caps that DO exist are narrower than the web, which has none on `name` and
// `color` at all — the `LIBRETA_SHARE_LABEL_MAX` situation exactly. "The web has
// no limit here" describes an oversight, not a decision, and a JSON body is a far
// easier place to post forty kilobytes from than a text input is. The two contact
// caps are not narrowings at all: they are the numbers the server already
// enforces (`update-emergency-contacts.ts:37` — names ≤ 80, phones ≤ 40),
// carried here so a client can say so before the round trip.

import { z } from "zod";

/** The longest a pet's name may be. See the header on why this is not the web's. */
export const PET_NAME_MAX = 80;

/** The longest a pet's colour description may be. Same reasoning as the name. */
export const PET_COLOR_MAX = 80;

/**
 * The server's own cap on a contact NAME, mirrored rather than invented —
 * `update-emergency-contacts.ts` rejects longer with "Máximo 80 caracteres".
 */
export const EMERGENCY_CONTACT_NAME_MAX = 80;

/**
 * The server's own cap on a contact PHONE. Forty, not eighty: the column holds a
 * dialable string, and the web's field agrees. Format is NEVER validated — the
 * writer says so out loud ("a soft client-side warning, never a server error"),
 * because a national registry that refused an unusual but real number would be
 * refusing the one call that matters during an emergency.
 */
export const EMERGENCY_CONTACT_PHONE_MAX = 40;

export const PET_PROFILE_COMMAND_INPUT_CODES = [
  "COMMAND_REQUIRED",
  "NAME_REQUIRED",
  "NAME_TOO_LONG",
  "COLOR_TOO_LONG",
  "CONTACT_NAME_TOO_LONG",
  "CONTACT_PHONE_TOO_LONG",
] as const;
export type PetProfileCommandInputCode = (typeof PET_PROFILE_COMMAND_INPUT_CODES)[number];

/** A trimmed optional string; absent, blank and `null` all mean "not stated". */
const optionalBreed = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const optionalColor = z
  .string()
  .trim()
  .max(PET_COLOR_MAX, { error: "COLOR_TOO_LONG" })
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * Edit the animal's identity.
 *
 * `name` IS REQUIRED because the column is `not null` and the credential is
 * addressed by it everywhere a person reads one. `breed` and `color` are
 * required KEYS with nullable values, not optional keys, for the reason
 * `createLibretaShare` makes about `expiresInDays`: an absent field would have
 * to mean either "leave it" or "clear it", the two are different acts, and a
 * contract that let a client ask for the ambiguity would have to invent an
 * answer. Posting `null` clears; posting the current value leaves it.
 */
const editIdentity = z.object({
  command: z.literal("edit_identity"),
  name: z
    .string({ error: "NAME_REQUIRED" })
    .trim()
    .min(1, { error: "NAME_REQUIRED" })
    .max(PET_NAME_MAX, { error: "NAME_TOO_LONG" }),
  breed: optionalBreed,
  color: optionalColor,
});

const contactName = z
  .string()
  .trim()
  .max(EMERGENCY_CONTACT_NAME_MAX, { error: "CONTACT_NAME_TOO_LONG" });

const contactPhone = z
  .string()
  .trim()
  .max(EMERGENCY_CONTACT_PHONE_MAX, { error: "CONTACT_PHONE_TOO_LONG" });

/**
 * Set this animal's emergency-contact OVERRIDE.
 *
 * ALL FOUR FIELDS ARE REQUIRED AND AN EMPTY STRING IS MEANINGFUL: it clears the
 * pet-level override so the account default shows through again. That is the
 * web sheet's own behaviour — it posts all four every time — and it is why the
 * fields are not optional: an omitted key would be indistinguishable from a
 * cleared one, and the writer would have to guess which of two different acts
 * the person meant.
 */
const setEmergencyContacts = z.object({
  command: z.literal("set_emergency_contacts"),
  preferredVetName: contactName,
  preferredVetPhone: contactPhone,
  emergencyContactName: contactName,
  emergencyContactPhone: contactPhone,
});

export const petProfileCommandInputSchema = z.discriminatedUnion("command", [
  editIdentity,
  setEmergencyContacts,
]);

export type PetProfileCommandInput = z.infer<typeof petProfileCommandInputSchema>;
export type PetProfileCommand = PetProfileCommandInput["command"];

/**
 * The FIRST input code in a failed parse, for a client that wants to show one
 * message. Mirrors `firstShareCommandInputCode` — same shape, same reason.
 */
export function firstPetProfileCommandInputCode(
  error: z.ZodError<unknown>,
): PetProfileCommandInputCode | null {
  for (const issue of error.issues) {
    const code = issue.message;
    if ((PET_PROFILE_COMMAND_INPUT_CODES as readonly string[]).includes(code)) {
      return code as PetProfileCommandInputCode;
    }
  }
  for (const issue of error.issues) {
    if (issue.code === "invalid_union" || issue.path.length === 0 || issue.path[0] === "command") {
      return "COMMAND_REQUIRED";
    }
  }
  return null;
}
