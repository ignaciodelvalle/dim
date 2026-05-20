# Master execution plan — Claude Code backlog

> Plan maestro consolidado de todos los pendientes de implementación de DIM/MiMAR al 2026-05-20. Sequenced por dependencias y prioridad operativa. Cada sprint linkea al plan ejecutable detallado o a la design spec correspondiente.
>
> **Owner:** Ignacio Del Valle
> **Audiencia:** Claude Code (este plan se le da como input para ejecutar)
> **Estimación total:** ~28-35 días de Claude Code distribuidos en 8 sprints shippeables independientes

---

## Cómo Claude Code debe usar este plan

1. **Sprints son secuenciales por dependencia, no por orden alfabético.** Ejecutar en el orden listado salvo override explícito del owner.
2. **Cada sprint es shippeable.** Al cerrar, `pnpm typecheck && pnpm lint && pnpm test && pnpm rls:smoke` deben quedar verdes y el feature live en main.
3. **Cuando el sprint linkea a un plan ejecutable existente**, ese plan es la verdad. Esa lista de archivos + decisiones D1..Dn + tests es lo que se ejecuta literal.
4. **Cuando el sprint linkea a una design spec sin plan ejecutable**, primero Claude Code escribe el plan en `docs/superpowers/plans/2026-05-XX-<feature>.md` siguiendo el formato de los planes existentes, lo envía al owner para review express (15 min), y después ejecuta.
5. **Al cerrar cada sprint** Claude Code actualiza `docs/feature-inventory-2026-05-20.md` cambiando el estado del item correspondiente de 🟢→✅ (o lo que corresponda), y mueve el plan ejecutado a `docs/superpowers/plans/archive/`.
6. **No skipear el verification step.** Cada sprint tiene un bloque "Definition of done" — no se cierra hasta que cada bullet sea cierto.

---

## Vista de sprints

| # | Sprint | Plan / spec base | Duración | Dependencias | Outcome |
|---|---|---|---|---|---|
| 1 | Tech-debt cleanup | `2026-05-20-microchip-replaced-ui.md` + `2026-05-20-deprecate-pro-portal.md` | ~5d | ninguna | -1 portal, -1 capability deuda; `microchip_remediation` case lifecycle activo |
| 2 | Foster volunteers pool | `2026-05-18-foster-volunteers-pool.md` + design spec `docs/design/02-foster-pool.md` | ~4d | Sprint 1 (pro deprecation libera authorship resolution) |
| 3 | /adoptar listing público | design spec `docs/design/03-adoptar-public.md` + spec `2026-05-18-adoption-listing-public-design.md` (v1.4) | ~5d | Sprint 2 (foster pool fija eligibility flag que el listing usa) |
| 4 | Vaccine-due UX owner | design spec `docs/design/06-vaccine-due.md` | ~3d | ninguna (puede correr en paralelo a Sprint 3) |
| 5 | Govt dashboards | design spec `docs/design/04-govt-dashboards.md` | ~7d | Sprint 1 + 3 (proyecciones requieren listing público estable) |
| 6 | Welfare export fiscalía MPF (Ley 14.346) | sin plan — escribir desde la sección 6.9 del inventory | ~4d | Sprint 5 (reutiliza export pipeline) |
| 7 | PPP export provincial | sin plan — escribir desde `docs/superpowers/specs/2026-05-19-ppp-pet-profile-display-design.md` | ~3d | ninguna |
| 8 | Bulk operations refugios | sin plan — escribir desde AGENTS.md §"Bulk operations for high-capacity refugios" | ~5d | Sprint 2 (foster pool consolida operaciones org-side) |

**Diferidos / out of scope de este backlog:**
- Wizard adopción 28 preguntas (❎ — plan existe en `2026-05-20-adoption-handshake-unified.md` pero el owner decidió que 4 campos cubren el caso actual; se re-evalúa cuando emerja demanda concreta).
- Mi Argentina OAuth (⚪ — dependiente de disponibilidad externa de SSO).
- DNI verification real (⚪ — dependiente de elegir provider RENAPER vs intermediary).
- 3 case_kinds deferidos restantes (`custody_episode`, `foster_proposal`, `outbreak_investigation`) — se activan cuando emerjan workflows operativos.

---

## Sprint 1 — Tech-debt cleanup (~5d)

**Objetivo:** retirar la deuda arquitectónica que multiplica superficie de testing antes de sumar features nuevos.

### Sub-sprint 1A — Deprecación `/pro` → clinic org (~3d)

**Plan ejecutable:** [`2026-05-20-deprecate-pro-portal.md`](./2026-05-20-deprecate-pro-portal.md)

3 fases secuenciales:
- **Fase A — Backfill** (0.5d): script `scripts/migrate-vets-to-clinics.ts` idempotente. Detecta vets con offerings, crea clinic org auto, re-ancla offerings.
- **Fase B — Eliminar `/pro`** (1.5d): borra 11 archivos `app/pro/*`, retira `requireVetProviderOrRedirect`, ajusta ~18 archivos con refs, agrega middleware redirect 308.
- **Fase C — Onboarding nuevo** (0.75d): wizard `/cuenta/crear-consultorio` (3 pasos) + banner en `/cuenta` + signup step.

**Definition of done:**
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm rls:smoke` verdes.
- [ ] Vet existente con offerings: redirige automático a su org clinic. Offerings siguen aceptando reservas.
- [ ] Visit a `/pro/*`: 308 redirect a `/cuenta/memberships`.
- [ ] Backfill idempotente: re-run no duplica orgs.
- [ ] Inventory actualizado: sección 9 ya refleja el cambio; verificar que `🔴 deprecado` esté correcto.

### Sub-sprint 1B — `microchip_replaced` UI + remediation case (~2d)

**Plan ejecutable:** [`2026-05-20-microchip-replaced-ui.md`](./2026-05-20-microchip-replaced-ui.md)

3 fases secuenciales:
- **Fase A — Lifecycle case** (0.25d): mover `microchip_remediation` de deferred a V1, crear `lib/case-lifecycles/microchip-remediation.ts`, registrar.
- **Fase B — Server action** (1d): `app/actions/microchip.ts` con `replaceMicrochipAction`, cross-pet duplicate scan, notif matrix, audit.
- **Fase C — UI** (0.75d): 3 forms (owner / vet en clinic / admin) con reasons gated por actor.

**Definition of done:**
- [ ] Tests verdes incluyendo `__tests__/microchip-replaced.test.ts` con los 7 happy paths + edge cases del plan.
- [ ] Owner emite damaged → event emitido, sin case, `pets.microchipNumber` actualizado.
- [ ] Owner intenta `fraud_detected` → server rechaza con error claro.
- [ ] Vet en clinic emite `duplicate_detected` → case `microchip_remediation` abierto + `secondaryPetId` si hay match.
- [ ] Inventory actualizado: entry 3.3.21 pasa de 🟢 a ✅.

---

## Sprint 2 — Foster volunteers pool (~4d)

**Plan ejecutable:** [`2026-05-18-foster-volunteers-pool.md`](./2026-05-18-foster-volunteers-pool.md)
**Design spec:** [`docs/design/02-foster-pool.md`](../../design/02-foster-pool.md)

4 fases secuenciales (A→B→C→D, cada una bloquea la siguiente):

- **Fase A — Schema voluntarios + propuestas** (1d): migración SQL (`foster_volunteers` + `foster_proposals` + `ownerships.allow_co_foster`), Drizzle models, `EVENT_TYPES` suma 6 valores, Zod schemas, coverage tests.
- **Fase B — Adoption eligibility on pets** (0.75d): migración SQL (5 columnas `adoption_*` en pets + 4 CHECK constraints + 2 indexes), `EVENT_TYPES` suma `adoption_eligibility_set`, `setAdoptionEligibilityAction`, extend `createIntakeAction` y `finalizeAdoptionAction`.
- **Fase C — Server actions del pool** (1d): `app/actions/foster-volunteers.ts` (3 actions) + `app/actions/foster-proposals.ts` (5 actions) + `lib/foster-matching.ts` + extend `endFosterAction`, `recordDeathAction`, `finalizeAdoptionAction`. RLS policies + cron 7d expiry.
- **Fase D — UI surfaces** (1.25d): según design spec — entry point en `/cuenta`, `/cuenta/ofrecerme-como-transito`, `/cuenta/transitos/*` (hub con tabs), `/org/[orgToken]/voluntarios`, `/org/[orgToken]/voluntarios/propuestas`, `/org/[orgToken]/transitos` (surface unificado), `/org/[orgToken]/pets/no-aptas`, eligibility card en pet detail, shortcut adopción.

**Definition of done:**
- [ ] Tests verdes (unit + integration por server action).
- [ ] E2E mínimo: voluntario se inscribe con pre-check D13 (DNI + display_name + phone), org busca pool, propone pet específico, voluntario acepta con co-foster opt-in, foster materializado, voluntario termina tránsito, re-enroll prompt aparece.
- [ ] Cron `/api/cron/expire-foster-proposals` corre y marca >7d como `expired`.
- [ ] D18 cascade auto-cancel funciona: voluntario con slot=1 acepta una propuesta → otras pending al mismo voluntario se cancelan auto.
- [ ] Surface unificado en `/org/.../transitos` muestra member-based + voluntary pool + vecino con filtro por origen.
- [ ] `/org/.../pets/no-aptas` muestra pets con `adoption_eligible=false` agrupadas por motivo.
- [ ] Inventory actualizado: entries 3.9.1–3.9.5, 4.4.3, 4.5.1–4.5.4, 4.6.3 pasan a ✅.

---

## Sprint 3 — /adoptar listing público (~5d)

**Spec base:** [`docs/superpowers/specs/2026-05-18-adoption-listing-public-design.md`](../specs/2026-05-18-adoption-listing-public-design.md) (v1.4)
**Design spec:** [`docs/design/03-adoptar-public.md`](../../design/03-adoptar-public.md)
**Plan ejecutable:** ⚠️ pendiente de escribir — primer paso del sprint

### Pre-trabajo (~0.5d): escribir el plan ejecutable

Claude Code escribe `docs/superpowers/plans/2026-05-2X-adoptar-public-execution.md` con:
- Migración: columnas listing en `pets` (12 nuevas: `adoption_listed_at`, `adoption_listing_paused_at`, `adoption_story`, `adoption_requirements`, `adoption_energy_level`, `adoption_size_estimate`, `adoption_age_bucket`, `adoption_good_with_kids/dogs/cats`, `adoption_needs_yard`, `adoption_fee_ars`) + CHECK constraints.
- Server actions: `setAdoptionListingStatusAction`, `updateAdoptionListingCopyAction`, `submitAdoptionApplicationAction` (extend con `apply_intent` token + D22 consent).
- Proyección query: `lib/adoption-listing-query.ts` con keyset pagination + 12 cross-spec guards (D18 lost + D19 eligible + D20 dispute + D21 rabies).
- 4 fases: schema + projection → org config UI → public listing UI → ficha + postulación gate.

Send a owner para review express, después ejecutar.

### Implementación (~4.5d)

- **Fase 1 — Schema + projection** (1d): migración, Drizzle, projection query, tests con N pets en N combos de filtros.
- **Fase 2 — Org config UI** (1d): `app/org/[orgToken]/mascotas/[publicToken]/adoptar/` extend con `<AdoptionListingConfigForm>` (12 campos curados + photo gallery editor) + toggle publicar/pausar/despublicar. Pre-check `adoption_eligible=true` antes de permitir publicar.
- **Fase 3 — Public listing UI** (1.5d): `/adoptar` SSR con `<AdoptionFiltersBar>` (mobile drawer + desktop sidebar) + `<AdoptionListingGrid>` responsive 1/2/3/4 cols + paginación keyset + `<EmptyState>` curado.
- **Fase 4 — Ficha + postulación** (1d): `/adoptar/[petToken]` con hero + story + stats grid + convivencia (tri-state) + requisitos + share intents (WhatsApp + IG sticker + FB + copy). `apply_intent` token + D22 consent.

**Definition of done:**
- [ ] Tests verdes.
- [ ] Cross-spec guards verificados: pet con `adoption_eligible=false` no aparece; pet con `in_custody_dispute=true` no aparece; pet con `rabies_observation_status='active'` no aparece; pet con `status='lost'` no aparece.
- [ ] SEO: cada ficha genera `<title>`, `og:image`, JSON-LD `Animal` schema, sitemap.
- [ ] Visitante anónimo postula → redirect a `/login?returnTo=...&apply_intent=...` → post-auth vuelve al wizard.
- [ ] Refugio publica → pet aparece en feed; pausa → desaparece sin perder content.
- [ ] D22 consent checkbox obligatorio + persistido en `profile_sharing_consent_at`.
- [ ] Inventory actualizado: entries 3.7.1, 3.7.2 pasan a ✅.

---

## Sprint 4 — Vaccine-due UX owner (~3d)

**Design spec:** [`docs/design/06-vaccine-due.md`](../../design/06-vaccine-due.md)
**Plan ejecutable:** ⚠️ pendiente de escribir — primer paso del sprint

Sprint chico, puede correr en paralelo a Sprint 3 si hay banda (no comparten archivos).

### Pre-trabajo (~0.25d): escribir el plan ejecutable

Claude Code escribe `docs/superpowers/plans/2026-05-2X-vaccine-due-ux.md`:
- Cron throttling rules (variants upcoming/due_soon/overdue/overdue_critical con cadencias diferenciadas).
- Helper `lib/vaccine-reminder-state.ts` para computar variant según `next_due_at`.
- Notif anti-spam por `(reminder_id, user_id)`.

### Implementación (~2.75d)

- **Fase 1 — Componente core** (0.5d): `components/poncho/ReminderCard.tsx` con 5 variants + `<Badge>` shared.
- **Fase 2 — Cron logic** (0.75d): extend `app/api/cron/vaccine-due/route.ts` con throttling per variant. Marcar notifications como `category='health'`.
- **Fase 3 — Surfaces** (1d): `<RemindersSection>` en `/inicio` (global) + `<PetReminders>` en pet detail (scoped). Badge en `<PetCard>` de `/mis-mascotas`.
- **Fase 4 — Libreta** (0.5d): `<VacunasTimeline>` + `<VacunaTimelineDot>` en `/mis-mascotas/[publicToken]/vacunas`. Tabs agrupados por categoría en `/notificaciones`.

**Definition of done:**
- [ ] Tests verdes. Especialmente: race entre owner registrando vacuna y cron creando notif → ambos suceden, notif legacy queda como "Resuelta".
- [ ] Vacuna overdue_critical en libreta tiene `role="alert"` y respeta `prefers-reduced-motion`.
- [ ] Anti-spam funcional: el mismo reminder no genera notif más de 1/sem en upcoming, 1/día en due_soon (primeros 3d), 1/día en overdue (primeras 2 semanas), 1/día indefinido en critical.
- [ ] Posponer botón cap a 3 veces; 4to dice "Posponer 30 días".
- [ ] Inventory actualizado: entry 7.4 pasa de ⚪ a ✅.

---

## Sprint 5 — Govt dashboards (~7d)

**Design spec:** [`docs/design/04-govt-dashboards.md`](../../design/04-govt-dashboards.md)
**Plan ejecutable:** ⚠️ pendiente de escribir — primer paso del sprint

### Pre-trabajo (~1d): escribir el plan ejecutable

Sprint grande, plan ejecutable también lo es. Claude Code escribe `docs/superpowers/plans/2026-05-2X-govt-dashboards.md`:
- 5 componentes nuevos shared: `<MetricCard>`, `<MapChoropleth>`, `<TimeSeriesChart>`, `<JurisdictionSwitcher>`, `<PeriodPicker>`.
- 3 dashboards (vigilancia + perdidas + maltrato) — extend `/gob/*` existentes.
- 1 dashboard nuevo: `/gob/analytics`.
- Export endpoint async: `/gob/analytics/export` con job que escribe a Supabase Storage privado.
- RLS scope-bound por `govt_assignments`.

### Implementación (~6d)

- **Fase 1 — Componentes shared** (1.5d): los 5 componentes Poncho-flavored con tests + page `/design/dashboards` con ejemplos.
- **Fase 2 — `/gob/vigilancia` completo** (1d): metrics row + map + outbreak signals + zoonosis chart + rabies observations table.
- **Fase 3 — `/gob/perdidas` enriched** (0.75d): metrics + map + table responsive.
- **Fase 4 — `/gob/maltrato` enriched** (1d): metrics + tabs (urgentes/mine/all/overdue) + welfare officer queue + detail page polish.
- **Fase 5 — `/gob/analytics`** (1d): metrics row + acquisition method chart + map per_capita + death causes + outbreak history.
- **Fase 6 — Export endpoint** (0.75d): form `/gob/analytics/export` + async job + email con signed URL.

**Definition of done:**
- [ ] Tests verdes. Especialmente: RLS — govt de CABA solo ve casos+pets de su jurisdicción; govt sin assignments ve mensaje "Sin jurisdicciones asignadas"; admin ve universal.
- [ ] Cada chart/map tiene fallback `<details><summary>Ver datos</summary>` con tabla para screen readers.
- [ ] Export async: form submit → toast "Generando export, te avisamos por mail cuando esté listo" → cron-emite email + signed URL 24h.
- [ ] Period picker persiste en searchParams.
- [ ] Inventory actualizado: 11.7, 11.13, 11 nuevos entries pasan a ✅.

---

## Sprint 6 — Welfare export fiscalía MPF (Ley 14.346) (~4d)

**Sin plan ni spec dedicada todavía.** El owner mencionó en AGENTS.md §Open questions: "export template a fiscalía MPF CABA (Ley 14.346 pipeline)".

### Pre-trabajo (~0.5d): escribir spec + plan

Claude Code escribe:
- `docs/superpowers/specs/2026-05-2X-welfare-export-fiscalia.md` — qué campos exporta, formato (PDF + adjuntos zip?), trigger (manual desde caso por welfare officer? automático al cerrar con outcome="seria"?).
- `docs/superpowers/plans/2026-05-2X-welfare-export-execution.md` — pasos ejecutables.

Pasos sugeridos para investigar antes:
- ¿La fiscalía MPF tiene formato estándar o es libre?
- ¿Qué campos del expediente quieren ver? (denuncia + cronología + ubicación + evidencia + autoridades intervinientes)
- ¿La autoridad denunciante es la org de welfare o el ciudadano individual?

### Implementación (~3.5d)

Una vez con spec, ejecutar:
- Template PDF con `@react-pdf/renderer` (mismo pipeline que el contrato de adopción si se construye eventualmente).
- Server action `exportWelfareCaseToFiscaliaAction` gated por capability `welfare.export.fiscalia`.
- UI button en `/gob/maltrato/[id]` "Generar para fiscalía" con preview + descarga.
- Audit log + notif al welfare officer asignado.

**Definition of done:**
- [ ] PDF generado contiene: portada con publicCode + cronología completa de eventos del caso + fotos adjuntas (linked) + ubicación geocoded + autoridades intervinientes + cita de Ley 14.346 + firma electrónica simple del welfare officer.
- [ ] Inventory actualizado: entry 6.9 pasa de ⚪ a ✅.

---

## Sprint 7 — PPP export provincial (~3d)

**Spec base:** [`docs/superpowers/specs/2026-05-19-ppp-pet-profile-display-design.md`](../specs/2026-05-19-ppp-pet-profile-display-design.md)
**Plan ejecutable:** ⚠️ pendiente de escribir

El campo `pets.potentially_dangerous_breed` + event `dangerous_breed_attested` ya están en código. Falta el "push" automático a los registros provinciales (Ley CABA 4078, Ley Prov 14.107).

### Pre-trabajo (~0.5d): investigar canal real

- ¿Existe API del registro CABA / Prov BA?
- ¿Mientras tanto, exportamos a PDF firmado para que el dueño lo lleve al municipio?

### Implementación (~2.5d)

Si no hay API: implementar export PDF firmado por DIM (Documento de Identificación PPP) que el dueño descarga + presenta al municipio. Action `generatePppExportAction`. UI en `/mis-mascotas/[publicToken]` cuando `potentially_dangerous_breed=true`.

Si hay API: implementación del push automático con queue + retry + dead-letter cuando el municipio responde error.

**Definition of done:**
- [ ] Owner con pet PPP puede generar export PDF firmado.
- [ ] Audit log de cada export.
- [ ] Inventory actualizado: entry 13.2 pasa de 🟡 a ✅.

---

## Sprint 8 — Bulk operations para refugios high-capacity (~5d)

**Sin spec dedicada.** El owner mencionó en AGENTS.md §Open questions: "Bulk operations for high-capacity refugios — El Campito-scale shelters (200+ animals)".

### Pre-trabajo (~1d): escribir spec + plan

Investigar uso real:
- ¿Bulk intake (lote de 50 cachorros nacidos en refugio)?
- ¿Bulk vaccination logging (campaña de vacunación a 30 perros en una mañana)?
- ¿Bulk listing edits?
- ¿Bulk transfers entre orgs?

Definir API mínima:
- ¿CSV upload? ¿Form repetible? ¿Selector multi en tabla?

### Implementación (~4d)

Probable forma: tabla `/org/[orgToken]/mascotas` ya existe — agregar selector multi-row + bulk action menu (Vacunar selección / Editar campo común / Cambiar listing status / Transferir a otra org).

Server actions bulk con transacción + dry-run preview + audit log per row.

**Definition of done:**
- [ ] Bulk vaccinate funciona: refugio selecciona 20 pets, elige vacuna + lote + fecha, todos quedan con `vaccination_administered` event con same payload.
- [ ] Bulk listing publish funciona.
- [ ] Tests con 200 pets simulan operación bulk en transacción sin timeout (< 5s).
- [ ] Inventory actualizado: entry 14.4 pasa de ⚪ a ✅.

---

## Sprints posibles a futuro (no priorizados todavía)

| Sprint | Cuándo | Plan/spec |
|---|---|---|
| Mi Argentina OAuth | Cuando Argentina.gob.ar habilite SSO público | Sin spec — escribir cuando emerja |
| DNI verification real (RENAPER) | Cuando se elija provider | Sin spec |
| Adoption handshake unificado (wizard 28q) | ❎ diferido por owner — solo si emerge demanda concreta de refugios | `2026-05-20-adoption-handshake-unified.md` ya escrito |
| Lost-pet broadcast distribution (WhatsApp/IG share + voluntario alerts) | Después de Sprint 3 (`/adoptar` SEO) y Sprint 2 (foster pool — voluntarios) | Sin spec — leverage coverage zones + foster pool |
| Decomiso → temporary welfare-authority custody chain | Cuando el modelo de welfare authority esté implementado en /gob | Sin spec — mencionado en AGENTS.md |
| Native mobile (React Native) | Cuando PWA topée con push notifications iOS | Sin spec |
| Campaign management UX (govt-side scheduling) | Cuando emerja partner govt | Sin spec — schema ya soporta `campaign_id` en eventos |

---

## Cómo medir avance

Al cerrar cada sprint, el `docs/feature-inventory-2026-05-20.md` debe reflejar el cambio de estado. La métrica simple: cuántas líneas 🟢 + ⚪ + 🟡 pasaron a ✅.

Estado actual (2026-05-20):
- ✅ Shipped: ~85 entries
- 🟢 Spec'd + plan listo: 8 entries (todos cubiertos por Sprints 1-3)
- 🟡 Parcial: 4 entries (cubiertos por Sprints 1B, 5, 7)
- 🔴 Deprecado: 1 entry (`/pro`, cerrado por Sprint 1A)
- ⚪ Planeado: ~12 entries (Sprints 4-8 + futuros)
- ❎ Diferido: 1 entry

Target post-Sprint 8:
- ✅ Shipped: ~115 entries (+30)
- 🟢: 0 (todos ejecutados)
- 🟡: 0
- ⚪: ~7 (los diferidos de futuro, Mi Argentina, RENAPER, mobile native, etc.)
- ❎: 1 (adoption wizard 28q — owner-managed)

---

## Reminder de las decisiones doctrinales (DP1–DP13 de Poncho)

Cada PR de cada sprint debe respetar:

1. **DP1** — Wrappers ricos `<Field>` sobre primitivos.
2. **DP2** — Validación zod + form actions, no RHF.
3. **DP3** — Tokens `var(--color-gob-*)` o Tailwind utilities, nunca hex inline.
4. **DP4** — WCAG 2.1 AA mínimo, touch ≥44px, focus visible.
5. **DP5** — Mobile-first, drawer en mobile no dropdown.
6. **DP6** — Server components default, `"use client"` solo con razón.
7. **DP7** — API consistente: variant/size/loading/disabled/iconLeft/Right.
8. **DP8** — Poncho original trade-offs respetados pero documentados.
9. **DP9** — Empty states con `<EmptyState>`, nunca texto plano.
10. **DP10** — Microcopy voz argentina: tuteo, imperativo amable, error con sugerencia.
11. **DP11** — Encode Sans default, Lora solo editorial.
12. **DP12** — Toast efímero, Alert persistente, Banner sticky.
13. **DP13** — Sin jQuery, sin Bootstrap 3 CSS.

Y las invariantes de DIM:
- **Events are forever** — corrección = nuevo evento, nunca mutación.
- **Spanish UI, English code.**
- **Tests por server action**: unit + integration con happy path + 2 fallos típicos.
- **Audit log row** por cada acción institucional.
- **RLS verificado** con `pnpm rls:smoke` antes de merge.
