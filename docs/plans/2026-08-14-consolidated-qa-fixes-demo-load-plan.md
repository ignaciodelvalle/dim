# Consolidated plan — QA fix backlog, per-role demo tours, PBA densification + load tests

**Date**: 2026-08-14 · **Owner**: main agent (autonomous), Ignacio gates marked `[PO]`
**Origin**: QA run CW0813 (2 phases, report `informe-QA-miMAR-CW0813_2.md`), PO directive "hace todo, vos elegís el orden", inventory pass 2026-08-14.
**Prime directive**: extend what exists — do not duplicate. The inventory found prior art for nearly everything (see "Existing assets" per section).

---

## Phase 1 — Code fixes from QA CW0813 (in flight)

### Batch 1 (writer running)
- A4: server-side breed validation with alias/case folding at all pet write sites; canonical label persisted; grandfather rule on edit; `classifyPpp` folds before membership; alta form aligned to edición's `<select>`.
- A3: booking guard per (pet, offering) for `confirmed` appointments; in-tx check + partial unique index migration (next free NNNN, forward-only); Spanish rejection; cancel→rebook preserved.

### Batch 2 (after batch 1 lands; single-writer rule)
- A9: gate the "Check-in post-adopción" entry in `ALL_CAPTURE_OPTIONS` (`app/(app)/mis-mascotas/[publicToken]/anotar/handoff.ts:93`) on adoption context; introduce a shared `isAdoptedByUser(petId, userId)` helper mirroring the checkin page's own gate (`eventos/nuevo/checkin/page.tsx:38-47`).
- B1: chip-collision message variant — branch on `match.pet.ownerUserId === null` (already returned by `lookupByChip`, `lib/infra/chip-lookup.ts:34-57`) to produce an org-custody-without-family message in `create-intake.ts:258-263`.
- C1: server-side last-admin rejection test **already exists** (`src/modules/organizations/__tests__/membership-use-cases.test.ts:818-843`) — verify it covers the QA scenario (single admin of multiple orgs), extend only if a gap is real; report closes the C1 flag.
- Booking confirm UX: pending/disabled affordance until hydration (documented task-#39 dropped-click class, `e2e/crisis-seams.spec.ts:911-916`); stay inside the `useActionRedirect` contract (`check-action-redirect.ts`).
- Cancel-turno confirmation: respect the anti-double-signal rule (`lib/ui/action-feedback.ts:14-24`) — either in-place close + `notifySaved`, or keep reload-as-confirmation and make it visible; NO toast on top of reload.
- Analytics error correlation id: `loadWithTimeout` (`lib/analytics/analytics-load.ts:37-57`) swallows the Error — capture, log via `lib/observability/report-error.ts` shape, generate short id, thread through `AnalyticsLoad` → `AnalyticsLoadFallback` (mirrors `ErrorBoundary`'s `digest ?? "sin código"` + copy button).
- Panorama quick win (PO-approved 2026-08-14, option chosen: keep UX identical): build the KPI cube at the **bienestar landing window (90d)** instead of `PANORAMA_DEFAULT_PRESET` (3y) so the admin first visit hits the cube (`cube-builder.ts:371`, `load-panorama-kpis-cube.ts:82-105`). Structural follow-ups stay documented in engram (`perf/panorama-cube-eligibility-gap`), NOT implemented now: denuncias layer in `CUBE_LAYER_METRIC`, analytics pool retune 2→3-4 (needs staging load test), sparkline/prior-delta deferral.

### Batch 3 (seeds; after batch 2)
- Adoptante persona: `adoptante@dim.test` in `seed-demo-spine.ts` (the established "named pet + named account" home) with a pet carrying `adoption_finalized` (`adopter_user_id` = REAL uuid — note the existing seeds' display-name trap at `seed-storylines-iconic.ts:1641`) + an open `reminders` row of type `post_adoption_checkin`. Unblocks: QA A9 positive path, demo tour persona gap.
- PBA government persona: `gov-pba@dim.test` with Buenos Aires jurisdictions (e.g. La Plata + Quilmes + Morón) — the demo-tour gap: every current govt account is CABA-scoped.
- Bruno dispute (B5): scenario already exists in `seed-demo-spine.ts` — first VERIFY why staging shows "No hay disputas" (spine not run against staging, or dispute resolved); fix is operational (re-run spine) unless code drift is found.
- PBA densification knob: add `PANO_PROVINCE_BOOST` (e.g. `"Buenos Aires:3"`) multiplying per-province pet allocation in `seed-panorama.ts` — global `SCALE` stays untouched so other provinces don't inflate. Keep PANO- idempotency and the deterministic PRNG.

### Gates for every batch
`pnpm verify` AND `pnpm test` as separate commands, output pasted as evidence; work-unit commits, Spanish conventional subjects, no attribution; fresh-context adversarial review over the full commit range BEFORE push.

---

## Phase 2 — Per-role demo tours "hasta el cansancio" (cowork)

**Existing assets (extend, don't recreate)**: 6 recorded per-role videos + generating specs (`e2e/demo/0{1..6}-*.spec.ts`, `docs/demo/videos/INDEX.md`, 2026-07-04, stale vs HEAD); screen-by-screen shot list (`docs/demo/walkthrough-script-2026-07-01.md`); live demo guion with speech validated on staging (`docs/plans/2026-08-02-demo-speech-y-pasos.md` + `-guion-demo-ciclo-completo.md`); 5 onboarding guides + honesty gap inventory (`docs/onboarding/`); cowork brief lineage (`docs/agents/prompt-cowork-clickthrough-*.md`, 5-lens framework); `docs/agents/README.md` contract table.

**Work items**:
1. Write `docs/agents/prompt-cowork-demo-recorridos.md` following the established brief pattern (build check by meta-tag prefix, CW-prefix for created data, OBSERVACIÓN/HIPÓTESIS split, one-account-at-a-time login logistics): 8 tours — público, dueño (`owner@`), adoptante (`adoptante@` — new), veterinaria (`lilian@`), voluntaria (`noeli@`), org admin (`alejo@`), gobierno CABA (`lucas@`), gobierno PBA (`gov-pba@` — new), admin (`admin@`). Each tour: seed data it relies on, step script derived from the walkthrough shot list + speech guion, checkpoints ("qué debe verse"), known gotchas from QA CW0813/TN0813 (e.g. tránsito proposal notification tier, login rate limits 5/min-per-email — use one login per account, x-real-ip does NOT dodge the email limit).
2. Repeatability: tours must be runnable N times — steps that create data use run-prefixes; destructive steps stop-before-submit (same convention as the recorded specs).
3. `[PO]` After fixes deploy + seeds run on staging: launch the cowork run; optionally re-record the 6 videos locally (`pnpm` demo harness) as a follow-up — not blocking.

---

## Phase 3 — PBA densification + load test reflected on the map

**Existing assets**: `seed-panorama.ts` (population-weighted provinces; PBA already top-weighted: 10 metro anchors weight 103, highest coverage targets; knobs `SCALE`/`HISTORY_SCALE`/`PANO_*`; PANO- idempotent, deterministic, `--allow-remote` + local-only guard; staging invocation documented in `2026-07-26-cutover-staging-readiness.md:406`); `scripts/load-probe.ts` + `docs/ops/load-probe.md` (waves × concurrency vs 4 endpoints, p95 targets, cache-header distribution); `pnpm cube:refresh` (per-metric department-row output = the PBA visibility instrument); geo assets already cover all 135 PBA partidos (`ar-departments.geojson`, code prefix 06); k=5 fold logic `build-features.ts:333-354`.

**Sequence (staging, after Phase 1 deploys)**:
1. **Baseline** `[PO: staging env access]`: `cube:refresh` against staging → record PBA department rows per metric (code 06 filter) + `load-probe` baseline p50/p95 with cache-source headers.
2. **Densify**: re-run `seed-panorama.ts --allow-remote` with `PANO_PROVINCE_BOOST="Buenos Aires:3"` + `HISTORY_SCALE=2` (in-code comment marks it as the stress-test lever; measure run time — old SCALE=0.002 ran ~11 min, expect similar order). Session pooler (5432) target per runbook; `register-server-only-stub` import pattern (NOT `--conditions=react-server` — seed-panorama doesn't import server actions).
3. **Rebuild cube**: `cube:refresh` → compare PBA department-row counts vs baseline (k=5 cells cleared = the "se refleja en el mapa" proof), spot-check `/admin/panorama` department grain over PBA.
4. **Load test**: `load-probe` with escalating `PROBE_WAVES`/`PROBE_CONCURRENCY` — ceiling discipline: staging Supabase free tier, session pooler `pool_size` 30 (raised from 15 in the EMAXCONNSESSION incident, `db/index.ts:206-219`), analytics `max: 2` per lambda ≈ 8 backends per cold user → keep concurrency ≤ 9 unless we deliberately probe the ceiling; zero-5xx is the pass bar; capture `x-kpi-source`/`x-layer-source` to confirm cube-vs-live (validates the Batch 2 quick win under load).
5. Fold results + the staging seed pattern into `docs/ops/` (env-handling gap the inventory flagged).

**Non-goals now**: sub-partido PBA geometry (new geo assets — separate decision), k6/artillery adoption (load-probe suffices at this scale), analytics pool retune (needs its own supervised test).

---

## Execution order & PO gates

1. Batch 1 → Batch 2 → Batch 3 (single writer, review between none, one adversarial review over the whole range) → push `[PO gate: apply new migration(s) to staging DB via session pooler BEFORE or immediately after the Vercel auto-deploy]`.
2. Write the cowork demo-tour brief (Phase 2 item 1) — pure docs, can land with the same push.
3. Staging ops runbook execution (Phase 3) — needs `[PO]` for staging env/credentials at the console; agent drives, Ignacio unlocks.
4. Cowork marathon run `[PO launches in the cowork conversation]`.

**Single list of things only Ignacio can do** (batched, per working agreement): apply migrations to staging DB; provide/confirm staging env for seed+cube+probe runs; launch the cowork run; two product calls already made for him to veto: KPI cube window → 90d; adoptante/gov-pba account names.
