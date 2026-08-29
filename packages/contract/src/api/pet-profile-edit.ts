// The wire shape of `GET /api/v1/pets/{publicToken}/profile` — the two things
// an owner edits about their animal that are not events.
//
// TWO CAPABILITIES, ONE ENDPOINT, AND THEY DO NOT SHARE A GUARD. That is the
// single most important thing this file records, because the temptation is to
// read them as one screen and therefore one rule:
//
//   · IDENTITY (name, breed, colour) is `requireTitularAccess` on the web —
//     `editar/page.tsx:28` gates the FORM and `updatePetAction`
//     (`src/modules/pets/actions.ts:398`) gates the WRITE. That guard denies
//     exactly one thing: a person-path holder whose `ownerships.role` is
//     `caretaker`. A co-owner passes, a foster passes, the ORG path passes.
//   · EMERGENCY CONTACTS (the preferred vet and the person to call) is
//     NARROWER, and narrower in a way `requireTitularAccess` cannot express:
//     `updateEmergencyContactsForPet` joins `ownerships` with
//     `role = 'owner'` and no other role passes
//     (`application/profile/update-emergency-contacts.ts:70`), and the web page
//     nulls the sheet's data for anybody else
//     (`mis-mascotas/[publicToken]/page.tsx:499`, "M2 fresh-review required fix
//     2"). A foster in transit is a Path-1 holder and must not see, let alone
//     edit, the legal owner's own phone numbers.
//
// So `capabilities` carries TWO booleans and a client renders each control from
// its own. Deriving either from "this pet is mine" is how a foster ends up
// looking at somebody else's emergency contact, and it is why this payload
// answers `emergencyContacts: null` rather than an empty draft when the caller
// may not have them: an empty form is an invitation, `null` is a boundary.
//
// WHAT IS NOT HERE, AND WHY EACH ONE IS ABSENT RATHER THAN FORGOTTEN
// ---------------------------------------------------------------------------
//   · SPECIES and JURISDICTION. FULL-LOCK (PO decision #40): the profile-edit
//     path on the web writes neither — `PetsRepository.updatePetProfile` omits
//     all three columns from its `SET` on purpose, and each has its own
//     event-governed correction path (`correctPetSpeciesAction`,
//     `recordMoveAction`). An "editar" endpoint that accepted them would be a
//     second, ungoverned door onto legally load-bearing state.
//   · SEÑAS PARTICULARES (`pets.distinguishing_features`). The column exists
//     and NO profile-edit writer anywhere touches it: it is written by lost-mode
//     enrichment (`set-pet-lost-use-case.ts`), by intake and by decomiso, and it
//     is not a field of `diffPet`, so a value written here would never reach the
//     `pet_profile_updated` payload and the spine would not carry the change.
//     Shipping it natively would have been the app inventing a capability the
//     web does not have, against a diff that would silently drop it.
//   · THE PHOTO. `POST /pets/{token}/photo` already owns it, ticket-and-confirm.
//   · INTERNAL IDs, for the reason `owner-pet-detail.ts` states: this is what a
//     stolen access token buys. `publicToken` is the animal's identity here.

export const PET_PROFILE_EDIT_PAYLOAD_VERSION = 1;

/**
 * How long a client may present a cached copy as current.
 *
 * ONE MINUTE, the window `pet-shares.ts` takes and for the same kind of reason:
 * the facts on this screen are exactly the ones a person changes and then
 * immediately wants to see changed. Five minutes here is five minutes of a form
 * pre-filled with the name somebody just corrected.
 */
export const PET_PROFILE_EDIT_STALE_AFTER_MS = 60_000;

/**
 * The identity fields this endpoint edits, as they stand right now.
 *
 * `breed` and `color` are nullable because the columns are: an animal with no
 * recorded breed is a normal animal, not an incomplete one, and the register
 * form says so out loud ("La raza es opcional").
 */
export type PetIdentityDraftV1 = {
  name: string;
  breed: string | null;
  color: string | null;
};

/**
 * The pet-level emergency-contact OVERRIDE, exactly as stored.
 *
 * EMPTY STRINGS, NOT NULLS, and that is the web's own pre-fill
 * (`page.tsx:773` — `pet.preferredVetName ?? ""`). The distinction is load
 * bearing on the way back out: a field left empty CLEARS the override and the
 * account default shows through, which is a different act from never having set
 * one. A client renders these into text inputs and posts them back unchanged.
 */
export type PetEmergencyDraftV1 = {
  preferredVetName: string;
  preferredVetPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

/**
 * The ACCOUNT-level default each pet-level field falls back to when cleared.
 *
 * Carried so a client can tell somebody what clearing a field will actually
 * show, instead of promising a blank. Resolution is per PAIR (name + phone
 * together, never mixed across levels) — `lib/domain/emergency-contacts.ts` is
 * the one implementation and this payload does not repeat it, it only reports
 * the inputs.
 */
export type PetEmergencyAccountDefaultV1 = {
  preferredVetName: string | null;
  preferredVetPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/**
 * Which of the two commands this caller may send. See the header: they are two
 * different rules and a client must not collapse them into one.
 */
export type PetProfileEditCapabilitiesV1 = {
  /** `requireTitularAccess` — every holder except a caretaker, plus the org path. */
  canEditIdentity: boolean;
  /** The legal owner alone — `ownerships.role = 'owner'` on the person path. */
  canEditEmergencyContacts: boolean;
};

export type PetProfileEditV1 = {
  payloadVersion: typeof PET_PROFILE_EDIT_PAYLOAD_VERSION;
  issuedAt: string;
  staleAfter: string;
  publicToken: string;
  /**
   * The species, so a client can ask `breedsForSpecies` for the right catalog.
   *
   * IT IS NOT EDITABLE HERE (see the header) and it is carried anyway, because
   * the breed catalog is species-scoped and a client that guessed would offer a
   * dog somebody else's list. The server validates the breed against the
   * PERSISTED species regardless of anything a client sends.
   */
  species: string;
  identity: PetIdentityDraftV1;
  /**
   * `null` when `capabilities.canEditEmergencyContacts` is false — a boundary,
   * not an empty form. See the header.
   */
  emergencyContacts: PetEmergencyDraftV1 | null;
  /** `null` under the same gate, for the same reason. */
  emergencyAccountDefault: PetEmergencyAccountDefaultV1 | null;
  capabilities: PetProfileEditCapabilitiesV1;
};

/**
 * What `POST /api/v1/pets/{publicToken}/profile` answers.
 *
 * A BARE ACK, no envelope — the split every write on this surface makes. A
 * version and a staleness window describe a READ a device may present as
 * current; an acknowledgement of something that just happened has neither.
 *
 * `changed` IS MEASURED AND NOT ASSUMED. The identity writer short-circuits a
 * no-op edit before opening a transaction (`updatePet`'s `isNoOp`), so posting
 * the same name twice writes nothing and appends no `pet_profile_updated` — the
 * append-only spine must not fill with events that record nothing. The contacts
 * writer is a plain column update, and this endpoint compares before and after
 * rather than reporting `true` because an UPDATE ran.
 */
export type PetProfileEditAckV1 = {
  command: "edit_identity" | "set_emergency_contacts";
  changed: boolean;
};
