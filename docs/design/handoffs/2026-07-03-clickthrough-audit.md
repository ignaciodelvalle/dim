# Clickthrough audit — 2026-07-03

> Cowork fills Fase 1-3 below. This header is CC's Definition of Ready block
> (Fase 0), produced per the plan and the handoff contract
> (docs/design/handoffs/README.md).

## Environment (Definition of Ready — CC)

| Item | Value |
|---|---|
| Branch | `integration/all-20260703` |
| SHA | `71fe2bb0` (qa-up certified: "Build is fresh relative to HEAD (71fe2bb0)") |
| DB | Fresh `pnpm db:bootstrap` (full reset + migrations + base seeds), 2026-07-03 |
| Seed chain | `pnpm seed:demo` → `node --import ./scripts/register-server-only-stub.mjs --import tsx scripts/seed-demo-spine.ts` → `pnpm seed:panorama` → `pnpm seed:demo:scenario` |
| demo:verify | ✅ ALL GREEN (10/10 invariants — includes event_amended beat, alert firing, coverage-below-target) |
| pnpm verify | ✅ `VERIFY_EXIT=0` @ 71fe2bb0 (typecheck+biome+lints+build, "Compiled successfully in 17.5s") |
| pnpm test | ✅ 7126 passed on fresh DB. ONE known exception: `pet-cache-rederivation` flags a SEED bug (identification/cache columns written without events — S002/S009, filed as follow-up task), NOT app code. Zero demo-beat pets affected. |
| Build | ✅ prod `pnpm build` @ 71fe2bb0 ("✓ Compiled successfully in 24.9s") — NOT dev |
| URL | http://localhost:3000 (prod server via qa-up, morning's stale server killed first) |
| Password universal | `Test1234!` |

### Gates HTTP pre-browser (CC, curl @ 71fe2bb0)

`/login` `/adoptar` `/perdidas` `/refugios` `/denuncias/nueva` → **200** ·
`/p/DEMO-PET-001` `/p/DIM-4SUZ-U2HT` `/p/DIM-BU4K-QRZU` → **200**.

**qa-up warning:** `refugio@dim.test` missing from seed — use `orgadmin@dim.test`
for the Segmento 3 org actor (exists, password universal). Filed with the seed
follow-up.

**Plan correction (for the next run):** the plan's `pnpm tsx scripts/seed-demo-spine.ts`
fails on the `server-only` guard — spine needs the stub loader like its siblings:
`node --import ./scripts/register-server-only-stub.mjs --import tsx scripts/seed-demo-spine.ts`.

### Env config confirmed

| Variable | State |
|---|---|
| DATABASE_URL | `postgresql://postgres:***@127.0.0.1:54322/postgres` (local) ✅ |
| NEXT_PUBLIC_SUPABASE_URL | `http://127.0.0.1:54321` ✅ |
| SUPABASE_SERVICE_ROLE_KEY | set (local dev key) ✅ |
| CRON_SECRET | **NOT set** — manual cron gates unavailable unless Ignacio adds one to `.env.local` |
| DNI_HASH_PEPPER | not set (test default applies) ✅ |
| NEXT_PUBLIC_DEMO_MODE | **NOT set → demo banner OFF.** demo:verify recommends `true` for `/admin/*` demos — Ignacio's call (requires rebuild). Note the banner state on every screen either way. |

### Cuentas (password `Test1234!`)

| Actor | Email | Entrada |
|---|---|---|
| Dueño | `owner@dim.test` (alt: `owner2@`) | `/inicio` |
| Vet clínica | `alejo@dim.test` | `/org/…` |
| Org refugio | `orgadmin@dim.test` (`refugio@` NOT seeded — see warning above) | `/org/…` |
| Govt CABA | `govt@dim.test` (alt local: `govt-local@`) | `/gob` |
| Admin | `admin@dim.test` | `/admin` |

(Also seeded: carla, graciela, ignacio, lilian, lucas, noeli, vet — plus qa-debug-*
residue accounts from e2e; ignore those.)

### Tokens fijos (post-seed, queried 2026-07-03)

| Beat | Token |
|---|---|
| Pet con `event_amended` (beat Libro / D0-3) | `DEMO-PET-001` — **"Rocco"** post-polish |
| Pet perdido (credencial Tier-1) | `DIM-4SUZ-U2HT` (Michi) |
| Org refugio verificado | `DIM-EE4N-G2M9` (**Refugio Esperanza Animal**, ex "Refugio Test") |
| Pet activo (credencial Tier-0) | `DIM-BU4K-QRZU` |
| Oferta turno antirrábica (Segmento 1 booking) | `DEMO-SVO-RABIA-01` — Clínica Veterinaria Recoleta, 160 slots lun-vie 09-13 ART |

Public credential URLs: `http://localhost:3000/p/<token>`.

### Data polish (post-DoR, PO request 2026-07-03)

`pnpm seed:demo-polish` ran against this environment: owner@ curated to 4
pets (Firulais, Michi, Atún, Rocco — full identity + photos + libretas
12-20 events), 18 renames (DEMO/QA/e2e names → es-AR pet culture), 17
surplus ownerships redistributed to other seeded humans, 66k PANO pets
got clean human names + breed/color/DOB, 53 placeholder photos
(species-aware, warm palette) across owner/adoptable/lost/org-portal
sets, antirrábica offering + slots created for the booking beat.
demo:verify re-run: ALL GREEN. Note for filming: photos are generated
placeholders (silhouette + initial), not real animal photos.

### Fixes A/B/C shipped this session (gate references)

- **A** amendments → projections: commit `3803ae1e` (timeline shows corrected
  values + badge; compliance/summary/nudges/sparkline read corrections).
- **B** cron fleet: commit `5cc5ef11` (all 21 crons record telemetry; SSOT
  registry; drift reason in cron-health; parity fitness test).
- **C** vaccine cadence: relatedEventId nulled on cron inserts + archive keeps
  throttle + 2nd-emit regression test.
- Bonus: `/admin/censo` funnel 500 on deceased-pet-with-ISO-chip fixed
  (`cd2714e6`) — Segmento 4 screen.

### Beat-state pass (CC, post-polish 2026-07-03 evening)

Direct DB fixes so no beat films empty (all through faithful shapes):

- **Inbox owner@**: 8 stale notifications referencing pre-polish names ("QA
  Ronda2 Perro") archived. One `vaccine_due` notification present with the
  exact cron shape (title "Antirrábica anual", body "Atún tiene una vacuna
  programada en 9 días.", CTA `/mis-mascotas/DIM-VT3V-SEA3/eventos/nuevo/
  vacuna?reminderId=…`) — the fix-C beat is filmable.
- **Vencimientos**: stale overdue pregnancy reminders on Michi closed; Atún
  has "Antirrábica anual" due in 9 days (amber due-soon).
- **Vet agenda (Segmento 2)**: 4 confirmed turnos Mon 09:00-09:45 ART at
  Clínica Veterinaria Recoleta (Blue, Chicha, Cielo, Courage). NOTE: booked
  Monday because prep ran Friday night — **film Segmento 2 on a weekday**.
- **Michi stays LOST on purpose** — she IS the documented lost-pet beat
  (DIM-4SUZ-U2HT). Expect the lost banner on owner@'s home.
- **Shelter portals**: Esperanza Animal 4 pets, Patitas del Norte 5 — not
  empty; the Segmento 3 short flow gets created on camera.

Open PO calls before recording: (1) real photos for owner@'s 4 pets —
current ones are tasteful placeholders but read as placeholders in close-ups;
(2) NEXT_PUBLIC_DEMO_MODE banner on/off (rebuild needed if on); (3)
CRON_SECRET in .env.local only if the manual cron gates are wanted.

### Final GO pass (CC, 2026-07-03 late — all PO calls resolved)

- **Server rebuilt @ `bf765974`** with `NEXT_PUBLIC_DEMO_MODE=true` baked in —
  the "Datos de demostración" banner shows ONCE per screen (global on
  /admin/*, panorama-local under /gob). CRON_SECRET set; all 21 cron routes
  triggered once with it (all 200) — /admin/sistema/crons now shows a full
  telemetry baseline instead of 21× "never_ran".
- **Real photos wired for 3 of owner@'s 4 pets** (Firulais + Rocco = the two
  border collies, breed/color updated to match; Atún = the siamese; the
  IG-sticker band was cropped off Rocco's photo). Michi keeps a generated
  placeholder — no cat photo left; fine for the lost-pet beat.
- **Project logo** saved at `public/logo-dim.png` — NOT wired into any
  surface (no existing logo slot; placement is a post-demo design decision).
- **Drift beat**: reconcile-pet-status went from `divergent: 320` (synthetic
  seed inconsistencies: 3.3k PANO deceased-with-active-status, 4.3k chip
  code mismatches between panorama events and coverage identifications,
  6k missing implantation sites, lost/found same-day ties) to
  **`divergent: 2`** after events-win reconciliation of the synthetic data.
  cron-health flags reason 'drift' for those 2 stragglers
  (PANO-018587 rabiesObservationStatus, PANO-022681 deceasedAt) — expected;
  if the drift card shows 2, that is the detection system working, not a bug.

---

## Fase 1 — Gates (Cowork)

_(pending)_

## Fase 2 — Clickthrough por segmento (Cowork)

_(pending — plantilla por pantalla según el plan)_

## Fase 3 — Cierre (Cowork)

_(pending — tabla 🔴/🟡/✅, top 5 rompe-confianza, top 5 quick wins)_
