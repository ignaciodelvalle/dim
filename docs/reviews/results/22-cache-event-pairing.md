1. `src/modules/pets/infrastructure/pets-repository.ts:281` · Profile edit dual-writes `estimatedWeightKg` but only emits `pet_profile_updated`, not `weight_recorded` — cache ≠ `replayPetWeight(events)` · **HIGH** · On weight diff emit `weight_recorded` in same tx (or drop weight from profile UPDATE path).

2. `src/modules/pets/infrastructure/pets-repository.ts:288` · Profile edit dual-writes `jurisdictionProvince`/`jurisdictionLocality` via `pet_profile_updated` instead of `movement_recorded(sub_kind=jurisdiction_changed)` · **HIGH** · Remove jurisdiction from profile writer; route moves through `recordMovementWriter`.

3. `src/modules/pets/infrastructure/pets-repository.ts:116` · Registration sets `estimatedWeightKg` with only `pet_registered`/`microchip_implanted` — no `weight_recorded` for harness/projection · **MED** · If `estimatedWeightKg` present at create, also insert `weight_recorded` in same tx.

4. `src/modules/pets/application/intake/create-intake.ts:353` · Org intake sets `estimatedWeightKg` with only `pet_registered` — same weight projection gap as owner register · **MED** · Emit matching `weight_recorded` when intake carries weight.

5. `lib/infra/business-rules-reeval.ts:138` · PPP rule sweep flips `potentiallyDangerousBreed` with zero `pet_events` row · **MED** · Same tx: insert `pet_profile_updated` with `{field:potentially_dangerous_breed,old,new}` (or dedicated system/attestation event).

6. `src/modules/events/application/amendment/amend-event.ts:113` · `event_amended` on latest `weight_recorded` never refreshes `pets.estimatedWeightKg` · **MED** · After amend, re-apply `overlayAmendments` + `updateWeightProjection` in same tx when target is current weight.

7. `src/modules/events/application/amendment/amend-event.ts:113` · `event_amended` on `movement_recorded` never refreshes `pets.jurisdiction*` · **MED** · After amend, re-derive jurisdiction from amended stream and UPDATE `pets` in same tx.

8. `src/modules/events/application/amendment/amend-event.ts:113` · `event_amended` on `clinical_info_logged(sub_kind=pregnancy)` never refreshes `pets.pregnancyStatus` · **MED** · After amend, `replayPetPregnancy` + UPDATE `pregnancyStatus` in same tx.

**Clean (paired in same tx for scoped columns):** `pets.status`/`deceasedAt` (`status_changed`, `death_recorded` + projection helpers); `rabiesObservationStatus` (bite/close/cron/death cascades); `pregnancyStatus` (started/ended writers); `pet_identifications` microchip/tattoo (with `microchip_implanted`/`microchip_replaced`/`tattoo_recorded`); `sterilized` (no pets column — EXISTS on `sterilization_performed` only); `app/actions/**` (no direct pets cache writes).
