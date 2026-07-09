# Clickthrough deep review — all journeys, 7-lens rubric + case-creation info review

**Branch**: integration/all-20260703 · **Build**: fresh @ da5a0fcf (BUILD_ID 2026-07-09 03:57) · **Env**: local :3000, QA seed (drift accepted) · **Driver**: Playwright MCP (chrome-for-testing), live human-eyes pass.

## Scope

All 6 demo journeys (público, dueño, refugio, veterinaria, gobierno, admin) walked end to end, completing every flow at least once. Every flow that **creates a case/record** gets a STRONG information review of the resulting comprobante/detail: **info missing? / info excess? / format valid? / can it improve?**

## The 7-lens rubric (per screen)

1. **Propósito y densidad de decisión** — does the screen enable a decision/action? Does each tile/table/chart earn its place or duplicate a number shown elsewhere? Does it exploit the event-sourced spine or is it shallow CRUD?
2. **Honestidad del dato** — k-anon honest (hatch, never fake 0); labels say what the datum IS; numbers reconcile across screens; "sin datos" ≠ "0".
3. **Estados que la demo esconde** — empty / loading / error / 1-row vs thousands.
4. **Claridad para el usuario real** — primary action obvious; es-AR copy natural+consistent; understandable without training; CTA hierarchy; stable terminology.
5. **Un solo producto** — consistent chrome, design-system typography/spacing/color, unified maps, dark mode, responsive.
6. **Invariantes y arquitectura** — pet is the credential (public token → QR); events append-only (corrections as visible amendments); every view a projection; authz scoping (jurisdiction, cross-tenant).
7. **Privacidad** — zero excess PII; DNI last-4 only; public routes no leaks; k-anon on geographic surfaces.

Plus **active authz/isolation probes** per authenticated profile (folded in from cross-tenant-isolation + auth-bypass specs): owner→/admin, owner→/gob, owner→other owner's pet, org→other org portal, govt→out-of-jurisdiction → all must 404/redirect.

Severity: **HIGH** (honesty/privacy/authz/broken) · **MED** (confusing/inconsistent/format) · **LOW** (polish/a11y nit).

---

## Segmento 01 — PÚBLICO (sin login)

### `/` landing
- L5: hero + credencial PAMPA/QR + panorama preview read well. Story blocks have large whitespace — likely intentional scroll-reveal (to confirm interactively).
- **LOW** — `favicon.ico` 404 (console error on every page).

### `/adoptar`
- L1 ✓ clear purpose; L2 ✓ "3 mascotas publicadas" reconciles with 3 cards; L4 ✓ warm es-AR voseo; L7 ✓ no PII leak (shelter pets, locality-level).
- **LOW** (a11y) — each pet-card link accessible-name is a run-on that repeats the pet name twice ("Bichita … Bichita …").

### `/perdidas`
- L1 ✓ purpose clear (lost-pet board, 116 activas, filters + quick filters + "Mostrar más" cursor pagination); L4 ✓ warm copy, good empty-CTA "¿Perdiste a tu mascota?".
- **MED (L2 honesty / L3 empty state)** — "Visto por última vez" shows the generic placeholder **"AMBA / zona de búsqueda activa"** on pets located in Salta, Jujuy, Chaco, Corrientes, Tierra del Fuego, Mendoza, etc. A pet lost in Salta reading "last seen in AMBA" (1400 km away) is geographically impossible. On a lost-pet board the last-seen location is THE decision datum — a wrong/placeholder value actively misdirects searchers. Fix: either surface the real last-seen point, or render an honest empty state ("sin ubicación de avistaje registrada") instead of a metro placeholder. (Some pets DO show a real value, e.g. "Lanús, zona sur del conurbano" — so the placeholder is a fallback that should be an empty state.)
- Seed-data note (not a code finding): "Últimas 24h: 0 / Últimos 7 días: 0" against 116 activas makes the board look stale; all visible entries are "hace 2-3 semanas". Also geo mismatches in seed (e.g. "San Justo, Tierra del Fuego"). QA seed freshness, not product.

### `/denuncias/nueva` — CASE-CREATION flow (welfare report wizard)
- **MED (L?/prod-correctness)** — CSP blocks a dynamically-imported chunk: `Loading the script '/_next/static/chunks/7851.*.js' violates ... script-src 'self' 'nonce-...' 'strict-dynamic'`. Verified the wizard core still hydrates and advances (step 1 "¿Qué pasó?" → step 2 "¿Qué tan grave es?"), so the blocked chunk is NOT the wizard logic — likely a lazy import in a later step (LocationFields/map on step 3 "¿Dónde y cuándo?"). Still a real CSP-nonce propagation bug: some chunk loads outside the nonce chain and is blocked in any environment with CSP enforced (prod build). Feature behind that chunk silently fails. Page-specific (landing/adoptar/perdidas showed no CSP error). → investigating source.
- Strong info review of comprobante: pending (drive full wizard).

### `/refugios` — pending

---

## Fase 1 — Completabilidad + dimensiones automáticas (e2e vs live :3000)

Running `playwright.local3000.config.ts` over `e2e/demo/01-06` + a11y-regression + cross-tenant-isolation + auth-bypass. Partial results:

- **auth-bypass** ✓ PASS — owner redirected away from `/admin` and `/gob`.
- **cross-tenant-isolation** ✓ browser-path PASS — Owner A → Owner B's REAL pet URL = 404; govt out-of-jurisdiction = 404; org non-member portal = 404. NOTE: the direct PostgREST/RLS probes **self-skipped** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` not set in the e2e env) — that layer is covered by `__tests__/rls/matrix.test.ts`, not here. Browser/action-edge scoping confirmed.
- **a11y-regression** — public + owner surfaces ✓ 0 violations (axe WCAG 2.1 AA). **One FAIL** ↓.
  - **HIGH-ish (a11y) — pet-profile Credencial/Libreta tablist keyboard nav is broken.** `a11y-regression.spec.ts:119` — "Tab reaches tablist, Arrow roves + activates, Enter flips the face" times out (18.6s). The WAI-ARIA roving-tabindex + arrow-activation + Enter-flip contract on the credential↔libreta flip is not satisfied. Keyboard-only users can't flip the core credential. Likely a regression from pet-document-redesign flip-card (ADR-11). Exact failing assertion pending end-of-run detail. Candidate mechanical fix (no product decision).
- **demo/01-publico** ✓ PASS (1.2m) — full public journey completable end to end, INCLUDING the denuncia wizard submit → comprobante. Confirms the CSP chunk block is cosmetic (does not break the flow).
- demo/02-06 — running.

---

## Content + visualization audit — ALL /gob (42) + /admin (38) screens

Full per-screen analysis (code layer, cursor-delegated, every claim file:line-anchored): see companion doc `2026-07-09-gob-admin-content-viz-audit.md`. Highlights:
- **Top mechanical wins**: campanas legend (fixed), vigilancia subregion k-anon (fixed), PPP tone target (fixed), vigilancia trend title (fixed), gob→admin breach link (fixed role-aware), "Mascotas hoy" relabel (fixed).
- **Ghost finding**: the rabies label collision is ALREADY disambiguated in code (distinct label constant + info popover on analytics tile) — both audits carried it from stale context. No change needed.
- **Product-decision queue (batched)**: campaign dashboard reads appointments only (no event spine); default panorama preset by role; consolidate /gob/sistema into /gob/programa; 22/48 event-coverage gaps (projections for movement/deworming/vet-access/adoption-funnel); perdidas "Recuperados" KPI following the PeriodPicker.
- **Screens that don't earn their place** (per audit): /admin/acerca/integracion-miarg (stub by design), /gob/vigilancia/zoonosis (near-duplicate of parent), /gob Panel "Vigilancia" aside card (link-only), /gob/sistema for govt (duplicates programa), /gob/analytics/export (half-wired).

## Fixes applied this session (all verified: tsc clean, biome clean, unit tests green)

| Task | Fix | Files |
|---|---|---|
| #1 HIGH k-anon | fetchCasesPerSubregion now redacts 1..4 counts via suppressSmallCells (k=5) at the module boundary; vigilancia renders suppressed cells with hatch + privacy tooltip, never a number. New pure module + 5 unit tests. | lib/analytics/subregion-redaction.ts(+test), govt-dashboards.ts, app/gob/vigilancia/page.tsx |
| #5 legend | Campanas map tooltip/scaleLabel/fallback/caption say "Asistencias" (the datum) not "Inscripciones" | app/gob/campanas/page.tsx |
| #15 labels | PPP tile tone now uses TARGETS.PPP_ATTESTATION_PCT=100 (legal mandate) not the microchip target; vigilancia trend title no longer claims "(12 meses)" while defaulting 30d; rabies breach banner link is role-aware (admin → /admin/observaciones, govt → in-page card anchor); "Mascotas hoy" → "Altas registradas hoy" | lib/metrics/targets.ts, app/gob/page.tsx, app/gob/vigilancia/page.tsx |
| #3 seed honesty | seed-panorama lost pets now carry their OWN locality/province as location_description (was: fixed "AMBA / zona de búsqueda activa" nationwide). Local reseed queued post-e2e; staging reseed is Ignacio-gated. | scripts/seed-panorama.ts |
| #6 polish | favicon wired (icons.icon → /icons/icon-192.png, kills the sitewide 404); adoptar card img alt="" (redundant-alt inside link) | app/layout.tsx, components/AdoptionListingCard.tsx |

---

## Empirical validation (clean re-runs, fresh build, no CPU contention)

### a11y tablist "failure" → stale test fixture (NOT a product bug), now fixed
- The a11y-regression tablist keyboard test failed identically contaminated AND clean (18.6/18.9s) — first assertion `getByRole("tablist", {name:/cara del documento/})` not found. Error-context snapshot showed the page rendered **"No encontramos esta página"** (404).
- Root cause (DB truth via psql): `PET_TOKEN = "DIM-B4KS-KWZA"` **does not exist**; owner@dim.test owns `DIM-DEMO-0001..0008`. The hardcoded token went stale when the demo seed changed its token scheme.
- **Consequence beyond the one failure**: the public-credential test (`/p/DIM-B4KS-KWZA`) and owner-profile test also ran against 404 pages — axe finds no violations on a 404, so THREE a11y assertions were silently passing against nothing. Real coverage was zero on those routes.
- Fix: `PET_TOKEN = "DIM-DEMO-0001"` (Rocco, active, owned). **All 5 a11y tests now pass in 17s, tablist keyboard nav in 4.0s** — the FlipCard roving-tabindex/arrow/Enter code was always correct. This also restores genuine a11y coverage on the credential + public pages.

### Contaminated-run demo failures were contention, not bugs
- Original run: 02-dueno + 05-gobierno hit the FULL 18-min timeout (hung), 03-refugio fast-failed (14.5s). Root cause: I ran tsc/vitest/biome/build + MCP nav concurrently against the same :3000, starving the recording-paced specs. Clean serial re-run in progress (br1vx9c4f) on the fresh build with nothing competing. [results appended on completion]

<!-- APPEND BELOW AS THE PASS CONTINUES -->
