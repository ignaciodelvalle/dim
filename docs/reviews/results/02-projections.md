1. `lib/projections/pet-microchip.ts:26` · `replayPetMicrochip` only reads earliest `microchip_implanted`, ignores `microchip_replaced` (revoke/replace updates `pet_identifications`, not replay) · **HIGH** · fold `microchip_replaced` into replay or derive chip from active canonical row.

2. `lib/infra/rederive-pet-cache.ts:247` · drift harness compares canonical microchip to `replayPetMicrochip` that cannot model post-replacement state (persistent false drift or masked by backfill sentinels) · **HIGH** · same fix as #1 so stored/derived share one model.

3. `lib/infra/owner-nudges.ts:179` · `hasChip` = `replayPetMicrochip(events).microchipId !== null` stays true after chip revocation (`new_chip_number=null`) · **HIGH** · gate on active `pet_identifications` row or handle `microchip_replaced`.

4. `src/modules/pets/infrastructure/pets-repository.ts:281` · `updatePetProfile` writes `pets.estimatedWeightKg` with no `weight_recorded` event · **HIGH** · emit `weight_recorded` on weight change or stop writing the cache column on profile edit.

5. `lib/projections/pet-weight.ts:14` · `replayPetWeight` only replays `weight_recorded`, so profile/register weight on `pets` is never derivable from events · **HIGH** · extend replay (e.g. `pet_profile_updated`/`pet_registered` weight fields) or restrict cache writes to event writers only.

6. `lib/analytics/owner-dashboard.ts:1201` · `fetchComplianceStatesForPets` omits `species`/`breed`/`estimatedWeightKg`; PPP “Faltan datos” card missing on list vs profile · **HIGH** · pass the same PPP inputs as `app/(app)/mis-mascotas/[publicToken]/page.tsx:489-491`.

7. `lib/projections/pet-compliance.ts:72` · `deriveComplianceState` is not pure `(events,filters)→view`: inputs include `reminders`, `appointments`, `pet_identifications`, `pets.potentiallyDangerousBreed`, `pets.estimatedWeightKg` · **MED** · document hybrid contract or derive all inputs from events (+ rules resolver).

8. `lib/projections/pet-compliance.ts:216` · rabies card prefers `rabiesReminder` (mutable `reminders` row) over overlay-amended dose `next_due_at` in events · **MED** · derive rabies variant from amended events or sync/update reminders on `event_amended`.

9. `lib/infra/rederive-pet-cache.ts:136` · `rederivePetCache` replays raw payloads without `overlayAmendments`; amended clinical fields ≠ UI projection and ≠ stale cache · **MED** · call `overlayAmendments(events)` before all `replay*` functions.

10. `lib/analytics/owner-dashboard.ts:1544` · `fetchPetEventsForProfileV2` orders events by `occurredAt` only; harness uses `(occurredAt, recordedAt, id)` · **MED** · add `.orderBy(asc(recordedAt), asc(id))` to match re-derivation tie-break.

11. `lib/infra/business-rules-reeval.ts:137` · `potentiallyDangerousBreed` flipped via direct `UPDATE pets` with no event; compliance PPP gate reads that cache · **MED** · emit a classification/attestation event or derive PPP at read from breed/weight + rules.

12. `app/(app)/mis-mascotas/[publicToken]/page.tsx:491` · PPP indeterminado uses `pet.estimatedWeightKg` (dual-write cache) instead of event-replayed weight · **MED** · feed `replayPetWeight(events)` (or profile-event projection) into `deriveComplianceState`.

13. `lib/infra/rederive-pet-cache.ts:81` · `CHECKED_COLUMNS` has no `jurisdictionCountry/Province/Locality` despite `record-movement.ts:57-64` dual-writing them from `movement_recorded` · **MED** · add jurisdiction replay + harness columns.

14. `lib/projections/travel-compliance.ts:43` · travel origin taken from `pets.jurisdiction*` cache, not replayed from `movement_recorded` history · **MED** · derive origin from latest `jurisdiction_changed` event (keep cache as write-through only).

15. `lib/infra/rederive-pet-cache.ts:279` · backfill sentinel sets `stored = derived` for implant date/author, hiding real drift on those fields · **MED** · report backfill columns as `skipped_legacy` instead of auto-match.

16. `scripts/rebuild-projections.ts:185` · `--apply` only repairs `status`/`deceasedAt`/`estimatedWeightKg`; other harness columns are detect-only · **MED** · extend apply to rabies/pregnancy/adoption/canonical-id columns or document one repair script per column family.

17. `app/(public)/adoptar/[petToken]/page.tsx:117` · adoption eligibility gates read cached `pets.adoptionEligible` / `inCustodyDispute` / `rabiesObservationStatus` without read-time replay · **MED** · derive gate flags via `rederivePetCache` (or inline `replay*`) at read boundary.

18. `lib/projections/pet-tattoo.ts:36` · `replayPetTattoo` handles `tattoo_recorded` only, not catalogued `tattoo_updated` · **MED** · add latest-wins branch for `tattoo_updated`.

19. `lib/projections/pet-compliance.ts:256` · `deriveSterilization` uses `.find()` (first/earliest in ASC stream), unlike latest-wins replay modules · **LOW** · iterate from end for latest `sterilization_performed`.

20. `lib/projections/pet-status.ts:24` · multiple `death_recorded` events: `.find()` picks earliest, not documented “latest wins” · **LOW** · use last death event or enforce single-death invariant in writers.

**clean:** `lib/projections/owner-confidence-display.ts` (pure tier→badge map); `lib/projections/pet-rabies-observation.ts` + `pet-adoption-eligibility.ts` (pure replay, dual-write covered by harness); `scripts/detect-pet-cache-drift.ts` (read-only drift detection, advisory-lock discipline).
