1. `lib/analytics/admin-metrics.ts:116` · `fetchQueueHealthScoped([])` omits the jurisdiction `WHERE` and returns **national** approval-queue counts/aging · **HIGH** · if `jurisdictions.length === 0`, return zeroed metrics (or `sql\`false\``), never run unscoped.

2. `lib/infra/admin-search.ts:72` · `searchUsers` defaults `scope` to `{ role: "admin" }` (universal user PII search) · **MED** · remove the default; require an explicit `UserSearchScope` at every call site.

3. `lib/analytics/owner-dashboard.ts:1079` · `fetchComplianceStatesForPets` loads `pet_events.payload` for caller-supplied `petIds` with no `ownerships`/membership predicate (only reminders filter on `userId`) · **MED** · constrain `petIds` via `EXISTS` active ownership/membership for `userId` before reading events.

4. `lib/analytics/owner-dashboard.ts:1524` · `fetchPetEventsForProfileV2(petId)` returns full event payloads for any `petId` · **MED** · gate with `requirePetAccess` semantics (ownership/membership join) inside the query.

5. `lib/analytics/owner-dashboard.ts:1239` · `fetchVaccinationHistory(petId)` same unscoped `pet_events` read · **MED** · same ownership/membership predicate on `petId`.

6. `lib/analytics/owner-dashboard.ts:1393` · `fetchPetWeightHistory(petId)` same · **MED** · same ownership/membership predicate on `petId`.

7. `lib/infra/case-queries.ts:191` · `getCaseDetailByPublicCode` loads opener display names + raw `pet_events.payload` with zero access predicate · **MED** · add viewer/scope args and filter (or split public-redacted vs operator projections).

8. `lib/infra/case-queries.ts:802` · `getOutbreakInvestigationDetail(publicCode)` loads investigation + actor names with no jurisdiction predicate · **MED** · add `jurisdictions`/`isAdmin` params and `WHERE` on case jurisdiction columns (mirror `listOutbreakInvestigationsForGovt`).

9. `lib/analytics/govt-dashboards.ts:1447` · `fetchWelfareTimeline(reportId)` `select()`s the full `welfare_reports` row with no jurisdiction filter · **MED** · verify report jurisdiction against caller scope before any read (or push scope into SQL).

10. `lib/infra/case-queries.ts:517` · `listCaseKindDistributionForOrg(orgId)` trusts caller-supplied `orgId` for case metadata · **MED** · derive `orgId` only from verified org session (`requireOrgAccessByToken`) or join membership in-query.

11. `lib/infra/notification-service.ts:94` · `createNotification`/`createNotificationsBulk` write notifications to arbitrary `userId` (cross-user write if wrapper skips session check) · **MED** · require `actorUserId` + assert target is authorized, or restrict imports to cron/internal modules via lint.

12. `scripts/check-authz-guards.ts:299` · guard linter covers only `app/actions/*.ts` + `src/modules/**/actions.ts`; **`lib/**` mutations/PII reads are unlinted** · **MED** · extend scan to `lib/**` write/PII modules or add a dedicated lib authz linter.

13. `scripts/check-authz-scoping.ts:31` · baseline ratchet never fails on existing tenant-guarded-but-unscoped actions (only count growth) · **LOW** · burn baseline to 0 and fail CI on any offender until delegated scoping is proven in code.

**`*ForUser/*ForAuthority/*ForOrg` exports in `lib/**`:** clean (no such exports; impersonation writers live in `src/modules/**`, blocked from `"use server"` re-export by `check-authz-guards.ts:190-251`).

**`lib/infra/auth-guards.ts` institutional guards:** clean (active institutional profile + deactivation checks centralized in `loadActiveInstitutionalProfile`).

**Server actions reachable without guard (`lib/**` scope):** clean (no `"use server"` modules under `lib/`).
