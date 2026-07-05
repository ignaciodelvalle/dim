1. `lib/projections/pet-compliance.ts:343` · PPP `tone:"ok"` / summary “al día” from any `dangerous_breed_attested` via `hasEvent()` — no `clearsObligation()` · **HIGH** · Apply same provenance gate as rabies/chip/sterilization, or use non-“al día” state label for owner attestation.

2. `lib/projections/pet-compliance.ts:256` · `deriveSterilization` uses `.find()` on events ordered ASC (`owner-dashboard.ts:1544`, `fetchPetEventsForProfileV2:1544`) — oldest row wins · **HIGH** · Pick latest `sterilization_performed` by `occurredAt` (or newest verified).

3. `lib/projections/pet-compliance.ts:287` · `deriveMicrochip` same `.find()`/ASC-order bug — first implant wins over later verified replacement · **HIGH** · Pick latest `microchip_implanted` or highest-confidence implant.

4. `lib/projections/pet-compliance.ts:174-182` · Rabies `due`/`over` from `rabiesReminder` bypass H1 — self-reported reminder can show “Vencida”/“Por vencer” without verified dose · **MED** · Gate all non-neutral rabies tones on `clearsObligation(latestRabiesDose)` or downgrade to `Declarada · sin verificar`.

5. `lib/projections/pet-compliance.ts:126-133` · `clearsObligation` accepts `computeConfidence` → `institutional_verified` when owner event has `payload.confirmed_by_lab===true` (`event-confidence.ts:52`) · **MED** · For compliance clearing, require `authorRole` in `{vet,shelter,govt}` regardless of lab flag.

6. `lib/projections/pet-compliance.ts:147-155` · Rabies dose detection regexes `payload.vaccine_name` only — ignores top-level `tipo_evento_code='vacunacion_antirrabica'` on full `typedEvents` rows · **MED** · Also match SENASA `tipo_evento_code` (extend `ComplianceEvent` + filter).

7. `lib/projections/pet-compliance.ts:418-423` · Rabies/microchip cards + Ord. 41.831 footnotes emitted for all species — no cat/other exemption · **MED** · Branch obligations by `species` and jurisdiction-resolved requirement rules.

8. `lib/projections/pet-compliance.ts:354` · `derivePpp` treats `species === null/undefined` as non-dog — skips PPP indeterminado even when breed/weight present · **MED** · Treat missing species with dog fields as dog for indeterminado/PPP surfacing.

9. `lib/projections/pet-compliance.ts:331-340` · PPP classification at read time is only `pppApplies` flag — projection never re-runs `classifyPpp`/`resolveBusinessRule`; stale `potentiallyDangerousBreed` after rule changes until reeval · **MED** · Pass resolved `PppRules` into `deriveComplianceState` and recompute flag at projection time.

10. `lib/reference/breeds.ts:96-101` · `isPotentiallyDangerousBreed` exact `Set.has(breed.trim())` — typos/aliases (“Pitbull”, “Doberman Pinscher”) never match · **MED** · Shared normalized breed matcher used by client warning + `classifyPpp` (`ppp-classification.ts:73`).

11. `lib/infra/breeds-server.ts:28-30` · `isPotentiallyDangerousBreedForJurisdiction` resolves only `ppp_breed_list`, ignores `ppp_weight_threshold`/`classifyPpp` OR path · **MED** · Remove or delegate to `resolvePppClassificationForJurisdiction`.

12. `lib/domain/vaccine-reminder-state.ts:30-35` · Hardcoded 8/1/30-day variant thresholds feed `deriveRabies` via `rabiesReminder` — not `due_soon_window`/`reminder_windows` from `govt_business_rules` · **MED** · Resolve windows via `resolveBusinessRule` before computing variant.

13. `lib/analytics/owner-dashboard.ts:1206` · Batch `deriveComplianceState` always passes `microchipCode: null` — microchip obligation wrong on list/inicio surfaces using same projection · **MED** · Pass active microchip code per pet from identifications.

**Provenance gate (rabies/sterilization/microchip “Vigente”/“Registrada”/“Sí”):** clean except findings 4–5.

**`computeConfidence` mapping:** clean except finding 5 (lab-flag bypass into compliance clearing).

**PPP dog-only + indeterminado:** clean except findings 8–9; weight-only PPP via `classifyPpp` (`ppp-classification.ts:76-80`) is correct at write time.

**Jurisdiction `resolveBusinessRule` / PPP rules:** clean in resolver (`business-rules-resolver.ts:48-90`); not wired into compliance projection (finding 9).
