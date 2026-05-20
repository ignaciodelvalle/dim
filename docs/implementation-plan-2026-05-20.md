# DIM — Implementation plan: specs, tests, security

**Date:** 2026-05-20
**Author:** Claude (Cowork session)
**Verified against:** `develop`, working tree at `C:\dev\dim`
**Supersedes (in part):** `docs/action-plan-2026-05-20.md` and `docs/unapplied-specs-audit-2026-05-20.md` — those framed the work before any of it shipped. This doc reflects what's actually left after verification.

---

## How to read this doc

Each item below has the same five fields:

- **Context** — why this matters, in one paragraph
- **Files** — concrete paths to touch
- **Acceptance** — what "done" means, testable
- **Tests** — what to add or run
- **Effort** — rough wall-clock estimate

Items are grouped by section. Sections are ordered by urgency × leverage — finish a section before starting the next one. Within a section, items are independent and can be parallelized across PRs.

---

## Status snapshot

Verified items from the original action plan that are **already done** (no further work needed):

| Item | Where it shipped | Verified by |
|---|---|---|
| Phase 0 — working-tree recovery | Working tree lives at `C:\dev\dim`; git status clean | `git status` clean, 39 migrations present |
| Phase 1.1 — CONTRIBUTING.md | `CONTRIBUTING.md` at repo root | File reads correctly, covers quickstart, branching, commits |
| Phase 1.2 — PR template | `.github/PULL_REQUEST_TEMPLATE.md` | File present |
| Phase 1.3 — issue templates | `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml` | Both present |
| Phase 1.4 — CODEOWNERS | `CODEOWNERS` at repo root | Catch-all + DB/admin/superpowers routing in place |
| Phase 1.5 — CI db-check | `.github/workflows/ci.yml` job `db-check` | Spins up Postgres, runs `db:push`, asserts zero drift |
| Phase 2.1 — gate stub claim | `app/actions/claim.ts` line 33 | `const STUB_CLAIM_ENABLED: boolean = false` + early return |
| Phase 2.2 — notifications outside tx | `cross-org-transfer.ts`, `foster-proposals.ts`, etc. | `pendingNotifications: PendingNotification[]` pattern; insert after `db.transaction` commits |
| Phase 2.3 — libreta-share revocation | `app/actions/libreta-share.ts` lines 87-102 | Only creator + `role='admin'` can revoke; comment cites review §2.2 |
| Phase 2.4 — sanitize `next` redirect | `lib/dni-next.ts` | `URL`-based parsing against `https://local.invalid`; rejects `%2F`/`%5C`-encoded bypasses |
| Phase 2.5 — cross-org-transfer sender re-derivation | `cross-org-transfer.ts` lines 326-343 | `senderOrgId = caseRow.openedByOrganizationId`; payload cross-checked, integrity error if drift |
| Phase 2.6a — public-token modulo bias | `lib/publicToken.ts` lines 26-50 | `REJECTION_THRESHOLD = 248`; rejection sampling implemented |
| Phase 3.1 — `ON DELETE` clauses on FKs | `db/migrations/0038_fk_on_delete_and_indexes.sql` §3.1 | Migration applied; idempotent |
| Phase 3.2 — FK column indexes | `db/migrations/0038_fk_on_delete_and_indexes.sql` §3.2 | Same migration; `CREATE INDEX IF NOT EXISTS` for the listed columns |
| Phase 3.4 — audit-log the event-mutation escape hatch | `db/triggers.sql` (PR #56) | Append-only trigger writes `pet_events_mutation_override` audit rows when GUC + actor uuid are set |
| Phase 3.5 — atomic projection rebuild | `scripts/rebuild-projections.ts` lines 165-173 | `pg_advisory_xact_lock(hashtext(pet_id))` inside `db.transaction` |
| Phase 4.1 — server-action auth-coverage test | `__tests__/server-actions-auth-coverage.test.ts` | File exists (206 lines) |
| Phase 4.3 — event-design checklist | `docs/event-design-checklist.md` | File exists |
| Phase 4.4 — event payload version field | `lib/event-schemas.ts` line 33 + `db/migrations/0039_backfill_payload_version.sql` | Field is named `payload_version: z.literal(1).default(1)` (not `schemaVersion`); backfill done with audit trail via #56's override mechanism |
| Rabies cron schedule | `vercel.json` line 21-23 | `close-rabies-observations` every 12h |
| Foster `db/foster_rls.sql` written | `db/foster_rls.sql` | File present (still pending: apply in Supabase Studio — manual ops step) |

That leaves the remaining work below. Headline: **the gap is much narrower than `unapplied-specs-audit-2026-05-20.md` suggested** — it predates a lot of the work that's now in `develop`. The two big things still genuinely pending are (a) test-gating in CI and (b) the cases system + adoption handshake. Everything else is a focused sub-day PR.

---

## Section 1 — Test infrastructure (do this first, blocks everything else)

The reason this section comes before security or features: without test-gating in CI, every test we write or fix is theater. A PR that breaks tests merges silently today.

### 1.1 Add `pnpm test` to CI

**Context.** `.github/workflows/ci.yml` currently runs `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `db-check`, but **not `pnpm test`**. The 88 test files in `__tests__/` are not enforced on PR. This is the single largest hole in the testing doctrine and corresponds to `docs/testing/PLAN.md` Fase 0 / decision D13.

**Files.**
- `.github/workflows/ci.yml` — add a `test` job (separate from `check`, runs in parallel)
- Reuse the same Postgres service definition that `db-check` already has
- Set the same env vars (`DATABASE_URL`, dummy Supabase keys)
- Step order: checkout → pnpm install → `pnpm db:push` → `pnpm test`

**Acceptance.**
- A PR that introduces a failing test cannot merge (CI shows the test job red).
- Job completes in under 8 minutes on a clean cache (per D13).
- Branch protection on `main` and `develop` lists the new `test` check as required (manual step in GitHub UI after the workflow merges).

**Tests.** This phase *is* the test infrastructure — nothing new to add here. Validate by deliberately breaking an existing test on a throwaway branch and confirming CI catches it.

**Effort.** 3-4 hours (mostly tuning the Postgres service + waiting for runs).

---

### 1.2 Coverage targets in `vitest.config.ts`

**Context.** Testing doctrine D2 (`docs/testing/PLAN.md`) sets branch-coverage minimums per folder, with `lib/business-rules-*` at 90% and `app/actions/**` at 75% per file. Current `vitest.config.ts` declares no coverage config at all, so the doctrine isn't enforced.

**Files.**
- `vitest.config.ts` — add `coverage` block using `@vitest/coverage-v8`
- `package.json` — add `@vitest/coverage-v8` as devDependency (probably already on lockfile via `vitest`; verify)
- `.github/workflows/ci.yml` — the new `test` job from §1.1 runs `pnpm test --coverage` and uses the thresholds defined in config to fail

**Acceptance.**
- `pnpm test --coverage` outputs a branches report grouped by folder.
- Running with a manually deleted test causes `pnpm test --coverage` to fail with a threshold error (proves enforcement).
- Thresholds match D2 verbatim — copy from the table in `PLAN.md`, do not invent new numbers.

**Tests.** N/A (this is test infrastructure). Manual smoke: drop one branch from `lib/business-rules-validators.ts`, run coverage, watch it complain.

**Effort.** ~1 hour.

---

### 1.3 RLS smoke widening + matrix testing

**Context.** `scripts/rls-smoke.ts` exists and is a spot-check, not a matrix. Testing doctrine D7 calls for a YAML-versioned matrix of `(role × table × operation) → expected`, checked against Postgres in CI. The action plan §4.2 also lists this.

**Files.**
- `db/rls-matrix.yaml` — new file, one entry per (role, table, op) tuple. Cover at minimum: `anon`, `owner`, `vet`, `govt`, `admin`, `wrong_org_member` across `pets`, `pet_events`, `ownerships`, `welfare_reports`, `cases`, `foster_volunteers`, `foster_proposals`, `notifications`, `audit_log`, `appointments`, `service_offerings`. Operations: `select`, `insert`, `update`, `delete`.
- `__tests__/rls/matrix.test.ts` — load the YAML, iterate, assert against Postgres via PostgREST with one JWT per role.
- `scripts/rls-smoke.ts` — keep, but mark in its header that the matrix is now the authoritative test; smoke remains a fast local sanity check.

**Acceptance.**
- Adding a permissive RLS policy (e.g., `USING (true)` on a sensitive table) on a throwaway branch causes the matrix test to fail.
- Changing a row in `rls-matrix.yaml` to expect a permission Postgres doesn't grant also fails — the test catches drift in *either direction*.
- New CI step runs the matrix test against a freshly reset DB. This is enforced by CODEOWNERS: changes to `db/*_rls.sql` require both the test and the matrix to update in the same PR.

**Tests.** This *is* the test. Add one unit test for the loader so a malformed YAML fails clearly instead of silently passing.

**Effort.** 1 day for the matrix population + 4 hours for the test harness + CI wiring.

---

## Section 2 — Remaining security & hardening

Everything from `docs/action-plan-2026-05-20.md` Phase 2 except the items already verified done.

### 2.1 Public-token uniqueness retry wrapper

**Context.** `lib/publicToken.ts` fixed the modulo-bias (rejection sampling done), but there's no `generateUniqueToken` wrapper. At low volume this is fine — 31⁸ ≈ 8.5e11 — but the libreta-share tokens protect medical records and the spec note says "add a uniqueness check + retry per table when adoption justifies it." A clean wrapper is cheap insurance.

**Files.**
- `lib/publicToken.ts` — add `generateUniqueToken<TTable>(table, column, generator, maxRetries = 5)` that catches Postgres unique-constraint errors (SQLSTATE `23505`) on insert and re-rolls. Return the token actually used; throw if all retries exhausted (extremely unlikely — log loudly).
- Refactor the ~5 call sites currently doing `insert({ publicToken: generatePublicToken(), ... })` to go through the wrapper. Greppable: `generatePublicToken|generateLibretaShareToken|generateApprovalRequestToken|generateOfferingToken|generateAppointmentToken`.

**Acceptance.**
- A mocked DB that throws `23505` once on insert and succeeds on retry returns a token (no error to the caller).
- A mocked DB that throws `23505` five times in a row throws a clear "exhausted token-generation retries" error.
- Existing tests still pass — wrapper is a no-op at low volume.

**Tests.**
- `__tests__/publicToken-retry.test.ts` — three cases: succeeds first try, succeeds after one retry, throws after 5 failures. Mock the table object's `insert` chain to throw a fake `PostgresError` with `code: '23505'`.
- Adjust one existing call-site test (e.g., libreta-share) to confirm it still works end-to-end through the wrapper.

**Effort.** 2-3 hours.

---

### 2.2 Cross-org-transfer receiver — canonical column

**Context.** The sender is now re-derived from `cases.openedByOrganizationId` (action plan §2.5 done). The **receiver** is still trusted from `proposalPayload.to_organization_id` — the file's own comment at line 344 admits it: "Receiver is still derived from the payload (no canonical column on `cases` yet — tracked as a follow-up). The single-proposal guard above makes this safe as long as the data-integrity invariant holds." The guard is good defense but the canonical column is the proper fix.

**Files.**
- `db/schema.ts` — add `receiverOrganizationId: uuid(...).references(() => organizations.id, { onDelete: "set null" })` to the `cases` table.
- `db/migrations/0040_cases_receiver_organization.sql` — new migration:
  - `ALTER TABLE cases ADD COLUMN receiver_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;`
  - Backfill: `UPDATE cases SET receiver_organization_id = (SELECT (payload->>'to_organization_id')::uuid FROM pet_events WHERE case_id = cases.id AND event_type = 'custody_transfer_proposed' ORDER BY recorded_at DESC LIMIT 1) WHERE case_kind = 'custody_transfer_handshake';`
  - Add a partial index on the column for case_kind = 'custody_transfer_handshake' (most rows null otherwise).
- `app/actions/cross-org-transfer.ts` — populate `receiver_organization_id` at proposal time (line ~175 region, where the case is created). At accept time (line 347), check `caseRow.receiverOrganizationId !== organization.id` instead of the payload field. Keep the payload cross-check log as drift detection.

**Acceptance.**
- A new transfer proposal writes `receiver_organization_id` on `cases`.
- Accept logic refuses if the case's `receiver_organization_id` doesn't match the calling org, regardless of payload contents.
- Forging the payload via `// @ts-expect-error` in a test does not let the acceptance through.
- Migration `0040` runs clean on `pnpm db:reset`; backfill produces non-null values for every existing open custody-transfer case (verify with a `SELECT COUNT(*)` in the migration's down-script comments).

**Tests.**
- Extend `__tests__/cross-org-transfer.test.ts`: case where the payload's `to_organization_id` is set to org B but `cases.receiverOrganizationId` is org C, then call accept as org B — must return "no fue dirigida a tu organización."
- Backfill smoke test: write a fixture with a proposed transfer, run the migration, assert the column is populated.

**Effort.** ½ day (schema + backfill + 2 tests).

---

### 2.3 Apply `db/foster_rls.sql` in Supabase Studio (ops, not code)

**Context.** The foster volunteers pool ships with `db/foster_rls.sql` defining policies, but the file is **not auto-applied** by `db:push` because RLS lives outside Drizzle's purview. Listed as follow-up in `docs/superpowers/README.md` row "foster-volunteers-pool".

**Files.** None to edit. This is a manual step.

**Acceptance.**
- Open Supabase Studio → SQL editor → paste `db/foster_rls.sql` → run.
- Then run `__tests__/rls-foster.test.ts` (if it exists; if not, add to the matrix from §1.3): cross-org reads on `foster_proposals` and `foster_volunteers` are denied as expected.

**Tests.** Covered by §1.3 once the matrix lands. Until then, manual verification via `pnpm rls:smoke -- foster_proposals foster_volunteers`.

**Effort.** 15 minutes.

---

## Section 3 — DB schema hygiene (mostly done; one finishing touch)

Phase 3.1 (`ON DELETE` clauses), 3.2 (FK indexes), 3.4 (event-mutation audit), and 3.5 (atomic projection rebuild) are **already done** — see the status snapshot at the top. The only item left in this section is the Drizzle ↔ migration CHECK-constraint mirror.

### 3.1 Mirror migration CHECK constraints into Drizzle

**Context.** Migration `0023_pets_adoption_eligibility.sql` adds four CHECK constraints. `db/schema.ts` line 539 has *one* of them mirrored (the `adoptionEligible IS NOT NULL ↔ adoptionEligibilitySetAt IS NOT NULL` invariant). The other three are still in the migration only. Reading `schema.ts` makes it look like fewer constraints exist than actually do. Review §3.3.

**Files.**
- `db/schema.ts`, table `pets` — add the remaining 3 `.check(...)` calls for: ineligible-requires-reason, "other"-eligibility-requires-notes, and the third constraint from 0023 (read the migration for the exact predicates).
- Mark `adoptionEligibilitySetAt` consistently with the constraint that requires it when `adoptionEligible IS NOT NULL` — keep it nullable in the column definition (matches existing schema; the check is the cross-column constraint).
- No new migration. `pnpm db:push --dry-run` should report zero changes after the schema edit — that's the proof the schema is now an honest mirror of the DB.

**Acceptance.**
- `pnpm db:push` after the change reports no pending changes.
- `db-check` CI green.
- Try to insert a `pets` row violating one of the constraints from a test — fails with the same error message as before (proves the constraint is unchanged, not that we accidentally dropped it).

**Tests.** Existing `__tests__/admin-fase-0-schema.test.ts` or a new `__tests__/pets-adoption-eligibility-constraints.test.ts` — one negative case per constraint.

**Effort.** 1-2 hours.

---

## Section 4 — Convention enforcement (one verification item left)

Phase 4.3 (event-design checklist) and Phase 4.4 (event payload version — called `payload_version` in this codebase) are both **done**. Only one item still needs attention: confirming the existing auth-coverage test is enforcing as intended once test-gating ships.

### 4.1 Verify the server-action auth-coverage test is enforcing

**Context.** `__tests__/server-actions-auth-coverage.test.ts` exists, but it was created before `pnpm test` ran in CI. Once §1.1 lands, the test will actually gate PRs. Verify the test is enforcing what the action plan §4.1 prescribed: every exported async in `app/actions/` calls a guard (`requireUser`, `requireCapability`, `requireOrgAccess`, `requireAlivePetAccess`, `requirePetAccess`, `requireVetProviderOrRedirect`) **or** carries a `// @no-auth-required` comment.

**Files.**
- Read `__tests__/server-actions-auth-coverage.test.ts` end-to-end (this is the deliverable of this item — verify, don't rewrite blindly).
- Confirm it parses the AST (or robust regex) of every file under `app/actions/`.
- Confirm the opt-out comment is recognized.
- If gaps exist, file follow-up sub-PRs by area.

**Acceptance.**
- Adding a throwaway `app/actions/__test_audit.ts` that exports `async function noGuard() {}` causes the test to fail with a clear message naming the function.
- Adding `// @no-auth-required` above the export silences the test.

**Tests.** This is itself a test; no new tests. Validate by the manual experiment above.

**Effort.** 1 hour to verify; up to ½ day if rewriting.

---

## Section 5 — Test coverage gaps (docs/testing/PLAN.md Fase 1)

This is the largest remaining chunk and the one most worth scoping carefully. `docs/testing/PLAN.md` lays out Fase 1A–1G; the items below cherry-pick the highest-leverage ones first.

### 5.1 1A — Eight critical server actions

**Context.** Testing PLAN.md Fase 1A — close coverage gaps on the 8 server actions with the biggest attack surface or biggest correctness blast radius. Each needs 1 happy path + 2-3 negatives (permissions, validation, invalid state).

**Files.** One test file per action, slotting in next to existing tests. The 8 actions, in priority order:

| # | Server action | New test file | Why it ranks |
|---|---|---|---|
| 1 | `app/actions/auth.ts` (signup, login, logout, OTP, password reset) | `__tests__/auth.test.ts` | Auth surface is the front door |
| 2 | `app/actions/bite.ts` (interacts with rabies observations) | extend `__tests__/bite-cases-d2.test.ts` | Already has D2 coverage; need negatives for permission edges |
| 3 | `app/actions/intake.ts` (most-used data-in path) | `__tests__/intake.test.ts` | Pet creation = most rows in DB |
| 4 | `app/actions/welfare-triage.ts` | `__tests__/welfare-triage.test.ts` | Decision authority is high; product impact of false triage is high |
| 5 | `app/actions/claim.ts` (stub claim — gate is in place) | extend `__tests__/dni-verification.test.ts` | Critical security path even when gated |
| 6 | `app/actions/transfer.ts` (both-consent path) | `__tests__/transfer.test.ts` | Edge cases when consent is rescinded mid-flow |
| 7 | `app/actions/pregnancy.ts` (open/close/abort) | `__tests__/pregnancy.test.ts` (none today) | Has state machine; D6 territory |
| 8 | Bulk admin actions in `app/actions/admin-*.ts` (IDOR risk) | extend `__tests__/admin-decisions.test.ts` | Bulk ops cross the wrong-org line easily |

For each: follow doctrine D3 (factories, not raw SQL) and D6 (state machines explicit when the action transitions one).

**Acceptance.**
- Each action has ≥ 75% branch coverage per its file (D2 target for `app/actions/**`).
- Each action has ≥ 1 happy + ≥ 2 negatives.
- The coverage CI step from §1.2 catches a regression in any of them.

**Tests.** This *is* the test work — see the table above.

**Effort.** 1.5 weeks. Probably do this in two sub-PRs (auth + intake first, the other 6 later).

---

### 5.2 1B — Cron handler invariants

**Context.** Testing doctrine D8: every handler in `app/api/cron/**` needs three invariant tests — idempotency, runtime window, and recovery. There are 10 cron handlers currently registered in `vercel.json`. None have all three.

**Files.**
- Sweep `app/api/cron/**` for handler entry points.
- Per handler, add a test file `__tests__/cron-<handler-name>.test.ts` covering the three invariants.

**Highest-priority handlers (most state-mutating, per PLAN.md):**
1. `close-rabies-observations` — already has the action implemented, needs the invariant tests.
2. `materialize-slots` (or `materialize:slots`) — verify it's registered; spec was D8 territory.
3. `auto-expire-approvals` — touches `approval_requests` + audit_log.
4. `escalate-stale-disputes` — modifies case status; idempotency matters.
5. `expire-foster-proposals` — already battle-tested via the foster pool plan; verify the three invariants.

**Acceptance.**
- Each handler test: invokes the handler twice in a row, asserts the second run is a no-op (idempotency).
- Each handler test: against a realistic seeded dataset (use `seed:test`), the handler completes in < 50% of its cron interval. For a `@daily` cron, that's 12 hours — generous; for `*/12h`, that's 6 hours. In practice they'll all be seconds.
- Each handler test: kill mid-execution via a thrown error after some work, run again, assert the remaining work completes without duplicating effects. Use the `cron_runs` table for resumability.

**Tests.** This *is* the work.

**Effort.** 1 week (about a day per handler × 5 high-priority ones; remaining 5 lower-priority can defer or piggyback).

---

### 5.3 1D — RLS matrix testing

Covered above in §1.3. Moved into Section 1 because it's prerequisite infrastructure, not Fase 1 work — without it, every RLS change ships blind.

---

### 5.4 1E — State machines extracted to explicit matrices

**Context.** Doctrine D6 — extract the implicit state machines in `case_lifecycle`, `foster_proposal`, `adoption_application`, `rabies_observation`, `pregnancy` into explicit `{ from, event, to, guard? }` matrices. Server actions consume the matrix; tests fuzz it.

**Files.** Per domain, create:
- `lib/<domain>/transitions.ts` — exports `const TRANSITIONS = [{ from, event, to, guard? }, ...] as const` and a typed `applyTransition(state, event, ctx)` helper.
- Refactor the corresponding server action to consume `applyTransition` instead of inline `if/switch` blocks.
- `__tests__/<domain>-transitions.test.ts` — two tests: walk every row in the matrix and assert the resulting state; fuzz 1000 random events against random starting states and assert no prohibited state is reachable.

**Domains, in priority order:**
1. `foster_proposal` — already has clear states (pending/accepted/rejected/cancelled/expired) and is the easiest to extract first.
2. `rabies_observation` — outcome enum is small; useful template.
3. `adoption_application` — already has explicit resolution events post the catalog phase-2 cleanup.
4. `pregnancy` — depends on the pregnancy spec landing (Section 6).
5. `case_lifecycle` — depends on the cases system landing (Section 6).

**Acceptance.** For each domain extracted:
- `lib/<domain>/transitions.ts` exists and is the only source of truth for legal transitions.
- The corresponding server action imports from it; no inline transition logic remains.
- Fuzz test runs in < 5s and asserts no illegal state is reachable.

**Tests.** This *is* the work.

**Effort.** 1 week for the 5 domains, sequentially.

---

### 5.5 1F — Observability baseline (Sentry + structured logs)

**Context.** Testing PLAN.md Fase 1F. Without this, the load tests in Fase 3 are blind, and any production user-visible incident is invisible to the team until a user complains. Sentry or equivalent + structured JSON logs with `request_id` propagated through middleware → server actions → edge functions → cron.

**Files.**
- `middleware.ts` — generate or pick up a `request_id` header, push it into a `cls-hooked` / `AsyncLocalStorage` context.
- `lib/log.ts` (new) — wrap `console.log` etc., always emit JSON, attach `request_id` from context.
- `lib/sentry.ts` (or `@sentry/nextjs`) — initialize. Wire to env vars; documented in `.env.local.example`.
- `lib/auth-guards.ts` and helpers — replace `console.error` with the structured logger.
- A minimal dashboard outside the repo (Sentry UI or Grafana) — error rate, p95 latency, signups/day, denuncias by state.

**Acceptance.**
- Any unhandled exception in a server action is captured in Sentry with the `request_id`.
- Logs in staging are JSON-formatted, parseable by `jq`, all carry `request_id`.
- A dashboard with the four metrics above is reachable from `docs/ops/` (link).

**Tests.** Hard to unit-test observability directly. Add one test that triggers an error through a server action and asserts the structured logger was called; the actual transport (Sentry SDK) can be mocked.

**Effort.** 3 days.

---

### 5.6 1C — Playwright E2E (defer to a separate PR sequence)

Five flows per PLAN.md (registration + DNI + first pet; denuncia D2 → triage → close; adoption end-to-end; foster with expiration; libreta share). This is its own work-stream — call it out here for completeness but plan it as Section 7 work rather than slotting into the test infra section. The other 5.x items above are higher-leverage per unit of effort.

**Effort estimate.** 1.5 weeks for all five. Schedule after §5.1 (server-action tests) so the underlying flows are themselves test-covered before we ask Playwright to drive them.

---

## Section 6 — Specs ready to execute (plans already written)

These are 🟢 Ready for Claude Code per `docs/superpowers/README.md`. Each has a self-contained plan; nothing further needs writing before code starts.

### 6.1 Sistema de casos (the big one)

**Context.** The biggest piece pending. Tabla `cases` unifies multiple coordination workflows (welfare, bite, lost/found, custody dispute, foster, adoption listing, adoption application) under one expediente object. Unblocks 5 other features (cross-org transfer UX, org abuse investigation, decomiso chain, bite-from-unowned, adoption v1.4 addendum).

**Files.**
- Plan: `docs/superpowers/plans/2026-05-19-cases-system.md` (read this first; it's the source of truth).
- Spec dependencies: `docs/superpowers/specs/2026-05-19-cases-event-attachment-design.md` (v1.1) + `docs/superpowers/specs/2026-05-19-cases-lifecycles-design.md` (v1.0).
- Touches: `db/schema.ts` (new table + 2 columns), `db/migrations/0044…` (multi-step), `lib/case-kinds.ts`, `lib/case-attachment.ts`, `lib/case-normatives.ts`, `lib/case-lifecycles/*.ts` (one per kind), `lib/case-helpers.ts`, `lib/notification-templates.ts`, 5 server actions refactored, 4 new cron handlers + 1 rabies cron refactor, UI `/casos/[publicCode]` + 4 entry points, `db/cases_rls.sql`.
- 7 fases A-G; the plan numbers them and gives a per-fase scope.

**Acceptance.** Per the plan's verification checklist at the end. In short: every case_kind in the v1 subset opens/closes through `cases`; existing workflows still function (refactored to read from cases instead of inline status); RLS policies pass smoke + matrix; backfill imports the 3 open-row categories.

**Tests.** The plan specifies tests per fase. Cross-case visibility tests are critical (D7). Don't skip the smoke that asserts foster proposals on `org A` aren't readable by `org B` after the refactor.

**Effort.** 2–3 weeks per the plan. Bigger than anything else on this list. Recommend gating it behind Sections 1-3 of this doc so test-gating is live before this PR lands.

---

### 6.2 Adoption handshake unified

**Context.** The other major piece. Replaces the broken `finalizeAdoptionAction` with: 28-question structured form + per-adoption contract PDF with merge fields + applicant consent loop. Closes the biggest correctness hole in the adoption flow.

**Files.**
- Plan: `docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md` (8 fases).
- Touches: adoption schema, contract template handling, `app/actions/adoption*.ts`, UI for the form + the consent flow.

**Acceptance / tests / effort.** See the plan — it's self-contained. ~7 days. **Hard dependency:** the stub-claim gate (§2.1, already done) — confirmed the plan's D1 is satisfied.

---

### 6.3 CABA barrios import — execution

**Context.** Script written, just needs to be run + verified. INDEC treats CABA as one locality; the 48 barrios from Ley CABA 1.777 live in a separate import.

**Files.**
- Plan: `docs/superpowers/plans/2026-05-19-caba-barrios-import-execution.md`.
- Script: `scripts/import-caba-barrios.ts` (already written).
- Verify: `LocalityCombobox` ranking gives a small boost to barrios when the user's jurisdiction is CABA.

**Acceptance.** Dry-run → live run → SQL count = 48 → manual smoke in the combobox.

**Effort.** ½ day.

---

### 6.4 Fix vet portal routing default

**Context.** Vet with `professional.provider` granted should land at `/pro` instead of `/mis-mascotas`. Plan covers F1-F4 + optional F5 (ActiveRoleBadge).

**Files.**
- Plan: `docs/superpowers/plans/2026-05-19-fix-vet-portal-routing.md`.

**Effort.** ½-1 day.

---

### 6.5 Fix service-dog 404

**Context.** Asymmetry: profile shows "Perro de asistencia" link to non-owners, but `/asistencia` filters strict `role='owner'` and 404s. Plan covers F1 (hide link) + F2 (friendly message) + F3 (audit `devolucion/page.tsx`).

**Files.**
- Plan: `docs/superpowers/plans/2026-05-19-fix-service-dog-404.md`.

**Effort.** ½ day.

---

### 6.6 Bulk revoke UI (Phase 13 follow-up)

**Context.** `bulkRevokeAction` server action already implemented + tested. Missing: the UI surfaces in the 4 queues (`/admin/usuarios`, `/gob/usuarios`, `/admin/organizaciones`, `/gob/organizaciones`) + a bulk attachment uploader.

**Files.**
- Same plan as Fases 10-14: `docs/superpowers/plans/2026-05-18-admin-page-fases-10-14.md` (read F13 follow-up).
- New UI components: a `BulkActionBar` shared between the 4 queue pages; a `BulkAttachmentUploader` that posts to whatever attachment endpoint already exists.

**Effort.** ½ day for the UI, separate ½ day for the bulk attachment uploader if it's not already in place.

---

### 6.7 Localities catalog — finish the 5 remaining server actions

**Context.** v2.0 of the localities catalog ships canonical jurisdiction validation in 2 govt-side actions. Five more still accept text: vet upgrade, org creation, service-offerings, welfare, events. Follow-up listed in the superpowers README row for the catalog spec.

**Files.**
- `app/actions/upgrade.ts`, `app/actions/admin-institutional.ts` (org creation), `app/actions/service-offerings.ts`, `app/actions/welfare.ts`, `app/actions/events.ts`.
- For each: import `resolveCanonicalJurisdiction` from `lib/jurisdiction-validation.ts` and call it before persisting any user-supplied locality string.

**Acceptance.** All 5 actions canonicalize; a free-text "buenos aires" (lowercase) gets normalized to the INDEC canonical form before write.

**Tests.** One test per action with a mixed-case input asserting the persisted row has the canonical value.

**Effort.** ½ day total.

---

## Section 7 — Specs needing a plan written (🟡 Spec only)

These specs are locked but no Claude Code plan exists yet — write the plan before executing.

| # | Spec | Status | Effort to write plan | Effort to execute (per spec) |
|---|---|---|---|---|
| 7.1 | `2026-05-19-performed-by-autocomplete-design.md` | Plan to write | 2-3 hours | 5-6 days |
| 7.2 | `2026-05-19-pet-profile-v2-design.md` (v1.0 + v1.1) | Plan to write | 3-4 hours | ~1 week |
| 7.3 | `2026-05-19-pregnancy-tracking-design.md` | Plan to write | 2-3 hours | 5 days |
| 7.4 | `2026-05-19-eno-vet-direct-report-and-owner-alerts-design.md` | Plan to write | 3-4 hours | 5 days |
| 7.5 | `2026-05-19-cross-org-transfer-ux-design.md` | Plan to write (depends on cases) | 3 hours | 5 days |
| 7.6 | `2026-05-19-org-abuse-investigation-design.md` | Plan to write (depends on cases) | 3 hours | 4-5 days |
| 7.7 | `2026-05-19-decomiso-welfare-authority-design.md` | Plan to write (depends on cases) | 3-4 hours | 7-8 days |
| 7.8 | `2026-05-19-bite-from-unowned-animal-design.md` | Plan to write (depends on cases) | 4 hours | 8 days |
| 7.9 | `2026-05-19-govt-business-rules-poc-design.md` | Plan to write | 4 hours | 7-9 days |

Items 7.5-7.8 are blocked by Section 6.1 (cases system) and should sit until cases lands.

### 7.10 Specs with open §15 questions (need decisions before plan)

| Spec | Open decisions |
|---|---|
| `2026-05-18-physical-tag-design.md` (v1.0) | Material / fabricante (AR vs import), auto-revoke on death, DIY QR, interop with other systems |
| `2026-05-19-pet-spaces-catalog-design.md` (v1.0) | 8 open questions before the plan can be written. ~2-3 weeks to execute once decided. |

These are not engineering items — they're product decisions. Write them down as GitHub issues so they don't get forgotten while the rest of this plan executes.

---

## Section 8 — Deferred (testing PLAN.md Fases 2-4)

These exist, they're valuable, but they're not next. Captured here so the punch list survives:

- **Property-based testing** (Fase 2A) — `fast-check` on validators and business rules. After Section 5 lands.
- **Adversarial dataset in `seed:test`** (Fase 2B) — edge cases like cross-DST slots, multiple-claim pets, vencido pregnancies.
- **Snapshot tests for user-visible outputs only** (Fase 2C) — notifications, capability matrices, copy.
- **Visual regression** (Fase 2D) — Chromatic or Playwright snapshots committed.
- **The remaining 27 server actions** (Fase 2E) — the long tail not in §5.1.
- **Performance budgets** (Fase 3A) — `docs/testing/performance-budgets.md` with p95 thresholds.
- **Load tests with k6** (Fase 3B) — 5 scenarios.
- **Query performance analysis** (Fase 3C) — pg_stat_statements + EXPLAIN sweep + N+1 detector.
- **Chaos / IDOR fuzz / PII leak / captcha / external pen test** (Fase 4A-4E) — scale-stage work.

These are tracked in `docs/testing/PLAN.md` already — that doc is the canonical source. Don't duplicate the detail here.

---

## Suggested execution order

| Week | Focus |
|---|---|
| 1 | Section 1 (CI test-gating + coverage + RLS matrix). Section 2.3 (apply foster RLS — 15min). Section 3.1 (mirror remaining CHECK constraints — 2h). Section 4.1 (verify auth-coverage test — 1h). |
| 2 | Section 2.1 (publicToken retry) + 2.2 (cross-org receiver column). |
| 3-4 | Section 5.1 (8 critical server actions). |
| 5 | Section 5.2 (cron invariants — 5 priority handlers). |
| 6 | Section 5.4 (state machines extracted) + 5.5 (Sentry / observability). |
| 7 | Section 6.3-6.7 (the small "Ready for CC" feature fixes — CABA barrios, vet routing, service-dog 404, bulk revoke UI, localities catalog tail). |
| 8-10 | Section 6.1 (cases system). |
| 11 | Section 6.2 (adoption handshake unified). |
| 12+ | Section 5.6 (Playwright E2E) + Section 7 (specs needing plans) + Section 8 (deferred). |

Roughly a two-month horizon to clear everything in Sections 1-6. The deferred items in Sections 7 and 8 are post-pre-release work.

---

## What this plan does *not* cover

- **UI consistency push** (capability-request UX, case stepper, owner-side IA cleanup). Worthwhile but lower stakes than security/DB foundations; slot after Section 6.
- **Refugio→org physical folder rename.** Code rename is done; the physical `app/refugios/` folder still exists but is now intentional (public shelter profile route). Documented in AGENTS.md.
- **Projection-as-API layer.** Bigger architecture move; do after the test infrastructure and cases system are both solid.
- **Mi Argentina OAuth integration.** Replaces the stub-claim flow once available; tracked as a separate work-stream because it depends on external availability.
