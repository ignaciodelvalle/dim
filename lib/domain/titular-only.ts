// Titular-only effects — the machine-checkable subject of the deny-list fence.
//
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
// Since custodia-temporal, an active ownership row no longer implies "this
// caller may do anything to this pet". A `caretaker` row is a bounded, scoped
// grant: medical events, notes, photos, lost/found — yes; transferring the
// animal, publishing it for adoption, moving its jurisdiction, minting a public
// share link or editing its identity — no.
//
// The property worth machine-checking is NOT "these seven call sites are
// gated". A list of seven proves nothing about a default-ALLOW rule: the eighth
// writer, written next month in a module that does not exist yet, is exactly
// the one that will not be on it. So the fence keys on the EFFECT — the closed
// set of database outcomes a titular-only action produces — and this file is
// the single declaration of that set, imported by:
//
//   - scripts/check-titular-gate.ts   (the CI fence, app layer)
//   - db/migrations/*                 (the SQL mirror, RLS layer — a SECOND
//                                      copy by design; the duplication is
//                                      fenced by a db-project equality test)
//
// Keep this file dependency-free apart from the EventType type: the fence
// script, the application code and the tests all import it, and a runtime
// dependency on the database client would drag the whole suite into the serial
// `db` vitest project.

import type { EventType } from "@/db/schema";

export type TitularOnlyDenyListRow = {
  /** Stable id, referenced by tests and by the RLS migration's comments. */
  readonly id: string;
  readonly summary: string;
  /**
   * The enforcement signals this row is caught by. EVERY entry must be a member
   * of one of the three constants below — the coverage self-test checks it, so
   * emptying a constant to turn a red build green breaks the deny-list instead
   * of silently shrinking the fence's subject.
   */
  readonly signals: readonly string[];
  /**
   * Non-null when the row is knowingly UNENFORCED for now, with the reason and
   * the commit that closes it. A row may have no signals only if it says so out
   * loud — "covered" by silence is the exact failure this file exists to avoid.
   */
  readonly pending: string | null;
};

/**
 * The seven titular-only outcomes, as committed in the spec
 * (`sdd/custodia-temporal/spec` → "Deny-list fence"). This array is NOT what
 * the fence scans — it is the anti-emptying anchor.
 */
export const TITULAR_ONLY_DENY_LIST: readonly TitularOnlyDenyListRow[] = [
  {
    id: "transfer-initiation",
    summary: "Initiating or resolving a change of titularidad.",
    // NOTE, verified rather than assumed: initiatePetTransferAction was ALREADY
    // titular-safe before this change — TransfersRepository.findActiveOwnerOwnership
    // filters role='owner', so a caretaker never passes it. The signals below are
    // the second layer, for a future writer that does not repeat that care.
    signals: ["custody_transfer_proposed", "custody_transferred", "custody_transfer_cancelled"],
    pending: null,
  },
  {
    id: "adoption-eligibility-publishing",
    summary: "Flagging a pet as available for adoption.",
    // Org-only today (requireCapabilityForOrgToken), where holderRole is null by
    // construction — so there is no person-path writer to gate, only a future one.
    signals: ["adoption_eligibility_set", "adoptionEligible"],
    pending: null,
  },
  {
    id: "jurisdiction-change",
    summary: "Moving the pet between provinces/localities.",
    signals: ["jurisdictionCountry", "jurisdictionProvince", "jurisdictionLocality", "localityId"],
    pending: null,
  },
  {
    id: "caretaker-sub-designation",
    summary: "A caretaker designating another caretaker.",
    signals: [],
    pending:
      "The caretaker_designated event type does not exist yet; the coverage self-test refuses an event type that is not in EVENT_TYPES. Closed by migration N (commit C3), which adds the event type and the signal together.",
  },
  {
    id: "tier2-public-toggle",
    summary: "Opening the Tier-2 public window on the credential.",
    signals: ["tier2PublicEnabledUntil", "tier2PublicPermanent"],
    pending: null,
  },
  {
    id: "libreta-share-minting",
    summary: "Minting a libreta share token (a public, bearer-readable link).",
    signals: ["libretaShareTokens"],
    pending: null,
  },
  {
    id: "identity-field-edits",
    summary: "Editing name, species, breed or date of birth.",
    // Pet DELETION belongs to this row rather than a row of its own: DIM has no
    // pet-deletion path today (no pets.deleted_at, no delete action), so a
    // separate row would document a fence over nothing.
    signals: ["name", "species", "breed", "dateOfBirth"],
    pending: null,
  },
] as const;

/**
 * Event types only a titular may write.
 *
 * DELIBERATE EXCLUSIONS, so the next reader does not have to re-derive them:
 *   - `movement_recorded` carries a `sub_kind` discriminator with three faces
 *     (jurisdiction_changed | cvi_issued | transport_recorded) and only the
 *     first is titular-only. The column rule catches exactly that face; naming
 *     the event type would deny a caretaker from recording a trip.
 *   - `adoption_finalized` / `ownership_claimed` are shelter-side and
 *     claimant-side facts respectively. Neither is reachable from a caretaker's
 *     ownership row, and both are read (queried) far more often than written,
 *     which would make the regex noisy for no security gain.
 *   - `death_recorded` is EXPLICITLY allowed to a caretaker (spec: "Allowed
 *     caretaker actions"), with a mandatory titular notification instead.
 */
export const TITULAR_ONLY_EVENT_TYPES: readonly EventType[] = [
  "custody_transfer_proposed",
  "custody_transferred",
  "custody_transfer_cancelled",
  "adoption_eligibility_set",
] as const;

/**
 * Drizzle column keys on `pets` that only a titular may write. Named in the
 * Drizzle (camelCase) spelling because that is what the fence scans; the SQL
 * mirror in the RLS migration uses the snake_case column names.
 */
export const TITULAR_ONLY_PET_COLUMNS: readonly string[] = [
  // Jurisdiction (deny-list row 3)
  "jurisdictionCountry",
  "jurisdictionProvince",
  "jurisdictionLocality",
  "localityId",
  // Tier-2 public window (row 5)
  "tier2PublicEnabledUntil",
  "tier2PublicPermanent",
  // Adoption eligibility (row 2)
  "adoptionEligible",
  // Identity (row 7)
  "name",
  "species",
  "breed",
  "dateOfBirth",
] as const;

/** Tables whose INSERT is a titular-only effect in itself. */
export const TITULAR_ONLY_INSERT_TABLES: readonly string[] = ["libretaShareTokens"] as const;

const TITULAR_ONLY_EVENT_TYPE_SET: ReadonlySet<string> = new Set(TITULAR_ONLY_EVENT_TYPES);

export function isTitularOnlyEventType(value: string): boolean {
  return TITULAR_ONLY_EVENT_TYPE_SET.has(value);
}
