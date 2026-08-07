# Deep review — test coverage & CI-gate gaps (risk-weighted)

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `25dc9bd5` |
| **Canonical checkout** | `C:/dev/dim` |

---

## Test infrastructure inventory

| Asset | Count / detail |
|---|---|
| **Test files** (`__tests__` + `e2e`) | **362** (`rg --files`) |
| **Cron routes** | **21** under `app/api/cron/` |
| **Cron-specific test files** | **17** (`__tests__/cron-*.test.ts`) |

### CI gates (`.github/workflows/ci.yml`)

| Job | What runs |
|---|---|
| `check` | `pnpm lint`, `pnpm lint:tokens`, `pnpm typecheck`, `pnpm build` |
| `dep-audit` | `pnpm audit --audit-level=high` |
| `migration-presence` | PR-only: `db/schema.ts` change ⇒ new `db/migrations/*.sql` |
| `db-check` | `pnpm db:push` ×2 (schema ↔ migrations drift) |
| `test` | Supabase stack + `pnpm db:bootstrap` + **`pnpm test:coverage`** |
| `e2e` | Supabase + bootstrap + build + **`pnpm e2e`** (16 spec files) |

### Local `pnpm verify` (Definition of Done) vs CI

`verify` also runs: `lint:ui`, **`lint:authz`**, `lint:deps`, **`lint:rls`**, `lint:actions`, `lint:lib-root`, `lint:mocks`, `lint:buttons`.

**Gap:** CI `check` does **not** run `lint:authz`, `lint:rls`, or the other `lint:*` scripts. No vitest test shells out to those linters either. A PR can pass CI while failing `pnpm verify`.

### E2E surface (16 files)

| Spec | Role |
|---|---|
| `auth.spec.ts` | Login → `/inicio` only |
| `cross-tenant-isolation.spec.ts` | Owner A cannot see Owner B pages |
| `owner-shell.spec.ts` | AppShell chrome + a11y on `/inicio`, `/adoptar` |
| `public-smoke.spec.ts` | Public routes, lost-credential smoke, axe on lost `/p/[token]` |
| `create-pet.spec.ts` | Pet creation |
| `demo/01–06` | Curated demo journeys (public, owner, refugio intake, vet, gob, admin) |
| `executive-smoke`, `admin-topbar`, `a11y-operator-auth`, `auth-bypass` | Operator / smoke |

---

## Guardrails that exist (credit table)

| Guardrail | File | What it protects | Depth |
|---|---|---|---|
| Impersonation export sweep | `__tests__/authz-bare-writer-exports.test.ts` + `scripts/check-authz-guards.ts:79+` | `*ForUser/*ForAuthority` must not be exported from `"use server"` | **Good** — full surface sweep + negative regex cases (`:67-82`) |
| Auth-guard linter helpers | `__tests__/check-authz-guards.test.ts` | `findOffenders`, route-guard rules | **Shallow** — inline fixtures only; **full `pnpm lint:authz` not in CI** |
| Page-level guards (mock) | `__tests__/auth-guards.test.ts` | `requireAdminOrGovtOrRedirect`, `requireOrgAccessByToken`, etc. | **Good (unit)** — redirect/notFound matrix; **no DB** |
| Append-only trigger | `__tests__/pet-events-append-only.test.ts` | `pet_events` UPDATE/DELETE blocked | **Good** — live Postgres |
| Macro projection invariants | `__tests__/macro-invariants/macro-invariants.test.ts` | Vaccine jurisdiction, transfer counts, death denominator, idempotency, enumeration oracle | **Good** — 6 locked invariants |
| Pet-cache fitness | `__tests__/pet-cache-rederivation.test.ts` | Dual-write columns match event re-derivation | **Good** — sweep + non-vacuity skew test |
| Idempotency guards | `__tests__/idempotency-guards.test.ts` | Double-submit no-ops (intake, tattoo, foster, etc.) | **Good** — representative writers |
| Event schema coverage | `__tests__/event-schemas.test.ts` | Every implemented event type has Zod schema | **Good** — `UNIMPLEMENTED` allowlist empty |
| Cron fleet parity | `__tests__/cron-registry-parity.test.ts` | 21 routes ↔ `vercel.json` ↔ `CRON_REGISTRY` ↔ telemetry | **Good (shape)** — not behavior |
| Cron auth fitness | `__tests__/cron-auth.test.ts` | Every route uses `authorizeCronRequest` | **Good** |
| RLS enabled | `__tests__/rls/coverage.test.ts` | 43+ tables have `relrowsecurity=true` | **Structural only** — not policy deny |
| RLS SELECT matrix | `__tests__/rls/matrix.test.ts:45` | Role × table PostgREST reads | **Partial** — **SELECT only**; INSERT/UPDATE/DELETE deferred |
| Cross-tenant e2e | `e2e/cross-tenant-isolation.spec.ts` | Owner A page renders for Owner B URLs | **Good (page layer)** |
| Jurisdiction drift (subset) | `__tests__/govt-dashboards.test.ts:308+`, `__tests__/govt-home-kpis.test.ts:178+` | Moved-pet exclusion + KPI amendment overlay | **Good** — but **not all analytics fetchers** |
| Compliance KPIs C1–D5 | `__tests__/compliance-enforcement.test.ts` | `fetchMicrochipPenetration`, `fetchReunificationRate`, etc. | **Good** — pinned definitions + k-anon |
| `deriveComplianceState` | `lib/projections/pet-compliance.test.ts` | Owner credential stamp logic (H1 provenance) | **Good (pure)** |
| Scan privacy | `__tests__/log-scan-location.test.ts`, `__tests__/scan-retention.test.ts` | `recordedByUserId=null`, 90d purge | **Good** |
| Lost disclosure SQL | `__tests__/pii-fixes-item27.test.ts`, `__tests__/disclosure-prefs.test.ts` | Location not fetched when flag off | **Good** |
| `/encontre` name gate | `__tests__/encontre-owner-disclosure.test.tsx` | No owner-name query when `discloseFirstNameWhenLost=false` | **Good** |
| Migration runner | `__tests__/migrate-runner.test.ts` | Forward-only runner, checksum, drift | **Good** |
| Schema drift CI | `.github/workflows/ci.yml` `db-check` | Drizzle push idempotency | **Good** |
| Skeleton / error boundaries | `__tests__/skeleton.test.tsx`, `__tests__/error-boundence-presence.test.ts` | `loading.tsx` + portal `error.tsx` | **Good (structural)** |
| Amendment overlay (pure) | `lib/infra/amendment.overlay.test.ts` | `overlayAmendments` read boundary | **Good (unit)** — wired in KPI SQL tests in `govt-home-kpis.test.ts:330+` |

---

## Risk-ranked gap table

| Severity | Area | Code | Test status | If it regressed | Recommended test |
|---|---|---|---|---|---|
| **CRITICAL** | CI ≠ DoD | `package.json:22` vs `.github/workflows/ci.yml:32-45` | **`lint:authz` / `lint:rls` absent from CI** | Unguarded action or table without RLS merges green | Add `pnpm lint:authz && pnpm lint:rls` (or full `verify` subset) to `check` job |
| **CRITICAL** | Authz — export shape only in CI | `scripts/check-authz-guards.ts` (full linter) | **Shallow in CI** — vitest tests helpers + impersonation sweep, but **never runs `findOffenders` over live tree** | New `fooAction` ships without `requireUser` — caught only if dev runs `pnpm verify` | CI step: `pnpm lint:authz`; optional integration matrix: N representative writes denied for wrong role/org/jurisdiction |
| **CRITICAL** | Server-action rejection (integration) | `app/actions/*`, `src/modules/**/actions.ts` | **Sparse** — mostly **mock parity** (`actions-parity.test.ts` patterns) or inner-writer tests; few prove **real session + wrong tenant ⇒ error** on writes | Govt/org operator crosses boundary; data mutation at scale | 5–8 golden-path integration tests: org member A → org B pet write fails; govt outside assignment → welfare triage/export fails |
| **HIGH** | Jurisdiction drift — analytics tail | `lib/analytics/govt-dashboards.ts:2163+` (`fetchPetsForExport`, `fetchEventsForExport`, `fetchAnalyticsMetrics`, `fetchDeathCauses`, …) | Drift tests cover **surveillance/zoonosis/outbreak + home KPIs** (`govt-dashboards.test.ts:308`, `govt-home-kpis.test.ts:178`) — **export fetchers untested for moved-pet class** | Export CSV leaks pets that left jurisdiction; wrong provincial briefing | Parameterized drift fixture applied to **every** `petEventsScopeClause` consumer (grep-driven fitness) |
| **HIGH** | RLS — policies deny | `__tests__/rls/coverage.test.ts:4-14` | **Structural** — RLS enabled; `matrix.test.ts:45` **SELECT only** | PostgREST write path opens if policy regresses | Extend `OPERATIONS_UNDER_TEST` to INSERT/UPDATE/DELETE for core 9 tables; keep `pnpm rls:smoke` in CI (currently **not** gated) |
| **HIGH** | Tier-0 `/p/[token]` PII contract | `app/(public)/p/[publicToken]/page.tsx` | **Shallow** — `public-token-landing-structure.test.tsx` checks chrome/a11y landmarks; **no assertion that rendered HTML excludes phone/email/DNI/full name** | Public QR page leaks owner contact after refactor | Contract test: mock pet + flags ⇒ HTML must not contain phone/email/DNI; only allowed Tier-0 fields |
| **HIGH** | Privacy — Tier-1 lost fields | `lib/analytics/govt-dashboards.ts:264` `fetchLostPets` | **Partial** — scope tests exist; **disclosure prefs on govt lost queue** not proven end-to-end | Operator sees last-seen coords when owner opted out | Integration: pet with `discloseLastLocationWhenLost=false` ⇒ `fetchLostPets` row has null coords |
| **HIGH** | Cron behavior — silent fleet gaps | `app/api/cron/evaluate-alerts/route.ts`, `cron-health/route.ts` | **Absent** — no `evaluate-alerts` test; `cron-health` untested; registry parity only | Alert evaluation stops; ops blind at province scale | Route tests for `evaluate-alerts` + `cron-health` (auth + one happy-path side effect) |
| **HIGH** | Cron — mocked vs live | `__tests__/cron-reconcile-pet-status-route.test.ts` | **Shallow** — heavy mocking; `scan-retention.test.ts` / `vaccine-due-scan.test.ts` hit **real DB** | Reconcile drift detection logic wrong but mocks green | At least one **integration** reconcile run against fixture drift (like scan-retention pattern) |
| **HIGH** | Event-paired projections (systematic) | Writers across `app/actions/`, `src/modules/` | **Partial** — `pet-cache-rederivation` sweeps `DIM-%` seed pets; **no compile-time/fitness rule that every projection write emits an event** | Cache column updates without audit event | Fitness: grep dual-writers vs event emitters; extend sweep beyond `DIM-%` tokens or tag test pets |
| **MEDIUM** | Amendment overlay on all clinical reads | `lib/infra/amendment.ts` | **Good (pure)** + KPI SQL (`govt-home-kpis.test.ts`); **libreta/export paths not exhaustively listed** | Owner/vet sees stale clinical data after amendment | One integration per surface: libreta timeline, travel export, govt export |
| **MEDIUM** | Compliance metrics — census funnel | `lib/analytics/govt-home-kpis.ts` | **Good** on rabies/bites/sterilization/amendment; historical census bug class | Wrong denominator in govt home panel | Keep fixtures; add regression case for the exact census-funnel bug if documented |
| **MEDIUM** | E2E — lost→found reunification | `setPetFound` flow | **Unit** (`set-pet-found-use-case.test.ts`); **no e2e** | Status flip breaks in production UI | E2e: mark lost → public page → mark found → status active |
| **MEDIUM** | E2E — finder QR scan | `src/modules/pets/application/scans/log-scan.ts` | **Unit** (`log-scan-location.test.ts`); **no browser e2e** | Scan event not written; lost-location consent broken | E2e: visit `/p/[lostToken]` as anon, trigger scan, assert event row |
| **MEDIUM** | E2E — logout / deactivated institutional | `app/actions/auth.ts` | **Unit** (`auth-actions.test.ts:174` deactivated sign-out); **no e2e logout or deactivated loop** | Admin lockout / redirect loop returns | E2e: login deactivated admin ⇒ error not loop; logout clears session |
| **MEDIUM** | E2E — org intake→custody | `src/modules/pets/application/intake/create-intake.ts` | **Integration** (`idempotency-guards.test.ts`); **e2e only in `demo/03-refugio`** (demo data, not CI contract) | Intake breaks custody + events chain | Dedicated CI e2e: intake → `shelter_custody` ownership + event |
| **MEDIUM** | New analytics (Task #44) | `lib/analytics/policy-outcome.ts`, `territorial-data-quality.ts`, `territorial-index.ts` | **Unit only** (`*.test.ts` — pure helpers, mapping completeness) | Admin inteligencia page shows wrong scores with real DB noise | Integration fixtures for `fetchPolicyOutcomes` / quality aggregation (govt-scoped) |
| **MEDIUM** | `/admin/inteligencia` | `app/admin/inteligencia/page.tsx` | **None** (only nav preset tests mention route) | New govt-facing surface ships without authz/a11y gate | Structure test + guard assertion (`requireAdminOrRedirect`) |
| **LOW** | Landing / leyes / panorama / viaje | Marathon features | **Structure/unit good** — `landing-structure.test.tsx`, `leyes-page-structure.test.tsx`, `PanoramaConsole.test.tsx`, `TravelSemaforo.test.tsx` | Copy/layout regressions | Already reasonable; add one smoke e2e for `/` and `/leyes` if marketing is launch-critical |
| **LOW** | Native mobile | PWA install path | **Touch targets only** (`a11y-touch-targets.test.tsx`) | Mobile UX regressions | Optional visual/smoke; low blast radius for govt tenant |
| **LOW** | Coverage % ratchets | `vitest.config.ts:41-48` | Floors **low** on `app/actions` (30% branches), `app/api` (8%) | Regressions in rarely-hit branches | Raise floors incrementally; prioritize auth + cron + analytics globs |

---

## Area-by-area audit (requested sections)

### 1. Authorization

| Layer | Tested? | Notes |
|---|---|---|
| 39-export impersonation guard | **Good** | `authz-bare-writer-exports.test.ts` sweeps all `"use server"` files; negative cases at `:67-82` |
| `lint:authz` full tree | **Not in CI** | Helpers tested; live `findOffenders` sweep is manual via `pnpm verify` |
| `requireUser` / `requireOrgAccess` / `requireCapability` on **writes** | **Shallow → partial** | `auth-guards.test.ts` — mocks only. Some integration (`decomiso-execute-action.test.ts:584` out-of-jurisdiction, `access-control-deactivated-proposals.test.ts`). Adoption/welfare/transfers use **mocked** `requireCapability` parity — proves call happens, not DB rejection |
| Out-of-org caller on representative actions | **Absent as systematic suite** | No matrix like RLS for server actions |

### 2. Multi-tenant / jurisdiction scope

| Layer | Tested? | Notes |
|---|---|---|
| Drift (moved pet) | **Good but narrow** | 3 surveillance fetchers + home KPIs (`govt-dashboards.test.ts:308`, `govt-home-kpis.test.ts:178`) |
| `surveillance-metrics` | **Good scope, no drift** | `surveillance-compliance.test.ts` — locality scope; **no moved-pet payload vs `pets.jurisdiction_*` case** |
| `fetchLostPets`, `fetchAnalyticsMetrics`, exports | **Scope yes, drift no** | Govt locality filtering tested; drift class not extended |
| RLS coverage | **Enabled only** | `rls/coverage.test.ts` — catalog check, not deny proof |
| RLS matrix | **SELECT only** | `matrix.test.ts:45` — INSERT/UPDATE/DELETE explicitly deferred |

### 3. Event-sourcing invariants

| Invariant | Status |
|---|---|
| Append-only | **Good** — `pet-events-append-only.test.ts` |
| Idempotency | **Good** — `idempotency-guards.test.ts` + macro INV-5 |
| Macro invariants | **Good** — 6 invariants |
| Pet-cache re-derivation | **Good** — fitness + non-vacuity |
| Every projection write event-paired | **Gap** — fitness sweep is best-effort on `DIM-%` pets, not exhaustive |
| Amendment on clinical boundaries | **Partial** — pure overlay + KPI SQL; not every read path |

### 4. Privacy tiers

| Contract | Status |
|---|---|
| Tier-0 zero owner PII on `/p/[token]` | **Weak** — structure/a11y tests; **no field-level PII negative on main credential page** |
| Disclosure prefs gate lost SQL | **Good** — `pii-fixes-item27.test.ts`, `disclosure-prefs.test.ts` |
| Scan `recordedByUserId = null` | **Good** — `log-scan-location.test.ts` |
| `/encontre` name disclosure | **Good** — `encontre-owner-disclosure.test.tsx` |
| Future PII leak catcher | **Partial** — `welfare-org-pii-fitness.test.ts` for welfare exports only |

### 5. Crons (21 routes)

| Class | Status |
|---|---|
| Registry / telemetry / auth | **Good** — parity + `cron-auth.test.ts` |
| **Behavior** (throttle, purge, reconcile, dedupe) | **Mixed** — `vaccine-due-scan.test.ts` + `scan-retention.test.ts` = **good DB integration**; many route tests **mock DB** (`cron-reconcile-pet-status-route.test.ts`); **`evaluate-alerts` untested** |
| Notification dedupe (Task #8 C3) | Covered in `vaccine-due-scan.test.ts` / notifications tests |

### 6. Money/compliance-critical projections

| KPI / projection | Status |
|---|---|
| `deriveComplianceState` | **Good** — extensive pure tests + `CredentialFace` H1 |
| C1–D5 compliance metrics | **Good** — `compliance-enforcement.test.ts` pins definitions |
| Govt home KPIs + amendment | **Good** — `govt-home-kpis.test.ts` |
| Census funnel (historical bug) | **Tested** via dedicated fixtures in govt-home-kpis |
| One-truth-per-KPI fleet-wide | **Not systematic** — strong on documented metrics, not grep-closed |

### 7. Migrations

| Gate | Status |
|---|---|
| PR migration presence | **Good** |
| Schema ↔ migrations drift (`db-check`) | **Good** |
| Forward-only runner | **Good** — `migrate-runner.test.ts` |
| Apply-all-migrations smoke on clean DB | **Partial** — `db:push` in CI, not full `db:migrate` replay on empty DB in every run |

### 8. E2E critical flows

| Flow | E2E? |
|---|---|
| Owner shell / login | **Partial** — login yes; logout no |
| Public smoke / lost render | **Yes** — `public-smoke.spec.ts` |
| Cross-tenant pages | **Yes** |
| Demo owner/refugio/gob/admin | **Yes** (demo/*, long, curated) |
| **Lost → found reunification** | **No** |
| **Org intake → custody** (CI contract) | **No** (demo only) |
| **Finder QR-scan path** | **No** |
| **Login/logout + deactivated loop** | **No e2e** (unit fix in `auth-actions.test.ts:174`) |

### 9. Marathon work (landing, /leyes, viaje, panorama, native-mobile)

| Feature | Tests |
|---|---|
| Landing `/` | `landing-structure.test.tsx` — PO-locked copy/structure (**good shallow**) |
| `/leyes` | `leyes-page-structure.test.tsx`, `legal-knowledge-base.test.ts` |
| Viaje / movilidad | `movement-writer.test.ts`, `travel-export.test.ts`, `TravelSemaforo.test.tsx`, `travel-compliance.test.ts` |
| Panorama redesign | Strong unit/module tests (`PanoramaConsole.test.tsx`, `get-panorama-kpis.test.ts`, choropleth tests) |
| Native mobile | **Minimal** — touch targets in `a11y-touch-targets.test.tsx` |
| `/admin/inteligencia` | **No dedicated tests** |

---

## TOP 5 gaps to close before a government tenant relies on this

| # | Gap | Cost | Why first |
|---|---|---|---|
| **1** | **Align CI with `pnpm verify` auth/RLS gates** (`lint:authz`, `lint:rls` at minimum) | **Cheap (CI config)** | Highest leverage — closes the gap between “green CI” and “green DoD”; catches unguarded actions and RLS omissions before merge |
| **2** | **Tier-0 `/p/[token]` PII contract test** (field-level negative on rendered credential) | **Cheap (unit/structure)** | Worst public blast radius — one refactor leaks phone/email to anyone with QR |
| **3** | **Jurisdiction-drift fitness across all govt analytics fetchers** (extend `govt-dashboards.test.ts:308` pattern via grep) | **Cheap–medium (unit/integration)** | Real bug class fixed in 3 fetchers; tail (exports, analytics metrics) still exposed |
| **4** | **Server-action auth integration matrix** (5–8 real-session reject cases: wrong org, wrong govt locality, deactivated institutional) | **Medium (integration)** | Export-shape lint is necessary not sufficient; govt operators need proof mutations fail closed |
| **5** | **E2e: lost→found + anon QR scan + logout/deactivated** | **Structural (e2e)** | Only layer that catches full-stack regressions in the citizen crisis path and admin lockout |

---

## Overall test maturity (honest)

**Strong for a pre-government-pilot codebase** — not a coverage-percentage story, but a deliberate guardrail stack: macro invariants, pet-cache fitness, cron parity, event-schema lock, compliance KPI pinning, cross-tenant e2e, and recent scope-security drift tests show real incident-driven discipline.

**Weakest under blast-radius weight:**

1. **CI does not enforce the same gates as `pnpm verify`** — the biggest process gap.
2. **Authorization proof stops at lint + mocks** — few integration tests that a wrong tenant cannot **mutate** data.
3. **Privacy testing is strong on SQL predicates and scan retention, weak on Tier-0 render contract** for the main credential page.
4. **Analytics jurisdiction safety is patched where bugs were found, not fleet-closed.**
5. **E2e covers smoke and demos, not the reunification / scan / institutional-auth crisis paths.**

**Verdict:** Mature enough for continued internal/demo use; **not yet “government tenant default”** without closing the TOP 5 — especially CI↔verify parity and Tier-0 + jurisdiction fleet tests. Most fixes are **cheap unit/integration**; e2e expansion is the main **structural** investment.
