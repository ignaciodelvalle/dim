// Rehome-sponsorship payload schemas — rehome-by-titular.
//
// Split out of event-schemas.ts, which is at its file-size ratchet
// (scripts/file-size-baseline.json), following the caretaker-event-schemas.ts
// and tag-event-schemas.ts precedent. The registry in event-schemas.ts imports
// these two and maps them to `rehome_sponsorship_started` /
// `rehome_sponsorship_ended`; nothing else changes about how they validate.
//
// WHAT A SPONSORSHIP IS. The titular keeps their `ownerships(role='owner')` row
// for the whole arrangement and the animal keeps living with them; the org gets
// a `shelter_custody` row alongside it so the existing adoption catalog, which
// keys on that role, lists the pet with no predicate change. That is the PO's
// accepted overload of the word "custodia" and the reason every org-facing
// surface has to say the animal is NOT in the org's possession.

import { z } from "zod";

import { withVersion } from "./payload-version";

/**
 * The sponsorship became active: the org accepted the titular's
 * `rehome_request`, and the `ownerships(role='shelter_custody')` row was
 * written in the same transaction.
 *
 * `ownership_id` is not decoration. It is what lets rollback, drift detection
 * and any audit say WHICH custody row belongs to this sponsorship, instead of
 * guessing from timestamps — the same job `caretakerDesignated.grant_id` does.
 * Selecting rows by the catalog predicate instead would sweep up decomiso and
 * intake custody that has nothing to do with this feature.
 */
export const rehomeSponsorshipStarted = z
  .object(
    withVersion({
      ownership_id: z.string().uuid(),
      sponsoring_organization_id: z.string().uuid(),
      consented_by_user_id: z.string().uuid(),
      request_case_public_code: z.string().min(1),
      listing_case_id: z.string().uuid().nullable(),
      note: z.string().nullable(),
    }),
  )
  .strict();

/**
 * The sponsorship stopped being active, for one of five reasons.
 *
 * The key is `outcome`, NEVER `reason`: erase_subject_data (0159 to 0166)
 * sentinel-redacts the key `reason` across ALL event types on subject erasure,
 * which would destroy this enum fact. Same trap `tag_revoked` and
 * `caretaker_ended` hit.
 *
 * `withdrawn_by_platform` exists only for the rollback script
 * (scripts/rollback-rehome-sponsorships.ts). Deciding it now costs one enum
 * member; discovering it during an incident costs a strict-Zod migration under
 * pressure, on a path that has to run BEFORE the app commit is reverted.
 */
export const rehomeSponsorshipEnded = z
  .object(
    withVersion({
      ownership_id: z.string().uuid(),
      outcome: z.enum([
        "adopted",
        "withdrawn_by_titular",
        "ended_by_org",
        "pet_deceased",
        "withdrawn_by_platform",
      ]),
      ended_at: z.string().min(1),
    }),
  )
  .strict();
