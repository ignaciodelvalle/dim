# Crisis-path Playwright E2E — Test Design

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `3c390fc0` |
| **Repo** | `C:/dev/dim` (canonical checkout only) |

**Harness:** `playwright.config.ts` — `testDir: ./e2e`, `baseURL: http://localhost:3333`, `pnpm db:bootstrap` → `pnpm seed:test` prerequisite. Reuse `e2e/demo/_helpers.ts` (`loginAs`, `ACCOUNTS`, `pickCard`, `wizardStep`, `resolveOrgToken`, `submitAndWait`).

**Recommended new shared helpers** (implementer adds, not in repo today):

- `e2e/helpers/db.ts` — Drizzle/`postgres` via `DATABASE_URL` (BYPASSRLS, same as server actions). Pattern mirrors Vitest integration tests, not PostgREST anon (RLS blocks `pet_events` reads).
- `e2e/helpers/clickability.ts` — `assertElementFromPoint(locator)` for flow 2.
- `e2e/fixtures/crisis-pets.ts` — hermetic pet create/mark-lost/mark-found with unique `DIM-*` tokens and teardown.

---

## Flow 1 — Lost → found reunification

### Purpose

Regression-proof the full owner cycle: affirmative-disclosure mark-lost wizard → Tier-1 public credential → mark found → `active` again, with disclosure prefs honored on the public surface.

### Preconditions / fixtures

| Item | Source |
|---|---|
| **Account** | `owner@dim.test` / `Test1234!` (`e2e/demo/_helpers.ts:8-14`, `scripts/seed-test-users.ts:131-132`) |
| **Pet** | **Dedicated fixture pet** — do **not** use curated demo pets (Firulais/Michi). Create via owner UI (`e2e/create-pet.spec.ts` pattern) or `e2e/fixtures/crisis-pets.ts` with: `status='active'`, **no microchip** (forces 3-step wizard), unique name `CrisisLost-${runId}`. |
| **Owner phone** | Seed sets `profiles.phone = '+54 9 11 5555-1001'` for owner (`scripts/seed-test-users.ts:309-312`) — needed if testing phone disclosure. |
| **Optional photo** | Not required for this flow (photo overlay is flow 2). |

**Disclosure scenario (deterministic):** On final wizard step, opt **IN** only:

- `Tu teléfono` → ON  
- `Formulario para avisarte` → ON (default)  
- `Tu nombre`, `Tu email`, `Última ubicación` → OFF  

Defaults documented at `MarkLostWizard.tsx:40-46`, toggles at `MarkLostWizard.tsx:383-394` (`role="switch"` + `aria-label` per `components/ui/Toggle.tsx:91-95`).

### Steps

| # | Actor | Action | Route / selector (file:line) |
|---|---|---|---|
| 1 | Owner | `loginAs(page, ACCOUNTS.owner)` | `e2e/demo/_helpers.ts:24-42` |
| 2 | Owner | Open mark-lost sheet | `/mis-mascotas/{token}?sheet=marcar-perdida` — sheet mounts `MarkLostWizard` (`SheetMounter.tsx:381-404`, `PetActionRow.tsx:63-71` `aria-label="Marcar como perdida"`) |
| 3 | Owner | **Step 1 — location** | Section `[data-section="step-location"]` (`MarkLostWizard.tsx:200-228`). Fill `input[name="locationAddress"]` (`LocationFields.tsx:321-328`). Pick first Nominatim result: `page.locator('ul button').first()` (`LocationFields.tsx:343-356`). Fill `textarea[name="reason"]` with ≥10 chars. Click `Continuar →` (`MarkLostWizard.tsx:443-449`). |
| 4 | Owner | **Step 2 — details** (no chip) | Section `[data-section="step-details"]` (`MarkLostWizard.tsx:232-367`). Fill `input[name="enriched_color"]`, optional `textarea[name="enriched_accessories_when_lost"]`. Click `Continuar →`. |
| 5 | Owner | **Step 3 — disclosure** | Section `[data-section="step-disclosure"]` (`MarkLostWizard.tsx:372-405`). Toggle switches: `page.getByRole('switch', { name: 'Tu teléfono' })` ON; leave others OFF. Click `Marcar como perdida` (`MarkLostWizard.tsx:451-469`). |
| 6 | Owner | Success receipt | `LnSuccessScreen` title `Activamos la búsqueda de {name}` (`MarkLostWizard.tsx:159-167`) |
| 7 | Owner | Profile shows lost case | Navigate `/mis-mascotas/{token}`. Expect `[data-section="lost-case-block"]` (`LostCaseBlock.tsx:156-158`). Header copy `{name} … perdida` (`LostCaseBlock.tsx:187-189`). |
| 8 | Anon | Public lost credential | New browser context (no cookies). `page.goto('/p/{token}')`. |
| 9 | Owner | Mark found | Back to owner context. `/mis-mascotas/{token}?sheet=marcar-encontrada` (`PetActionRow.tsx:73-81`). Sheet `#marcar-encontrada` (`SheetMounter.tsx:448-457`). Click `Confirmar` (`SheetMounter.tsx:497-498`). Wait for full navigation to `/mis-mascotas/{token}` (`use-action-redirect.ts:25-28`, `setPetFoundAction` → `redirectTo` at `src/modules/events/actions.ts:1480`). |
| 10 | Anon | Public active credential | Anon context: `/p/{token}` — lost UI gone. |

### Assertions

| Layer | Assertion |
|---|---|
| **UI — after mark lost** | `[data-section="lost-urgent-banner"]` visible (`LostPublicCredential.tsx:116-119`). Headline `¡Hola! Soy {name}` (`LostPublicCredential.tsx:153-155`). |
| **UI — disclosure ON** | `a[href^="tel:"]` with text matching `/Llamar/` (`LostPublicCredential.tsx:162-168`). Link `La tengo conmigo` → `href="/p/{token}/encontre"` (`LostPublicCredential.tsx:170-176`). Link `La vi cerca de acá` → `href="/p/{token}/sighting"` (`LostPublicCredential.tsx:178-185`). |
| **UI — disclosure OFF** | No `Última vez vista` section when location undisclosed (`LostPublicCredential.tsx:195-229` — section gated on `lastSeenPlaceName \|\| lastSeenLocality \|\| hasLastSeenCoords`). No owner first name in call CTA (`ownerFirstName` null when `discloseFirstNameWhenLost=false`, `page.tsx:565`). No email link. |
| **UI — after found** | `[data-section="lost-case-block"]` **absent** on owner profile. `aria-label="Marcar como perdida"` visible again (`PetActionRow.tsx:63-71`). Public page: no `[data-section="lost-urgent-banner"]`; active credential shows `Credencial` field `Activa` (`format.ts:78-83`, `page.tsx:799`). |
| **DB** | After lost: `pets.status = 'lost'`; disclosure columns match wizard (`disclose_phone_when_lost=true`, `disclose_last_location_when_lost=false`, etc.). Latest `status_changed` event: `payload->>'to_status' = 'lost'` (`page.tsx:427-453`). After found: `pets.status = 'active'`; latest `status_changed` with `to_status='active'`. Open `lost_pet_episode` case closed (if harness exposes `cases` table). |
| **HTTP** | All navigations complete without 5xx; no `Application error` / Next error boundary text. |

### Cleanup

- `DELETE` fixture pet + ownerships + `pet_events` + `cases` rows for fixture pet (via `db.ts` helper), **or** mark found + delete if create-pet path used.
- Never leave `owner@dim.test` pets in `lost` state (pollutes `/perdidas`, demo recordings).

### Flakiness notes

- **Location L2:** Nominatim can be slow/offline — prefer picking first geocode result with 15s timeout; fallback: set map pin if geocode fails (hidden `locationLat`/`locationLng` at `LocationFields.tsx:407-408`).
- **Sheet vs router:** Use `?sheet=` URLs (History API shallow nav per `PetActionRow.tsx:12-21`), not `router.push`.
- **Hydration:** Reuse `loginAs` settle + `submitAndWait` for mark-found (`_helpers.ts:122-139`).
- **Unique token per run** avoids parallel worker collisions on shared local Supabase.

---

## Flow 2 — Anonymous finder QR scan (clickability + scan anonymization)

### Purpose

Catch the north-star regression: finder CTAs covered by the pet photo (untappable), and verify anonymous scan writes `credential_scanned` with `recorded_by_user_id IS NULL`.

### Preconditions / fixtures

| Item | Source |
|---|---|
| **Account (setup only)** | `owner@dim.test` — marks pet lost in `beforeAll` |
| **Pet** | **Must have `primary_photo_id` set** — photo overlay bug only reproduces with photo (`LostPublicCredential.tsx:130-135` comment: viewport-bleed `Image fill` bug). Use Firulais after `pnpm seed:pet-photos` (`scripts/seed-pet-photos.ts:7-16`) **or** fixture pet + photo upload via `PetForm` / seed helper. |
| **Lost state** | Pet `status='lost'` with `allow_finder_form_when_lost=true`, phone disclosed (so all three CTAs render). |
| **Anon context** | `browser.newContext()` with **no** `storageState` — do not reuse owner session. |

**Important:** Run scan assertions against a **dedicated lost pet**, not shared Firulais, if other tests also scan it (event count noise).

### Steps

| # | Actor | Action | Selector |
|---|---|---|---|
| 1 | Setup | Create/mark lost pet with photo + disclosure (reuse flow 1 steps 1–6, shorter disclosure: phone ON, finder form ON, location ON optional) | — |
| 2 | Anon | `await context.goto('/p/{lostToken}')` | `app/(public)/p/[publicToken]/page.tsx:534-583` lost branch |
| 3 | Anon | Wait for `ScanLogger` mount | `ScanLogger.tsx:33-37` fires `logScanAction` once on mount |
| 4 | Anon | **Clickability audit** | For each CTA locator, run `elementFromPoint` at bounding-box center — topmost element must be the CTA or its child, **not** the photo (`LostPublicCredential.tsx:136-145` `pointer-events-none` on image). |
| 5 | Anon | **Tap test** | `click()` on `La tengo conmigo` → navigates to `/p/{token}/encontre` (200, form visible). Back, click `La vi cerca de acá` → `/p/{token}/sighting`. If phone disclosed: verify `tel:` link has non-zero box. |
| 6 | Anon | (Optional) Dismiss location consent banner | `ScanLogger.tsx:97-102` "Ahora no" — does not affect base scan (already logged step 3). |

### Assertions

| Layer | Assertion |
|---|---|
| **Visible CTAs** | `[data-section="lost-urgent-banner"]` (`LostPublicCredential.tsx:119`). `getByRole('link', { name: /La tengo conmigo/i })`. `getByRole('link', { name: /La vi cerca de acá/i })`. Conditional: `getByRole('link', { name: /Llamar/i })` if phone disclosed. |
| **Clickability** | Custom helper: for each CTA, `document.elementFromPoint(cx, cy)` returns `a` matching locator (photo must not win). **This is the regression test for QA finding #0** (`LostPublicCredential.tsx:130-135`). |
| **DB — scan event** | After page load (+500ms): latest `pet_events` where `event_type='credential_scanned'` AND `pet_id={id}`: `recorded_by_user_id IS NULL` (`log-scan.ts:124-127`), `author_role='scanner'`, `payload->>'is_self_scan' = 'false'`, `payload->>'viewer_authenticated' = 'false'`. |
| **DB — privacy** | Payload has `scan_ip_area` key (nullable in local dev) (`log-scan.ts:101-104`); no raw IP column. |
| **Negative** | Anon visit does **not** expose owner email/full name when toggles off (`page.tsx:406-524` query-level gating). |

### Cleanup

- Mark pet found or delete fixture pet + events.
- Do not purge scan events in test (90d TTL cron) — use unique pet id to isolate rows.

### Flakiness notes

- **Photo required** — skip with explicit message if `primary_photo_id IS NULL` after setup (test documents dependency).
- **`ScanLogger` race:** Poll DB up to 5s for new scan row after `domcontentloaded`.
- **Fixed consent banner** (`ScanLogger.tsx:65-108`, `z-50`) can overlap bottom CTAs on small viewports — use `page.setViewportSize({ width: 390, height: 844 })` and scroll CTAs into view before clickability check; dismiss banner first if it intercepts.
- **Rate limit:** Public page allows 60/min (`page.tsx:122`); use one pet token per test, avoid hammering.

---

## Flow 3 — Login / logout + deactivated institutional loop

### Purpose

Prove admin logout works (`app/admin/layout.tsx:88-97`) and deactivated institutional accounts surface an error — **not** `ERR_TOO_MANY_REDIRECTS` (fix: `login.ts:56-66`, `login/page.tsx:41-46`, `role-landing.ts:36-44`).

### Preconditions / fixtures

| Item | Source |
|---|---|
| **Active admin** | `admin@dim.test` / `Test1234!` (`seed-test-users.ts:131`, `_helpers.ts:13`) |
| **Deactivated institutional** | **New fixture user** — do not deactivate `admin@dim.test`. Pattern from `__tests__/access-control-deactivated-proposals.test.ts:27-97`: e.g. `e2e-deactivated-admin@dim.test.local`, `role=admin`, `account_type=institutional`, `deactivated_at=NOW()`. Create in `beforeAll`, delete in `afterAll`. |

### Steps — 3A: Active admin logout

| # | Action | Selector |
|---|---|---|
| 1 | `loginAs(page, ACCOUNTS.admin)` | `_helpers.ts:24-42` |
| 2 | `page.goto('/admin')` — expect portal loads | `data-testid="admin-topbar"` (`app/admin/layout.tsx:123`) |
| 3 | Click logout | `getByRole('button', { name: /Cerrar sesión/i })` (`app/admin/layout.tsx:90-96`) |
| 4 | Assert session cleared | URL matches `/login` or `/`; `page.goto('/admin')` redirects unauthenticated user away from admin shell (no topbar) |
| 5 | Assert no admin chrome | `getByTestId('admin-topbar')` not visible |

### Steps — 3B: Deactivated login (primary loop fix)

| # | Action | Selector |
|---|---|---|
| 1 | Fresh context, `/login` | — |
| 2 | Submit deactivated credentials | `getByLabel(/correo/i)`, `getByLabel(/contraseña/i)`, `getByRole('button', { name: /iniciar sesión/i })` |
| 3 | Assert **stays on login** | `waitForURL` predicate: pathname still `/login` after 10s — **must NOT** reach `/admin` or `/gob` |
| 4 | Assert error copy | `getByText(/cuenta institucional está desactivada/i)` — form error from `login.ts:64-65` |
| 5 | Assert no session | `page.goto('/admin')` — not authenticated; no redirect loop (max 3 navigations; page not blank/crashed) |

### Steps — 3C: Stale deactivated session (defense in depth)

| # | Action | Notes |
|---|---|---|
| 1 | Programmatically sign in deactivated user via Supabase service role + inject cookies **or** temporarily set `deactivated_at` on fixture user while session exists | Simulates pre-fix stale cookie |
| 2 | `page.goto('/login')` | Deactivated session path: `login/page.tsx:114-134` |
| 3 | Expect alert | `role="alert"` + `Tu cuenta institucional está desactivada` (`login/page.tsx:115-125`) |
| 4 | Click `Cerrar sesión` in alert form | `login/page.tsx:126-133` → `logoutAction` |
| 5 | Assert logout succeeded | Can log in as different user, or `/admin` no longer loops |

### Assertions

| Assertion | Detail |
|---|---|
| **No redirect loop** | `page.goto('/admin', { waitUntil: 'domcontentloaded' })` completes in `<10s`; final URL is `/login` or `/`, not chrome error. Optionally: navigation count ≤ 4. |
| **Logout clears cookies** | After 3A, Supabase session cookie absent / `/admin` inaccessible. |
| **No ERR_TOO_MANY_REDIRECTS** | Playwright does not throw `net::ERR_TOO_MANY_REDIRECTS` (the da23a678 failure mode). |

### Cleanup

- Delete fixture deactivated user (auth + profile) in `afterAll`.
- Restore any temporarily deactivated rows.

### Flakiness notes

- Use **dedicated deactivated email** per worker — never touch production admin seed.
- Login hydration: reuse `_helpers.ts` Enter fallback.
- Test 3B and 3C in separate tests for clearer failure signals.

---

## Flow 4 — Org intake → custody (event-first dual-write)

### Purpose

Verify `/org/[orgToken]/intake` creates pet + `shelter_custody` ownership + `pet_registered` + `shelter_intake_recorded` in one atomic write (`create-intake.ts:4-5`, `362-438`).

### Preconditions / fixtures

| Item | Source |
|---|---|
| **Account** | `orgadmin@dim.test` / `Test1234!` (`_helpers.ts:10-11`) |
| **Org token** | Runtime via `resolveOrgToken(page, /refugio/i)` (`_helpers.ts:175-191`) — "Refugio Test" from seed (`seed-test-users.ts:396-422`) |
| **Pet name** | Unique: `IntakeE2E-${runId}` |

### Steps

| # | Action | Selector (file:line) |
|---|---|---|
| 1 | `loginAs(page, ACCOUNTS.orgAdmin)` | — |
| 2 | `resolveOrgToken` → `{orgToken}` | — |
| 3 | `page.goto('/org/{orgToken}/intake?tab=registrar')` | `e2e/demo/03-refugio.spec.ts:55-57`, `app/org/[orgToken]/intake/page.tsx` |
| 4 | Step 1 — skip chip | `wizardStep(page).getByRole('button', { name: /continuar sin chip/i })` (`IntakeForm.tsx:221-227`) |
| 5 | Step 2 — identity | Labels: `Nombre o alias`, `Especie`, sex radio `name="sex"`, etc. (`IntakeForm.tsx:233-260`, demo spec lines 65-76) |
| 6 | Step 3 — intake state | `pickCard(page, 'intakeReason', 'stray_found')` (`IntakeForm.tsx:33-37`, `_helpers.ts:154-158`) |
| 7 | Step 4 — confirm | `getByRole('button', { name: /crear ingreso/i })` (`IntakeForm.tsx:536`) |
| 8 | Success | `getByText(/mascota ingresada/i)` (`IntakeForm.tsx:138`, demo spec line 92-95) |
| 9 | Parse token | From `Ver ficha` / `Publicar adopción` link href (`demo spec:100-104`) |

### Assertions

| Layer | Assertion |
|---|---|
| **UI** | Success screen `Mascota ingresada: {name}` (`IntakeForm.tsx:137-138`). Link `/org/{orgToken}/mascotas/{petToken}` works (200). |
| **DB — pet** | Row in `pets` with `public_token={petToken}`, `name={name}`. |
| **DB — ownership** | Active row: `owner_organization_id={orgId}`, `role='shelter_custody'`, `ended_at IS NULL` (`create-intake.ts:362-367`). Default custody unless form sets `owner` (`IntakeForm.tsx:74`). |
| **DB — events** | Exactly one `pet_registered` + one `shelter_intake_recorded` for `pet_id`, same `occurred_at` window. `pet_registered.payload.custody_kind = 'shelter_custody_by_org'` (`create-intake.ts:394`). `shelter_intake_recorded.payload.intake_reason = 'stray_found'`. `author_organization_id = orgId`, `author_role='shelter'`. |
| **DB — case** | Open `cases` row `case_kind='custody_episode'` for pet (`create-intake.ts:409-428`). |
| **Idempotency** | Double-click submit does not create duplicate pets (same `clientIdempotencyKey` — optional second assert). |

### Cleanup

- Delete intaked pet + ownerships + events + case, **or** leave pet but document as ephemeral (prefer delete — demo org stays clean).
- `03-refugio.spec.ts` already intakes "Morena" — crisis spec must use **unique name** to avoid confusion.

### Flakiness notes

- Reuse `wizardStep(page)` scoping (`_helpers.ts:198-200`) — inactive steps stay in DOM as `sr-only`.
- `resolveOrgToken` fails loud if org seed missing — CI must run `pnpm seed:test`.
- Intake has no photo field yet (`03-refugio.spec.ts:53-54`) — do not assert photo.

---

## Implementation order (cheapest → highest value)

| Priority | Flow | Rationale |
|---|---|---|
| **1** | **Flow 3** — login/logout/deactivated | No pet fixtures; catches admin lockout / redirect-loop; ~2 tests, high severity |
| **2** | **Flow 2** — anon QR scan | Single anon page + DB read; photo clickability is the unique north-star bug |
| **3** | **Flow 1** — lost→found | Longest wizard but reuses flow 2 fixture patterns + disclosure contract |
| **4** | **Flow 4** — org intake | Demo spec (`03-refugio.spec.ts:52-104`) already walks UI — add **DB assertions** + dedicated pet name |

---

## Seed fixtures: existing vs new

| Flow | Existing seed | New fixture needed |
|---|---|---|
| 1 Lost→found | `owner@dim.test` | **Yes** — ephemeral active pet (no chip) |
| 2 Anon scan | `owner@dim.test` + `pnpm seed:pet-photos` (or upload) | **Yes** — lost pet with photo + known token |
| 3 Auth | `admin@dim.test` (active) | **Yes** — `e2e-deactivated-admin@…` institutional deactivated user |
| 4 Intake | `orgadmin@dim.test` + Refugio Test org | **No** new accounts — unique pet name only |

---

## Recommended `data-testid` additions (brittleness reduction)

| Surface | Current selector | Recommended test id | File |
|---|---|---|---|
| Lost finder CTAs | Text/role only | `data-testid="finder-cta-call"` | `LostPublicCredential.tsx:163` |
| | | `data-testid="finder-cta-possession"` | `:171` |
| | | `data-testid="finder-cta-sighting"` | `:179` |
| Mark-lost wizard root | Step sections only | `data-testid="mark-lost-wizard"` | `MarkLostWizard.tsx:173` |
| Public credential status | Text "Activa"/"Perdida" in grid | `data-testid="public-credential-status"` | `page.tsx:799` |
| Admin logout | Text "Cerrar sesión →" | `data-testid="admin-logout"` | `app/admin/layout.tsx:91` |
| Deactivated login alert | `role="alert"` only | `data-testid="deactivated-institutional-notice"` | `login/page.tsx:115` |
| Intake success token | Parse href | `data-testid="intake-success-pet-token"` on success links | `IntakeForm.tsx:137-165` |

---

## Product gaps noticed while tracing

1. **Mark-lost entry is sheet-first** (`?sheet=marcar-perdida`) but `/perdida` full page also exists (`perdida/page.tsx:76-109`) — e2e should pick **one canonical path** (sheet) to match production UX; keep `/perdida` as optional smoke only.

2. **Flow 1 + 2 coupling:** Photo overlay test is meaningless without `primary_photo_id`; document hard dependency in test name (`@requires-photo`).

3. **Scan location consent banner** (`ScanLogger.tsx:65-108`) can intercept taps on small viewports — not the photo bug, but can cause false failures; dismiss or scroll before clickability audit.

4. **No e2e DB helper today** — intake/event assertions require new `e2e/helpers/db.ts`; without it, flow 2 scan anonymization and flow 4 dual-write cannot be fully verified (UI-only would miss the north-star DB contract).

5. **`loginAction` signs out deactivated users immediately** (`login.ts:61-62`) — 3B tests form error, not stale session; 3C is still needed for the `/login` notice + logout path when a session cookie exists.

6. **Intake lacks photo** — lost public page photo bug cannot be tested via intake; owner create-pet + photo upload or `seed:pet-photos` required.

---

*Design only — no files modified. Implement as `e2e/crisis/*.spec.ts` (suggested) with shared helpers above.*
