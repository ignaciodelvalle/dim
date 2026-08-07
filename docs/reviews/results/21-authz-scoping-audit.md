Audited all 48 baseline offenders plus the `lib/**` / `src/modules/**` / `app/actions/**` surface.

**Headline:** 43 baseline entries are clean (scoping lives in delegated use-cases). **15 real gaps:** 6 **HIGH** (cross-jurisdiction PII or out-of-scope govt writes — worst: `lookupTransferTarget`, broken `loadActorAuthority` in proposals, decomiso province-only gate) and 9 **MED** (multi-org `orgToken` not pinned to `requireCapability(..., org.id)`).

Full numbered list with one-line fixes: `docs/reviews/results/21-authz-scoping-audit.md`.
rs.ts:42` · `loadActorAuthority` hardcodes `jurisdictions: []` for govt · **HIGH** · Load active `govt_assignments` like `admin-decisions/helpers.ts`.
3. `src/modules/organizations/application/admin-proposals/propose-vet-upgrade.ts:100` · Govt inserts approval_request with client-supplied province/locality outside assignments · **HIGH** · Reject unless admin or matching `(province, locality)` in `session.jurisdictions`.
4. `src/modules/organizations/application/admin-proposals/propose-org-verification.ts:40` · Govt proposes verification for any org without jurisdiction check · **HIGH** · Reject govt unless org HQ matches an assignment tuple.
5. `src/modules/decomiso/application/decomiso-pet-lookup/lookup-pet-for-decomiso.ts:64` · Province-only govt gate exposes `ownerDisplayName` across localities · **HIGH** · Match `(province, locality)` pairs on pet jurisdiction.
6. `app/actions/decomiso.ts:160` · Same province-only gate on execute path · **HIGH** · Same locality predicate as #5.
7. `app/actions/chip-match.ts:54` · `requireCapability` without `org.id`; client `orgToken` unpinned · **MED** · `requireCapability("intake.create", org.id)` from resolved `orgToken`.
8. `app/actions/intake.ts:33` · Same orgToken / last-membership mismatch · **MED** · Same fix as #7.
9. `src/modules/adoption/actions.ts:76` · `setAdoptionEligibilityAction` missing orgToken pin · **MED** · Resolve org from `orgToken` → `requireCapability(..., org.id)`.
10. `src/modules/adoption/actions.ts:116` · Same in `setAdoptionListingStatusAction` · **MED** · Same as #9.
11. `src/modules/adoption/actions.ts:162` · Same in `updateAdoptionListingContentAction` · **MED** · Same as #9.
12. `src/modules/foster/actions.ts:76` · `assignFosterAction` orgToken not bound to capability org · **MED** · `requireCapability("foster.assign", orgIdFromToken(orgToken))`.
13. `src/modules/foster/actions.ts:113` · Same in `endFosterAction` · **MED** · Same as #12.
14. `src/modules/foster/actions.ts:153` · Same in `proposeFosterAction` · **MED** · Same as #12.
15. `src/modules/transfers/actions.ts:613` · `transferCustodyAction` uses last membership, not URL orgToken · **MED** · `requireCapability("custody.transfer", org.id)` from `orgToken`.

## Clean

43/48 baseline shims delegate to scoped use-cases (`canDecideRequest`, `canRevoke`, org custody joins, omnibox/admin-search jurisdiction predicates, admin-only surfaces). No additional cross-tenant read leaks found in audited lib/dashboard paths.
