# Auth floor + panorama perf breakdown (Batch 3.1)

**Date:** 2026-07-10 · **Branch:** integration/all-20260703 · **Mandate:** MEASURE
the per-request auth/profile floor, deliver a breakdown + proposal. **Do NOT
touch the auth path** (PO instruction). This report honors that: the finding is
that the floor is *infrastructural (cross-region), not code* — so the fix needs
no auth-path change at all.

## The measurement

| Probe | What it isolates | Measured (staging, iad1 functions → sa-east-1 DB) |
|---|---|---|
| `GET /api/panorama/*` anon (401) | auth chain only — `getUser()` fails, returns before any data query; includes lambda cold start | ~2.5–3.0s |
| `GET /api/panorama/kpis` authed, **full cache HIT** | auth chain + cached read, **zero DB compute** | **961ms warm** |
| `GET /api/panorama/kpis` authed, cache MISS | auth chain + 11-statement fan-out | 6.8–21s |

The 961ms *warm, fully-cached* number is the key one: with no compute at all, a
request still costs ~1s. That is ~3 sequential cross-region round-trips of
~300ms each:

1. `supabase.auth.getUser()` → GoTrue (cross-region)
2. `getProfileCached(user.id)` → Postgres (cross-region)
3. `getJurisdictionsCached(profile.id)` (govt only) → Postgres (cross-region)

(`_guard.ts:51,54,59,78` — three awaited network hops, request-cached within a
request but paid fresh on every new request.)

## Root cause

Vercel functions ran in **iad1** (US-East, the default) while Supabase lives in
**sa-east-1** (São Paulo). Every auth/DB round-trip crossed a continent (~300ms
RTT). The auth floor is not the profile query being slow — it is *three of them
in series over a 300ms link*.

## Proposal (no auth-path code change)

1. **Pin functions to `gru1`** (São Paulo, same region as Supabase AND closest
   to Argentine users). — **DONE** in `vercel.json` (`189259f2`); activates on the
   next production redeploy. Expected: the 3 auth round-trips drop from ~900ms to
   ~30ms total; cache-hit APIs land ~200–300ms, fan-outs shed ~3s of pure network.
2. **(Optional, post-redeploy re-measure)** if the auth chain is still a
   meaningful share after gru1: collapse hops 2+3 into one query (profile JOIN
   jurisdictions) behind the existing request-cache. Only if measurement justifies
   it — do not pre-optimize. This is the *sole* item that would touch auth-adjacent
   code, and it is deferred pending gru1 numbers.

## Also confirmed this batch

- **Reunification index: NOT warranted.** `EXPLAIN ANALYZE` on staging shows the
  optimal plan already (bitmap index on `pet_events_event_type_occurred_at_idx`,
  all shared-buffer hits, no seq scan). The 1.5s was pure micro-instance CPU
  contention, not a missing index. No speculative index shipped.
- **Death-spiral guardrail live.** `0136_stuck_backend_reaper_pg_cron` runs every
  minute on staging (verified via `cron.job_run_details`) terminating only
  Supavisor backends stuck past every app budget.

## Verdict

The auth floor is **cross-region latency, fully addressed by the gru1 pin already
committed**. No auth-path code change is required or recommended before national
deployment. Re-measure on staging after the single final redeploy to confirm the
~700ms saving lands.
