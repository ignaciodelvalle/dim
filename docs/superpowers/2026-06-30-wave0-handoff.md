# Handoff — 2026-06-30 (continue on another machine)

> Branch: `integration/session-review` (PR **#746**). Everything below is committed + pushed.
> To resume elsewhere: `git fetch && git checkout integration/session-review && git pull`, then
> bring the local stack up (`pnpm db:start`) and **re-run the seed** (`pnpm seed:panorama`) — the
> seed now includes the B2 compliance backfill, so the new machine's local DB gets the same data.

---

## 1. Strangler migration — DONE ✅ (the big one)

All **61/61** fat `app/actions/*.ts` files migrated to `src/modules/<domain>/application/` use-cases;
each is now a thin shim. Verified per-file (tsc + parity tests or line-diff) and committed individually.

- Canonical checklist: `docs/superpowers/plans/2026-06-26-strangler-finish-plan.md` (all `[x]`).
- `rule-impact-preview.ts` left as-is (already thin — logic in `lib/`).
- **Post-migration remediation** (all green now):
  - `check-authz-guards` convention: whole-body moves hid the auth guard from the shim → restored
    (lift guard to shim, or `// @no-auth-required:` for interleaved/anonymous). 44 funcs / 27 shims.
  - `check-dependency-direction`: allowlisted 3 real cross-module edges (alerts→surveillance,
    pets→custody, search→organizations).
  - `notification-cta-fitness`: annotated 5 pre-existing info-status notifications with `// no-cta:`.
  - **CRITICAL bug found by `pnpm dev` (NOT by tsc/vitest):** 4 use-server shims (auth, password-reset,
    subject-rights, alert-subscriptions) used bare `export { x } from "..."` re-exports → Next.js
    500s every page importing them. Fixed with async-function wrappers (commit `c75ea8f5`).
    **Lesson: after action migrations, run `next build` — tsc + unit tests do NOT exercise the Next
    "use server" compiler boundary.** See engram `strangler/use-server-reexport-gotcha`.
- Status: tsc ✅ · lint:authz/deps/actions/rls/ui/tokens/lib-root ✅ · full suite **6745 pass**
  (1 flaky hook-timeout in `admin-institutional.test.ts` under parallel load — passes isolated).

## 2. Wave 0 (demo/QA blockers) — 4 of 6 closed

| # | Item | Status |
|---|------|--------|
| 0.1 | Omnibox PII await | ✅ already awaited (verified) |
| 0.4 | Crash `/casos/[publicCode]` (PANO-CASE-DISPUTE-0000) | ✅ resolved — case exists, query null-safe; was local desync |
| 0.3-B1 | ForecastChart empty | ✅ guards already present; added test (`__tests__/forecast-chart.test.tsx`) |
| 0.3-B2 | Microchip / Antirrábica 0% | ✅ **fixed** — see below |
| 0.3-B3 | Panorama map blank on first paint + no zoom | 🔴 **OPEN (partial)** — see below |
| 0.2 | Operator session expires ~1-2 min | 🔴 **OPEN — needs live repro** |

### B2 (fixed) — `scripts/seed-demo-compliance-coverage.ts` (wired into `seed-panorama.ts`)
- Root cause: `fetchMicrochipPenetration` reads `pet_identifications` (was ~16 rows vs 66k pets → 0%);
  `fetchRabiesCoverage` scopes by the payload keys `pet_jurisdiction_province/locality` which the
  seed's vaccination events lacked → 0% in govt/province views.
- Fix (idempotent, local-only): INSERT microchip `pet_identifications` for a per-province varied
  fraction (24–54%); `pet_events` is **append-only** so INSERT new province-keyed rabies events
  (28–55% per province, within the 12-month window) rather than UPDATE.
- Verified: no metric reads 0% universally; outliers vary realistically per province.

### B3 (OPEN) — Panorama map blank + no zoom — `components/panorama/`
- **Done (partial, committed):** the admin page never passed `initialBounds`, so `SituationalMap`
  could only fit to the active layer's feature bbox. Now computes the province bbox from
  `localityCentroids` and passes it (`app/admin/panorama/page.tsx`). **User reports it's still not
  visibly fixed.**
- **Still open:** the **blank map on first paint** persists in the browser even though the default
  layer `perdidas` HAS province data (Córdoba 659, BA 588, … 4083 events in 3y). So it's a RENDER
  issue, not data. Where to look next:
  - `components/panorama/PanoramaConsole.tsx` (802 lines) — the client orchestrator. `asOf` starts
    `null` (not scrubbing) and `defaultFeatures` (perdidas/province) are seeded into `provinceDataRef`
    on mount — confirm those features actually reach the choropleth source on first paint.
  - `components/panorama/SituationalMap.tsx` — the MapLibre choropleth: confirm the fill-color
    expression binds to the seeded `defaultFeatures` before any client `/api/panorama/[layer]` fetch
    resolves. Suspect the first paint clears/overwrites the seeded features.
  - Verify what `getLayerFeatures("perdidas", actor, [], {since}, "province")` actually returns for
    admin-universal (couldn't curl — operator-gated). If empty, it's a scope bug in
    `src/modules/panorama/application/get-layer-features.ts`.
  - Also apply the same `initialBounds` wiring to `app/gob/panorama/page.tsx` (not done).
  - The handoff `docs/demo/handoff-demo-blockers-cc.md` B3 suggested: default to a POPULATED layer +
    don't start temporal playback dimmed. Consider defaulting the layer to `cobertura` (now seeded).

### 0.2 (OPEN) — Operator session expires ~1-2 min — needs live repro
- Confirmed NOT a code/config bug from inspection: `supabase/config.toml` `jwt_expiry = 3600` (1h),
  `lib/supabase/middleware.ts updateSession` is the standard SSR pattern, no idle/maxAge timeout in
  app code. A 1-2 min expiry with a 1h JWT points to refresh-token-rotation under concurrency
  (`enable_refresh_token_rotation=true`, `refresh_token_reuse_interval=10`) OR a runtime mismatch.
- **To resume:** log in as operator, keep the dev-server log open, and watch for the session drop
  (redirect to `/login` / 401). Try bumping `refresh_token_reuse_interval` and restarting Supabase,
  or narrowing the `middleware.ts` matcher so it doesn't `getUser()` on every asset request.

## 3. Other pending project work (from the consolidated handoff)
`docs/superpowers/2026-06-26-CONSOLIDATED-handoff-CC.md` is the master plan. After Wave 0:
Wave 1 (perf: caching, next/image, pooler), Wave 2 (crons: pets.status reconciliation 2.1, meta-cron
health-check 2.2), Wave 3 (design-system scale tokens 3.1), Wave 4 (features — bulk-revoke UI is ½ day).
Product/legal decisions blocking CC: retention policy, physical-tag §15, /gob/analytics→Panorama.
