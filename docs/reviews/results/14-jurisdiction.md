**Write-path canonicalization**

1. `src/modules/pets/actions.ts:102` · `createPetAction` skips strict canonicalization when `jurisdictionProvince` is null but locality is set (free-text L1 submit) · **HIGH** · Require `localityIndecId` or run strict always and reject when province unresolved.

2. `src/modules/pets/domain/pet-form.ts:219` · `parsePetForm` ignores `provinceName`/`loc.province` and only canonicalizes `provinceCode`, so crafted/empty-code requests drop province while keeping locality · **HIGH** · Derive province from `localityIndecId` or `provinceName` before persist.

3. `components/LocalityPickerAcross.tsx:163` · L1 picker emits raw typed text as `localityName` without catalog pick; server accepts it when province is absent · **HIGH** · Reject submit unless `selected.indecId` is set (or server-side strict rejects unknown pairs).

4. `lib/domain/location-normalize.ts:87` · `normalizeLocationForWrite` never reads `loc.localityIndecId`; all writers pass `null` · **HIGH** · Prefer `resolveCanonicalJurisdictionById` when `localityIndecId` present.

5. `src/modules/pets/actions.ts:247` · `updatePetAction` canonicalizes then writes jurisdiction changes via profile edit (`pet_profile_updated`), not `movement_recorded` · **HIGH** · Lock `jurisdiction_*` on established pets; moves only through `recordMovementWriter`.

6. `src/modules/pets/domain/pet-diff.ts:122` · Diff includes `jurisdiction_province`/`jurisdiction_locality` as mutable profile fields · **HIGH** · Remove from `diffPet` / block in `updatePetProfile` when pet already has canonical locality.

7. `src/modules/auth/application/complete-identity.ts:54` · Profile signup uses `locality:"none"`; raw `localityName` persisted on `profiles` · **MED** · Switch to `locality:"strict"` (or require `localityIndecId`).

8. `src/modules/welfare/actions.ts:813` · Public denuncia uses `locality:"soft"`; non-catalog strings can persist on `welfare_reports` · **MED** · Acceptable for anon UX — add post-submit normalization job or flag `localityCanonical=false` for govt routing.

9. `src/modules/service-offerings/application/create-service-offering.ts:73` · Service offerings use `locality:"soft"`; off-catalog locality can persist · **MED** · Upgrade to strict once scope is required, or reject `localityCanonical=false` before approval routing.

10. `app/actions/business-rules.ts:82` · `normalizeJurisdiction` trim-only; `govt_business_rules.jurisdiction_locality` never validated against `ar_localities` · **HIGH** · Route through `resolveCanonicalJurisdiction` before insert.

11. `src/modules/pets/application/movement/record-movement.ts:61` · `jurisdiction_changed` denormalizes raw `to_province`/`to_locality` with no catalog gate · **HIGH** · Canonicalize payload fields before `UPDATE pets`.

12. `src/modules/foster/infrastructure/foster-repository.ts:434` · Foster volunteer UPDATE stores raw `jurisdictionProvince`/`jurisdictionLocality` (no strict pass, province not canonicalized) · **MED** · Run `normalizeLocationForWrite({locality:"strict"})` on both INSERT and UPDATE.

13. `lib/domain/location-normalize.ts:134` · `locality:"strict"` passthrough when province or locality absent instead of throwing · **MED** · Throw `JurisdictionValidationError` when either half missing.

14. `components/LocationFields.tsx:406` · L2 mode always writes empty `localityNameIndecId`; geocoded locality is never catalog-bound at capture · **LOW** · Map geocode result through `resolveCanonicalJurisdiction` (soft fallback) before persist.

**Locality mutability (#40)**

15. `docs/design/handoffs/2026-07-04-cutover-readiness-final.md:44` · Policy recommends full-lock; code still allows profile edit path (items 5–6) · **HIGH** · Implement full-lock per PO decision.

**Stale INDEC rename**

16. `scripts/import-indec-localities.ts:287` · Catalog rename updates `ar_localities.locality_name` in place; no fan-out to `pets`/`profiles`/other jurisdiction columns · **MED** · Add migration/script to remap stored locality strings via `indecId` or slug join.

17. `db/migrations/0117_govt_assignments_locality_canonical.sql:159` · One-time backfill/revoke only for `govt_assignments`; no equivalent for `pets.jurisdiction_locality` · **MED** · Add pets locality fitness sweep + repair migration mirroring 0117.

18. `__tests__/govt-assignments-locality-integrity.test.ts:45` · CI fitness covers only active `govt_assignments`, not `pets` · **MED** · Add `pets` active-row locality integrity test.

**Province/locality mismatch**

19. **clean** — `lib/infra/jurisdiction-validation.ts:45` strict path resolves locality scoped to resolved province; mismatch throws `INVALID_LOCALITY`.

20. `lib/domain/location-normalize.ts:170` · `locality:"none"`/`"soft"` paths allow arbitrary locality string with any (or null) province · **MED** · Restrict `"none"`/`"soft"` to non-jurisdiction columns (coords/address only).

**Case / accent normalization**

21. `lib/infra/ar-localidades.ts:110` · `localityByName` CI fallback uses `lower(locality_name)=lower(input)` without accent fold; fails when slug path misses · **MED** · Apply same `normalize()` to both sides (or `unaccent(lower(...))` like 0117 SQL).

22. `lib/infra/ar-localidades.ts:98` · 68 ambiguous `(province,name)` pairs pick first `ORDER BY department_name`; wrong department homonym possible · **MED** · Require `indecId` from picker; reject ambiguous name-only resolution.

23. **clean** — `lib/infra/ar-localidades.ts:46` slug path + `searchLocalities` slug scoring handle case/accent for combobox search and strict picks that hit slug first.
