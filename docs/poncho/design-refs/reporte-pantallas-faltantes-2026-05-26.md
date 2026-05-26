# MiMAR — Auditoría de pantallas vs. workflows y ciclos de prueba

**Fecha:** 2026-05-26
**Insumos cruzados:**
- `index (1).html` (Claude Design export) — **48 pantallas** entregadas
- `docs/screen-inventory-by-role-2026-05-22.md` — IA objetivo post-consolidación (**88 pantallas**)
- `docs/test-storylines.md` + `docs/test-storylines-iconic.md` — 15 stressors + 10 stressors icónicos
- `__tests__/*` — 114 archivos de prueba (cobertura de flujo)
- `docs/feature-inventory-2026-05-20.md` + `docs/owner-portal-redesign-plan-2026-05-26.md`

## Veredicto en una línea

El index entrega **48/88 pantallas (55%)**, con cobertura desigual por rol: público al 82%, dueño al 50%, organización al 27%, gobierno al 56%, admin al 8%, y **auth al 0%**. Hay flujos completos cubiertos por tests (booking, claim, foster, adopción, transferencias, surveillance, disputas, moderación) que **no tienen ninguna pantalla** asociada en lo entregado.

## Cobertura por rol

| Rol | Entregadas | Target IA | Δ | % |
|---|---:|---:|---:|---:|
| Público | 9 | 11 | −2* | 82% |
| Auth | 0 | 2 | −2 | 0% |
| Dueño (app) | 9 | 18 | −9 | 50% |
| Dueño · hojas modales | 12 | n/a (subset de sheets) | parcial | — |
| Organización | 7 | 26 | −19 | 27% |
| Gobierno | 10 | 18 | −8 | 56% |
| Admin | 1 | 13 | −12 | 8% |
| **Total** | **48** | **88** | **−40** | **55%** |

*Público está engañosamente cerca: el index gasta 4 pantallas en variantes Tier 0/0+/1/2 de la misma credencial (que el target inventario cuenta como 1 sola página `/p/[publicToken]`), por lo tanto los faltantes reales son ~6, no 2.

---

## P0 — Bloquean flujos con tests pasando, sin UI

Estas pantallas faltan a pesar de tener cobertura de tests verde. Sin ellas el producto **no se puede demostrar end-to-end**.

### 1. Auth completo — `0 / 2` pantallas
- `/login` — auth obligatorio, mencionado por `intent=apply` round-trip de adopción.
- `/signup` — tests `dni-verification`, `dni-next`, `profile.test`, `role-upgrade` asumen un usuario recién creado.

**Impacto:** ningún flujo dueño/org/govt/admin es accesible. **Crítico.**

### 2. Flujo de adopción (lado postulante) — público
Tests con cobertura sin UI:
- `adoption-applications.test.ts` · `adoption-listing.test.ts` · `adoption-review.test.ts` · `adoption-cascade.test.ts` · `apply-intent.test.ts`

Pantallas faltantes:
- `/adoptar/[petToken]` — detalle público de mascota adoptable
- `/adoptar/[petToken]/postular` — formulario de postulación
- `/mis-mascotas/postulaciones` — "Mis postulaciones" (dueño autenticado)

**Impacto:** el catálogo `/adoptar` (entregado, P05) lleva a vacío — no se puede ver una mascota ni postular.

### 3. Flujo de turnos / booking — sin ninguna pantalla
Tests sin UI: `booking.test.ts`, `booking-race.test.ts`, `scheduling-attendance.test.ts`

Pantallas dueño faltantes:
- `/turnos/buscar` — catálogo de servicios
- `/turnos/buscar/[offeringToken]` — detalle de oferta
- `/turnos/buscar/[offeringToken]/reservar/[slotId]` — confirmación de reserva
- `/mis-turnos` — bandeja de turnos del dueño
- `/mis-turnos/[appointmentToken]` — detalle de turno

Pantallas org faltantes (para que existan servicios):
- `/org/[orgToken]/servicios/nuevo`
- `/org/[orgToken]/servicios/[offeringToken]`
- `/org/[orgToken]/servicios/[offeringToken]/agenda`

**Impacto:** el cuadro "Servicios catálogo" entregado (org-05) está completamente desconectado: no permite crear, configurar disponibilidad, ni reservar.

### 4. Claim de mascota — `/mis-mascotas/reclamar`
Test directo: `claim-gate.test.ts`. Sin UI no hay forma de que un dueño "reclame" su credencial QR cuando ya existe.

### 5. Centro de cuenta (`/cuenta`) y sub-tabs
Tests: `profile.test.ts`, `profile-self-service.test.ts`, `dni-verification.test.ts`, `disclosure-prefs.test.ts`

Faltan **todas** las pantallas del tab "Yo":
- `/cuenta` (perfil + DNI verification + disclosure preferences)
- `/cuenta/memberships` (memberships en orgs)
- `/cuenta/solicitudes` (approval requests recibidos — test `approval-request-withdraw.test.ts`)

**Impacto:** ningún usuario puede ver/editar su perfil, verificar DNI, ni manejar memberships.

### 6. Portal de organización — picker y pet detail
- `/org` — selector cuando un usuario es miembro de varias orgs. Sin esto, multi-org está roto.
- `/org/[orgToken]/mascotas/[publicToken]` — pet detail org-side (shell compartido con dueño). Tests `org-welfare-report.test.ts`, `case-attachment.test.ts`, `pet-events-append-only.test.ts` lo asumen.

### 7. Intake — el flujo más usado de la org
Tests: `pet-events-append-only.test.ts`, `eno-trigger.test.ts`, `event-catcher-handoff.test.ts`

Faltan:
- `/org/[orgToken]/intake` — cola de intake
- `/org/[orgToken]/intake/match/[matchedPetToken]` — confirmación de match (detecta chip duplicado)

**Impacto:** sin estas pantallas la org no puede ingresar mascotas — bloquea casi todo el resto del workflow org.

---

## P1 — Tests existen, surface incompleto

### 8. Tab Vacunas del pet detail (faltante en index)
El inventario IA define **4 tabs** en pet detail (Resumen / Libreta / Vacunas / Historial). El index entrega Libreta (P06) y Historial (P07), **pero no Vacunas**.

Tests afectados: `vaccine-due-scan.test.ts`, `vaccine-reminder-state.test.ts`, `vaccine-due-scan.test.ts`. La pantalla owner `/mis-mascotas/[token]?tab=vacunas` está descrita en el inventario (líneas 866-871).

### 9. Surveillance govt — 3 pantallas
Tests: `symptom-surveillance.test.ts`, `eno-trigger.test.ts`, `disease-public-alert-catalog.test.ts`, `disease-diagnosis-flow.test.ts`, `disease-legal-anchors.test.ts`

Faltan:
- `/gob/vigilancia` (resumen)
- `/gob/vigilancia/brotes`
- `/gob/vigilancia/zoonosis`

**Impacto:** todo el valor diferencial del portal gobierno (vigilancia epidemiológica) está sin UI.

### 10. Disputas de custodia — gobierno + admin
Tests: `custody-dispute-cases-d4.test.ts`, `admin-decisions.test.ts`, `cross-org-transfer.test.ts`

Faltan:
- `/gob/disputas` (queue)
- `/gob/disputas/[disputeToken]` (expediente)
- *(equivalentes admin también ausentes)*

**Workflow stressor 3 (`Orphaned ownership chain` — Odie) y stressor 5 (`Owner death cascade` — Hachikō iconic) sin UI para resolución.**

### 11. Mascotas perdidas — gobierno
Tests: `lost-cases-d3.test.ts`, `lost-pet-broadcast.test.ts`, `lost-listing.test.ts`

Faltante: `/gob/perdidas`. **Workflow stressor 6 (`Burst de 9 QR scans en 9 ciudades` — Bolt) y stressor 6 iconic (`9-year lost-found loop` — Hachikō) sin UI gob.**

### 12. Voluntarios / tránsito org
Tests: `foster-cases-d5.test.ts`, `foster-e2e-flow.test.ts`, `foster-matching.test.ts`, `foster-proposal-expirer.test.ts`

Faltan:
- `/org/[orgToken]/voluntarios`
- `/org/[orgToken]/voluntarios/propuestas`
- `/org/[orgToken]/transitos`
- Dueño-side: `/cuenta/transitos/activos`, `/cuenta/transitos/propuestas`, `/cuenta/transitos/propuestas/[proposalToken]`, `/cuenta/transitos/historial`

**Impacto:** todo el handshake foster (owner ↔ org) está sin UI a pesar de tener 4 tests verdes.

### 13. Transferencias entre orgs
Test: `cross-org-transfer.test.ts`. Faltan:
- `/org/[orgToken]/transferencias` (salientes)
- `/org/[orgToken]/transferencias/nueva`
- `/org/[orgToken]/transferencias/recibidas`

### 14. Maltrato — pantallas org
Tests: `welfare-cases-d1.test.ts`, `welfare-moderation.test.ts`, `welfare-mpf-export.test.ts`, `welfare-cases-d1.test.ts`

Faltan:
- `/org/[orgToken]/maltrato/recibidos`
- `/org/[orgToken]/maltrato/nuevo`

### 15. Mordedura — `/org/[orgToken]/mordedura/nuevo`
Test directo: `bite-cases-d2.test.ts`. **Workflow stressor 12 (Scooby — bite, no skin break) y stressor 10 iconic (Pal — rabies pair) no tienen pantalla de captura.**

### 16. Eventos del dueño — surface faltante
- `/mis-mascotas/[token]/devolucion` (return-to-org) — test `return-to-owner.test.ts`
- `/mis-mascotas/[token]/eventos/atestar-raza-peligrosa` — test `ppp-caba-export.test.ts`
- `/mis-mascotas/[token]/eventos/[eventId]` — read-only (event detail) — tests `event-schemas`, `event-payload-validation-convention`
- `/mis-mascotas/[token]/anotar` — quick-capture handoff — test `event-catcher-handoff.test.ts`
- `/mis-mascotas/[token]/asistencia/presentar` — presentación de turno — test `scheduling-attendance.test.ts`
- `/mis-mascotas/[token]/vacunas/programar` — test `vaccine-reminder-state.test.ts`

### 17. Notificaciones — bandeja dueño
Tests: `notifications.test.ts`, `notifications-by-category.test.ts`, `notification-templates.test.ts`, `notifications-outside-tx.test.ts`, `active-reminders.test.ts`

Faltante: `/notificaciones`. **Sin esto el dueño no ve recordatorios ni avisos.**

### 18. Denuncias del dueño (autenticado)
Tests: `welfare-cases-d1.test.ts`, `welfare-moderation.test.ts`

Faltan:
- `/denuncias/mias` — mis denuncias
- `/denuncias/[id]` — detalle (vista autenticada)

### 19. Match confirmation en alta — `/mis-mascotas/nueva/match/[matchedPetToken]`
Test: `chip-match.test.ts`. Cuando el wizard de nueva mascota detecta un chip ya registrado, no hay UI para confirmar match o reclamar.

### 20. Libreta compartida — `/libreta/compartir/[shareToken]`
Test: `libreta-share.test.ts`. La libreta-share sheet existe (modal 09), pero **falta la pantalla pública que recibe el link compartido**.

---

## P2 — Admin platform (1/13) y govt complementos

El portal admin está prácticamente desnudo. Si la demo del 2026-05-21 no incluye admin, esto es P2; si la quiere mostrar Ignacio en la presentación, sube a P0.

### 21. Admin
Faltan: Admins (list/new/detail), Govt agents (list/new/detail), Moderación queue + item (tests `welfare-moderation`), Jurisdicciones index + reglas por localidad (list/new/edit) — test `case-normatives.test.ts`, Auditoría (tests `admin-fase-0-schema`), Outbox + detail (tests `outbox-drainer`, `event-idempotency`), Casos admin scope, Observaciones admin + detail + reemplazar microchip (test `microchip-replaced.test.ts`), Servicios admin, Sistema (health), Historial.

### 22. Govt — analytics + reglas + historial
- `/gob/reglas` (jurisdiccionales)
- `/gob/analytics` + `/gob/analytics/export` — tests `govt-dashboards.test.ts`, `govt-exports.test.ts`
- `/gob/historial`

### 23. Público — secundarias
- Marketing landing `/` — sin esto no hay puerta de entrada
- `/refugios/[orgToken]` — perfil público org
- `/casos/[publicCode]` — caso público (P09 entregada cubre denuncia, no caso)

---

## Fallas de workflow (resueltas tras revisión con Ignacio · 2026-05-26)

### F1 — Status banners stack — ✅ RESUELTO
Confirmado por Ignacio: la pantalla `owner/05-pet-perfil-banners.html` **apila los banners** correctamente. Los 6 banners (Org access, Tránsito, Observación antirrábica, Embarazo, PPP, Servicio) se renderizan stacked condicionalmente sobre el perfil.

### F2 — Resurrección post-fallecimiento — ✅ RESUELTO
Confirmado: la pantalla "In memoriam" (owner-09) permite revertir `death_recorded`. La acción `un-deceased` está cubierta.

### F3 — Sheets de microchip — ✅ RESUELTO (cubierto por modal-12)
Confirmado: el sheet "Vet registra evento" (modal-12) es **genérico y cubre todos los eventos médicos**, incluyendo `evento.microchip` y `evento.microchip-reemplazo`. Tests `microchip-validation`, `microchip-replaced` quedan cubiertos.

### F4 — Burst de QR scans en lost cockpit — ✅ RESUELTO
Confirmado: el lost cockpit (owner-08) pinta el histograma/lista de scans con ubicación.

### F5 — Posthumous notes — ✅ RESUELTO
Confirmado: la pantalla "In memoriam" acepta `note_added` post-mortem. El sheet "Nota" (modal-05) es invocable desde el estado in memoriam.

### F6 + F7 — Sheets de evento médico — ✅ RESUELTO (cubierto por modal-12)
Confirmado: modal-12 **"Vet registra evento" es el sheet universal de eventos médicos** y cubre antiparasitario, esterilización, mordedura, fallecimiento, tatuaje, microchip, microchip-reemplazo, medicación-fin, vet, clínico y embarazo. Los 5 sheets owner-side per-tipo entregados (vacuna, peso, síntoma, medicación-inicio, nota) son los quick-captures más frecuentes; el resto del catálogo de 16 eventos del inventario IA se gestiona via el picker dentro de modal-12.

**Decisión arquitectónica que confirmar para diseño:** ¿modal-12 también es accesible desde el flujo owner (no solo Tier 2 público), como el "all-in-one" del Phase D EventCatcher? Si sí, no hace falta diseñar sheets adicionales por tipo de evento. Si no, hay que clonarlo como `modal-13 evento (owner)`.

---

## Lista de pantallas/sheets faltantes ordenada por prioridad

| # | Prioridad | Pantalla / sheet | Tests asociados | Bloqueo |
|---|:---:|---|---|---|
| 1 | **P0** | `/login` · `/signup` | dni-*, profile, role-upgrade | Acceso a TODO el sistema |
| 2 | **P0** | `/adoptar/[petToken]` + `/postular` | adoption-applications, adoption-review, apply-intent | Adopción público |
| 3 | **P0** | `/mis-mascotas/postulaciones` | adoption-applications | Adopción dueño |
| 4 | **P0** | `/turnos/buscar` + `[offeringToken]` + `/reservar/[slotId]` | booking, booking-race | Turnos dueño |
| 5 | **P0** | `/org/.../servicios/{nuevo,[token],agenda}` | scheduling-attendance | Creación de servicios org |
| 6 | **P0** | `/mis-turnos` + `[appointmentToken]` | scheduling-attendance | Turnos dueño |
| 7 | **P0** | `/mis-mascotas/reclamar` | claim-gate | Onboarding desde QR |
| 8 | **P0** | `/cuenta` + memberships + solicitudes | profile-self-service, dni-verification, disclosure-prefs | Mi cuenta |
| 9 | **P0** | `/org` (picker) + `/org/.../mascotas/[token]` | (gating de todo el portal org) | Multi-org y pet detail org |
| 10 | **P0** | `/org/.../intake` + `intake/match/[token]` | pet-events-append-only, event-catcher-handoff, chip-match | Intake org |
| 11 | **P1** | Pet detail tab `?tab=vacunas` | vaccine-due-scan, vaccine-reminder-state | Recordatorios |
| 12 | **P1** | `/gob/vigilancia` + `/brotes` + `/zoonosis` | symptom-surveillance, eno-trigger, disease-* | Surveillance gob |
| 13 | **P1** | `/gob/disputas` + `[disputeToken]` | custody-dispute-cases-d4, admin-decisions | Disputas custodia |
| 14 | **P1** | `/gob/perdidas` | lost-cases-d3, lost-pet-broadcast | Perdidas gob |
| 15 | **P1** | `/cuenta/transitos/*` + org voluntarios + tránsitos | foster-cases-d5, foster-e2e-flow, foster-matching, foster-proposal-expirer | Foster handshake |
| 16 | **P1** | `/org/.../transferencias/{salientes,nueva,recibidas}` | cross-org-transfer | Transfer org→org |
| 17 | **P1** | `/org/.../maltrato/{recibidos,nuevo}` + `/mordedura/nuevo` | welfare-cases-d1, bite-cases-d2 | Casos org |
| 18 | **P1** | `/notificaciones` | notifications, active-reminders | Inbox dueño |
| 19 | **P1** | `/denuncias/mias` + `/denuncias/[id]` (auth view) | welfare-moderation | Denuncias dueño autenticado |
| 20 | **P1** | `/mis-mascotas/[token]/devolucion`, `/atestar-raza-peligrosa`, `/anotar`, `/asistencia/presentar`, `/vacunas/programar`, `/eventos/[id]` | return-to-owner, ppp-caba-export, event-catcher-handoff, scheduling-attendance | Eventos owner especiales |
| 21 | **P1** | `/mis-mascotas/nueva/match/[token]` | chip-match | Match en alta |
| 22 | ~~P1~~ | ~~Sheets de evento médico individuales~~ — **cubierto por modal-12** (vet registra evento es universal) | — | RESUELTO |
| 23 | **P1** | `/libreta/compartir/[shareToken]` (público) | libreta-share | Compartir libreta |
| 24 | **P2** | `/gob/reglas`, `/gob/analytics`, `/gob/analytics/export`, `/gob/historial` | govt-dashboards, govt-exports, case-normatives | Reportes gob |
| 25 | **P2** | Admin portal: Admins, Govts, Moderación (queue + item), Jurisdicciones + reglas, Auditoría, Outbox + detail, Casos, Observaciones, Servicios, Sistema, Historial | admin-decisions, admin-revocations, admin-proposals, admin-institutional, admin-fase-0-schema, outbox-drainer, event-idempotency, microchip-replaced, case-normatives | Operación de plataforma |
| 26 | **P2** | Marketing landing `/`, `/refugios/[orgToken]`, `/casos/[publicCode]` | (sin tests directos) | Entry público |
| 27 | **P2** | `/org/.../checkins`, `/org/.../casos`, `/org/.../adopciones/[id]`, `/org/.../pets/no-aptas`, `/org/.../admin/permisos` | case-lifecycles, scheduling-attendance, adoption-cascade | Operaciones org |

---

## Comportamientos a validar dentro de pantallas entregadas

Tras la revisión con Ignacio (2026-05-26), quedan abiertas estas dudas menores sobre pantallas ya entregadas:

1. **modal-03 síntoma** — ¿dispara el flag `eno_trigger` correctamente cuando aplica? (test `eno-trigger`)
2. **org-04 mascotas** — ¿tiene tabs/filtros para custodia, foster, no-aptas? El inventario IA pide screen separada para no-aptas (P2)
3. **gob-03 cola-detalle** — ¿permite asignar, reasignar, tomar caso? (sheets `asignarme`/`reasignar`/`tomar-caso`)
4. **modal-12 vet evento** — Confirmar que es accesible **también desde el flujo owner** (no solo desde Tier 2 público vet). Si no lo es, hay que duplicarlo como modal owner-side.

---

## Recomendación de orden de trabajo

**Sprint 1 (desbloquear demo end-to-end):** items #1, #7, #8, #9, #10 — sin esto Ignacio no puede recorrer un solo flujo completo.

**Sprint 2 (cerrar adopción + turnos):** items #2, #3, #4, #5, #6 — son los dos workflows más vistosos para presentación.

**Sprint 3 (govt value prop):** items #12, #13, #14 — vigilancia + disputas + perdidas son la razón de existir de `/gob`.

**Sprint 4 (foster + transferencias + maltrato):** items #11, #15, #16, #17, #18, #19, #20, #22, #23.

**Sprint 5 (admin + analytics):** items #24, #25, #26, #27.

**Cleanup transversal:** F1–F7 (comportamientos), correr en paralelo a cada sprint según el rol.

---

*Generado 2026-05-26 a partir del index entregado y los docs de IA, storylines y tests del repo HEAD.*
