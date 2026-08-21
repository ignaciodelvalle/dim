// Temporary-caretaker payload schemas — migration 0189 (custodia-temporal).
//
// Split out of event-schemas.ts, which is at its file-size ratchet
// (scripts/file-size-baseline.json), following the tag-event-schemas.ts
// precedent. The registry in event-schemas.ts imports these two and maps them
// to `caretaker_designated` / `caretaker_ended`; nothing else changes about how
// they are validated.
//
// TWO events, not three. There is no `caretaker_proposed`: a pending invitation
// is workflow state (pet_caretaker_grants.status), not a fact about the animal.
// `caretaker_designated` is emitted AT ACCEPT — the name means "the grant became
// active" — so the spine only ever records arrangements that actually happened.

import { z } from "zod";

import { withVersion } from "./payload-version";

/**
 * The grant became active: the invitee accepted, and the
 * `ownerships(role='caretaker')` row was written in the same transaction.
 *
 * `ends_at` is denormalised into the payload deliberately. The grant row can
 * later be ended early, and the spine must still say what the arrangement was
 * agreed to be at the moment it started — that is the difference between a log
 * and a mutable record.
 */
export const caretakerDesignated = z
  .object(
    withVersion({
      grant_id: z.string().uuid(),
      grant_public_token: z.string().min(1),
      caretaker_user_id: z.string().uuid(),
      ends_at: z.string().min(1),
      note: z.string().nullable(),
    }),
  )
  .strict();

/**
 * The grant stopped being active, for one of four reasons.
 *
 * `outcome` is an enum rather than free text because the copy the titular and
 * the caretaker each see depends on it, and because "expired" must never be
 * presented as "the animal came back" — the arrangement ended, the possession
 * question is open. See the spec's auto-end scenarios.
 *
 * The key is `outcome`, NOT `reason`: erase_subject_data (0159→0166)
 * sentinel-redacts the key `reason` across ALL event types on subject erasure,
 * which would destroy this enum fact. Same trap tag_revoked hit (design D5).
 */
export const caretakerEnded = z
  .object(
    withVersion({
      grant_id: z.string().uuid(),
      // Mirrors GRANT_END_OUTCOMES. `ownership_transferred` (2026-08-21) covers
      // the arrangement being overtaken by a change of hands — adoption
      // finalize, decomiso — which none of the other four describe truthfully.
      outcome: z.enum([
        "returned",
        "expired",
        "revoked_by_owner",
        "withdrawn_by_caretaker",
        "ownership_transferred",
      ]),
      ends_at: z.string().min(1),
    }),
  )
  .strict();
