// The event-type source of truth.
//
// WHY IT LIVES HERE AND NOT IN db/schema.ts
// ---------------------------------------------------------------------------
// This list used to be declared inside `db/schema.ts`, a 4.8k-line Drizzle
// module. That made the ORM the anchor of the whole domain vocabulary: every
// pure module that needed one enum — case lifecycles, the zod payload
// registry, the titular-only deny-list — reached through `@/db/schema` and,
// with it, through `drizzle-orm`. A React Native client that needs to name an
// event type could not have this list without installing a Postgres ORM.
//
// The dependency is now inverted: `db/schema.ts` imports FROM here and
// re-exports for compatibility. This file has zero imports, and the
// `check-contract-purity` fence keeps it that way.
//
// The list is deliberately not a `pgEnum`: event types are stored as TEXT so
// adding one never requires a database migration. Validation happens in
// application code against this const.

export const EVENT_TYPES = [
  // Lifecycle
  "pet_registered",
  "pet_profile_updated",
  "status_changed",
  "death_recorded",
  // Preventive medicine
  "vaccination_administered",
  "deworming_administered",
  "sterilization_performed",
  // Medication
  "medication_started",
  "medication_stopped",
  // Clinical encounters and findings.
  // Lab work, imaging, surgery, and allergy detection live inside
  // `clinical_info_logged` with a `sub_kind` discriminator (lab_work | imaging
  // | surgery | allergy_detection | other). Their former dedicated event_types
  // were removed 2026-05-18 as part of the event-catalog-cleanup. Historical
  // rows with those types remain in pet_events (events are immutable).
  "vet_visit_logged",
  // Body metrics
  "weight_recorded",
  // Identification & legal
  "microchip_implanted",
  // microchip_replaced is the umbrella for replacement + revocation
  // (catalog cleanup 2026-05-19). new_chip_number === null distinguishes
  // a revocation (no replacement chip) from a normal replacement.
  "microchip_replaced",
  "tattoo_recorded",
  "tattoo_updated",
  "dangerous_breed_attested",
  // Free-form
  "note_added",
  // System / observed
  "credential_scanned",
  "incident_reported",
  // Rabies observation — 10-day lifecycle around an `incident_reported` row
  // with `payload.incident_type='bite_inflicted'`. See
  // docs/superpowers/specs/2026-05-18-bite-rabies-observation-design.md (v1.1).
  "rabies_observation_started",
  "rabies_observation_ended",
  // Medication adherence — dual-write with reminder.completedAt.
  "medication_dose_taken",
  // Non-owner reporting flow — writers live in src/modules/welfare (abandonment/maltreatment)
  // and src/modules/events/application/surveillance (symptom_observed).
  "symptom_observed",
  "abandonment_reported",
  "maltreatment_reported",
  // Unified clinical information event (collapses lab/imaging/surgery/allergy for v1 owner flow).
  "clinical_info_logged",
  // Custody & adoption — schema-ready, UI deferred. See AGENTS.md → Custody & adoption.
  // Note: `adoption_application_reviewed` was removed 2026-05-18; the
  // application table's status field covers the "in review" stage without
  // needing an explicit event.
  "shelter_intake_recorded",
  "foster_assigned",
  "foster_ended",
  "adoption_application_submitted",
  // adoption_application_resolved is the umbrella for approved + rejected
  // decisions (catalog cleanup 2026-05-19). outcome discriminates;
  // auto_generated=true is set by the F5.5 finalize cascade.
  "adoption_application_resolved",
  "adoption_finalized",
  "post_adoption_checkin",
  // adoption_reversed is the umbrella for adoption_revoked + adoption_withdrawn
  // (catalog cleanup 2026-05-19). actor: shelter | adopter | court.
  "adoption_reversed",
  "custody_transferred",
  // Direct claim of a chip/tattoo-registered pet with NO active custody of
  // any role (free pet). Unlike custody_transferred there is no "from" actor;
  // the claimant opens a fresh owner ownership. Emitted by
  // submitFreeClaimAction (claim wizard variant "free").
  "ownership_claimed",
  // Lost & Found — two-phase return-to-owner handshake (Fase 5).
  // Proposed by the actor holding shelter_custody; accepted by the owner.
  "custody_transfer_proposed",
  // Structured cancellation of a custody_transfer_proposed. Replaces the
  // fragile marker-text note_added approach (ARCH-B). The cancelled_by
  // discriminator records who terminated the proposal.
  "custody_transfer_cancelled",
  // Custody disputes — admin/govt flag the pet for external legal proceedings.
  // Set `pets.in_custody_dispute=true` on raised, false on resolved.
  "custody_dispute_raised",
  "custody_dispute_resolved",
  // Foster volunteers pool — two-phase proposal lifecycle (org→volunteer),
  // plus the co-foster opt-in flag (D17). See
  // docs/superpowers/specs/2026-05-18-foster-volunteers-pool-design.md v1.4.
  //
  // foster_proposal_resolved is the umbrella terminal event with
  // `outcome: accepted | rejected | cancelled | expired` in the payload.
  // Replaces the 4 dedicated event_types (accepted/rejected/cancelled/expired)
  // that lived here prior to the 2026-05-19 catalog cleanup.
  "foster_proposed",
  "foster_proposal_resolved",
  "foster_co_foster_allowed",
  // Adoption eligibility flag set/changed — see spec foster-volunteers-pool §17.
  "adoption_eligibility_set",
  // Surveillance — emitted when symptom_observed triggers a reportable disease match.
  "outbreak_signal",
  // Generic disease report — laboratory-confirmed or clinically-suspected
  // case of a reportable zoonosis. payload.disease is the discriminator
  // (lepto | hidatidosis | other) so new zoonoses don't need a new
  // event_type entry. Powers /gob/* KPI tiles (handoff P4-3).
  "disease_reported",
  // Jurisdictional mobility (movilidad-jurisdiccional Fase 1, 2026-07-04).
  // ONE event type with a `sub_kind` discriminator for its three faces:
  //   jurisdiction_changed — multi-locality move (denormalizes pets.jurisdiction*)
  //   cvi_issued           — records the FACT of a foreign CVI (DIM never issues)
  //   transport_recorded   — outbound trip on one of the 5 registered corridors
  "movement_recorded",
  // Correction by amendment — core principle #2 (2026-06-19).
  // Immutable correction: references the original event, never edits it.
  // Only events in AMENDABLE_EVENT_TYPES may be amended (D4).
  // D5: admin/govt amendments are sensitive — reason required, audit logged,
  // owner notified via notification_type='admin_event_amended'.
  "event_amended",
  // Physical tag (chapa) lifecycle — migration 0169. Payloads NEVER carry the
  // activation code (plaintext or hashed) under any field. tag_revoked uses
  // payload key `revoke_reason` (NOT `reason`) because erase_subject_data
  // sentinel-redacts the key `reason` across ALL event types (0159→0166) and
  // would destroy the enum fact on subject erasure (design D5).
  "tag_activated",
  "tag_revoked",
  // Temporary caretaker (custodia-temporal, migration 0189). TWO events, not
  // three: there is NO `caretaker_proposed`, because a pending invitation is
  // workflow state (pet_caretaker_grants.status) and not a fact about the
  // animal. `caretaker_designated` is emitted AT ACCEPT — the name means "the
  // grant became active" — in the same transaction as the
  // ownerships(role='caretaker') row. `caretaker_ended` carries the outcome
  // discriminator (returned | expired | revoked_by_owner | withdrawn_by_caretaker |
  // ownership_transferred)
  // so ending a grant never needs a fourth event type.
  "caretaker_designated",
  "caretaker_ended",
  // Rehome sponsorship (rehome-by-titular). A titular who can no longer keep
  // their pet asks a verified org to publish it for adoption and vet the
  // applicants WHILE THE ANIMAL STAYS IN THE TITULAR'S HOME. The org gets a
  // `shelter_custody` row ALONGSIDE the titular's `owner` row, never instead of
  // it, so "custodia" here is a registry role and not physical possession.
  //
  // TWO events, same shape as the caretaker pair: the pending request is
  // workflow state on a `rehome_request` case, not a fact about the animal, so
  // there is no `rehome_sponsorship_requested`. `rehome_sponsorship_started` is
  // emitted AT ACCEPT, in the same transaction as the ownerships row.
  // `rehome_sponsorship_ended` carries the `outcome` discriminator (adopted |
  // withdrawn_by_titular | ended_by_org | pet_deceased | withdrawn_by_platform),
  // so no third type is ever needed to say how an arrangement finished.
  "rehome_sponsorship_started",
  "rehome_sponsorship_ended",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
