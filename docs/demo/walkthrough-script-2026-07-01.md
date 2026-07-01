# Demo Walkthrough Script (guion de recorrido) — 2026-07-01

> **STATUS: DRAFT FOR VALIDATION.** Nothing is recorded yet. This is the shot-list to approve before
> building the Playwright specs and recording. Every screen and flow the app has is listed per profile.
> Once Ignacio approves (and picks the decisions in §0), the specs get written and the `.webm` recorded.

## 0. Reality checks & decisions to approve first

These change the plan, so confirm them before we record:

1. **The committed Playwright harness records NO video.** `playwright.config.ts` has `video: "off"`; the
   three root `.webm` (`admin-demo-walkthrough.webm`, etc.) were produced ad-hoc and never committed — no
   generating spec exists. → I will **add** a demo recorder: a new `e2e/demo/*.spec.ts` set with
   `test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } })`, a viewport clean of devtools,
   and a post-run step that renames `test-results/**/video.webm` → `docs/demo/videos/NN-profile.webm`.
   This is a code change (tests + a small record script) on a `feat/demo-recording` branch.

2. **Recording needs the local Supabase DB up + fully seeded.** Task authorizes local seed ("el seed es
   local, no toques la DB remota"). Plan: `supabase start` → `pnpm db:bootstrap` → the full seed chain
   (§4). All local (`127.0.0.1`), never remote. Confirm the local stack is available on this machine.

3. **Photo bucket bug → blank avatars.** `seed-demo.ts` uploads pet photos to a `seed-photos` bucket, but
   the app reads from `pet-photos` (`lib/infra/storage.ts:15`), so seeded avatars render blank. Two fixes,
   both in scope:
   - (a) point the seed at `pet-photos` (small `seed-demo.ts` change) so listings/credentials aren't blank;
   - (b) upload 2–3 real photos **through the actual forms** during recording (alta de mascota / adopción /
     perdida), per the task. I'll do **both** (a for populated screens, b to show the upload UX).
   Real photos available in `docs/archive/Fotos/` (russian dog.jpg, hachi.jpg, bolt.jpg, courage.jpg, …).

4. **Which login account per profile?** The repo has two seed universes. My recommendation — one clean
   account per profile, richest data each (see §3 table). Key question: the **veterinaria/clínica** profile
   needs a *clinic-type org* (Servicios + Agenda). Options:
   - **V-A (recommended):** log in as `alejo@dim.test`, focus on **Clínica Veterinaria Recoleta** (a real
     clinic org from `seed:demo`) — shows the full clinic portal populated.
   - **V-B:** start as `owner@`, run the **`/cuenta/crear-consultorio`** flow live to *create* a clinic,
     then use it — shows onboarding but starts empty.
   I suggest **V-A** for coverage + **also** filming the create-consultorio flow inside the owner segment.

5. **Segmentation.** One `.webm` per profile (6 base). Owner and Gob/Admin are large; if a segment runs
   very long I'll split by area (e.g. `02a-dueno-mascotas.webm`, `02b-dueno-turnos-denuncias.webm`). Time
   per screen is not optimized (you edit later) — coverage is the priority.

---

## 1. Segments (deliverables)

| # | File (proposed) | Profile | Login |
|---|---|---|---|
| 01 | `docs/demo/videos/01-publico.webm` | Público / anónimo | none |
| 02 | `02-dueno.webm` (may split a/b) | Ciudadano / Dueño | `owner@dim.test` |
| 03 | `03-refugio.webm` | Organización — Refugio (shelter) | `orgadmin@dim.test` |
| 04 | `04-veterinaria.webm` | Organización — Veterinaria (clinic) | `alejo@dim.test` (Clínica Recoleta) |
| 05 | `05-gobierno.webm` (may split) | Gobierno | `govt@dim.test` |
| 06 | `06-admin.webm` (may split) | Admin | `admin@dim.test` |

Password for all: `Test1234!`. Every segment: real UI login → walk the **entire** nav in order → full
scroll on each screen → fill & submit forms with real data → run the multi-step flows end to end.

---

## 2. Screen-by-screen shot list

Legend: **▶ flow** = multi-step process run end-to-end · **✎ form** = fill every field + submit ·
**📷 photo** = upload a real image · **⤓ scroll** = full scroll (tables/dashboards).

### SEGMENT 01 — PÚBLICO (no login)
1. `/` landing ⤓
2. `/adoptar` catalog ⤓ → `/adoptar/[petToken]` a pet → **▶ `/adoptar/[petToken]/postular`** ✎ (adoption application: all fields, submit)
3. `/perdidas` lost board ⤓
4. `/refugios` directory → `/refugios/[orgToken]` public shelter profile ⤓ (logo + adoption list + services)
5. `/denuncias` hub → **▶ `/denuncias/nueva`** ✎📷 (denuncia wizard end-to-end, upload evidence photo) → `/denuncias/codigo/[code]` comprobante ⤓ → `/denuncias/buscar` (look up same code) → `/casos/[publicCode]` case view
6. **QR credential:** `/p/[publicToken]` (Tier 0) → for a lost pet show Tier 1 → **▶ `/p/[publicToken]/encontre`** ✎ ("la tengo") and `/p/[publicToken]/sighting` ✎ ("la vi cerca")
7. `/libreta/compartir/[shareToken]` shared read-only libreta
8. Static/legal: `/acerca` `/ayuda` `/accesibilidad` `/privacidad` `/terminos` `/cookies` `/sugerencias` ✎
9. Auth screens (no submit): `/login`, `/signup`, `/recuperar`

### SEGMENT 02 — DUEÑO (`owner@dim.test` → `/inicio`)
Masthead: account pill + notifications bell shown throughout.
1. `/inicio` home ⤓ (greeting, "Asentar un hecho" capture, pets, vencimientos)
2. **▶ New pet:** `/mis-mascotas` → **`/mis-mascotas/nueva`** ✎📷 (onboarding wizard, upload photo) → (`/nueva/match/[token]` if dup) → `/nueva/[publicToken]/credencial` (issued QR)
3. `/mis-mascotas/[publicToken]` pet profile ⤓ → tabs `?tab=libreta`, `?tab=vacunas` → `/editar` ✎
4. **▶ Event capture:** `/mis-mascotas/[token]/anotar` (catalog) → walk key sub-forms `…/eventos/nuevo/{vacuna,antiparasitario,clinico,sintoma,peso,medicacion-inicio,esterilizacion,microchip,tatuaje,checkin,nota,vet,mordedura,fallecimiento}` ✎ each → `/historial` ⤓ → `/eventos/[eventId]`
5. `…/vacunas/programar` ✎, `…/mostrar-libreta`, `…/asistencia` ✎ → `…/asistencia/presentar` (service-dog full-screen)
6. **▶ Lost/found:** `…/perdida` ✎ (mark lost) → `…/cartel` (printable poster) ⤓
7. `…/buscar-hogar` ✎ (rehome), `…/devolucion`
8. Claim flows: `/mis-mascotas/reclamar` ✎, `/mis-mascotas/reclamar-dni` ✎
9. `/mis-mascotas/postulaciones` (adoption applications tracked)
10. **▶ Turnos:** `/turnos/buscar` → `/turnos/buscar/[offeringToken]` → **`…/reservar/[slotId]`** ✎ (book) → `/mis-turnos` → `/mis-turnos/[appointmentToken]`
11. **▶ Transfers:** `/transferencias` → `/transferencias/[transferToken]` (accept)
12. **▶ Denuncias (citizen):** `/denuncias/mias` → `/denuncias/[id]`
13. `/notificaciones` inbox ⤓ (category tabs)
14. **Account:** `/cuenta` → `/cuenta/editar` ✎, `/cuenta/privacidad` ✎, `/cuenta/verificar-dni` ✎, `/cuenta/upgrade`, `/cuenta/memberships`, `/cuenta/solicitudes`, `/cuenta/casos`
15. **▶ Create clinic (onboarding):** `/cuenta/crear-consultorio` ✎ (become an org — sets up Segment 04's clinic if we go V-B)
16. **▶ Foster (volunteer side):** `/cuenta/ofrecerme-como-transito` ✎ → `/cuenta/transitos` → `/activos`, `/historial`, `/propuestas` → `/propuestas/[proposalToken]`

### SEGMENT 03 — REFUGIO / shelter org (`orgadmin@dim.test` → `/org/[orgToken]`)
Nav order: Operación · Animales · Adopciones · Casos · Administración.
1. **Operación:** `/org/[t]` panel ⤓ → `/agenda` → `/agenda/turnos/[appointmentToken]` → **▶ `/intake`** ✎📷 (intake new animal + photo) → `/intake/match/[token]` → `/censo` ⤓ (occupancy) → `/transitos` → `/voluntarios` → `/voluntarios/propuestas`
2. **Animales:** `/mascotas` ⤓ → `/mascotas/[publicToken]` detail → **▶ `…/adoptar`** ✎ (list for adoption) → `…/adoption` (finalize) → `…/foster` ✎ (assign foster) → `…/foster-fin` → **▶ `…/transfer`** ✎ (org→org custody) → `…/microchip/reemplazar` ✎ → `…/devolver-al-dueno` → `/pets/no-aptas` → `/transferencias` → `/transferencias/nueva` ✎ → `/transferencias/recibidas`
3. **Adopciones:** `/adopciones` queue → `/adopciones/[appEventId]` (review an application, approve/next) → `/checkins`
4. **Casos:** `/casos` → `/maltrato/recibidos` → `/maltrato/nuevo` ✎ → `/mordedura/nuevo` ✎
5. **Administración:** `/servicios` → `/servicios/nuevo` ✎ → `/servicios/[offeringToken]` → `…/agenda` ✎ (schedule rules) → `/miembros` → `/miembros/invitar` ✎ → `/cobertura` ✎ → `/admin/permisos` → `/configuracion` ✎

### SEGMENT 04 — VETERINARIA / clinic org (`alejo@dim.test` → Clínica Recoleta `/org/[t]`)
Same `/org` portal, clinic-capability focus (Servicios + Agenda are the clinic's core):
1. `/org/[t]` panel ⤓
2. **▶ Servicios:** `/servicios` → `/servicios/nuevo` ✎ (create a vet service) → `/servicios/[offeringToken]` → `…/agenda` ✎ (schedule rules / slots)
3. **▶ Agenda:** `/agenda` (bookings dashboard) → `/agenda/turnos/[appointmentToken]` (attend an appointment)
4. `/mascotas` (pets in care) → `/mascotas/[publicToken]` → clinical event on a pet (vet-side)
5. `/miembros`, `/configuracion`, `/cobertura` (clinic admin)
6. Note: also show a vet recording a clinical event on a patient via the pet timeline.

### SEGMENT 05 — GOBIERNO (`govt@dim.test` → `/gob`)
1. Top: `/gob` panel ⤓ → `/gob/panorama` (geospatial console, pan/zoom layers) ⤓ → `/gob/programa` (+ forecast) ⤓
2. **Vigilancia:** `/vigilancia` → `/vigilancia/brotes` → `/vigilancia/zoonosis` → **▶ `/vigilancia/investigaciones`** → `/investigaciones/nuevo` ✎ → `/investigaciones/[caseCode]`; `/mortalidad` ⤓; `/analytics` ⤓ → `/analytics/export`; `/campanas` ✎; `/outreach`; `/poblacion` ⤓
3. **Casos y cumplimiento:** `/casos` → `/maltrato` → `/maltrato/[id]` (triage) → **▶ `/decomisos`** → `/decomisos/nuevo` ✎ → `/decomisos/[publicCode]`; `/disputas` → `/disputas/[disputeToken]`; `/perdidas`
4. **Registro y aprobaciones:** `/censo` ⤓ → `/adopciones` → **▶ `/cola`** → `/cola/[publicToken]` (approve/reject a registration) → `/organizaciones` → `/usuarios` → `/reglas` ✎
5. **Confiabilidad:** `/sistema` → `/outbox`
6. **Referencia:** `/servicios` → `/servicios/[offeringToken]`; `/historial`

### SEGMENT 06 — ADMIN (`admin@dim.test` → `/admin`)
1. Top: `/admin` dashboard ⤓ → `/admin/panorama` ⤓
2. **Analítica:** `/programa` → `/censo` → `/adopciones` → `/poblacion` (all ⤓)
3. **Operaciones:** `/alertas` (show the fired sterilization-coverage alert) → `/casos` → **▶ `/moderacion`** → `/moderacion/[id]` (moderate) → `/observaciones` → `/observaciones/[publicToken]` → `…/microchip/reemplazar`
4. **Confiabilidad:** `/sistema` → `/sistema/crons` (cron health) → `/outbox` → `/outbox/[id]` → `/auditoria` ⤓
5. **Identidad y acceso:** `/govts` → `/govts/new` ✎ → `/govts/[userId]`; `/admins` → `/admins/new` ✎ → `/admins/[userId]`
6. **Gobernanza:** **▶ `/jurisdicciones`** → `/[country]/[province]/[locality]/reglas` → `…/reglas/nueva` ✎ → `/historial` → `/libro` (event book, incl. the seeded amendment chain) ⤓ → `/servicios`
7. `/admin/acerca/integracion-miarg` (Mi Argentina)

---

## 3. Login account per profile (recommended)

| Profile | Account | Why | Data source |
|---|---|---|---|
| Público | — | — | seed:demo listings + panorama |
| Dueño | `owner@dim.test` | enriched with lost-pet, vaccines, turno, notifications, transfer | seed:test + seed:owner-demo + seed:coverage |
| Refugio | `orgadmin@dim.test` (Refugio Test) | shelter with pets + coverage; feature tables filled | seed:test + seed:coverage |
| Veterinaria | `alejo@dim.test` (Clínica Recoleta) | real clinic-type org with services/agenda | seed:demo |
| Gobierno | `govt@dim.test` | CABA-focal, panorama/scenario density | seed:demo:scenario + seed:panorama |
| Admin | `admin@dim.test` | fired alert, moderation, libro amendment, crons | seed:test + seed:demo:scenario |

Mixing accounts across segments is invisible (each segment is a separate video).

---

## 4. Data prerequisites (local seed chain, in order)

All local (`127.0.0.1:54321` API / `:54322` DB). Never remote.
```
supabase start
pnpm db:bootstrap            # schema + triggers + storage + reference + seed:test (roles)
pnpm seed:panorama           # national dashboard density
pnpm seed:demo:scenario      # CABA govt scenario + fired alert + libro amendment
pnpm seed:perf               # showcase + PERF-STATE pets (prereq for coverage)
pnpm seed:coverage           # fills every feature table (offerings, slots, welfare, fosters, transfers…)
pnpm materialize:slots       # open future slots so bookings work
node --conditions=react-server --import tsx scripts/seed-owner-demo.ts   # owner lost/vaccines/turno/notifs/transfer
pnpm seed:demo               # persona universe + storyline pets + PHOTOS (after bucket fix, §0.3a)
pnpm demo:verify             # gate: prints OK/FALTA per invariant
```
Then record against the built app: `NEXT_BUILT=1 pnpm build && pnpm start --port 3333` with
`NEXT_PUBLIC_DEMO_MODE=true` at build+start.

---

## 5. Coverage index (final deliverable — filled after recording)
A `docs/demo/videos/INDEX.md` will list, per `.webm`: profile, ordered screens/flows covered, duration,
and the seed state used. (Placeholder until recording.)

## 6. Out of scope / notes
- 308-redirect routes are noted but not filmed as standalone (they redirect): `…/libreta`, `…/vacunas`,
  `…/eventos/nuevo`, `/pro/*`, `/admin/cola|usuarios|organizaciones`.
- Cron/API routes are backend-only (shown indirectly via `/admin/sistema/crons`, `/admin/outbox`).
- No push / PR / remote DB / deploy — recording specs commit to a `feat/demo-recording` branch, local only,
  handed back with branch + SHAs + this coverage list for approval.
