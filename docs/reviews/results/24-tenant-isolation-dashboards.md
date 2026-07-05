`e2e/cross-tenant-isolation.spec.ts` covers owner A↔B only — no govt/org operator probes. Findings below are from live code paths.

1. `app/gob/vigilancia/investigaciones/[caseCode]/page.tsx:75` · Govt guard is province-only; `!detail.jurisdictionProvince` passes any assigned govt; ignores locality · **HIGH** · Require `(province, locality)` pair match like `listOutbreakInvestigationsForGovt` / `canReadCase`.

2. `lib/infra/case-queries.ts:802` · `getOutbreakInvestigationDetail(publicCode)` loads case + full `case_events` timeline with no jurisdiction predicate · **HIGH** · Add `jurisdictions`/`isAdmin` args and SQL `WHERE` on case jurisdiction columns before returning notes.

3. `src/modules/decomiso/application/decomiso-pet-lookup/lookup-pet-for-decomiso.ts:64` · Decomiso lookup scopes govt to pet province only (locality ignored; null province allowed) · **HIGH** · Match full `(pets.jurisdictionProvince, pets.jurisdictionLocality)` against assignment pairs before returning owner PII.

4. `app/actions/decomiso.ts:160` · `executeDecomisoAction` registered-pet path uses same province-only / null-province scope check · **HIGH** · Require `(province, locality)` pair match on `pets.jurisdiction*` before seizure.

5. `app/actions/decomiso.ts:177` · Unowned decomiso path checks govt org province only, not locality pair · **HIGH** · Require `(govtOrg.jurisdictionProvince, govtOrg.jurisdictionLocality)` ∈ `session.jurisdictions`.

6. `app/org/[orgToken]/intake/match/[matchedPetToken]/page.tsx:33` · Pet loaded by `publicToken` only — no org intake/chip-match claim; SSR exposes lost-pet owner first name + last-seen location cross-org · **HIGH** · `notFound()` unless org has pending intake chip-match tied to `organization.id` (or equivalent server-side claim).

7. `src/modules/pets/application/chip-match/confirm-chip-match-refugio.ts:40` · Write path confirms chip match / creates `shelter_custody` from token alone, not URL org’s intake context · **HIGH** · Verify org-scoped intake-match claim before mutating; bind writer to session org from URL-scoped auth.

8. `app/gob/decomisos/nuevo/page.tsx:27` · SSR loads all verified shelters/rescue_networks nationally for receiver combobox · **MED** · Filter `organizations` in SQL by govt `(province, locality)` assignment pairs.

9. `app/gob/maltrato/[id]/page.tsx:198` · Derivation panel falls back to nationwide verified shelters when none in report province · **MED** · Drop national fallback for govt; restrict fallback orgs to viewer assignment pairs only.

10. `src/modules/custody-disputes/application/lookup-transfer-target.ts:20` · `lookupTransferTargetUseCase` resolves any user/org UUID to `displayName` with no dispute or jurisdiction binding · **MED** · Require in-scope `disputeToken` (or equivalent) and scope-check dispute before lookup.

11. `app/actions/chip-match.ts:54` · `requireCapability("intake.create")` ignores URL `orgToken` — multi-org users auth as latest membership, not page org · **MED** · `requireOrgAccessByToken(orgToken)` then `requireCapability("intake.create", organization.id)`.

12. `app/actions/intake.ts:33` · Same session-default org for `createIntakeAction`; no `orgToken === organization.publicToken` check · **MED** · Resolve org from URL token first; reject mismatch before `createIntake`.

13. `src/modules/foster/actions.ts:76` · `assignFosterAction` / `endFosterAction` / `proposeFosterAction` / `searchFosterVolunteers` use `requireCapability(...)` without URL org id (unlike `cancelFosterProposalAction:203`) · **MED** · Pass `organization.id` from `requireOrgAccessByToken(orgToken)` into every org-portal foster action.

14. `src/modules/adoption/actions.ts:314` · `approveAdoptionApplicationAction` / `rejectAdoptionApplicationAction` auth via session-default org; only post-hoc `publicToken` compare · **MED** · `requireCapability("adoption.review", orgFromToken.id)` from URL-resolved org before review.

15. `app/org/[orgToken]/transitos/page.tsx:50` · `orgPets` omits `ownerships.endedAt IS NULL` — ended custody expands `petIds`, surfacing fosters for pets org no longer holds · **MED** · Add `isNull(ownerships.endedAt)` to the orgPets ownership filter.
