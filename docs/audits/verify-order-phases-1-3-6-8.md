# Verify Work-Order — complete audit Phases 1, 3, 6, 8 (read-only, for Claude Code)

> Finishes the passes the Cowork audit could **not** run in-sandbox (`docs/audits/ai-audit-2026-07-01.md`):
> the repo guardrail linters (authz/RLS/deps/actions), the deep async pass, the dependency reconciliation,
> and the git-history regression pass.
>
> **This is a READ-ONLY task.** Load the read-only gate `docs/audit-agent-permissions.json`. The **only**
> writable path is `docs/audits/**`. No source/config edits, no git mutation, no installs, no `db:*`/`seed:*`,
> no `--fix`. Findings only — the human decides fixes. Output goes to
> `docs/audits/ai-audit-2026-07-01-part2.md` using the finding schema from the main report (§2).
>
> Prereq: run on Ignacio's machine where `node_modules` is complete (the sandbox copy was broken).

## Deliverable
`docs/audits/ai-audit-2026-07-01-part2.md` with: metadata (branch + real HEAD SHA), one section per phase
below, findings in the standard schema, a "Positives" list, and the §5 self-verification checklist.

---

## Step A — Run the repo gate (Phase 1: authz + RLS + layering are DEFINITIVE here)
Run each; record command → exit code → summary. A non-zero exit or any reported violation becomes a finding.
```
pnpm typecheck
pnpm lint            # biome
pnpm lint:authz      # authorization-guard coverage on actions/routes  → Pass 3.3 (authz/IDOR)
pnpm lint:rls        # RLS policy coverage per table                   → Pass 3.3 (data access)
pnpm lint:deps       # dependency-direction / layering                → Pass 1 (architecture)
pnpm lint:actions    # server-action complexity/size budget           → Pass 5 (maintainability)
pnpm lint:tokens ; pnpm lint:ui ; pnpm lint:lib-root   # structural invariants
pnpm test            # behavioral suite incl. __tests__/rls/coverage.test.ts, admin-pii-audit-log,
                     # access-control-*  → confirms authz/RLS at runtime
```
- **Do NOT run** `pnpm verify` end-to-end if you only need signal (it ends in `pnpm build`); run `pnpm build`
  separately only if a finding needs it. **Never** `deploy:staging`, `db:*`, `seed:*`.
- If `pnpm test` needs the local Supabase stack and it is not running, note "requires `pnpm db:start` —
  human-gated" and record the suite as **not run** rather than starting/seeding a DB yourself.
- For each linter that reports violations, capture the exact file:line list — that IS the finding evidence.
  These four linters are the authoritative answer to "is authz/RLS/layering complete?" — trust them over grep.

## Step B — Phase 3: async logic & state (deep)
Focus dirs: `app/actions`, `src/modules`, `lib`. Triage every hit.
- Swallowed errors (log-and-return-undefined):
  `rg -n -U 'catch\s*\([^)]*\)\s*\{[^{}]*console\.[^{}]*\}(?![^]*throw)' app src lib`
  → a `catch` that logs and neither rethrows, returns a typed fallback, nor signals the caller = **High** on
  a prod path. (The known non-fatal, intentional ones: `transfers/actions.ts`, `surveillance/close-eligible-observations.ts`,
  `gob/analytics/export/actions.ts` — confirm each still returns a meaningful signal, then dismiss.)
- Floating promises / missing await: `rg -n '(?<!await |return |void )\b[\w.]+\([^)]*\)\.then\(' app src lib`
  and skim `async` functions in `app/actions` for un-awaited calls to repositories/use-cases.
- Race / non-atomic shared state: `rg -n 'setInterval|setTimeout|new WebSocket|globalThis\.|let [a-zA-Z]+ *= *(new Map|\{\}|\[\])' lib src`
  → concurrent writers to a module-level singleton/cache without serialization; polling without a cancel token.
  Cross-check `lib/metrics/*cache*` and any projection cache for interleaved writes.
- Listener/timer teardown: `rg -n 'addEventListener|subscribe\(|setInterval|new WebSocket' components src`
  → each needs a matching `removeEventListener`/`unsubscribe`/`clearInterval` in cleanup/unmount.
- Boundary conditions: for async funcs over collections in `lib/analytics` & `lib/metrics`, trace empty/null/
  single-item and null API responses.
**Done when** async hot paths reviewed and each hit flagged or dismissed with a reason.

## Step C — Phase 6: dependencies (read-only, no installs)
- Hallucinated / missing packages (offline):
  `node -e "const p=require('./package.json');const fs=require('fs');for(const d of Object.keys({...p.dependencies,...p.devDependencies})){if(!fs.existsSync('node_modules/'+d))console.log('MISSING:',d)}"`
  Any `MISSING:` that is not a `pnpm-workspace` alias = **Critical** supply-chain finding.
- Known CVEs (read-only — **never** `--fix`): `pnpm audit --audit-level=high`
  → each advisory = finding with package + severity + fixed-version note for the human to upgrade.
- Pinned-but-stale: skim `package.json` majors vs. `pnpm outdated` (read-only) for security-relevant deps
  (`next`, `@supabase/*`, `postgres`, `drizzle-orm`, `resend`, `sharp`, `pdf-lib`).
**Done when** dep list reconciled; no install/lockfile write performed.

## Step D — Phase 4: architecture / orphan modules (report only)
- Start from `pnpm lint:deps` output. For suspected zero-import modules, confirm with
  `rg -n "from ['\"].*<basename>['\"]"` across the repo **before** calling anything dead.
- **Remember:** event-sourced app — `lib/case-closers/*`, `scripts/*` cron jobs, `expire-*`/`escalate-*`,
  projection rebuilders are invoked by Vercel Cron / schedulers, not static imports. "No importers" ≠ dead.
  Flag as **Suspected (verify invocation path)**, never as deletable.

## Step E — Phase 8: iterative regression (read-only git)
On the canonical repo (git is intact there — the sandbox showed `improper chunk offset`):
- `git log --oneline -40 -- app/actions lib/infra/auth-guards.ts lib/infra/pet-access.ts lib/domain/cron-auth.ts db/*_rls.sql middleware.ts lib/dni-hash.ts`
- For each commit that touched an auth/validation/crypto/RLS surface: `git show <sha>` and verify it did **not**
  remove or weaken a prior control (dropped ownership check, relaxed RLS predicate, widened CORS, removed
  algorithm/expiry validation, replaced parameterized query with interpolation).
- Report suspected regressions as **Suspected** findings with SHA + `file:line`. **No git writes.**

---

## Step F — Write the report & self-verify
Write `docs/audits/ai-audit-2026-07-01-part2.md` (metadata incl. real HEAD SHA; findings per phase;
Positives; limitations). Then:
1. `git status --porcelain` → only `docs/audits/ai-audit-2026-07-01-part2.md` present. If any source/config
   file shows up, you violated read-only — stop and report it at the top.
2. `git diff --name-only` → no source change.
3. `rg -n 'sb_secret_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN' docs/audits/ai-audit-2026-07-01-part2.md`
   → must be empty (no secret values leaked).
4. Every finding has Location + Evidence + Status.

## Acceptance criteria
- All Step A commands run with exit codes recorded (or explicitly marked "requires local DB — not run").
- Phases 3/6/8 each have a written section (findings or "no issues found, evidence: …").
- Repo unchanged except the part-2 report. No push/PR/migration/install/`--fix`.

## Sequencing note
Run this **after** the XSS/HDR fix order (`fix-order-xss-001-hdr-001.md`) is merged, so the regression pass
(Step E) sees the fixed state and the gate (Step A) validates the new `serializeJsonLd` helper + headers.
