# Audit — Nivel 2: State Completeness (the honesty of the moment)

Read-only audit. Scope: every meaningful screen across `app/gob/*`, `app/admin/*`,
`app/org/[orgToken]/*`, `app/(app)/*` (citizen), `app/(public)/*`, plus the
cross-cutting vet surface (`app/libreta/compartir/[shareToken]`). Nine states
audited per screen: **loading, empty, error, offline, success, partial,
insufficient-permissions, no-results, maintenance**.

Legend: ✅ shared primitive · 🟡 ad-hoc (inline/one-off, sometimes duplicated) ·
❌ missing · — N/A (state doesn't apply to this screen's shape)

---

## 1. Primitives inventory (what actually exists)

| State | Primitive(s) | Where | Verdict |
|---|---|---|---|
| **loading** | `components/ui/Skeleton.tsx` (atom); `OpKpiSkeleton`/`OpCardSkeleton` (`components/ui/dashboard/`, operator tone); `LnCardSkeleton` (`components/ui/`, owner/public tone); `PanoramaBoardSkeleton` (panorama-specific) | 13 route segments ship a dedicated `loading.tsx`; portal roots (`app/gob/loading.tsx`, `app/admin/loading.tsx`, `app/org/[orgToken]/loading.tsx`) provide a generic fallback for every other page in that portal via Next.js's nearest-ancestor Suspense rule | **has-primitive, thin coverage** |
| **error** | `components/ErrorBoundary.tsx` (shared "Algo salió mal" card: Reintentar / Volver al inicio, digest-in-prod / stack-in-dev) | 11 portal-scoped `error.tsx` files, enforced by a fitness test (`__tests__/error-boundary-presence.test.ts`) that fails CI if a required boundary or its home-escape string goes missing | **has-primitive, strongest state in the app** |
| **not-found** (adjacent to error) | `components/BrandedNotFound.tsx` (branded 404, Spanish, "Volver al inicio") | `app/not-found.tsx`, `app/(app)/not-found.tsx`, `app/(public)/not-found.tsx`, `app/admin/not-found.tsx`, `app/gob/not-found.tsx` | **has-primitive** — but **org portal has none** (see gap #3) |
| **empty / no-results** | `components/ui/EmptyState.tsx` (`LnEmptyState`: icon + title + description + optional CTA, `plain`/`dashed` variants) | Reused across ~40+ list screens (gob, admin, org, citizen); `no-results` (filtered-to-zero) and `empty` (never-had-any) share the SAME component, just different title/description | **has-primitive, well-adopted** — a handful of inline combobox/dropdown result lists (`AddPartyForm`, `AdminReglasLens`, `DecomisoForm`, `LocalityPickerAcross`) roll their own `<li>Sin resultados.</li>` instead, which is a defensible scope call (compact suggestion lists, not full-page states) but is still fragmentation |
| **insufficient-permissions** | THREE parallel patterns: (1) `app/acceso-denegado/page.tsx` (wraps `BrandedNotFound`, portal-level mismatch, e.g. personal role hitting `/gob`, tested in `__tests__/acceso-denegado-page.test.ts`); (2) `OpBreach` (`components/ui/dashboard/OpBreach.tsx`, `role="alert"` banner) reused ~50 places for in-page scope/permission restriction (e.g. `app/org/[orgToken]/maltrato/recibidos/page.tsx`); (3) hand-rolled inline JSX, e.g. `app/org/[orgToken]/admin/layout.tsx` builds its own "Acceso restringido" card instead of reusing `OpBreach` | mixed | **has-primitive but inconsistently applied** — pattern (3) duplicates (2) |
| **offline** | none | `navigator.onLine` / `isOnline` do not appear anywhere in application code; `public/sw.js` line 4 states explicitly: *"There is NO caching / offline layer here"* | **systemically absent** |
| **maintenance** | none | no maintenance banner, flag-gated maintenance page, or kill-switch route found anywhere | **systemically absent** |
| **partial** (bulk success/failure) | Bespoke `ResultPanel` (succeeded/failed counts + per-item reasons), reimplemented independently THREE times: `components/BulkApprovalQueueList.tsx` (admin/gob cola), `components/AdoptionQueueList.tsx` (org adopciones), `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx` (org bulk vaccinate/eligibility/listing) | near-identical shape each time (`"{succeeded} OK · {failed} fallaron"` + reasons list) | **ad-hoc, duplicated 3x — ripe for extraction, no shared primitive** |
| **success** (non-bulk) | `components/ui/SuccessScreen.tsx` for multi-step wizard completions (~10 consumers: `MarkLostWizard`, `OrgBiteForm`, `ProposeReturnForm`, `ProposeTransferForm`, adoption `ApplicationForm`, `IntakeForm`, `DenunciaWizard`, mordedura `exito` page, `AttendanceFormDispatcher`, `ProposalActions`) | for the far more common case — simple CRUD via `window.location.assign()` (Tier A/B in `docs/design/handoffs/2026-07-04-router-refresh-tiers.md`, ~38 files / ~65 call sites) — success is communicated ONLY by the destination page's new SSR state; there is no toast/confirmation | **has-primitive for wizards only; silent for everything else** |
| **toast infra** | `components/Toaster.tsx` (sonner wrapper, mounted globally in `app/layout.tsx`) | Real runtime call sites: `components/gob/NoticeToast.tsx` (2, one hardcoded message: `"fuera-de-alcance"`) and `components/panorama/PanoramaConsole.tsx` (1). That's the entire app. | **infra exists, essentially unused** |

---

## 2. The hard-nav loading question (answered)

Operator dashboards are Server Components, and roughly **38 files / ~65 call
sites** (per the router-refresh-tiers audit) route post-mutation success
through `window.location.assign(...)` / `navigateAfterActionSuccess()` /
`closeSheetNavWithFullReload()` — a deliberate fix for a Next.js 15.5.x
production defect where `router.refresh()` silently drops the transition
(engram #621/#622, reproduced 3/3 on `/gob/reglas` CRUD).

What this means for loading affordance:
- `loading.tsx` is implemented as a server-streamed Suspense fallback, so it
  DOES still fire on a hard/full navigation, not only client-side soft nav —
  this is not a total blackout.
- But only 13 of ~115 leaf route segments across gob/admin/org/(app)/(public)
  ship a **segment-specific** `loading.tsx`. Every other leaf page inherits
  its **portal-root** skeleton (`gob/loading.tsx`, `admin/loading.tsx`,
  `org/[orgToken]/loading.tsx`) — a generic `OpKpiSkeleton`/`OpCardSkeleton`
  shape that does not match the destination page's actual layout, so a
  layout-shift "flash" is expected when real content mounts.
- `admin/panorama` and `gob/panorama` have `error.tsx` but **no** `loading.tsx**
  — intentional (the board's slow seed is a Suspense boundary *inside* the
  page using `PanoramaBoardSkeleton`), but it means the outer navigation itself
  has no route-level skeleton, only the inner one.
- Before the hard nav fires, the mutating button DOES show a `pending`
  affordance (`useTransition`, e.g. `"Procesando..."` in
  `BulkApprovalQueueList`'s `ConfirmRow`) — so the moment between click and
  server response is not silent. The moment that IS silent is the
  browser-native document-navigation gap itself (TTFB before any shell can
  stream), which is an inherent SSR/full-reload characteristic, not a missing
  app-level state.

**Verdict**: loading is not a void, but it is thin and generic outside 13
segments — closer to ad-hoc-by-inheritance than a deliberately designed
per-screen skeleton.

---

## 3. Systemically absent / weak states

1. **Offline** — zero handling anywhere. No banner, no `navigator.onLine`
   listener, no service-worker cache fallback. Every screen in every portal
   scores ❌.
2. **Maintenance** — zero handling anywhere. No flag, no banner, no route.
3. **Org portal has no branded 404** — `app/org/[orgToken]/not-found.tsx` does
   not exist; a bad sub-path falls through to the nearest ancestor
   (`app/(public)/not-found.tsx` or root), losing the org-scoped "volver al
   panel" exit every other portal gets.
4. **Partial (bulk) success is duplicated 3x, never shared** — see primitives
   table. Same UX, three bespoke components, no shared `BulkResultPanel`.
5. **Success feedback outside wizards is silent** — the sonner toast infra is
   mounted app-wide but essentially unused (3 real call sites total). Simple
   mutations rely entirely on the post-reload SSR diff to communicate
   success; a user who doesn't notice a subtle badge/count change has no
   explicit confirmation.
6. **Insufficient-permissions has 3 competing implementations** — one screen
   (`app/org/[orgToken]/admin/layout.tsx`) hand-rolls its own restricted-access
   card instead of reusing the already-shared `OpBreach`.
7. **No-results honesty gap (partially fixed)** — a prior cursor review
   (`docs/reviews/2026-07-15-cursor-qa-admin-official-roles-fresh.md`) flagged
   `/gob/perdidas` showing "(0)/Sin resultados" misleadingly under a silent
   30-day default filter while a summary panel showed real active cases.
   Current code (`app/gob/perdidas/page.tsx:387-396`) explains jurisdiction
   scope in the empty-state description but still does not call out that the
   default date filter is the reason for zero rows — the honesty gap is
   narrowed, not closed.

---

## 4. Screen × State matrix

### A. Operator — Gobierno (`app/gob/*`)

| Screen / flow | loading | empty | error | offline | success | partial | insuff.-perm | no-results | maintenance |
|---|---|---|---|---|---|---|---|---|---|
| Panorama (`panorama/page.tsx`) | 🟡 (inner `PanoramaBoardSkeleton`, no route `loading.tsx`) | — | ✅ (own `error.tsx`) | ❌ | — | — | ✅ (`?notice=fuera-de-alcance` toast + scope redirect) | — | ❌ |
| Cola de aprobaciones (`cola/*`) | ✅ (`cola/loading.tsx`) | ✅ `LnEmptyState` | ✅ (portal) | ❌ | 🟡 (silent reload on clean bulk) | 🟡 `ResultPanel` (ad-hoc, dup'd) | ✅ (portal guard → `acceso-denegado`) | ✅ `LnEmptyState` | ❌ |
| Casos (`casos/*`) | 🟡 (portal skeleton only) | ✅ `LnEmptyState`/`CaseQueue` | ✅ (portal) | ❌ | 🟡 (reload) | — | ✅ (portal) | ✅ | ❌ |
| Maltrato (`maltrato/*`) | ✅ (`maltrato/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Vigilancia + brotes + investigaciones (`vigilancia/*`) | ✅ (`vigilancia/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Disputas (`disputas/*`) | 🟡 (portal skeleton) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ (inline "Sin resultados." in `AddPartyForm`) | ❌ |
| Decomisos (`decomisos/*`) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | 🟡 (inline in `DecomisoForm`) | ❌ |
| Reglas / PPP (`reglas/*`) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 (hard-nav fix for the silent-drop defect) | — | ✅ (portal) | 🟡 (inline "Sin resultados." in `AdminReglasLens`) | ❌ |
| Perdidas (`perdidas/page.tsx`) | ✅ (`perdidas/loading.tsx`) | ✅ `LnEmptyState` | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ — copy explains scope, **not** the silent date filter (gap #7) | ❌ |
| Moderación (`moderacion/*`) | 🟡 | ✅ `LnEmptyState` ("Cola vacía" vs "Sin resultados") | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Usuarios (`usuarios/page.tsx`) | ✅ (`usuarios/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Organizaciones (`organizaciones/page.tsx`) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Analytics + export (`analytics/*`) | ✅ (`analytics/loading.tsx`) | ✅ | ✅ (portal) | ❌ | — (download) | — | ✅ (`export/actions.ts` "No tenés permisos para generar exports.") | — | ❌ |
| Censo / Población / Mortalidad / Programa / Servicios / Campañas / Outreach / Suscripciones / Outbox / Rupga / Sistema | 🟡 (portal skeleton) | ✅ (all use `LnEmptyState`) | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |

### B. Operator — Admin (`app/admin/*`)

| Screen / flow | loading | empty | error | offline | success | partial | insuff.-perm | no-results | maintenance |
|---|---|---|---|---|---|---|---|---|---|
| Panorama | 🟡 (inner skeleton, no route `loading.tsx`) | — | ✅ (own `error.tsx`) | ❌ | — | — | ✅ (portal) | — | ❌ |
| Cola (`cola/*`) | ✅ (`cola/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | 🟡 `ResultPanel` (same dup'd pattern) | ✅ (portal) | ✅ | ❌ |
| Casos / Observaciones / Moderación | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Libro (auditoría) | ✅ (`libro/loading.tsx`) | ✅ | ✅ (portal) | ❌ | — | — | ✅ (portal) | ✅ | ❌ |
| Alertas | ✅ (`alertas/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal, `actions/alert-firings.ts` "Acceso restringido a administradores") | ✅ | ❌ |
| Usuarios | ✅ (`usuarios/loading.tsx`) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ (copy fix noted in `2026-06-22-admin-executive-review-fixes.md` C18) | ❌ |
| Admins / Govts (CRUD, deactivate, assign locality) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 (`setDone` ad-hoc inline confirmations, e.g. `DeactivateAdminForm`) | — | ✅ (portal) | ✅ | ❌ |
| Organizaciones / Programa / Censo / Población / Servicios / Reglas / Adopciones / Suscripciones / Outbox / Inteligencia | 🟡 (portal skeleton) | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Sistema / crons | 🟡 | — | ✅ (portal) | ❌ | 🟡 | 🟡 (per-cron ok/fail rows, ad-hoc) | ✅ (portal) | — | ❌ |
| Acerca / integración Mi Argentina | — | — | ✅ (portal) | ❌ | — | — | ✅ (portal) | — | ❌ |

### C. Org portal (`app/org/[orgToken]/*`)

| Screen / flow | loading | empty | error | offline | success | partial | insuff.-perm | no-results | maintenance |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard (`page.tsx`) | ✅ (`org/[orgToken]/loading.tsx`) | ✅ | ✅ (own `error.tsx`) | ❌ | — | — | ✅ (own layout guard) | — | ❌ |
| Mascotas + bulk actions | 🟡 (portal skeleton) | ✅ `LnEmptyState` | ✅ (portal) | ❌ | 🟡 (reload) | 🟡 `ResultPanel` (3rd independent copy, `OrgMascotasBulkList.tsx`) | ✅ (portal) | ✅ | ❌ |
| Adopciones (queue + detail) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | 🟡 `ResultPanel` (2nd independent copy, `AdoptionQueueList.tsx`) | ✅ (portal) | ✅ | ❌ |
| Atender / Intake / Check-ins | 🟡 | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`IntakeForm`) | — | ✅ (`atender-access.ts` guard) | ✅ | ❌ |
| Transferencias (nueva/recibidas) | 🟡 | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`ProposeTransferForm`) / 🟡 (accept/reject) | — | ✅ (portal) | ✅ | ❌ |
| Maltrato (nuevo/recibidos) | 🟡 | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`OrgBiteForm`) | — | ✅ `OpBreach` ("Acceso restringido" role check) | ✅ | ❌ |
| Agenda / turnos / servicios | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 / ✅ (`AttendanceFormDispatcher` uses `SuccessScreen`) | — | ✅ (portal) | ✅ | ❌ |
| Voluntarios / propuestas | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Miembros / invitar | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 (`setDone` ad-hoc) | — | ✅ (portal) | ✅ | ❌ |
| Admin (`admin/permisos`) | 🟡 | — | ✅ (portal) | ❌ | 🟡 (optimistic cell flip) | — | 🟡 **hand-rolled restricted-access card, NOT reusing `OpBreach`** (gap #6) | — | ❌ |
| Configuración / Cobertura | 🟡 | — | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | — | ❌ |
| Mordedura (nuevo) | 🟡 | — | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`OrgBiteForm`) | — | ✅ (portal) | — | ❌ |
| Any sub-path typo under `/org/[orgToken]/*` | — | — | ✅ (portal `error.tsx`) | ❌ | — | — | — | — | ❌ |
| **404 under org portal** | — | — | — | — | — | — | — | — | ❌ (**❌ MISSING — no `app/org/[orgToken]/not-found.tsx`**, gap #3) |

### D. Citizen app (`app/(app)/*`)

| Screen / flow | loading | empty | error | offline | success | partial | insuff.-perm | no-results | maintenance |
|---|---|---|---|---|---|---|---|---|---|
| Mis mascotas (list) | ✅ (`mis-mascotas/loading.tsx`) | ✅ `LnEmptyState` | ✅ (own `error.tsx` at `[publicToken]` + portal) | ❌ | — | — | ✅ (portal, `pet-access.ts`) | ✅ | ❌ |
| Pet profile (`[publicToken]/page.tsx` + tabs) | ✅ (`[publicToken]/loading.tsx`) | — | ✅ (own `error.tsx`) | ❌ | 🟡 | — | ✅ (`pet-access.ts` "Mascota no encontrada o sin permisos.") | — | ❌ |
| Event capture (`eventos/nuevo/*`) | ✅ (`eventos/nuevo/loading.tsx`) | — | ✅ (portal) | ❌ | ✅ `SuccessScreen` (mordedura `exito`) / 🟡 (others, `navigateAfterActionSuccess`) | — | ✅ (portal) | — | ❌ |
| Libreta sanitaria / historial | 🟡 | ✅ | ✅ (portal) | ❌ | — | — | ✅ (portal) | — | ❌ |
| Vacunas + programar | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | — | ❌ |
| Viaje (semáforo legal) | 🟡 | — | ✅ (own logic tested, `TravelSemaforo.test.tsx`) | ❌ | — | — | ✅ (portal) | — | ❌ |
| Buscar hogar / adopción listing | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Perdida (mark lost) | 🟡 | — | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`MarkLostWizard`) | — | ✅ (portal) | — | ❌ |
| Devolución / mudanza / corregir-especie / microchip / chapita / cartel | 🟡 | — | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | — | ❌ |
| Nueva mascota (alta) + match + credencial | ✅ (nested loading in match flow) | — | ✅ (portal) | ❌ | 🟡 (credencial reveal) | — | ✅ (portal) | ✅ (match "no encontramos coincidencias") | ❌ |
| Reclamar / reclamar-dni | 🟡 | — | ✅ (portal) | ❌ | 🟡 | — | ✅ (`pet-access.ts`) | — | ❌ |
| Postulaciones (adopción) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Cuenta (perfil, privacidad, upgrade, verificar-dni) | ✅ (`cuenta/loading.tsx`) | — | ✅ (portal) | ❌ | 🟡 (`PrivacyActions` full `assign("/")` post-erase) | — | ✅ (portal) | — | ❌ |
| Cuenta / tránsitos (activos, historial, propuestas) | ✅ (`cuenta/loading.tsx` inherited) | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`ProposalActions` accept path) / 🟡 (reject) | — | ✅ (portal) | ✅ | ❌ |
| Cuenta / solicitudes / memberships | ✅ (inherited) | ✅ | ✅ (portal) | ❌ | 🟡 (optimistic-or-reload) | — | ✅ (portal) | ✅ | ❌ |
| Cuenta / casos / crear-consultorio / desactivar / renunciar | ✅ (inherited) | — | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | — | ❌ |
| Denuncias (mías + detail) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Notificaciones | 🟡 | ✅ | ✅ (portal) | ❌ | — | — | ✅ (portal) | — | ❌ |
| Transferencias (mine) | 🟡 | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (accept) / 🟡 (reject/cancel) | — | ✅ (portal) | ✅ | ❌ |
| Turnos (mis-turnos, buscar, reservar) | 🟡 | ✅ | ✅ (portal) | ❌ | 🟡 | — | ✅ (portal) | ✅ | ❌ |
| Inicio (redirect dashboard) | — (no skeleton by design — server redirect, per `skeleton.test.tsx` comment) | — | ✅ (portal) | ❌ | — | — | ✅ (portal) | — | ❌ |

### E. Public (`app/(public)/*`, `/p/[publicToken]`, `/libreta/compartir`)

| Screen / flow | loading | empty | error | offline | success | partial | insuff.-perm | no-results | maintenance |
|---|---|---|---|---|---|---|---|---|---|
| Public pet credential (`/p/[publicToken]`) | ✅ (`loading.tsx`) | — | ✅ (own `error.tsx`) | ❌ | — | — | — (public by design) | — | ❌ |
| Encontré / sighting report | 🟡 | — | ✅ (portal) | ❌ | ✅ `SuccessScreen`-adjacent confirmation | — | — | — | ❌ |
| Adoptar (list + detail + postular) | ✅ (`adoptar/loading.tsx`, `[petToken]/loading.tsx`) | ✅ `LnEmptyState` | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`ApplicationForm`) | — | — | ✅ | ❌ |
| Refugios (list + org profile) | ✅ (`refugios/loading.tsx`, `[orgToken]/loading.tsx`) | ✅ | ✅ (portal) | ❌ | — | — | — | ✅ | ❌ |
| Casos públicos (`/casos/[publicCode]`) | ✅ (`loading.tsx`) | — | ✅ (portal) | ❌ | — | — | — | — | ❌ |
| Perdidas (public lost-pet board) | ✅ (`perdidas/loading.tsx`) | ✅ | ✅ (portal) | ❌ | — | — | — | ✅ | ❌ |
| Denuncias (buscar, nueva, código) | 🟡 | ✅ | ✅ (portal) | ❌ | ✅ `SuccessScreen` (`DenunciaWizard`) | — | — | ✅ | ❌ |
| Libreta compartir (vet-facing share link) | ✅ (`loading.tsx`) | — | ✅ (own `error.tsx`, generic `ErrorBoundary` default) | ❌ | — | — | ✅ (`libreta-share.ts` "Sin permisos para revocar…") | — | ❌ |
| Static (acerca, ayuda, leyes, privacidad, términos, cookies, accesibilidad, transparencia, funcionalidades, sugerencias) | — | — | ✅ (portal) | ❌ | — | — | — | — | ❌ |
| **Portal-mismatch landing** (`/acceso-denegado`) | — | — | — | — | — | — | ✅ **the** shared primitive (`BrandedNotFound`), tested | — | — |

---

## 5. Coverage tally

Counting each screen-row × applicable-state cell above (N/A cells excluded):

| State | has-primitive (✅) | ad-hoc (🟡) | missing (❌) |
|---|---|---|---|
| loading | ~25% of rows (segment-specific `loading.tsx`) | ~75% (inherits generic portal skeleton) | 0% |
| empty | ~90% (`LnEmptyState`) | ~10% (inline combobox lists) | 0% |
| error | ~100% (portal `error.tsx` + `ErrorBoundary`, fitness-tested) | 0% | 0% |
| offline | 0% | 0% | **100%** |
| success | ~15% (`SuccessScreen`, wizards only) | ~85% (silent reload / ad-hoc `setDone`) | 0% |
| partial | 0% (no shared component) | 100% of the 3 bulk-queue screens that need it (rest N/A) | — |
| insufficient-permissions | ~95% (portal guard + `acceso-denegado` + `OpBreach`) | ~5% (org admin layout hand-rolled) | 0% |
| no-results | ~85% (`LnEmptyState`) | ~15% (inline dropdown lists) | 0% |
| maintenance | 0% | 0% | **100%** |

**Overall**: of the 9 states, **3 are strong** (error, empty/no-results,
insufficient-permissions), **2 are thin-but-present** (loading, success), **1
is duplicated-not-shared** (partial), and **2 are systemically absent**
(offline, maintenance). Rough blended coverage across all screens × states ≈
**55–60%** if "has a real, honest signal for the user" is the bar (✅ + solid
🟡 count, weak 🟡 and ❌ don't).

## 6. Which states most need a new shared primitive

1. **Partial-success `BulkResultPanel`** — extract the 3 duplicated
   `ResultPanel` implementations (`BulkApprovalQueueList`, `AdoptionQueueList`,
   `OrgMascotasBulkList`) into one `components/ui/dashboard/BulkResultPanel.tsx`.
   Lowest-risk, highest-clarity win — the UX is already right, it's just not
   shared.
2. **A real success-toast convention** — the sonner infra is mounted and
   idle. Simple CRUD mutations (the ~48 files that now do
   `navigateAfterActionSuccess`) have zero user-facing confirmation beyond
   the new page state. A thin helper (`toastAfterActionSuccess(message)`
   paired with `navigateAfterActionSuccess`) would close this cheaply.
3. **Offline banner** — even a minimal `navigator.onLine` listener + banner
   (no full offline-first architecture needed) would remove a total blind
   spot, especially for field operators (vets, welfare inspectors) on mobile
   data.
4. **Org portal 404** — `app/org/[orgToken]/not-found.tsx` reusing
   `BrandedNotFound` with a "volver al panel" exit, matching every sibling
   portal.
5. Maintenance is the lowest-priority gap given no ops signal currently
   requires it (no active maintenance-window workflow in this codebase), but
   worth a one-page placeholder before the first real deploy freeze.

---

## Files referenced

- `components/ui/EmptyState.tsx`, `components/ui/EmptyState.test.tsx`
- `components/ErrorBoundary.tsx`, `components/ErrorBoundary.test.tsx`
- `components/BrandedNotFound.tsx`
- `components/ui/SuccessScreen.tsx`, `components/ui/SuccessScreen.test.tsx`
- `components/ui/dashboard/OpBreach.tsx`
- `components/ui/Skeleton.tsx`, `components/ui/LnCardSkeleton.tsx`,
  `components/ui/dashboard/OpKpiSkeleton.tsx`,
  `components/ui/dashboard/OpCardSkeleton.tsx`,
  `components/panorama/PanoramaBoardSkeleton.tsx`
- `components/Toaster.tsx`, `components/gob/NoticeToast.tsx`
- `components/BulkApprovalQueueList.tsx`, `components/AdoptionQueueList.tsx`,
  `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx`
- `app/acceso-denegado/page.tsx`, `__tests__/acceso-denegado-page.test.ts`
- `__tests__/error-boundary-presence.test.ts`, `__tests__/skeleton.test.tsx`
- `lib/ui/full-page-action-nav.ts`,
  `docs/design/handoffs/2026-07-04-router-refresh-tiers.md`
- `public/sw.js`
- `app/gob/perdidas/page.tsx`,
  `docs/reviews/2026-07-15-cursor-qa-admin-official-roles-fresh.md`,
  `docs/superpowers/plans/archive/2026-06-22-admin-executive-review-fixes.md`
- `app/org/[orgToken]/admin/layout.tsx` (hand-rolled restricted-access gap)
