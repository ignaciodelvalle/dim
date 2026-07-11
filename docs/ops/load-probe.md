# Load probe — `scripts/load-probe.ts`

A repeatable concurrency probe against DIM/MiMAR's hottest endpoints: the
three panorama analytics routes (`/api/panorama/kpis`, `/api/panorama/perdidas`,
`/api/panorama/cobertura`) and the liveness check (`/api/health`). It reports
per-endpoint p50/p95/max latency, error/degraded counts, and cache-header
distribution, then PASS/FAILs against latency and error-rate targets.

Run it: before a demo (catch a cold environment before a funcionario does),
and after any infra change that could shift latency or caching — a migration,
a Supabase plan change, a change to the panorama cache TTLs, a Vercel region
or plan change, a dependency bump touching the DB pool.

## Running it

```bash
# Local — against `pnpm dev` / `pnpm start` on :3000
pnpm probe:load

# Staging
PROBE_URL=https://dim-staging.vercel.app pnpm probe:load
```

Defaults: 3 waves of 6 concurrent requests per endpoint. Override with
`PROBE_WAVES` / `PROBE_CONCURRENCY` env vars for a heavier or lighter run.

Exit code is `0` on overall PASS, `1` on overall FAIL — safe to wire into a
CI job or a pre-demo checklist script later. It is intentionally **not**
wired into `pnpm verify` — this is a live-environment probe, not a static
check, and has no place gating every commit.

## Auth

The probe needs a session to call the panorama routes (admin/govt only — see
`app/api/panorama/_guard.ts`). It logs in headlessly as the demo govt account
(`govt@dim.test`, see `e2e/demo/_helpers.ts` `ACCOUNTS.govt` +
`SHARED_PASSWORD`) by calling the Supabase auth REST API directly with
`@supabase/supabase-js` and reconstructing the `@supabase/ssr` session cookie
— the same technique `scripts/qa-session.ts` uses. No browser, no Playwright.

This works whenever `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
in `.env.local` (or `.env`) point at the same Supabase project the target
origin authenticates against — true for local (`http://localhost:3000` next
to the local Supabase stack) and for staging today (one shared project).

If that ever stops being true (a WAF in front of a target, a Supabase project
the local env doesn't have keys for, etc.), skip headless login by setting
`PROBE_COOKIE` to a session cookie captured from a real browser:

1. Log in as `govt@dim.test` at the target's `/login` in a real browser.
2. Open DevTools → Application/Storage → Cookies, copy the full value of the
   `sb-<project-ref>-auth-token` cookie (or all its `.0`, `.1`, … chunks if
   the session was split — see the comment in `scripts/qa-session.ts` for why
   that happens).
3. Run:
   ```bash
   PROBE_URL=https://dim-staging.vercel.app \
   PROBE_COOKIE='sb-<ref>-auth-token=<value>' \
   pnpm probe:load
   ```

## What gets measured

For each endpoint: `WAVES` sequential waves of `CONCURRENCY` concurrent
requests (default 3×6 = 18 requests). Latency is measured from request start
to full body read (matches what a real client pays, not just TTFB).

- **p50 / p95 / max** — latency distribution across all requests for that
  endpoint.
- **5xx** — server errors or fetch failures. Any 5xx is an automatic FAIL for
  that endpoint (a live `/api/health` 503 during a real degraded state is
  correctly flagged here too — that IS the signal the probe exists to catch).
- **4xx** — reported but does not fail the probe on its own (e.g. a rate
  limit tripped by the probe's own concurrency, not the app under normal use).
- **cache distribution** — value counts of `x-kpi-cache` / `x-layer-cache`
  (`hit` / `miss`), read straight off the response headers set by
  `app/api/panorama/kpis/route.ts` and `app/api/panorama/[layer]/route.ts`.

## Targets and what they mean

| Target | Default (local) | Default (remote) | Override |
|---|---|---|---|
| `/api/health` p95 | < 500ms | < 1000ms | `PROBE_HEALTH_P95_MS` |
| Panorama API p95 | < 800ms | < 800ms | `PROBE_API_P95_MS` |
| 5xx anywhere | 0 | 0 | — |

These are baselines measured against a locally seeded (small) database and
the staging deployment, not universal SLOs — retune them with `PROBE_*_MS`
if the seed data grows or the deployment topology changes materially.

**Cold-cache caveat**: the panorama routes cache KPI/layer results server-side
(`x-kpi-cache` / `x-layer-cache`). The FIRST wave against a cold cache is a
miss and pays the full query cost, which can push that endpoint's p95 over
target even though every subsequent wave is a fast cache hit. A single-wave
FAIL driven by one slow miss in an otherwise-fast run is expected — read the
cache distribution line, not just the FAIL, before treating it as a
regression. A real regression shows hits that are ALSO slow, or a p95 that
stays high across all three waves.

## Sample local run

Captured against a local `next start` on `:3000` with the local Supabase
stack running and seeded data (`pnpm seed:panorama`):

```
====================================================================================================
  DIM/MiMAR LOAD PROBE REPORT
  Target: http://localhost:3000   Waves: 3 x 6 concurrent
====================================================================================================
  Endpoint     reqs   p50       p95       max       5xx   4xx   Result
  ------------------------------------------------------------------------------------------------
  kpis         18     155ms     1185ms    1185ms    0     0     FAIL
    ✗ p95 1185ms exceeds target 800ms
    cache (x-kpi-cache): miss=6, hit=12
  perdidas     18     172ms     230ms     230ms     0     0     PASS
    cache (x-layer-cache): miss=6, hit=12
  cobertura    18     153ms     773ms     773ms     0     0     PASS
    cache (x-layer-cache): miss=6, hit=12
  health       18     26ms      33ms      33ms      0     0     PASS
====================================================================================================

  OVERALL: FAIL
```

Reading this one: `kpis` FAILed on p95, but the cache distribution shows only
the first wave (6 requests) missed — the other 12 were hits, and `perdidas`/
`cobertura` (same cache mechanism) passed comfortably. This is the cold-cache
caveat above, not a regression — running the probe again immediately after
(cache already warm from the run above) confirmed it:

```
  Endpoint     reqs   p50       p95       max       5xx   4xx   Result
  ------------------------------------------------------------------------------------------------
  kpis         18     129ms     162ms     162ms     0     0     PASS
    cache (x-kpi-cache): hit=18
  perdidas     18     133ms     143ms     143ms     0     0     PASS
    cache (x-layer-cache): hit=18
  cobertura    18     139ms     154ms     154ms     0     0     PASS
    cache (x-layer-cache): hit=18
  health       18     22ms      29ms      29ms      0     0     PASS

  OVERALL: PASS
```

Treat a lone FAIL driven by first-wave misses as a prompt to re-run and check
the cache split before opening an issue — a real regression shows hits that
are ALSO slow, or a p95 that stays high across all three waves.
