## Ground truth

| Field | Value |
|---|---|
| Branch | `integration/all-20260703` |
| HEAD | `30899e92` |
| Verified via | `git -C C:/dev/dim branch --show-current` + `git -C C:/dev/dim rev-parse --short HEAD` |

---

# Part A — Jurisdiction & multi-tenant scope-correctness

## A1. Amendment overlay (`event_amended` / `amendedPayloadText`) — class or one-off?

**Verdict: a CLASS of correctness risk, but NOT the “amendment JOIN widens rows” shape.** Commit `9f596832` touched 10 files; `fetchReportableIncidence` was **not** among them (`git show 9f596832 --stat`). At HEAD it scopes via `pets` join + `petsScopeClause`, with no amendment overlay (`lib/analytics/surveillance-metrics.ts:484-530`).

The shared SQL helper is a **correlated subquery on `target_event_id`**, not a widening JOIN:

```42:61:lib/infra/amendment-sql.ts
export function amendedPayloadText(field: string, refs?: { id: SQL; payload: SQL }): SQL {
  ...
        WHERE am.event_type = 'event_amended'
          AND am.payload->>'target_event_id' = ${idRef}::text
```

**Siblings using `amendedPayloadText` (grep `amendedPayloadText|amendment-sql` in `lib/**`):**

| Function / area | File:line | Scope on final aggregate | Amendment leak risk |
|---|---|---|---|
| `fetchRabiesCoverage` / `fetchRabiesCoverageByProvince` | `lib/analytics/govt-home-kpis.ts:100-214` | **Dual:** `petEventsScopeClause` + `pets` jurisdiction pairs | Low — both predicates applied |
| `fetchRabiesVaccinationTrend` | `lib/metrics/trends.ts:239-258` | `petEventsScopeClause` + `INNER JOIN pets` | Low |
| `fetchRegionRanking` | `lib/analytics/analytics-ranking.ts:117-124` | `petsScope` on pets + rabies join | Low |
| `fetchAnalyticsMetrics` (rabies arm) | `lib/analytics/govt-dashboards.ts:1686-1705` | `needsJoin` → pets jurisdiction for govt | Low |
| `fetchCrossJurisdictionOutliers` | `lib/metrics/program-health.ts:289-308` | Outer `pets` + `activePetsCondition`; EXISTS unscoped inside pet | Low (per-pet, not cross-pet) |
| `fetchOverdueRabiesVaccine` | `lib/infra/outreach-pipelines.ts:150-171` | CTE unscoped, **final** `WHERE` uses `rawPetsScopeClause` on `pets` | Low (PII outreach is intentionally scoped on pets) |
| Panorama choropleth predicate | `src/modules/panorama/infrastructure/repository.ts:622-672` | `scopeClause` on `pets` in rollup | Low |
| Compliance metrics (C1/C2/D4/D5) | `lib/analytics/compliance-metrics.ts:30-37` | Explicitly **no** amendment overlay (non-amendable types) | N/A — safe by design |

**Systemic class (more important than amendment JOINs): `petEventsScopeClause` trusts `payload->>'pet_jurisdiction_*'` while many pet-scoped fetchers use `pets.jurisdiction_*`.** When those diverge (pet moved, seed drift — see `scripts/seed-panorama.ts:3690` comment), govt aggregates can mis-attribute or leak PII across locality boundaries.

---

## A2. Analytics / metrics — jurisdiction-scoped fetchers

### Severity-ranked findings

| Severity | file:line | Finding | Status | Why it leaks / why safe | Fix direction |
|---|---|---|---|---|---|
| **HIGH** | `lib/analytics/govt-dashboards.ts:112-149` | `fetchSurveillanceSignals` returns `petName`, `petPublicToken` scoped only via `outbreakSignalScopeClause` on **payload** jurisdiction (`:100-108`, `:124-125`) | **CONFIRMED** | Inner join to `pets` does not constrain scope; stale/wrong payload locality lets govt A see pets whose **current** `pets.jurisdiction_*` is outside assignment | Scope on **`pets.jurisdiction_*`** (or require payload == pets columns) for any row returning pet identifiers |
| **HIGH** | `lib/metrics/event-ledger.ts:119-174` | `fetchEventLedger` scopes via `petEventsScopeClause` only; returns `petPublicToken` | **CONFIRMED** | Same payload-vs-pet drift; govt ledger exposes DIM tokens outside assignment | Add `petsScopeClause(ctx)` (or join + pets pairs) to WHERE |
| **MEDIUM** | `lib/analytics/govt-home-kpis.ts:391-410` | `fetchBitesPer10k` counts `incident_reported` with `petEventsScopeClause` only — **no pets join** | **CONFIRMED** | Cross-locality **aggregate** inflation/deflation when payload jurisdiction stale | Join `pets` + apply `petsScopeClause` for govt |
| **MEDIUM** | `lib/analytics/govt-home-kpis.ts:285-309` | `fetchSterilizationMetrics` — payload scope only | **CONFIRMED** | Same aggregate drift class | Join `pets` + dual scope |
| **MEDIUM** | `lib/analytics/govt-home-kpis.ts:476-565` | `fetchActiveZoonosis` disease arms use `eventsScope` without pets join; rabies/bite arms correctly use `pets`/`cases` | **CONFIRMED** | Lepto/hidat counts can include out-of-jurisdiction pets if payload wrong | Join `pets` + `petsScopeClause` on disease_reported arms |
| **MEDIUM** | `lib/analytics/govt-dashboards.ts:1069-1090` | `fetchZoonosisTrend` — payload-only scope, no k-anon | **CONFIRMED** | Mis-attributed monthly counts (govt-only surface) | Join pets for govt; document admin exception |
| **MEDIUM** | `lib/analytics/govt-dashboards.ts:2005-2064` | `fetchOutbreakHistory` — payload-only scope | **CONFIRMED** | Choropleth/history attributed to wrong locality | Same as above |
| **LOW** | `lib/analytics/govt-dashboards.ts:754-779` | `fetchCasesPerLocality` — scoped correctly via `casesScopeClause`, **no k-anon** | **CONFIRMED** | Authorized govt surface; small barrios expose exact open-case counts (operational, not public) | Optional k-anon if treating govt choropleth like public analyst tier |
| **LOW** | `lib/analytics/govt-dashboards.ts:1394-1460` | `fetchWelfareTimeline(reportId)` has **no** internal auth | **CONFIRMED safe today** | Sole caller `app/gob/maltrato/[id]/page.tsx:106-114` enforces govt scope before call | Add `actor+jurisdictions` param + assert, or move behind guarded action |
| **INFO** | `lib/analytics/surveillance-metrics.ts:484-530` | `fetchReportableIncidence` — `JOIN pets` + `petsScopeClause`; integration test proves scope (`__tests__/surveillance-compliance.test.ts:524-543`) | **CONFIRMED safe at HEAD** | Not using amendment overlay; pets-table scope | N/A (assume live fix targets a different revision/drift) |
| **INFO** | `lib/analytics/compliance-metrics.ts:87-140` | C1 microchip `byLocality` uses `suppressedMetric` | **CONFIRMED safe** | k=5 enforced | Pattern to replicate |
| **INFO** | `lib/analytics/mortality-metrics.ts:198-219` | B8 locality uses `suppressSmallCells` k=5 | **CONFIRMED safe** | — | — |
| **INFO** | `lib/metrics/census.ts:286-296` | Registry `byLocality` suppressed | **CONFIRMED safe** | — | — |
| **INFO** | `lib/analytics/govt-dashboards.ts:228-258` | `fetchLostPets` scopes on **`pets.jurisdiction_*`** | **CONFIRMED safe** | Correct source of truth for pet location | — |
| **INFO** | `app/gob/maltrato/[id]/page.tsx:97-114` | Welfare detail govt guard → `notFound()` outside assignment | **CONFIRMED safe** | No existence leak | — |

**Scope primitives (canonical):** `lib/metrics/scope.ts:71-127` — `petsScopeClause` / `petEventsScopeClause`; govt empty assignments → `sql\`false\`` (`:86`, `:119`).

---

## A3. Server actions — READ + cross-org (post–prior triage)

Prior triage closed **8** shim files (`__tests__/authz-bare-writer-exports.test.ts:35-57`). **At HEAD there are still ~39 addressable `*ForUser/*ForAuthority/*ForOrg` exports** in `app/actions/**` (`rg "export async function.*For(User|Authority|Org)" app/actions` → 39 matches).

| Severity | file:line | Finding | Status | Why it leaks | Fix direction |
|---|---|---|---|---|---|
| **CRITICAL** | `app/actions/profile.ts:38-43` | `updateProfileForUser` / `uploadAvatarForUser` exported from `"use server"` module, no session check | **CONFIRMED** | Client can pass arbitrary `userId`; writer updates `profiles` via BYPASSRLS Drizzle (`src/modules/pets/application/profile/update-profile.ts:50-88`) | Remove exports; extend `FORBIDDEN_EXPORTS` guard; session-only `*Action` wrappers |
| **CRITICAL** | `app/actions/admin-decisions.ts:33-51` | `approveRequestForAuthority(actorUserId, …)` exported | **CONFIRMED** | Trusts supplied UUID; `loadActorAuthority(actorUserId)` (`admin-decisions/helpers.ts:22-39`) — no tie to session | Same pattern as triage: inner module only |
| **CRITICAL** | `app/actions/admin-institutional.ts:37-70` | `createInstitutionalAccountForAuthority`, `resetInstitutionalCredentialsForAuthority`, etc. exported | **CONFIRMED** | Institutional account provisioning callable with forged admin UUID | Remove exports |
| **HIGH** | `app/actions/service-offerings.ts:52-94` | `createServiceOfferingForOrg`, `approveServiceOfferingForAuthority` exported with caller-supplied `actorUserId` | **CONFIRMED** | Cross-org / cross-authority writes without session | Remove exports |
| **HIGH** | `app/actions/libreta-share.ts:48-59` | `createLibretaShareForUser` / `revokeLibretaShareForUser` exported | **CONFIRMED** | Attacker supplies victim `userId` + known pet token → mint Tier-2 medical share as victim | Remove exports |
| **HIGH** | `app/actions/admin-proposals.ts:39-76` | `logPiiQueryForAuthority`, `proposeVetUpgradeForUser`, etc. exported | **CONFIRMED** | PII audit forgery / proposal spam under stolen admin UUID | Remove exports |
| **MEDIUM** | `app/actions/pet-tab-data.ts:28-34` | `getLibretaFaceData` | **CONFIRMED safe** | Calls `requirePetAccess(publicToken)` before read | Good pattern |
| **MEDIUM** | `app/actions/libreta-share.ts:127-135` | `getActiveLibretaSharesAction` | **CONFIRMED safe** | `requirePetAccess` + owner-only | — |
| **INFO** | `app/org/[orgToken]/page.tsx:49-230` | Org dashboard reads | **CONFIRMED safe** | `requireOrgAccessByToken(orgToken)` before `fetchOrgDashboardMetrics(organization.id)` | — |
| **INFO** | `app/actions/omnibox-search.ts:25-28` | Org-scoped search | **CONFIRMED safe** | `requireOrgAccessByToken(orgToken)` | — |

**READ-side org isolation:** Org portal pages consistently resolve token → org via `requireOrgAccessByToken` before querying by `organization.id`. Library functions like `fetchOrgDashboardMetrics(organizationId)` (`lib/analytics/org-dashboard.ts:367-375`) are **not** self-guarding — safe only because every production caller auth-wraps first.

---

## A4. k-anonymity (k=5)

| Severity | file:line | Finding | Status | Notes | Fix direction |
|---|---|---|---|---|---|
| **MEDIUM** | `lib/analytics/govt-dashboards.ts:754-779` | Open-case choropleth per-locality counts unsuppressed | **CONFIRMED** | Govt-authorized; still exact counts for sparse barrios | Apply `suppressSmallCells` if policy treats govt maps like analyst tier |
| **MEDIUM** | `lib/analytics/surveillance-metrics.ts:547-553` | `fetchReportableIncidence` suppresses **by-disease** cells, headline totals unsuppressed | **CONFIRMED by design** | Comment `:476-479`; test `:502-521` | Document; add locality dimension only with suppression |
| **INFO** | `lib/metrics/population-control.ts:143-144` | Province-level sterilization choropleth explicitly **no** k-anon | **CONFIRMED intentional** | Province denominators assumed large | — |
| **INFO** | `lib/infra/outreach-pipelines.ts:127-189` | Overdue-rabies pipeline returns **named pets** (PII) | **CONFIRMED intentional** | Comment `:14`; caller must audit via `logOutreachPiiQuery` | Keep govt-gated at action layer |
| **INFO** | Multiple | C1, B8, census, trends use `suppressSmallCells` / `suppressSmallBuckets` | **CONFIRMED safe** | grep `suppressSmallCells|suppressedMetric` in `lib/**` | — |

---

## A5. RLS as PostgREST backstop

| Severity | file:line | Finding | Status | Notes | Fix direction |
|---|---|---|---|---|---|
| **HIGH (staging)** | `db/migrations/0086_track_rls_in_migrations.sql:447-454` | Pre-0099 policy: welfare attachments SELECT for **anon** if parent report exists — no reporter check | **CONFIRMED in 0086** | Superseded by `db/migrations/0099_welfare_attachments_rls_scope.sql:38-64` at HEAD when applied | Verify staging has ≥0099 applied |
| **HIGH (staging)** | `db/migrations/0113_advisor_security_errors.sql:48-51` | `rate_limit_buckets`, `_dim_migrations`, `govt_business_rules`, `jurisdictions_census` RLS enabled deny-all | **CONFIRMED in source** | `__tests__/rls/coverage.test.ts:89-92` lists them in `RLS_REQUIRED` | Apply 0113 to staging/prod |
| **INFO** | `__tests__/rls/coverage.test.ts:32-93` | 50+ PII/tenant tables required to have RLS ON | **CONFIRMED** | CI tripwire | Keep updated |
| **INFO** | `db/cases_rls.sql:29-66` | `can_read_case` — admin universal; govt matched on `govt_assignments` province+locality | **CONFIRMED safe** | Used by cases + pet_events policies | — |
| **INFO** | `db/migrations/0115_pet_events_hide_welfare_from_subject.sql:67-88` | Welfare-bridge events hidden from subject owner via `is_hidden_from_subject_case` SECURITY DEFINER | **CONFIRMED safe** | Fixes PostgREST leak parallel to app filter | Apply 0115 |
| **LOW** | `db/organizations_rls.sql:24-28` | Verified orgs readable by **anon** | **CONFIRMED intentional** | Public org profiles / adoption listings | — |
| **INFO** | `db/index.ts:51` | Drizzle uses `DATABASE_URL` (BYPASSRLS) | **CONFIRMED** | App-layer auth is primary gate | — |

---

# Part B — Anon / PostgREST attack surface

| Severity | file:line | Finding | Status | Why it leaks / why safe | Fix direction |
|---|---|---|---|---|---|
| **HIGH (staging if unapplied)** | `db/migrations/0059_subject_rights_rpcs.sql:44-46` + `db/migrations/0114_advisor_security_warns.sql:47-48` | `export_subject_data` / `erase_subject_data` are SECURITY DEFINER; Supabase init-grants `anon` EXECUTE; **0114 REVOKEs anon** | **CONFIRMED safe at HEAD source** | Self-guard: `auth.uid() IS NULL → forbidden` (`0059:44-46`) — not exploitable by anon even pre-0114, but RPC surface should be closed | Apply **0114**; verify `\df+` grants in staging |
| **HIGH (staging if unapplied)** | `db/migrations/0113_advisor_security_errors.sql:48-51` | Four public tables RLS **disabled** in 0086 PART 7 | **CONFIRMED hole pre-0113** | Anon key → `SELECT *` on business rules, rate limits, census | Apply **0113** before handing keys |
| **MEDIUM** | `db/migrations/0099_welfare_attachments_rls_scope.sql` vs `0086:447-454` | Attachment rows leaked to anon knowing `welfare_report_id` | **CONFIRMED pre-0099** | 0086 policy checks parent EXISTS only | Ensure 0099 applied everywhere |
| **MEDIUM** | `db/cases_rls.sql:29-34` + no `REVOKE` in repo | `can_read_case(uuid,uuid)` SECURITY DEFINER likely callable via `/rpc/` | **SUSPECTED** | Returns boolean — case existence / access oracle if anon can EXECUTE | `REVOKE EXECUTE FROM anon, PUBLIC`; grant only `authenticated` if needed |
| **MEDIUM** | `db/storage.sql:17-21` | `pet-photos` bucket **public** SELECT on all objects | **CONFIRMED** | By design for Tier-0 credential URLs (`lib/infra/storage.ts:17`) | **SUSPECTED:** anon LIST may enumerate objects if Storage API lists bucket — restrict listing; keep object GET by path |
| **LOW** | `db/storage.sql:59-63` | `event-attachments` SELECT for any **authenticated** user | **CONFIRMED** | Discovery gated by app; signed URLs needed for read | Accept for v1 or add owner-scoped policy |
| **INFO** | `db/welfare_rls.sql:13-17` | Anon can INSERT welfare reports | **CONFIRMED intentional** | Public denuncia flow | Rate-limit + moderation |
| **INFO** | `db/triggers.sql:30` | `handle_new_user` SECURITY DEFINER trigger | **CONFIRMED safe** | Trigger-only, not PostgREST RPC | — |
| **INFO** | `app/actions/scans.ts:26-27` | `logScanAction` — no auth required | **CONFIRMED intentional** | `@no-auth-required`; use-case validates lost-pet + coords (`scans.ts:19-25`) | — |

**Migration state at HEAD (source):** 0113 closes RLS-disabled tables; 0114 revokes anon on subject-rights RPCs; 0115 hardens welfare-bridge pet_events policy. Staging “pre-0113/0114” is a **real** delta until migrations run.

---

# Top 5 must-fix before handing keys to a government operator

1. **Close the server-action impersonation surface** — ~39 `*ForUser/*ForAuthority/*ForOrg` exports remain in `app/actions/**` (e.g. `profile.ts:38-43`, `admin-decisions.ts:33`, `admin-institutional.ts:37`). Any client can invoke them with a guessed institutional UUID; RLS does not backstop Drizzle. Extend the authz regression test beyond the current 8-file allowlist.

2. **Apply migrations 0113 + 0114 (+ 0115) to staging/prod** — PostgREST anon could read `govt_business_rules`, rate-limit state, and census tables pre-0113; 0114 removes defense-in-depth anon EXECUTE on subject-rights RPCs. Evidence: `db/migrations/0113_advisor_security_errors.sql`, `0114_advisor_security_warns.sql`.

3. **Fix payload-vs-pets jurisdiction drift on PII-returning govt queries** — `fetchSurveillanceSignals` and `fetchEventLedger` must not return pet identifiers scoped only by event payload (`govt-dashboards.ts:112-149`, `event-ledger.ts:119-174`). This is the operational scope bug class that looks like the live `fetchReportableIncidence` investigation but affects multiple siblings.

4. **Verify welfare attachment RLS is at ≥0099 everywhere** — 0086 allowed anon/authenticated SELECT on attachments knowing report UUID (`0086:447-454`); 0099 scopes to reporter/admin (`0099:38-64`). Stale DBs leak denuncia attachments over PostgREST.

5. **Storage enumeration review for `pet-photos`** — public SELECT is intentional for credential photos (`storage.sql:17-21`), but confirm anon cannot **list** bucket contents; if LIST works, pet photos are enumerable without DIM tokens.

---

## What is actually in good shape (don’t inflate)

- **`fetchReportableIncidence` at HEAD** uses `JOIN pets` + `petsScopeClause` with k-anon on disease cells; scope integration test is explicit (`surveillance-compliance.test.ts:524-543`). The amendment overlay from `9f596832` is a **sibling class** (rabies KPIs / trends / panorama), not the same code path.
- **`amendedPayloadText`** uses correlated lookup by event id — it does **not** add unscoped `event_amended` rows to aggregates.
- **Govt welfare detail** enforces jurisdiction before PII render (`app/gob/maltrato/[id]/page.tsx:106-114`).
- **RLS coverage CI** and **0113 table list** are aligned (`coverage.test.ts:89-92`).
- **Subject-rights RPCs** fail closed on `auth.uid()` even before 0114 (`0059:44-46`).
- **Org portal reads** consistently use `requireOrgAccessByToken` at the page/action edge.

---

## Recommended verification commands (for Ignacio / CI)

```bash
# Amendment / aggregate siblings
rg "amendedPayloadText|petEventsScopeClause|petsScopeClause" lib/analytics lib/metrics src/modules/panorama

# Bare server-action exports
rg "export async function.*For(User|Authority|Org)" app/actions

# SECURITY DEFINER + grants
rg "SECURITY DEFINER|GRANT EXECUTE|REVOKE EXECUTE" db/

# RLS coverage (needs local Postgres)
pnpm test __tests__/rls/coverage.test.ts
```
