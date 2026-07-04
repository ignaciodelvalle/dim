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

### Post-review triage (CC, response to both Cowork passes)

All three 🔴 fixed and browser-verified @ `b641e983` (server on :3000 runs it):
sistema digest 1282362471 (sql<Date> type lie in fetchGovtActivity → .getTime()
on a string; crash canary added), outbreak_signal off owner surfaces
(excludeAuthorityOnlyClause, §6), inbox coherence + all data quick wins
(stale notifs archived, Lucía Fernández + real emergency contact, Lorenzo/
Greco/Romeo renames, admin's 460-unread pile marked read).

**Two REAL engineering findings from pass 2, filed post-demo (tasks #38/#39):**
- Memory leak: RSS grows ~0.5MB/request unbounded (reproduced: 327→552MB over
  ~600 requests, connections flat — not pool starvation). Explains the global
  "Cargando…" degradation at ~1.5h.
- Login clicks silently dropped (hydration #418 class): button click fires no
  request; form.requestSubmit() works.

### FILMING PROTOCOL (mandatory, works around #38/#39)

1. **Restart the server immediately before the shoot** and again between
   segments if any screen janks: kill :3000 + `powershell -File
   scripts/qa-up.ps1 -Port 3000` (~15 s). A fresh process starts at ~330MB;
   degradation needs 1h+ of load.
2. **Login on camera: type credentials, press Enter** (keyboard submit) after
   letting the page settle 2-3 s — do not rely on clicking the button.
3. Booking beat: type **Recoleta** in the locality filter (Palermo default
   shows no services). Do not open "Ver detalle" on the amended event (shows
   the pre-correction original by design — D2).
4. Finder shots (`/p/…/encontre`, `/p/…/sighting`): use an incognito window
   (session bleed shows "Estás enviando como …"). Both routes verified fast
   on a fresh server.
5. `/gob/analitica` does not exist — the sidebar link points to
   `/gob/analytics` (pass-2 404 was a hand-typed URL).

---

## Fase 1 — Gates (Cowork)

**Lane:** Cowork recommendations only · **Replay SHA:** `bf765974` (Final GO pass
build; Fase 0 header still cites `71fe2bb0` for qa-up origin) · **When:**
2026-07-03 ~22:30 ART · **URL:** http://localhost:3000 (prod server, not dev)

### HTTP gates (PowerShell `Invoke-WebRequest`, unauthenticated)

| Route | Status |
|---|---|
| `/login` | 200 |
| `/adoptar` | 200 |
| `/perdidas` | 200 |
| `/refugios` | 200 |
| `/denuncias/nueva` | 200 |
| `/p/DEMO-PET-001` | 200 |
| `/p/DIM-4SUZ-U2HT` | 200 |
| `/p/DIM-BU4K-QRZU` | 200 |

**Resultado:** ✅ All gates green (replay matches CC pre-browser block @ 71fe2bb0).

### Browser login smoke (password `Test1234!`)

| Actor | Email | Landing | Result |
|---|---|---|---|
| Dueño | `owner@dim.test` | `/inicio` | ✅ |
| Vet clínica | `alejo@dim.test` | `/org/DIM-6TZM-DUJZ` (Clínica Veterinaria Recoleta) | ✅ |
| Org refugio | `orgadmin@dim.test` | `/org/DIM-EE4N-G2M9` (Refugio Esperanza Animal) | ✅ |
| Govt CABA | `govt@dim.test` | `/gob` | ✅ |
| Admin | `admin@dim.test` | `/admin` | ✅ |

**Notas de sesión:** role-switch vía `/login` directo (botón "Cerrar sesión" no
navega de forma confiable en automatización). Token clínica correcto:
`DIM-6TZM-DUJZ` (no `DIM-CLN-RECOLETA`).

---

## Fase 2 — Clickthrough por segmento (Cowork)

### Segmento 1 — Dueño (`owner@dim.test`)

| Pantalla / beat | Estado | Evidencia |
|---|---|---|
| `/inicio` — 4 mascotas curadas (Firulais, Michi, Atún, Rocco) | ✅ | Cards render; Michi badge **PERDIDO** |
| `/inicio` — vencimiento Atún antirrábica 9 días | ✅ | Card "Estado sanitario" amber due-soon |
| `/inicio` — caso Michi perdida | ✅ | Lost-case block visible |
| Notificación `vaccine_due` (Antirrábica anual, Atún, 9 días) | ✅ | Shape exacto del beat fix-C |
| `DEMO-PET-001` (Rocco) — overlay `event_amended` | ✅ | "Corregido… Ver original" en antirrábica libreta |
| `DIM-4SUZ-U2HT` (Michi) — perfil perdido + credencial Tier-1 | ✅ | LostCaseBlock + `/p/DIM-4SUZ-U2HT` contacto dueño |
| Fotos reales owner@ (Firulais, Rocco, Atún) | ✅ | Michi placeholder (esperado) |
| Banner demo en superficies citizen | ✅ (ausente) | Correcto: banner global solo en `/admin/*` |
| Inbox — "Marcaste a Michi como encontrada" vs Michi aún PERDIDO | 🔴 | Contradicción seed/estado rompe confianza |
| Inbox — referencias pre-polish (Luna, Toby, Refugio Test) | 🟡 | Notificaciones stale no archivadas |
| Inbox — welcome "¡Bienvenido a **DIM**, Lucía Tester!" | 🟡 | Brand drift (MiMAR en UI) |
| Vencimiento card menciona **Malbec** (no está en las 4 mascotas) | 🟡 | Reminder huérfano post-polish |
| Rocco libreta — `outbreak_signal` ("Señal de brote") visible al dueño | 🔴 | Debería ser NON-libreta (AGENTS.md) |
| Rocco — contactos emergencia basura ("Veterinario 12414421142") | 🟡 | Seed polish incompleto en emergency fields |
| `/turnos` booking beat `DEMO-SVO-RABIA-01` | ✅ (parcial) | Slots lun–vie 09–13 visibles; reserva end-to-end no filmada |

### Segmento 2 — Vet / clínica (`alejo@dim.test` → `DIM-6TZM-DUJZ`)

| Pantalla / beat | Estado | Evidencia |
|---|---|---|
| Portal clínica Recoleta carga | ✅ | Panel org operativo |
| Agenda lun **2026-07-06** (`?fecha=2026-07-06`) | ✅ | **4 turnos** 09:00–09:45 — Blue, Chicha, Cielo, Courage |
| Turnos Confirmado + Vacunación antirrábica | ✅ | Beat filmable en weekday morning |
| Viernes 2026-07-03 — slots tarde sin reservas | ✅ (info) | Beat correcto es el lunes, no viernes |

### Segmento 3 — Refugio (`orgadmin@dim.test` → `DIM-EE4N-G2M9`)

| Pantalla / beat | Estado | Evidencia |
|---|---|---|
| Panel Refugio Esperanza Animal | ✅ | 4 custodia, casos poblados |
| `/org/…/mascotas` listado | 🟡 | Incluye **`QA Test Pet 1782994750299`** — nombre QA sobrevivió al polish |
| Portal no vacío (beat filmable) | ✅ | Short-flow adoptable en cámara |

### Segmento 4 — Gobierno (`govt@dim.test`)

| Pantalla / beat | Estado | Evidencia |
|---|---|---|
| `/gob` panel KPIs + casos | ✅ | Caso Michi `CAS-AAJG-FDJS` visible |
| `/gob/panorama` | ✅ | Mapa + capas; disclaimer local "Datos de demostración… sintético" |
| Banner demo global en `/gob` panel | ✅ (ausente) | Esperado: disclaimer solo en panorama |
| Dashboards detalle (mortalidad, vigilancia, etc.) | ✅ (smoke) | No se profundizó cada sub-ruta |

### Segmento 5 — Admin (`admin@dim.test`)

| Pantalla / beat | Estado | Evidencia |
|---|---|---|
| `/admin` panel | ✅ | KPIs (1997 usuarios, cola 4, decisiones 7d) |
| Banner demo — **una vez** por pantalla | ✅ | CDP: 1× "Datos de demostración" en `/admin` y `/admin/panorama` |
| `/admin/panorama` | ✅ | Centro de Situación Nacional completo (mapa, KPIs, capas) |
| `/admin/alertas` | ✅ | Bandeja con badge nav "Alertas 1"; filtros operativos |
| `/admin/libro` | ✅ | Libro de eventos + filtros; timestamp freshness footer |
| `/admin/censo` | ✅ | 63.413 mascotas, embudo chip 64.9%, ranking provincias |
| `/admin/sistema` — drift card = **2** | 🔴 | **Error boundary** "Algo salió mal" (digest `1282362471`); card no verificable |
| `/admin/sistema/crons` | ✅ | 21 crons con runs recientes (< 1h); `vaccine_due` OK 0 items |

---

## Fase 3 — Cierre (Cowork)

### Tabla ejecutiva

| Severidad | Count | Resumen |
|---|---|---|
| 🔴 | 3 | Inbox contradice Michi perdida; `outbreak_signal` en libreta dueño; `/admin/sistema` crash |
| 🟡 | 7 | Notificaciones stale, brand DIM, Malbec orphan, emergency contacts, QA pet name refugio, booking no E2E |
| ✅ | — | Gates HTTP, 5 logins, beats core (amended, vaccine_due, vet agenda 4 turnos, govt/panorama, admin ops surfaces) |

### Top 5 rompe-confianza (film/demo)

1. **Inbox "Michi encontrada" con Michi aún PERDIDO** — el dueño ve mensajes
   contradictorios en la misma sesión que el beat de pérdida.
2. **`/admin/sistema` no carga** — el operador no puede ver salud del sistema ni
   la card de drift=2 documentada en Fase 0.
3. **`outbreak_signal` en libreta del dueño (Rocco)** — telemetría de
   vigilancia expuesta como historia médica; rompe el contrato libreta vs eventos.
4. **Notificaciones con nombres pre-polish** (Luna, Toby, Refugio Test) — el
   inbox parece desactualizado respecto al home curado.
5. **`QA Test Pet…` en portal refugio** — rompe la ilusión de demo pulido ante
   cámara en Segmento 3.

### Top 5 quick wins (antes de filmar)

1. Archivar o corregir la notificación "Michi encontrada"; alinear inbox con
   `pets.status='lost'` para `DIM-4SUZ-U2HT`.
2. Investigar y fix del crash en `/admin/sistema` (digest `1282362471`) — sin
   esto no se puede mostrar drift=2 en cámara.
3. Filtrar `outbreak_signal` (y resto NON-libreta) del timeline owner/libreta.
4. Pasada final de notificaciones owner@: archivar Luna/Toby/Malbec/welcome DIM.
5. Renombrar o reasignar `QA Test Pet 1782994750299` en custodia Esperanza Animal.

### Veredicto clickthrough

**GO condicional para filmar beats 1–4** (dueño, vet agenda, refugio, govt).
**NO-GO para beat admin/sistema** hasta resolver el crash de `/admin/sistema`.
Los 🔴 de inbox/libreta no bloquean el rodaje técnico pero sí degradan la
credibilidad ante PO — recomendado fix rápido de inbox + outbreak filter.

---

## Addendum — segunda pasada independiente (Cowork B, misma noche)

Una segunda sesión Cowork corrió el mismo protocolo en paralelo (22:30–23:15
ART, Chrome CDP, prod @ `bf765974`, HEAD repo `2b63c7ed`) sin ver las secciones
de arriba hasta el cierre. Este bloque registra SOLO deltas: confirmaciones
relevantes, discrepancias entre pasadas y hallazgos que arriba no están.
Sin submits con efecto: ninguna reserva confirmada, ninguna mascota creada.

### Confirmaciones (independientes, mismos hallazgos)

`/admin/sistema` crash digest `1282362471` (repro 2/2 tras Reintentar) · inbox
"Marcaste a Michi como encontrada" contradiciendo el beat de perdida · reminder
huérfano **Malbec** (además: "vence en 364 días" listado como "próximo") ·
`QA Test Pet 1782994750299` en custodia Esperanza · contactos de emergencia
basura en Rocco · 4 turnos lunes 09:00–09:45 (Blue/Chicha/Cielo/Courage)
coherentes con el 1/4-reservado del picker público · banner demo 1× en
`/admin/*` y panorama · logins 5/5.

### Discrepancias entre pasadas (re-chequear a mano antes de filmar)

1. **`/admin/alertas`**: arriba figura ✅; en esta pasada quedó en
   "**Cargando…**" indefinido (3 esperas, 30s+, con server-component errors en
   consola en la misma ventana). Posible carga intermitente/lenta — si tarda
   >5s en cámara, el beat de la alerta muere igual.
2. **Booking beat**: arriba "✅ parcial". En esta pasada el camino del guion
   ("Agendar" desde el recordatorio de Atún) **muere en el default**: prefillea
   la localidad del dueño (Palermo) → "**Sin servicios disponibles en
   Palermo**". La oferta vive en **Recoleta**: tipeándola, ✅ impecable
   ("Gratuito · 15 min · 96 turnos en 7 días" → grilla `DEMO-SVO-RABIA-01`).
   → Anotar en el guion "tipear Recoleta" o dar cobertura Palermo a la oferta.
   Nota: sábado 4/7 también tiene slots (el plan decía lun–vie).

### Hallazgos nuevos (no listados arriba)

**🔴 Rompe-beat / rompe-confianza**

1. **El detalle del evento corregido muestra el payload viejo** (gap fix-A):
   en `/mis-mascotas/DEMO-PET-001/eventos/333e786f…` el título/brand es
   "**Defensor 3 (incorrecto)**" aunque el timeline ya muestra "Nobivac
   Rabies" con el badge ✎. El mismo detalle expone `source:
   seed-demo-scenario` y `payload_version` crudos. Un click en "Ver detalle"
   durante el beat fix-A muestra exactamente lo que la corrección tapaba.
2. **React error #418 (hydration mismatch) recurrente en prod** (consola,
   22:51/22:53/23:05, distintas pantallas autenticadas) + **stalls de pintado
   de 30s+** reproducibles (viewport EN BLANCO al scrollear/navegar en
   `/inicio`, perfil de mascota, `/p/DIM-4SUZ-U2HT`; múltiples timeouts CDP).
   Mayor riesgo de jank visible en la filmación completa; sospecha de causa
   común con el doble-click de login/logout que ambas pasadas vieron.
3. **`DIM-BU4K-QRZU` (token documentado del beat Tier-0) se llama "Capacity
   Sync Dog"** (`Perro · No especificado`) — residuo QA en una de las 3 URLs
   públicas del guion.

**🟡 Degrada el film**

4. `/p/DIM-4SUZ-U2HT` (Michi): el hero perdida usa el placeholder "M" como
   backdrop full-bleed blureado → pantalla entera naranja con una M gigante
   (con foto real funcionaría; con placeholder desconcierta, y es la página
   que abre un desconocido desde el QR). Además "**hace 1 días**" y es la
   página más pesada de la app (ver stalls).
5. **Doble Rocco**: gato adoptable "Rocco" (Esperanza, publicado en `/adoptar`)
   vs el Rocco border collie hero de owner@ — dos Roccos de especies distintas
   en el mismo guion.
6. **Contradicciones de compliance en el pet hero** (misma pantalla): header
   "Microchip verificado" vs card "Microchip DECLARADA · SIN VERIFICAR";
   "Vacuna antirrábica **SIN REGISTRO** · 0 DE 3 AL DÍA" vs libreta con
   antirrábica 5/5/26 y "1 VIGENTE" (si solo cuenta vet-verificado, el label
   esperado es DECLARADA · SIN VERIFICAR).
7. **Embudo de censo**: la barra "Con chip ISO activo — 41.125 (64,9%)" pinta
   con **fill 0** (la fila gemela "ISO 11784/11785 válido" con el mismo número
   pinta ~65%); chart "Altas nuevas" en blanco.
8. Fechas futuras en superficies filmables: "último evento **31/12/26**"
   (`/admin` footer), "Datos al **15/10**, 07:33" (panorama), "Esterilización:
   castración **10/7/26**" primera en el timeline de Rocco.
9. Cosmética con nombre y apellido: agenda "Vacunación antirrábica ·
   Vacunación antirrábica" (duplicado); "Atún · **PANO —** Campaña…" (prefijo
   interno en la agenda del dueño); chip "PERDIDO" para Michi (concordancia);
   copy de refugio en panel de clínica ("custodia del refugio"); sidebar govt
   "Operador/a Gobierno (rem…" truncado; empty-state duplicado en
   `/org/…/adopciones`; "ATENCIÓN ·VACUNA" sin espacio tras "·".
10. `/org/DIM-EE4N-G2M9/adopciones` **no crashea** — pero Esperanza no tiene
    postulaciones; el crash conocido era en la org con "2 en curso" y quedó
    **sin re-verificar ahí** (pendiente CC).

### Quick wins adicionales (suman a los 5 de arriba)

- Renames por SQL: "Capacity Sync Dog" y el gato "Rocco" de Esperanza →
  nombres es-AR (mismo mecanismo del polish).
- Un string cada uno: "hace 1 días", "PERDIDO/A", "· " en severidades,
  título duplicado de agenda.
- Guion: tipear **Recoleta** en el booking; agenda vet directo con
  `?fecha=2026-07-06`; no clickear "Ver detalle" del evento corregido hasta
  que CC cierre el gap fix-A.
- Label de compliance antirrábica (SIN REGISTRO → DECLARADA · SIN VERIFICAR).

### Para CC (triage, adicional)

- Hydration #418: repro navegando logueado `/inicio` → perfil → libreta en
  build prod con consola abierta; correlacionar con stalls de paint.
- Fix-A gap: la página de detalle de evento no aplica correcciones (el
  timeline sí).
- `/admin/alertas`: medir el query — 30s+ sin resolver en esta pasada.
- Embudo censo: width 0 en la barra "Con chip ISO activo".

*Cowork B — solo lectura, 2026-07-03 noche.*

---

## Addendum 2 — deep-dive en los huecos de la primera pasada (Cowork B, 2026-07-03 ~23:20–23:55)

Cuatro áreas donde la pasada original quedó corta, re-auditadas. Un hallazgo
domina a todos los demás y va primero.

### 🔴🔴 El server de prod se degrada globalmente con el uptime (GO-blocker)

Cronología observable en una sola sesión de server (`qa-up` @ `bf765974`):

- ~22:30: todo renderiza (públicas instantáneas, /gob panel completo, crons).
- ~22:40+: stalls de pintado de 30s+ y React #418 (ya reportado arriba).
- ~23:40: `/gob/analytics`, `/gob/vigilancia`, `/gob/mortalidad`, `/gob/casos`
  → "Cargando…" indefinido (30s+ c/u, con reload).
- ~23:50: **`/gob` (que renderizó completo 20 min antes) y `/adoptar` (pública,
  instantánea al inicio) también quedan en "Cargando…"**.

Patrón: mismas páginas, mismo build, misma sesión — solo cambió el uptime/carga
acumulada. Sospecha clásica: agotamiento de pool de conexiones a Postgres (cada
página colgada retiene conexiones y acelera la espiral). Consecuencia directa
para el rodaje: **una sesión de filmación larga va a morir a mitad de camino**.
CC: revisar logs del server de qa-up + configuración de pool antes del GO
definitivo; considerar reinicio del server entre segmentos como mitigación de
guion.

Corolario: el "✅ /admin/alertas" de la pasada A vs mi "Cargando…" no es
contradicción — es la misma degradación vista en momentos distintos.

### 🔴 Login: los clicks en "Iniciar sesión" a veces no despachan el submit

Diagnóstico preciso (tab nueva, form correcto, sin mensaje de error, **cero
requests de red** al clickear): el form usa una **server action** (prop
`action` function, sin `onSubmit`), y el click en el botón no dispara el
submit; `form.requestSubmit()` por consola loguea al instante. O sea: la
action funciona, el dispatch del click se pierde (probable re-render entre
mousedown/mouseup o hidratación incompleta — consistente con los #418).
Además: **el submit fallido no da ningún feedback al usuario**. Ídem el botón
"Cerrar sesión": el del header de admin no cierra sesión nunca (2 intentos,
`/login` sigue redirigiendo a `/admin`; `/cuenta` como admin redirige a
`/admin`, así que no hay superficie de logout funcional para admin).

### Beat finder (Michi, la parte que faltaba del guion QR)

- `/p/DIM-4SUZ-U2HT/encontre` ("La tengo conmigo") ✅ **excelente**: pre-fill,
  contacto "al menos uno", pin en mapa + "Usar mi ubicación actual" + ajuste
  fino, taxonomía de estado (bien/herida/asustada/urgente), "¿hasta cuándo
  podés cuidarla?", foto opcional, CTA "Avisar al dueño/a". No se submiteó.
- 🔴 `/p/DIM-4SUZ-U2HT/sighting` ("La vi cerca de acá") — **"Cargando…"
  indefinido** (20s+, con reload; probado ANTES de la degradación global).
  Es la acción más probable de un desconocido con el QR.
- 🟡 **Session bleed**: logueado, el form muestra "Estás enviando como **DIM
  Admin**. ¿No sos vos? Salí de la sesión." — correcto como feature, pero para
  filmar el beat finder hay que usar **incógnito** o el form aparece
  pre-firmado por la cuenta que esté abierta.

### Crash de adopciones: NO reproducible @ bf765974 ✅

`alejo@` → Refugio Patitas del Norte (`DIM-TC7Z-APW6`) → Operaciones:
**2 postulaciones pendientes (Coco, Negro) renderizan bien** — esta es la org
con adopciones vivas donde crasheaba en la ronda anterior. El fix quedó
verificado en el entorno real; se puede cerrar ese ítem del summary de
critiques-smoke.

### Consistencia cobertura 42/54: NO verificable

`/gob/analytics` nunca cargó (ver degradación). La ruta además existe solo
como `/gob/analytics` — `/gob/analitica` da 404 aunque el sidebar diga
"Analítica" (menor, pero confunde al tipear). El check 43% (panel) vs 54%
(analytics/vigilancia) queda pendiente para cuando el server esté sano.

### Impacto en el veredicto

El GO condicional de arriba queda **suspendido a un diagnóstico del server**:
con la degradación progresiva, ni los segmentos "✅" sobreviven una sesión de
filmación completa. Orden sugerido: (1) pool/logs del server, (2) hydration
#418 + submit dispatch, (3) stuck-loaders (`sighting`, `alertas`, dashboards
gob), (4) los quick wins de datos ya listados.

*Cowork B — deep-dive, solo lectura, 2026-07-03 ~23:55.*
