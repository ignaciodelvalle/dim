# Task #38 — Memory-leak / global-degradation diagnosis (2026-07-04)

**Verdict: no application-level memory leak exists in the current build.** The
"RSS grows ~0.5MB/request unbounded" observation from the 2026-07-03
click-through audit is V8 lazy garbage collection plus one-time per-route
module loading — not a leak. Postgres pool exhaustion is refuted. The ~1.5h
global "Cargando…" hang was **not reproducible** under any load pattern tried;
the top remaining hypothesis is host-level memory pressure on the filming
machine (see "Remaining hypothesis").

## Method

Production server (`pnpm start`, build `fFKb4WOWrdL1aiIvsV1Kp` = HEAD
`84d36b89`) instrumented live via the V8 inspector protocol
(`process._debugProcess` → CDP): forced GC before every measurement, sampling
heap profiler, full heap snapshot, active-handle census. ~4,200 requests total
across every suspicious surface. Local Supabase stack up (20h uptime).

## Evidence

### 1. The "0.5MB/request" RSS growth is GC laziness, not retention

| Load (200 req each) | RSS before → after (no GC) |
|---|---|
| `/login` | 327.6 → 388.9 MB (~0.3MB/req) |
| `/_next/static` chunk | 388.8 → 391.2 MB (flat) |
| `/api/cron/*` 401 via middleware | 391.2 → 394.4 MB (flat) |
| 404 page (middleware + root layout) | 394.4 → 396.1 MB (flat) |
| `/adoptar` (DB-heavy) | 396.1 → 415.1 → 416.2 MB (plateaus after first 100) |

Then a single forced GC dropped RSS **416 → 282 MB**. The audit's 327→552MB
curve is the same effect: V8 simply does not collect aggressively when there
is no heap pressure (default max-old-space is ~4GB; 550MB RSS is nowhere near
a limit and is not dangerous).

### 2. Post-GC heap is flat under sustained load (no unbounded retention)

- Mixed anonymous routes, 600 req: heapUsed 186.0 → 189.5 MB, growth decaying
  to +0.1MB/100req by round 5 (asymptotic module warm-up, not linear leak).
- Authenticated operator load (admin@dim.test cookie), 600 req across `/gob`,
  `/gob/analytics`, `/gob/vigilancia`, `/gob/mortalidad`, `/gob/casos`,
  `/admin/alertas`: heapUsed 192.5 → 194.5 MB, latencies flat
  (110–430ms every round, no degradation trend).
- Sampling heap profiler across 150 requests: 0.4MB live retained, no app
  frames retaining per-request data.
- Heap snapshot (187MB file): retained heap is dominated by loaded webpack
  chunk sources + compiled code + shapes (55MB strings, 27MB code, 24MB
  shapes) — static cost of the loaded app, not per-request data. Zero objects
  > 500KB.

### 3. No handle/socket/timer/connection accumulation

- Active handles after 4,200 requests: 1 Server + 5–12 Sockets + ~10 keepalive
  Timeouts. Flat across all runs.
- `pg_stat_activity`: postgres.js pool steady at 10–11 connections, all
  `idle` between requests, across the entire session. The audit itself noted
  "connections flat — not pool starvation"; confirmed. `db/index.ts` is a
  proper module singleton (`prepare:false`, default pool max 10).

### 4. Token-refresh storm (1h JWT expiry) refuted

Because the audit degradation began ~1–1.5h in — suspiciously at
`jwt_expiry = 3600` — an expired access token (minted with the local JWT
secret) + valid refresh token was replayed:

- 48 sequential stale-cookie page loads: every one triggered a server-side
  refresh (Set-Cookie present), all 180–590ms, all 200.
- Storm: 180 refresh-triggering requests in 10s at concurrency 6 (exceeds the
  configured 150/5min `token_refresh` rate limit): zero 429s, zero slowdowns,
  pages still 8–22ms anonymous afterwards.

### 5. Image optimizer (sharp/libvips native memory) clean

420 `/_next/image` transforms (3 source photos × 14 widths × 10 qualities):
heapUsed +1.0MB, RSS +4.0MB, handles flat.

## Remaining hypothesis for the 1.5h hang

The hang ("Cargando…" 30s+ on ALL pages, including previously-instant public
ones, fixed by server restart) was never reproduced, including at comparable
uptime with the same routes the audit saw hang (`/p/DIM-4SUZ-U2HT/sighting`
16ms, `/gob/analytics` ~300ms).

**H1 (top): host memory pressure on the filming machine.** The audit window
(~22:30–23:50) had Chrome + OBS/recording + Docker Desktop + the node server
competing for RAM. Windows trims the node working set under pressure;
subsequent requests page-fault through a swapped-out 550MB process → tens of
seconds of stalls on every page, indistinguishable from "server hung".
Restarting the server "fixes" it because the fresh process has a small,
resident working set. This fits every observation: same build + same session
degrading purely with wall clock, public and DB pages equally affected, DB
connections flat, restart as reliable cure.

**H2 (cannot fully exclude): the audit ran the 2026-07-03 build.** This
diagnosis ran today's build (84d36b89). A leak fixed in between is possible
but unlikely — yesterday's changes (intake idents, admin error boundary)
touch nothing in the render/data path.

## Missing evidence (capture when it next happens)

When the hang next occurs, BEFORE restarting, capture:

1. Host state: Task Manager → commit charge / available RAM; hard-fault rate
   (Resource Monitor) for the node PID.
2. `node -e "process._debugProcess(<pid>)"` then CDP probe (scripts in the
   2026-07-04 diagnosis scratchpad, or simply attach chrome://inspect) —
   `process.memoryUsage()` post-GC tells retention vs drift in one number.
3. `SELECT application_name, state, count(*) FROM pg_stat_activity GROUP BY 1,2;`
4. qa-up server stdout for the degraded window.

## Recommendation

- Keep the "fresh server before filming" protocol as cheap insurance; it is
  NOT evidence of an app defect.
- Do not add pool/timeout tuning or restart cron "fixes" — nothing in the app
  needs fixing on current evidence, and #38 should not block GO on the
  memory-leak theory. The GO-blocker framing should move to H1 (demo-machine
  RAM budget: close Chrome tabs / cap OBS / give the demo machine headroom).
- Task #39 (hydration-dropped login clicks) is unrelated and remains open.
