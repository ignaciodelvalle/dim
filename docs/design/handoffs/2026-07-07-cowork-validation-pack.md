# Cowork validation pack — full-persona click-through (staging)

**URL:** https://dim-staging-8bp1zu2xv-ignacio-dim.vercel.app
**Password for ALL accounts:** `Test1234!`
**Date:** 2026-07-07 · Staging is the funcionarios' first look — validate like a real user, click by click.

## Mission

Validate that EVERY persona completes its real-world journey end-to-end by clicking through the UI (no API shortcuts). Report per-persona verdicts: COMPLETE / CONDITIONAL / BROKEN, with severity (BLOCKER / MAJOR / MINOR / INFO) + screenshot per finding. First load after idle can take ~10-15s (serverless cold start) — that's known, don't report it again.

## Context from previous passes (don't re-litigate)

- Owner core journey (credential, libreta, QR, share) — already validated ✅
- Operator govt journey (panorama, maltrato queue, case close) — already validated ✅
- MPF export was failing (`signed_url_failed`) — **just fixed at DB level (schema grants); re-confirm it as part of Persona 5**
- Operator omnibox searches PERSONS + CASES by design, never pets — don't report pet-search misses
- `/gob/cola`, `/gob/moderacion`, `/gob/disputas` empty for govt CABA = seed scope, expected
- Cold-start login 12-15s = serverless, known

## Persona 1 — OWNER can do EVERYTHING (`owner@dim.test`)

The deepest pass. Rocco (`DIM-DEMO-0001`) is this account's demo dog with clinical history.

1. **Alta**: register a NEW pet (foto optional) → credential appears in /mis-mascotas.
2. **Credential**: open the new pet → credential mounts, flips, QR renders.
3. **Events**: add a weight record + a vaccine (declared) → both appear in historial; try to EDIT an event → should only allow amendment/correction (append-only), never destructive edit.
4. **Libreta**: open Rocco's libreta → vaccines/timeline render; share the libreta → link appears INSTANTLY in "Enlaces activos"; open the shared link in incognito → renders with AR-local timestamps; revoke it → link dies.
5. **Lost mode**: mark the NEW pet (not Rocco) as lost → disclosure step (choose phone only) → public /p page shows lost banner + call CTA, NO address/location leak; /perdidas lists it; mark found → public page back to normal.
6. **Transfer**: start an ownership transfer of the new pet to `owner2@dim.test` → owner2 logs in, accepts → pet now under owner2. (This is the deepest owner flow — if it dead-ends, BLOCKER.)
7. **Account**: /cuenta loads (no infinite spinner), profile edit works, logout works.
8. **Reminders/notifications**: check the bell — no duplicates, no phantom items.

## Persona 2 — ORG / SHELTER (`orgadmin@dim.test` → Refugio Test `DIM-UATE-YXZK`)

Also available: `alejo@dim.test` is admin of Refugio Patitas del Norte (`DIM-389S-JFKJ`), Clínica Veterinaria Recoleta (`DIM-9XKC-ZDQK`), Red de Rescate Puerto Madero, Mascotas BA Centro — use him if a flow needs a bigger org.

1. **Console**: /org → pick the shelter → dashboard renders with its pets/queues.
2. **Custody intake**: register a pet under shelter custody (intake) → appears in the org's pet list.
3. **Adoption cycle (the big one)**: publish that pet for adoption → it appears on PUBLIC /adoptar (check in incognito) → as `owner2@dim.test` submit an adoption application → back as org: see the application, approve it → finalize the adoption → ownership transfers. Any dead-end = MAJOR.
4. **Foster**: assign a foster (noeli@ and graciela@ are foster members of Patitas del Norte — use alejo@ there if Refugio Test has no foster).
5. **Org events**: record a pet event from the org console (can_write_pet_events).

## Persona 3 — VET (`vet@dim.test`, individual vet in Refugio Test; `lilian@dim.test` in Clínica Recoleta)

1. **Clinic surface**: log in as lilian@ → org picker → Clínica Veterinaria Recoleta → the clinic console (Atender) renders.
2. **Atender walk-in**: resolve Rocco by token `DIM-DEMO-0001` → sign an Antirrábica vaccine → success.
3. **Cross-POV seam**: log in as owner@ → Rocco's libreta shows the VERIFIED vaccine signed by the clinic (vs declared).
4. **Vet identity**: vet profile shows matrícula; onboarding/membership state is coherent.

## Persona 4 — ANON / CITIZEN (no login, incognito)

1. **Landing** `/` renders (scroll narrative), `/leyes` knowledge base loads.
2. **Public credential**: /p/DIM-DEMO-0001 → public view, NO owner PII (no DNI, no address, no phone unless lost-disclosed).
3. **/perdidas** board renders; **/adoptar** lists the org's published pet (from Persona 2).
4. **Denuncia anónima**: complete the anonymous maltrato report wizard (pick CABA location) → confirmation with reference code. This is a critical citizen path — any dead-end = BLOCKER.
5. **Signup**: create a brand-new account end-to-end → lands as OWNER (never admin/govt) → onboarding completes.

## Persona 5 — ADMIN + GOVT spot-checks (`admin@dim.test`, `govt@dim.test`)

1. **Moderation seam**: the anonymous denuncia from Persona 4 appears in admin moderation → pass it to triage → govt@ sees it in /gob/maltrato (CABA).
2. **MPF re-test (was the last MAJOR)**: govt@ → /gob/maltrato → open a case → assign → close → **Exportar MPF → the PDF must download now** (fix went in at DB level today).
3. **Omnibox**: search "Lucía" (person) and a case code — both resolve.
4. **Admin users**: /admin/usuarios renders, user detail loads.
5. **Panorama**: still renders (map + KPI ribbon + presets).

## Reporting format

Per persona: verdict + step table (step → OK/FAIL → evidence). Global summary: what blocks the funcionarios demo (if anything), what's polish. Screenshots named `p{persona}-{step}-{slug}.png`.

---

## Ronda nocturna (automated QA-night toolkit)

The staging origin **changes on every deploy** — there is no fixed URL. The current one lives in the per-session scratchpad file `…/scratchpad/staging_url` (first line = origin). The PO supplies the current URL; automation reads it. All specs resolve the base URL via `e2e/_base-url.ts` in this order: `STAGING_URL` env (wins) → file at `STAGING_URL_FILE` env → the scratchpad `staging_url` file → `http://localhost:3000`.

> **URL placeholder:** `STAGING_URL=https://dim-staging-<current-deploy>.vercel.app` — replace `<current-deploy>` with tonight's deploy before running anything below.

### Re-test list — previously-broken flows now marked FIXED (confirm each)

These were fixed in prior passes; the night round must CONFIRM them, not assume:

| Flow | Persona | What to confirm | Status |
|---|---|---|---|
| Ownership transfer owner→owner2 accept | 1 | recipient accepts, ownership moves, no dead-end | FIXED — confirm |
| Signup → lands as OWNER | 4 | brand-new account, never admin/govt, onboarding completes | FIXED — confirm |
| Denuncia moderation seam (anon → admin → govt /gob/maltrato) | 4→5 | flagged report traverses all three POVs | FIXED — confirm |
| Revoke / lost-cache honesty (`Cache-Control: no-store` on `/p`, `/libreta/compartir`, `/adoptar`, `/casos`, `/perdidas`) | 4 | revoked share dies instantly; found pet stops showing SE BUSCA at the exact URL | FIXED — confirm |
| Adoption → adopter ownership transfer | 2 | approve + finalize moves custody to the adopter | FIXED — confirm |

### New features to validate this round

- **Hero "credencial viva"** — the landing/credential hero renders the live credential animation (flip, QR) without layout jank.
- **`/funcionalidades`** — the new feature-inventory page loads and its links resolve (no 404s).
- **Panorama zoom divisions at z ≥ 6.5** — zooming past ~6.5 discloses administrative divisions (localities) on the choropleth; below it, provinces only.
- **KPI decimals in es-AR** — dashboard/panorama KPIs format numbers with es-AR separators (`1.234,5`), not en-US.
- **Degraded-KPI honesty** — when a KPI can't be computed (missing data), the tile says so explicitly (no silent zeros / fake precision).

### Automated: race battery + synthetic monitor

Two committed Playwright suites aimed at the deployed staging origin (both under `e2e/`):

**1. Race battery — `e2e/race-battery.spec.ts`** — deterministic concurrency races from parallel browser contexts. Each test creates what it races on and asserts on FINAL STATE (exactly one winner, loser fails cleanly):
- (a) double-submit share-link generation → exactly one new active link
- (b) govt + admin assigning the same denuncia at once → single owner, clean conflict for the loser
- (c) two owner2 sessions accepting the same fresh transfer → ownership transfers exactly once (self-restores demo state via a round-trip)
- (d) concurrent withdraw of one adoption application → resolves cleanly (skips if owner2 has no pending application)

```bash
STAGING_URL=https://dim-staging-<current-deploy>.vercel.app \
  pnpm exec playwright test e2e/race-battery.spec.ts \
  --config=playwright.local3000.config.ts --workers=2
```

Tolerant of ~10s serverless cold starts; self-skips (never false-fails) when a precondition fixture is absent. Runs serially (mutating multi-actor journeys). Keep `--workers=2` max — the staging DB is free-tier.

**2. Synthetic monitor — `e2e/synthetic-monitor.spec.ts` + `scripts/qa-monitor.ps1`** — the 4 critical flows, fast (< 2 min warm): (a) owner login + credential; (b) anon `/p/DIM-DEMO-0001` → 200, no owner PII, `Cache-Control: no-store`; (c) govt maltrato actionable rows + panorama canvas paints ≤ 60s; (d) anon denuncia wizard → reference-code screen (submits a real minimal denuncia clearly marked **"PRUEBA SINTÉTICA"** so operators can ignore it).

Loop it overnight — logs pass/fail + per-flow timing to a rotating file under `docs/design/handoffs/qa-monitor-logs/`, and prints a loud red **ALERT** banner on any failure:

```powershell
pwsh scripts/qa-monitor.ps1 -IntervalMinutes 30 -StagingUrl https://dim-staging-<current-deploy>.vercel.app
# one-shot:
pwsh scripts/qa-monitor.ps1 -Once -StagingUrl https://dim-staging-<current-deploy>.vercel.app
```

> **Note (denuncia noise):** flow (d) files one real denuncia per cycle, marked "PRUEBA SINTÉTICA" in the free-text. Operators should filter these out; over a full night at 30-min cadence that is ~16 synthetic reports.

> **⚠️ Deploy-health caveat (2026-07-07):** at the time this toolkit landed, the staging origin in the scratchpad file was returning Vercel's `Deployment has failed` fallback page (HTTP 200, title "Deployment has failed") on every route — so all monitor flows fail LOUD and `/p` returns `Cache-Control: public, max-age=0, must-revalidate` (the failed-deploy default, NOT the app's `no-store`). Before reading a red monitor as a code regression, confirm the deploy actually built. The `no-store` policy IS in the code (`middleware.ts` + `lib/infra/public-cache-policy.ts`); it only appears once a healthy build is deployed.
