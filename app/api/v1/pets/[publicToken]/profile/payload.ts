// The `GET /api/v1/pets/{publicToken}/profile` body — what a form needs to
// pre-fill itself, and nothing else.
//
// THE CAPABILITIES ARE THE WHOLE POINT OF THIS FILE, and they are derived HERE,
// once, from the access record the guard already returned — never recomputed by
// a client and never inferred from "this pet is mine". `petProfileCapabilities`
// is exported so the write path uses the same two booleans the read reported: a
// screen that offers a control and an endpoint that refuses it are the same bug
// as a screen that hides one the endpoint would allow.
//
// THE EMERGENCY BLOCK IS `null` FOR ANYBODY BUT THE LEGAL OWNER, and that is
// the web's own behaviour rather than a tightening (`page.tsx:499` and `:766`,
// both tagged "M2 fresh-review required fix 2"). It matters because the fields
// are not about the ANIMAL: they are the titular's own vet and the person to
// call, and a foster holding the animal in transit is a Path-1 holder with no
// business reading them. `null` and not an empty draft — see the contract.

import { apiV1Envelope } from "@/lib/infra/api-v1";
import type { PetHolderAccess } from "@/lib/infra/pet-access";
import type { OwnerPetViewerContactsRead } from "@/src/modules/pets/application/read/owner-pet-detail-queries";
import {
  PET_PROFILE_EDIT_PAYLOAD_VERSION,
  PET_PROFILE_EDIT_STALE_AFTER_MS,
  type PetProfileEditCapabilitiesV1,
  type PetProfileEditV1,
} from "@dim/contract/api";

/** The `pets` columns this payload reads. Structural — the row satisfies it. */
export type ProfilePetRow = {
  publicToken: string;
  species: string;
  name: string;
  breed: string | null;
  color: string | null;
  preferredVetName: string | null;
  preferredVetPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/** The access record, minus the `none` arm the caller has already turned into a 404. */
export type ResolvedProfileAccess = Exclude<PetHolderAccess, { kind: "none" }>;

/**
 * Who may run which command.
 *
 * BOTH RULES ARE COPIED AS DENIALS, not as allow-lists, for the reason
 * `lost/commands.ts` gives for its own: an allow-list quietly narrows the roles
 * the web admits the first time somebody adds a role to the system.
 *
 *   · IDENTITY mirrors `requireTitularAccess`, which denies exactly one thing —
 *     a person-path holder whose `ownerships.role` is `caretaker`. A co-owner
 *     passes, a foster passes, the org path passes.
 *   · CONTACTS is not a `requireTitularAccess` question at all and cannot be
 *     expressed as one: the writer's own query joins `ownerships` on
 *     `role = 'owner'`, so co-owner, foster and the entire org path are outside
 *     it. Written as `kind === "owner" && holderRole === "owner"` — the positive
 *     form here, because this rule genuinely IS a single role and pretending
 *     otherwise would make the code read like the looser one beside it.
 */
export function petProfileCapabilities(
  access: ResolvedProfileAccess,
): PetProfileEditCapabilitiesV1 {
  return {
    canEditIdentity: !(access.kind === "owner" && access.holderRole === "caretaker"),
    canEditEmergencyContacts: access.kind === "owner" && access.holderRole === "owner",
  };
}

export type BuildPetProfileEditInput = {
  pet: ProfilePetRow;
  access: ResolvedProfileAccess;
  /**
   * The caller's ACCOUNT-level defaults, or `null` when they were not read.
   *
   * NOT READ AT ALL for a caller who may not edit the contacts — the fields
   * belong to whoever is looking, so reading them for a foster would be a query
   * whose only possible use is to be dropped.
   */
  accountContacts: OwnerPetViewerContactsRead;
  now: Date;
};

export function buildPetProfileEditV1({
  pet,
  access,
  accountContacts,
  now,
}: BuildPetProfileEditInput): PetProfileEditV1 {
  const capabilities = petProfileCapabilities(access);
  const mayReadContacts = capabilities.canEditEmergencyContacts;

  return {
    ...apiV1Envelope({
      payloadVersion: PET_PROFILE_EDIT_PAYLOAD_VERSION,
      issuedAt: now,
      staleAfterMs: PET_PROFILE_EDIT_STALE_AFTER_MS,
    }),
    publicToken: pet.publicToken,
    species: pet.species,
    identity: {
      name: pet.name,
      breed: pet.breed,
      color: pet.color,
    },
    // Empty strings, not nulls — the web's own pre-fill. The distinction is
    // load bearing on the way back: an empty field CLEARS the override.
    emergencyContacts: mayReadContacts
      ? {
          preferredVetName: pet.preferredVetName ?? "",
          preferredVetPhone: pet.preferredVetPhone ?? "",
          emergencyContactName: pet.emergencyContactName ?? "",
          emergencyContactPhone: pet.emergencyContactPhone ?? "",
        }
      : null,
    emergencyAccountDefault: mayReadContacts
      ? {
          preferredVetName: accountContacts?.preferredVetName ?? null,
          preferredVetPhone: accountContacts?.preferredVetPhone ?? null,
          emergencyContactName: accountContacts?.emergencyContactName ?? null,
          emergencyContactPhone: accountContacts?.emergencyContactPhone ?? null,
        }
      : null,
    capabilities,
  };
}
