# DIM / MiMAR — AI Audit Part 2 (Phases 1, 3, 6, 8) — 2026-07-01

> Completes the passes the Cowork audit (`docs/audits/ai-audit-2026-07-01.md`) could not run
> in-sandbox: the repo guardrail linters (authz/RLS/deps/actions), the deep async pass, the
> dependency reconciliation, and the git-history regression pass.
> Executed per `docs/audits/verify-order-phases-1-3-6-8.md`. **READ-ONLY** — only this file was written.
> No source/config edits, no git mutation, no installs, no `--fix`, no build/db/deploy.

## Metadata
- Repo root: `C:\dev\dim` (the session cwd was the parent `C:\dev`; the canonical repo is the `dim/` subdir).
- Branch: `fix/jsonld-xss-and-security-headers`
- HEAD SHA: **`6ef7e8afc79d793dbfa50a9c7650968ffb3fcf4a`** (`6ef7e8af`)
- Base (pre-fix): `5f26cc89` on `chore/tech-debt-finish`. This branch = base + the two applied fixes
  (`f2b72b20` XSS-001, `6ef7e8af` HDR-001), so the gate below validates the **post-fix** tree, and
  Phase 8 sees the fixed state — as the sequencing note requires.
- Git integrity: `git rev-parse HEAD` resolves cleanly here (the pack corruption reported in part 1 was
  a sandbox-only artifact; the canonical repo is intact).
- Commands run (read-only): all `pnpm lint:*` + `typecheck` + `lint` gate linters, `pnpm audit`
  (no `--fix`), offline `node -e` missing-package check, `rg` async passes, `git log`/`git show`.

## Executive summary
- **Critical: 0 · High: 0 · Medium: 3 · Low: 0 · Info: 1** · Positives (re-confirmed with evidence): 6
- The four **definitive** guardrail linters — `lint:authz`, `lint:rls`, `lint:deps`, `lint:actions` — all
  pass on the post-fix HEAD. Authorization coverage, RLS coverage, layering, and action budgets are intact.
- Three Medium findings, none a code vulnerability:
  1. **[DEP-001]** 6 dependency advisories (1 high, 4 moderate, 1 low). 5 of 6 are **dev-only** tooling
     (vite/esbuild/tar); the one production-path advisory is `postcss <8.5.10`.
  2. **[TEST-001]** 256 of the 258 failing tests were **stale test path literals** left by the `lib/`
     bucketize refactor — `vi.mock()`, `vi.doMock()/doUnmock()`, and `readFileSync()` specifiers pointing
     at pre-move `@/lib/X` locations. A broken behavioral gate, not a vitest API issue as first suspected.
     **Fixed** on branch `fix/test-stale-vimock-paths` (commits `ede859af`, `d2a35488`); suite goes
     **258 → 2**.
  3. **[TEST-002]** the final **2 failing tests** (`admin-analytics-perf`, `pet-cache-rederivation`) are
     integration tests that connect to the **local Supabase DB** (`127.0.0.1:54321`) and assert on seeded
     data / a 3 s perf budget. They require `pnpm db:start` + seed (**human-gated**) — not run here, not a
     code defect. Open.
- Phases 3 (async), 4 (orphans), and 8 (regression) surfaced **no** new findings.

> **Correction note (added after first draft):** the first version of this report attributed the test
> failures to a "vitest 4.1.6 API change." That was wrong. Root cause is stale test-path literals from the
> bucketize refactor — `vi.mock`, `vi.doMock`, and `readFileSync` paths (TEST-001, 256 tests, now fixed).
> The `cookies()`/`getUser` errors first read as an "unmocked supabase-server" issue were actually downstream
> symptoms of the same stale `doMock` paths. Only 2 genuinely independent failures remain (TEST-002,
> local-DB integration). Corrected here with evidence.

---

## Phase 1 — Repo gate (authz + RLS + layering + structural)  [DEFINITIVE]

| Command            | Exit | Result (evidence) |
|--------------------|:----:|-------------------|
| `pnpm typecheck`   | 0    | `tsc --noEmit`, no errors |
| `pnpm lint` (biome)| 0    | `Checked 1966 files … No fixes applied` |
| `pnpm lint:authz`  | 0    | `authz coverage clean — 70 action files guarded; operator routes (app/admin, app/gob) institutionally gated` |
| `pnpm lint:rls`    | 0    | `RLS coverage clean — 46 tables checked; 35 have policies; 11 intentional deny-all (allowlisted): _dim_migrations, alert_firings, case_events, eno_processing_queue, event_notification_outbox, govt_business_rules, jurisdictions_census, organization_invitations, physical_tag_interest, rate_limit_buckets, share_telemetry` |
| `pnpm lint:deps`   | 0    | `Dependency direction clean — 375 module files scanned; 10 allowed cross-module edges` |
| `pnpm lint:actions`| 0    | `app/actions/ line-budget clean — 65 baselined files within budget; 0 new files over threshold` |
| `pnpm lint:tokens` | 0    | `Design tokens clean` (1 non-fatal `[warn]` — see INFO-001) |
| `pnpm lint:ui`     | 0    | `UI invariants clean — touch targets, enum text, english copy, accents OK` |
| `pnpm lint:lib-root`| 0   | `lib/ root clean — 0 root files` |
| `pnpm test`        | 1    | 258 failed / 6537 passed — root cause **TEST-001** (stale bucketize test paths, 256). Fixed → **2 failed / 6805 passed**, the 2 being **TEST-002** (local-DB integration tests) |

**Findings of this phase:** TEST-001 + TEST-002 (below). The nine linters — the authoritative answer to
"is authz/RLS/layering complete?" — are all green. No authz/RLS/layering findings.

### [TEST-001] 256 tests fail on stale test-path literals left by the bucketize refactor  [FIXED]
- Severity: **Medium** (process/gate integrity — a red suite hides future real regressions)
- Pass:     Phase 1 (behavioral gate)
- Location: 47 test files across three stale-path mechanisms (canonical example:
  `src/modules/welfare/application/__tests__/actions-parity.test.ts:25` mocks `@/lib/auth-guards` while the
  code under test imports `@/lib/infra/auth-guards` at line 31):
  - `vi.mock("@/lib/X")` — 40 specifiers, 104 occurrences, 36 files
  - `vi.doMock()/vi.doUnmock("@/lib/X")` — 9 specifiers, 52 occurrences, 11 files (mostly cron-route tests)
  - `readFileSync(".../lib/X.ts")` — 2 files (`link-integrity`, `demo-mode`)
- Status:   **Confirmed**, **pre-existing** (independent of the XSS/HDR fix), and **fixed** on branch
  `fix/test-stale-vimock-paths` (commits `ede859af`, `d2a35488`).
- Root cause: the `refactor(lib): bucketize` commits moved `lib/*.ts` into
  `lib/{infra,domain,analytics,ui,events,reference,utils}/*.ts` and updated the source imports, but the
  string-literal paths in tests (mock specifiers and `readFileSync` args) were left on the old, now-deleted
  locations. tsc and Biome don't resolve these string literals, so it passed the gate silently. Each stale
  mock targeted a dead module → the real module ran **unmocked** → `vi.mocked(realFn).mockRejectedValue` /
  `mockResolvedValue` threw `is not a function`; stale cron `doMock`s let the real scan helper run and hit
  the DB (auth-passing cases returned 500/401 or wrong shapes); stale `readFileSync` args threw `ENOENT`.
  (The first draft of this report guessed "vitest 4.1.6 API change" — that was wrong.)
- Evidence: `ls lib/auth-guards.ts` → gone; `lib/infra/auth-guards.ts` → exists; `@/*` → `./*` in
  `tsconfig.json`, so `@/lib/auth-guards` resolves to a non-existent file. A repo scan found 49 stale mock
  specifiers, each mapping 1:1 by basename to exactly one bucketized location (0 ambiguous), plus 2 stale
  `readFileSync` paths.
- Fix applied: repointed every stale path (string-literal changes only; no source/import touched). Result:
  `pnpm test` **258 → 2** failed (`Tests 2 failed | 6805 passed`). The edited files are **disjoint** from
  the 2 files still failing (TEST-002), so the fix introduced no new failures.

### [TEST-002] Final 2 tests fail: local-Supabase integration tests, not run (human-gated DB)
- Severity: **Medium** (same gate-integrity concern; blocks the suite from going fully green)
- Pass:     Phase 1 (behavioral gate)
- Location: `__tests__/pet-cache-rederivation.test.ts`, `__tests__/admin-analytics-perf.test.ts`
- Status:   **Confirmed**, **pre-existing**, **open** — **not a code defect** (environment-dependent)
- Evidence: both connect to the local stack — `createClient("http://127.0.0.1:54321", …)` and
  `db.insert`/`db.transaction` against seeded `DIM-*` pets (`pet-cache-rederivation`); a 3 s DB-layer perf
  budget (`BUDGET_MS = 3000`, `admin-analytics-perf`). Failures are data/seed assertions
  (`Funnel invariant violated`, cache-vs-re-derived mismatch) and a timing budget, not mock/path errors.
- Impact:   These two integration checks (cache fitness, admin analytics perf budget) are not certified.
- Fix (not applied — human-gated): run with the local Supabase stack up and seeded
  (`pnpm db:start` + seed), which the read-only audit gate deliberately denies. The perf-budget case is also
  timing-sensitive and may be flaky on a loaded machine.

---

## Phase 3 — Async logic & state (deep)
Triaged every hit from the four async grep passes over `app`, `src`, `lib`, `components`. **No findings.**

- **Swallowed errors** (`catch { console.* }` with no rethrow): all matches are the
  `"…insert failed (action did succeed)"` / marker-insert pattern — a **post-success, non-fatal**
  side-effect (notifications/markers) that logs and continues by design. `src/modules/pets/actions.ts:58`,
  `adoption/actions.ts:54,438`, `foster/actions.ts:57`, `welfare/actions.ts:121`,
  `create-welfare-report.ts:321`, `gob/analytics/export/actions.ts:223`. The one loop that could mask a
  batch failure — `foster-repository.ts:619` — **increments an `errors` counter** it returns, so the caller
  still gets a signal. None returns silent `undefined` on a critical path.
- **Floating promises / missing await**: none. The 7 `.then(` hits in `lib/metrics/alert-evaluation.ts`
  assign to `promise`, store it in `fetchCache`, and `await Promise.all(...)` at line 173 — not floating.
  The remaining hit is a `next/dynamic` import in a chart component.
- **Race / module-level mutable shared state**: none. Only match is a comment referencing
  `globalThis.crypto` in `src/modules/welfare/domain/reference-code.ts` — no concurrent-writer singleton.
- **Listener / timer teardown**: all component listeners have matching cleanup, e.g.
  `components/charts/DashboardChart.tsx:126` returns `() => mq.removeEventListener("change", handler)`;
  `components/panorama/TimeScrubber.tsx` documents and implements interval cleanup on pause/unmount.

---

## Phase 4 — Architecture / orphan modules (report only)
- `pnpm lint:deps` clean (375 files, all cross-module edges within the allowed set) — no layering violation.
- No orphan/dead-module finding. Reminder honored: this is an event-sourced app; cron/scheduler-invoked
  modules (`lib/case-closers/*`, `scripts/*`, `expire-*`/`escalate-*`, projection rebuilders) have no static
  importers by design and were **not** flagged as dead.

---

## Phase 6 — Dependencies (read-only, no installs, no `--fix`)

### [DEP-001] Six dependency advisories (1 high, 4 moderate, 1 low); 5 of 6 are dev-only
- Severity: **Medium** (mostly dev-tooling; one production-path moderate)
- Pass:     Phase 6
- Location: `pnpm-lock.yaml` transitive deps (via `@vitejs/plugin-react`, `@vitest/coverage-v8`, `vitest`, build chain)
- Status:   Confirmed (`pnpm audit --audit-level=low`, no `--fix`)
- Evidence:

  | Sev | Package | Vulnerable | Patched | Reachability |
  |-----|---------|------------|---------|--------------|
  | high | `vite` | `>=8.0.0 <=8.0.15` | `>=8.0.16` | dev-only (GHSA-fx2h-pf6j-xcff) |
  | moderate | `esbuild` | `<=0.24.2` | `>=0.24.3` | dev-only |
  | moderate | `postcss` | `<8.5.10` | `>=8.5.10` | **production path** |
  | moderate | `tar` | `<=7.5.15` | `>=7.5.16` | dev-only |
  | moderate | `vite` | `>=8.0.0 <=8.0.15` | `>=8.0.16` | dev-only |
  | low | `esbuild` | `>=0.27.3 <0.28.1` | `>=0.28.1` | dev-only |

  Summary: `{critical:0, high:1, moderate:4, low:1}`. Offline reconciliation: **no `MISSING:` packages** —
  every `dependencies`/`devDependencies` entry resolves in `node_modules`. No hallucinated/typosquatted
  package. No **Critical** supply-chain finding.
- Impact:   The `high`/`moderate` vite+esbuild+tar advisories affect the **test/build toolchain only** — they
  do not ship in the production bundle. `postcss <8.5.10` is the one advisory on a production-path dependency
  and should be prioritized.
- Fix (unapplied — human upgrades, no `--fix` here): bump `vite >=8.0.16`, `esbuild >=0.28.1`,
  `tar >=7.5.16`, and **`postcss >=8.5.10`** (prioritize postcss), then re-run `pnpm audit` + `pnpm test`.

---

## Phase 8 — Iterative regression (read-only git)
Reviewed recent history on auth/validation/crypto/RLS surfaces. **No regression found.**

- Recent history on these paths is dominated by `refactor(strangler): migrate … action to module use-cases
  (no behavior change)` and `refactor(lib): bucketize …` commits (file moves + delegation to module
  use-cases), plus `a9e1bd05 fix(authz): annotate use-server wrapper shims for the auth-guard lint` and
  `9d3dbf4c fix(strangler): restore auth-coverage convention + allowlist cross-module edges`.
- **Definitive check:** `lint:authz` (70 files guarded) and `lint:rls` (46 tables covered) pass on the
  post-refactor HEAD. A strangler refactor that dropped an ownership check or relaxed an RLS predicate would
  fail these linters — they don't. This is the authoritative regression signal per the work-order.
- Spot-checks confirm the sensitive controls survived the refactors intact:
  - `lib/domain/cron-auth.ts`: still `import { timingSafeEqual } from "node:crypto"`, **fails closed in
    production** (`NODE_ENV === "production" → 401` when `CRON_SECRET` unset), dev-only fallback gated.
  - `lib/utils/dni-hash.ts`: still `createHmac("sha256", pepper)` (HMAC-SHA256, hex digest) — no plaintext
    DNI; dev/test pepper explicitly "MUST NOT be used in prod".
  - `fb2b8061` (password-reset migration): structural extraction to `auth/application/password-reset/*`
    use-cases; guard coverage preserved (confirmed by `lint:authz` green).
  - Note: the work-order path `lib/dni-hash.ts` does not exist; the real files are `lib/utils/dni-hash.ts`
    and `lib/domain/dni-next.ts` (found and checked).

---

## Positives (re-confirmed with command evidence — do not "fix")
1. **Authz coverage complete** — `lint:authz` green: 70 action files guarded, operator routes institutionally gated.
2. **RLS coverage complete** — `lint:rls` green: 46 tables, 35 with policies, 11 intentional deny-all allowlisted.
3. **Layering intact** — `lint:deps` green: 375 modules, only the 10 allowed cross-module edges.
4. **Action budgets held** — `lint:actions` green: 65 baselined files within budget.
5. **Cron auth hardened** — `timingSafeEqual`, fail-closed in production (verified in source at HEAD).
6. **No plaintext DNI** — HMAC-SHA256 hashing preserved through the bucketize refactor.

---

## Not audited / limitations
- **Runtime behavioral coverage** is now essentially green: TEST-001 (256 stale-path failures) is fixed
  (branch `fix/test-stale-vimock-paths`, commits `ede859af`+`d2a35488`), taking the suite **258 → 2**. The
  final 2 (TEST-002) are local-Supabase integration tests that need `pnpm db:start` + seed (human-gated) and
  were not run here. Runtime authz/RLS suites (`__tests__/rls/coverage.test.ts`, `access-control-*`,
  `admin-pii-audit-log`) are among the now-passing 6805.
- Phase 2 findings from part 1 (**KEY-001** local service_role key in tests/`.claude`, **RNG-001**
  `Math.random()` storage suffixes) are out of this part's scope (Phases 1/3/6/8) and were **not** re-audited;
  they remain open per part 1.
- `pnpm audit` reachability (`devOnly`) is derived from dependency-path metadata, not runtime tracing;
  treat `postcss` as production-path and the rest as build/test-time.

## INFO
### [INFO-001] One non-fatal design-token warning
- `components/ui/dashboard/OpKpi.tsx:161` — `text-ln-op-warn` in an operator status component; `lint:tokens`
  emits a `[warn]` recommending an `st-*` token. Exit 0 (non-blocking). Cosmetic, not security.

---

## Self-verification
- [x] `git status --porcelain` → the only added tracked/untracked file from this task is
  `docs/audits/ai-audit-2026-07-01-part2.md`. No source/config file was modified by this pass.
- [x] `git diff --name-only` (tracked) → empty (no source change from the audit).
- [x] Secret scan of this report (Supabase secret-key prefix, JWT prefix, PEM header patterns) → no secret values leaked. Redaction policy preserved from part 1.
- [x] Every finding carries Location + Evidence + Status.
- [x] Read-only respected: no push/PR/migration/install/`--fix`/build/db/deploy.
