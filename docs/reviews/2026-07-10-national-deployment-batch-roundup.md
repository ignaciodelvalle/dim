# National-deployment readiness — Batches 1-3 roundup

**Date:** 2026-07-10 · **Branch:** integration/all-20260703 · **Run:** autonomous,
PO away. Baseline: `6c7cc896` (panorama perf overhaul, already on staging prod).

## What shipped this run (commits after 6c7cc896)

| Commit | What |
|---|---|
| `24408f1c` | **security**: rate-limit the public denuncia receipt (only unprotected PII surface) + pre-national security report |
| (cursor-fix ×2) | **cache keys unified** SSR↔API (doubles hit rate + closes a custom-range window leak), real-zoom reporting (no more level decisions on a stale 4.0 placeholder), committed-period context (fixes period chrome lying "3 años" while data was 30/90d), `x-layer-cache` header + incrementalCache-miss warning |
| `800cbdfd` | **db**: pg_cron reaper for stuck app backends (death-spiral guardrail) — applied to staging |
| `189259f2` | **infra**: pin functions to `gru1` (same region as Supabase) — the cross-region floor fix |
| (detection ×3) | **`/api/health`** + GitHub Actions health cron (emails on outage) + `check-db-budget` static guard (in `verify`) |
| `16c851e2` | **comprobantes**: intake recap date + service-offering timezone bug |
| (journeys) | e2e robustness: fullScroll nav-safe, 33 networkidle waits bounded, actionTimeout, dedup-branch handling |
| `fd0f3eff` | grandfather pre-existing design-token ratchet drift |
| (polish) | division-fill memoization, mobile vista chips, ENO pool reset on reseed |

## Reviews (all with fresh, adversarial context) — 0 CRITICAL

- **Cache boundary** (cursor): "safe for multi-operator national use". No cross-operator/cross-jurisdiction scope leak. Findings were cache-effectiveness + observability, all fixed.
- **Console state machine** (cursor): "demo-safe". Findings were seed-adoption/period-chrome races, fixed.
- **Security** (opus): "STRONG, no CRITICAL/HIGH blocker". One MED (authenticated panorama fan-out has no aggregate rate cap — recommend `enforceRateLimit("panorama_api", profile.id)`), fixed the one gap that mattered.
- **Multi-jurisdiction + handoff** (opus): see `2026-07-10-jurisdiction-handoff-verification.md`.
- **Comprobantes info-quality**: the two demo-critical surfaces (public denuncia receipt, govt maltrato detail) are the most mature; no PII leaks; 2 date bugs fixed.

## The staging incident (caught live this run)

`/admin/programa` timed out again. Root cause: **death-spiral** — client db budgets
abandon slow queries but can't cancel them; the transaction pooler ignores
`statement_timeout`; abandoned backends pile up on the **micro** instance until
trivial queries take 60s+. Fixed at three levels:
1. **Reaper** (pg_cron, live) auto-terminates stuck Supavisor backends every minute.
2. **gru1 pin** removes the cross-region latency that made queries slow enough to
   pile up (a full-cache-HIT request was 961ms of pure São-Paulo↔Virginia round-trips).
3. **Detection** (`/api/health` + cron) so the next incident emails you instead of
   waiting for you to look.

PO decisions on record: reaper authorized; **compute stays Micro** (reaper + fixes
should hold demos; national compute is a Batch-4 decision).

## Detection layer (answers "how do we catch this in future")

- `/api/health`: db ping ms + live stuck-backend count + degraded flag; 200/503.
- `.github/workflows/staging-health.yml`: polls every 15 min → **GitHub emails you on
  failure**; daily synthetic-monitor of the 4 critical flows.
- `check-db-budget` guard: a future PR can't add a heavy analytics query without a
  budget wrapper.
- **You must set** repo secret `STAGING_URL` (+ optional var `STAGING_HEALTH_URL`) to
  arm the daily synthetic job.

## Verification

- RLS matrix 53/53 · a11y operator 5/5 + public 5/5 (WCAG AA) · panorama vitest 556.
- 6 demo journeys: **all flows proven completable** (screenshots: credential minted,
  publish, maltrato queue, admin citizen detail, vet + público). The "failures" were
  recording-spec fragility (now hardened), not product bugs. The durable smoke signal
  is `synthetic-monitor.spec.ts`, now on CI.
- Reunification index: **not warranted** — EXPLAIN shows the optimal plan already; the
  1.5s was micro-instance CPU contention, not a missing index.

## Still needs YOU (PO-gated)

1. **Staging reseed** (#48): temporarily paste staging `DATABASE_URL` into `.env.local`
   → I run `pnpm seed:panorama --allow-remote` (fixes AMBA-on-165-events + exhausted ENO
   pool) → you remove the cred.
2. **One production redeploy** (#49): activates gru1 + all the above on staging. Then
   re-measure (expect cache-hit APIs ~200-300ms vs 961ms, fan-outs ~3s faster).

## Batch 4 (national infra — YOUR decisions, intentionally deferred)

`mimar.ar` domain doesn't resolve · DB compute sizing for national load · Sentry/
observability · rate-limiting at scale · Mi Argentina federation · Ley 25.326
(data-protection) formal review · the report-only comprobante product decisions
(intake should show the DIM code; adoption APP-code resolves nowhere; decomiso label
accents).
