# Superpowers — Specs & Plans

Index of design docs (`specs/`) and implementation plans (`plans/`) for MiMAR features.

- **`specs/`** — design docs. The *what* and *why* of each feature. Reviewed and locked before implementation.
- **`plans/`** — implementation plans for Claude Code. The *how*. Self-contained, file-level detail, executable.

A typical feature lifecycle: brainstorm in chat → spec in `specs/` → review/iterate → plan in `plans/` → Claude Code executes → mark done.

---

## What to attack next

Recommended order based on dependency chains and leverage. Each item is a Claude Code session that produces 1+ PRs.

| Priority | Feature | Plan file | Why now |
|----------|---------|-----------|---------|
| 1 | **Admin page Fase 12 (admin metrics `/admin/sistema`)** | (mismo plan, Fase 12) | Salud del sistema visible al admin: DAU, queue age, decisiones, govt activity. ~½ día. |
| 2 | **Admin page Fase 13 (bulk ops en queues)** | (mismo plan, Fase 13) | Multi-select + bulk approve/reject/revoke. ~1 día. |
| 3 | **Admin page Fase 14 (auto-expiry cron + cron_runs)** | (mismo plan, Fase 14) | Cron diario que cierra requests pending 60d+. Tabla cron_runs compartida con scheduling. ~½ día. |
| 4 | **Admin page Fase 10 (custody disputes)** | (mismo plan, Fase 10) | Event catalog cleanup ya aplicado → desbloqueado. La más grande — tablas `custody_disputes` + `custody_dispute_parties`, surface `/gob/disputas`. ~2 días. |
| 5 | **Welfare reports polish** | `plans/2026-05-18-welfare-reports-polish.md` | 4 fases pequeñas: bridge bug (`pet_events` no copia lat/lng), mapa missing en denuncia detail, rate-limit anónimo, cleanup docs. ~1 día. |
| 6 | **Validación canonical en 5 actions restantes** (follow-up de INDEC) | (mismo plan, Fase E ampliada) | Las 2 actions críticas govt (`createInstitutionalAccountForAuthority`, `assignGovtLocalityForAuthority`) ya validan canonical. Faltan: `requestVetUpgradeForUser`, `createOrganizationForUser`, service-offerings, welfare, events.ts. Cada uno requiere inspección del callsite. ~1 día. |

---

## All specs & plans

### Specs (design docs)

| Spec | Status | Plan | Notas |
|------|--------|------|-------|
| `2026-05-15-timeline-type-filter-design.md` | ✅ Implementado | `plans/2026-05-15-timeline-type-filter.md` | `EventTimeline` tiene prop `chips` + `DEFAULT_FILTER_CHIPS` export |
| `2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | ✅ Implementado | `plans/2026-05-16-health-campaigns-and-scheduling.md` | Provider polymorphic (org o vet independiente via sub-rutas `/pro/servicios`). Approval routing a govt scope-matching + admin fallback. Paths `/org/[orgToken]`, `/pro`, `/gob`, `/admin`. 10 fases. |
| `2026-05-17-admin-page-design.md` (v2.3) | ✅ Implementado (Fases 0-9) | — | Cuatro roles (`owner`, `vet`, `govt`, `admin`), dos `account_type`s (personal / institutional). Surfaces `/gob` y `/admin` activos. Migraciones 0010/0011/0015/0016. Fases 10+ continúan en `2026-05-18-admin-page-next-phases-design.md`. |
| `2026-05-18-admin-page-next-phases-design.md` (v3.0) | 🟡 Parcial — Fase 11 ✅, Fases 10/12/13/14 pendientes | `plans/2026-05-18-admin-page-fases-10-14.md` | Fases 10-14 + placeholders 15-25. Custody disputes (10), dashboards regionales gobierno (11 ✅ shipped en `6f6444a` — `/gob/vigilancia` + `/gob/perdidas`), métricas admin (12), bulk ops (13), auto-expiry cron (14). Fase 10 depende del event-catalog-cleanup. |
| `2026-05-18-localities-catalog-design.md` (v1.0) | 🚫 **Superseded** por v2.0 — no implementar | — | Versión inicial chiquita (catálogo curado de 94 entradas hardcoded en TS). Reemplazada antes de implementar por v2.0 que importa el catálogo INDEC completo (~4500). Se mantiene en el repo como referencia histórica del razonamiento. |
| `2026-05-18-localities-catalog-indec-design.md` (v2.0) | ✅ Implementado (parcial — ver follow-ups) | `plans/2026-05-18-localities-catalog-indec.md` | **Reemplaza v1.0**. 4027 localidades INDEC importadas a `ar_localities` desde `https://infra.datos.gob.ar/georef/localidades_censales.csv`. Typeahead `<LocalityCombobox>` montado en `LocationFields` mode="jurisdiction" + CreateGovtForm + AssignLocalityForm. Validación canonical (`resolveCanonicalJurisdiction`) en las 2 actions govt críticas. Migrations 0019 + 0020. Script `normalize-existing-jurisdictions.ts` listo. **Follow-ups:** (a) validar 5 server actions restantes (vet upgrade, org creation, service-offerings, welfare, events) — siguen aceptando texto libre; (b) CABA barrios — INDEC trata CABA como 1 sola localidad, importar barrios de `data.buenosaires.gob.ar` con `source='caba_open_data'`. |
| `2026-05-17-symptom-disease-surveillance-design.md` | ✅ Implementado | `plans/2026-05-17-symptom-disease-surveillance.md` | Match fuzzy texto libre → enfermedades reportables → signal silencioso a autoridad. Owner no ve diagnósticos. |
| `2026-05-17-lost-and-found-complete-design.md` (v1.1) | ✅ Implementado | `plans/2026-05-17-lost-and-found-complete.md` | Microchip cross-check + return-to-owner + broadcast + disclosure prefs owner-controlled + enriched flow para pets sin chip. 7 fases. Paths via `/org/[orgToken]/mascotas/{petToken}`. |
| `2026-05-17-bidirectional-geocoding-design.md` | ✅ Implementado | `plans/2026-05-17-bidirectional-geocoding.md` | Sync bidireccional text ↔ map pin vía Nominatim/OSM proxy. `LocationFields` mode="point" integra text + sync, `MarkLostForm` migrado. UX-only, sin schema changes. |
| `2026-05-18-bite-rabies-observation-design.md` (v1.1) | ✅ Implementado | `plans/2026-05-18-bite-rabies-observation.md` | Bite reporting + observación 10 días, end-to-end. Migración 0021 + columna `pets.rabies_observation_status`. 2 event_types nuevos (`rabies_observation_started/ended`). Owner self-report `/mis-mascotas/[token]/eventos/nuevo/mordedura` + banner. Org-side reporting `/org/[orgToken]/mordedura/nuevo` (capability `bite.report`, vets + shelters). Surveillance escalation: rabia high-spec durante observación → `urgent` + nudge owner. Cron auto-close + script CLI. Death hook (auto-close con outcome=`dead` + escalada urgent). `/admin/observaciones` para cierre profesional con outcome configurable (negative / positive_rabies / dead / lost_to_followup). **Follow-up menor:** configurar cron schedule en vercel.json. Anclaje legal: Decreto 4669/1973 PBA, Ord. CABA 41.831/1987, Res. MS 1144/2018. |
| `2026-05-18-physical-tag-design.md` (v1.0) | 🟡 Spec only — pending decisions in §15 open questions | (plan a escribir post-OK) | Chapa identificadora física que cuelga del collar con QR a `/p/[publicToken]`. Modelo Estonia-style: identidad canónica en software, chapa como UX layer. Multi-tag por pet, redirect `/t/[serial]` → `/p/[publicToken]`, activación self-serve, revocación granular. **Material y fabricante son placeholders explícitos** — research de opciones AR (Luna Accesorios, Laser Eleven, K9, Grabados Piroso) + opciones import. Decisiones pendientes: auto-revoke on death, DIY QR, interop con otros sistemas. ~3 días cuando se planee. |
| `2026-05-18-foster-volunteers-pool-design.md` (v1.4) | ✅ Implementado | `plans/2026-05-18-foster-volunteers-pool.md` | Pool de owners voluntarios proactivos para foster. Tabla `foster_volunteers` (preferences + status + `available_slots`) + `foster_proposals` (org-initiated, pet-específica, timeframe estimado, 7d expiry). Volunteer acepta → materializa `ownership.role='foster'` con `allow_co_foster` flag opcional. **Decisiones cerradas v1.4**: D16 modelo de slots single-use (cada inscripción +1, cada aceptación -1, prompt post-termination "¿volver al pool?"); D17 co-foster opt-in por checkbox del primer foster; D18 cascade auto-cancel cuando slots queda en 0. Todo público entre orgs del pool (sin gating de detalle). Notes visibles en listado + count agregado aceptaciones/rechazos. Match warnings (no bloqueos) por mismatch de preferences — la org elige con criterio, el voluntario decide al recibir. Heredados v1.1-v1.3: D13 DNI verificado + perfil hidratado, D14 + §17 adoption eligibility flag, D15 + §6.10 foster con capacidades plenas como owner. 4 fases A-B-C-D shipped. **Follow-up:** aplicar `db/foster_rls.sql` en Supabase Studio. |
| `2026-05-18-maltreatment-reporting-design.md` | ⚪ **SUPERSEDED** | — | Quedó superseded por la implementación real en `welfare_reports` table (`db/schema.ts:885-983`, `app/actions/welfare.ts`, `app/denuncias/nueva/`). La arquitectura `ghost_subject` propuesta NO debe seguirse — el código usa una tabla separada con `subjectKind` enum polimórfico. Mantenido solo como referencia histórica del análisis comparativo con el form del MPF CABA (https://denuncias.fiscalias.gob.ar/). Para trabajar el feature ver `plans/2026-05-18-welfare-reports-polish.md` + futuro spec del welfare-officer queue. |
| `2026-05-18-adoption-listing-public-design.md` (v1.3) | 🟢 Ready for CC — cross-spec guards aplicados | (plan a escribir post-OK) | Listing público `/adoptar` con ficha individual `/adoptar/[petToken]`, filtros por especie/locality/edad/talle/energía, paginación keyset, JWT apply intent para gate de auth en "Postularme", branch en signup flow cuando viene de adopción. Schema: 11 columnas `adoption_*` en `pets`. **17 decisiones cerradas** (D1-D17): proyección sobre shelter_custody, no "reservar" sino "postularme", múltiples postulaciones simultáneas, postulante no ve competencia, branding refugio visible, branding del refugio visible, etc. **v1.3 agrega D18-D21 cross-spec guards**: excluye `status='lost'`, `adoption_eligible=false` (foster-volunteers v1.4), `in_custody_dispute=true` (custody disputes), `rabies_observation_status='active'` (bite-rabies-observation). Doble guard DB + server validation en `setAdoptionListingStatusAction`. 6 fases (1-6). ~1.5 semanas. |

### Plans (implementation, listos para Claude Code)

| Plan | Status | Spec relacionado | Notas |
|------|--------|------------------|-------|
| `2026-05-15-timeline-type-filter.md` | ✅ Implementado | `specs/2026-05-15-timeline-type-filter-design.md` | — |
| `2026-05-16-event-agent-foundations.md` | ✅ Implementado | — (diseño en chat) | `lib/event-agent-registry.ts` con `EVENT_AGENT_REGISTRY` + `buildAgentDeeplink()`. Form de peso retrofitteado como referencia de URL-prefill (acepta `?kg=&occurredAt=&notes=`). Tests en `lib/event-agent-registry.test.ts`. |
| `2026-05-16-vecino-mascota-en-transito.md` | ✅ Implementado | — (diseño en chat) | `custodyKind` field en `PetForm`, `shelter_custody` ownership branch en `createPetAction` |
| `2026-05-16-libreta-sanitaria-parte-a.md` | ✅ Implementado | — | `lib/libreta-sanitaria.ts` con `LIBRETA_SANITARIA_EVENT_TYPES`, `NON_LIBRETA_EVENT_TYPES`, `LIBRETA_FILTER_CHIPS`, helpers + test de cobertura |
| `2026-05-16-libreta-sanitaria-parte-b.md` | ✅ Implementado | — | Ruta `/mis-mascotas/{token}/libreta` con vista agrupada + cronológica + print stylesheet. Componentes `LibretaSanitariaView`, `LibretaIdentityHeader`. Grouping en `lib/libreta-sanitaria.ts`. |
| `2026-05-16-libreta-sanitaria-parte-c.md` | ✅ Implementado | — | Tabla `libreta_share_tokens`, ruta pública `/libreta/compartir/[shareToken]`, server actions `createLibretaShareAction`/`revokeLibretaShareAction`, `SharesManager` owner UI, view-tracking via `pet_events` type `libreta_shared_viewed`. |
| `2026-05-17-mimar-rebrand-and-portal-restructure.md` | ✅ Implementado | — | Paths alineados (`/pro`, `/gob`) + pasada de copy user-facing completa: títulos, notifications, error messages, banners y subjects de email todos como "MiMAR". `DIM` queda exclusivamente como codename interno (schema, tokens `DIM-XXXX-XXXX`, code identifiers, comments, audit logs). |
| `2026-05-17-code-rename-refugio-to-org.md` | ✅ Implementado | — | `app/refugio/` ya no existe; código vive en `app/org/[orgToken]/`. |
| `2026-05-17-symptom-disease-surveillance.md` | ✅ Implementado | `specs/2026-05-17-symptom-disease-surveillance-design.md` | 5 fases shipped (Fases 3+4 combinadas en un solo commit por estar acopladas). Catálogo de 23 síntomas, matcher fuzzy, `outbreak_signal` event type, server action + form, integration tests. TODO inline en `routeOutbreakSignalNotification` para swap a govt-scope routing cuando lande admin page Fase 0. |
| `2026-05-17-lost-and-found-complete.md` | ✅ Implementado | `specs/2026-05-17-lost-and-found-complete-design.md` | 7 fases shipped en PRs #49–#55. Cross-check + match flow + disclosure prefs + enriched + return-to-owner + broadcast + polish. |
| `2026-05-17-bidirectional-geocoding.md` | ✅ Implementado | `specs/2026-05-17-bidirectional-geocoding-design.md` | Server action `app/actions/geocoding.ts` (auth-gated) delega a `lib/geocoding.ts` (proxy Nominatim + token bucket 5 req/sec). `LocationFields` mode="point" integra text + map con debounce 600ms + skipNextForward flag. `LocationPicker` ahora soporta drag del pin además de click. `MarkLostForm` migrado: el input separado `lastKnownLocation` se removió y vive integrado en `LocationFields` con `inputNames.description="lastKnownLocation"`. 18 tests con fetch mockeado en `__tests__/geocoding.test.ts`. Privacy D10: server NO loguea queries. |
| `2026-05-18-bite-rabies-observation.md` | ✅ Implementado | `specs/2026-05-18-bite-rabies-observation-design.md` (v1.1) | Las 6 fases shipped en 6 commits. F0=schema + Zod + capability. F1=owner self-report + UI. F2=surveillance escalation hook. F3=cron + CLI auto-close. F4=org-side reporting + `OrgBiteForm`. F5=death-during-observation hook + `during_rabies_observation` flag. F6=`professionalCloseRabiesObservationAction` + `/admin/observaciones[/[token]]` surface con outcome configurable. Follow-up menor: vercel.json cron schedule. |
| `2026-05-18-event-catalog-cleanup.md` | ✅ Implementado | — | Cleanup estructural del catálogo: borrados 4 events redundantes (subsumidos por `clinical_info_logged`), bites refactoreados bajo `incident_reported` (umbrella + `incident_type` discriminator), agregados 5 events nuevos (`adoption_withdrawn`, `custody_dispute_raised/resolved`, `microchip_replaced/revoked`), deprecado `adoption_application_reviewed`. Migración 0018 agrega `pets.in_custody_dispute`. Test existente de cobertura (`__tests__/event-schemas.test.ts`) ajustado + nuevo orphan-schema check. AGENTS.md Event catalog actualizado a 39 types con sección "Deprecated event types" + nueva subsección "Cross-cutting event design patterns" (4 patterns). Spec de bite-rabies-observation bumpeada a v1.1. |
| `2026-05-18-admin-page-fases-10-14.md` | 🟡 Parcial — Fase 11 ✅ | `specs/2026-05-18-admin-page-next-phases-design.md` (v3.0) | Cinco fases independientes (excepto F10 que depende de event-catalog-cleanup), cada una = 1 PR. **F11 ✅ shipped** (`6f6444a` — regional dashboards govt: `/gob/vigilancia` + `/gob/perdidas` con scoping por jurisdicción). Pendientes: F12 admin metrics, F13 bulk ops, F14 auto-expiry cron + cron_runs table, F10 custody disputes (la más grande). Orden recomendado para lo que queda: 12 → 13 → 14 → 10. |
| `2026-05-18-localities-catalog-indec.md` | ✅ Implementado (parcial) | `specs/2026-05-18-localities-catalog-indec-design.md` (v2.0) | Fases A-E aplicadas. A=schema (`0019_ar_localities.sql` + `0020_drop_slug_unique.sql`), B=importer `scripts/import-indec-localities.ts` (4027 rows imported), C=helpers `lib/ar-localidades.ts` + `app/actions/localities.ts` (60 req/min rate limit), D=`LocalityCombobox` + 3 forms refactoreados, E=`lib/jurisdiction-validation.ts` + 2 actions govt + `scripts/normalize-existing-jurisdictions.ts`. **Follow-ups en READMEpriorities #7**: validar 5 actions restantes + importar CABA barrios separately. |
| `2026-05-16-health-campaigns-and-scheduling.md` | ✅ Implementado | `specs/2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | 10 fases shipped en 7 commits (`f0430f3`..`8ed5a9a`). Schema (4 tablas polymorphic + reminders FK), aprobación org/vet via `findAuthoritiesForJurisdiction`, schedule rules, materialización cron + script + botón, owner search + book (advisory lock + DB constraint para races), attendance + cancelaciones, integración con flujo existente, review UI en `/gob/servicios` + `/admin/servicios`, polish. 24h reminder cron documentado como TODO en `plans/2026-05-18-scheduling-24h-reminder-cron-todo.md`. |
| `2026-05-18-foster-volunteers-pool.md` | ✅ Implementado | `specs/2026-05-18-foster-volunteers-pool-design.md` (v1.4) | 4 fases A-B-C-D shipped en commits `7069d72` (A) → `2a5e3a3` (B) → `fb3d9bb`+`401ea03` (C) → `3308e28`+`8d522a9` (D) → `a92366e` (D12 E2E). A=schema foster_volunteers + foster_proposals + ownerships.allow_co_foster + 6 nuevos EVENT_TYPES. B=adoption_eligible columns + adoption_eligibility_set event + setAdoptionEligibilityAction + gate en finalizeAdoption. C=9 server actions (3 voluntarios + 5 propuestas + matching helper) + extensiones de endFoster/recordDeath/finalizeAdoption + cron `expire-foster-proposals` (patrón close-rabies-observations) + RLS policies en `db/foster_rls.sql`. D=10 pages/rutas UI (mix `/cuenta/*` + `/org/[orgToken]/*`). D12=test E2E al action layer (vi.mock createClient en lugar de Playwright); cazó bug real de ordering en acceptFosterProposalAction que violaba CHECK `foster_proposals_response_consistent` — fix: crear ownership primero, single UPDATE flip atómico. **Follow-up:** aplicar `db/foster_rls.sql` en Supabase Studio. |
| `2026-05-18-welfare-reports-polish.md` | 🟢 Ready for CC | — (cierra gaps de la implementación welfare_reports existente) | 4 fases pequeñas, ~1 día. F1=bridge bug en `app/actions/welfare.ts` — pet_events INSERT no copia `locationLat/locationLng` desde el welfare_report, EventMap renderiza "Sin ubicación registrada" falso. F2=mapa missing en detail pages de denuncia (`/denuncias/[id]` y `/denuncias/codigo/[code]`) — solo muestran coords como texto, no rendera `EventMap`. Rename a `LocationMap` y mover a `components/`. F3=rate-limit anónimo (TODO en welfare.ts:9-11) con tabla `rate_limit_buckets` + helper `lib/rate-limit.ts`. F4=cleanup docs: marcar maltreatment-reporting spec como SUPERSEDED, update AGENTS.md Open questions. **NO incluye** welfare-officer queue `/gob/maltrato` ni moderation queue (specs/plans separados). |

**Leyenda:**

- ✅ Implementado — código en main, verificado en repo
- 🟢 Ready for CC — plan auto-contenido, listo para sesión de Claude Code
- 🟡 Spec only — necesita plan escrito antes de implementar
- 🔵 In progress — Claude Code está trabajando ahora

---

## Cross-cutting dependencies

Conviene saberlas porque cruzan varios specs:

- **Portal rename (este plan)** destraba:
  - Coherencia entre todos los specs/plans (todos referencian `/org/[orgToken]`, `/gob`, `/admin`, `/pro` consistentemente)
  - Reducción de fricción cuando llegue el code rename físico de `app/refugio/` → `app/org/`
  - Habilita la implementación de sub-rutas `/pro/servicios` + `/pro/agenda` para vets independientes
- **Admin page Fase 0** (schema foundation: `account_type`, `admin_grants`, `approval_requests`, `audit_log`) destraba:
  - El routing a govts del symptom surveillance (hoy fallback a admins vía `/admin`; post-Fase 0 irá a `/gob`)
  - La aprobación real de vet upgrades (hoy se setea matriculaVerified=true por Studio)
  - La verificación real de organizaciones (hoy se hace por Studio)
  - El scheduling approval del spec de campaigns (hoy no existe)
  - La separación de surfaces `/gob` (approval queue scoped a localidad) vs `/admin` (meta-admin + fallback)
- **Libreta sanitaria Parte A** ya implementado destraba:
  - Parte B (ruta dedicada)
  - Parte C (Tier-2 shareable)
  - El narrativo "quedó en tu libreta sanitaria" del spec de scheduling cuando se implemente
  - Filtros consistentes en el pet profile timeline (ya integrado)
- **Hardening del event-sourcing** (Zod schemas estrictos, validateEventPayload, triggers append-only) ya implementado destraba:
  - El surveillance feature usa `validateEventPayload` para los payloads de `symptom_observed` y `outbreak_signal`
  - El lost-and-found feature extiende Zod schemas de `status_changed`, `custody_transfer_proposed`, `custody_transferred`
  - Cualquier feature futuro que agregue event_types

---

## Convenciones

**Naming:**
- Archivos con prefijo de fecha `YYYY-MM-DD-descripción-corta.md`
- Specs siempre terminan en `-design.md` (e.g., `health-campaigns-and-scheduling-design.md`)
- Plans no terminan en `-design.md` para distinguirlos visualmente
- Versiones en el header del doc (`v1.0`, `v1.1`, `v2.0`), no en el nombre del archivo

**Brand y rutas:**
- Producto user-facing: **MiMAR** (Mi Mascota Argentina). Aparece en title, copy, notifications.
- Codename interno: **DIM**. Schema, code, tokens, audit. Nunca cambia.
- Paths user-facing: `/mis-mascotas`, `/pro`, `/org/[orgToken]`, `/gob`, `/admin`, `/p/[publicToken]`, `/libreta/compartir/[shareToken]`.
- Spanish naming convention para paths (`/gob` abreviado de "gobierno", no `/government`; `/organizaciones` se acortó a `/org` por brevedad consistente con `/admin`, `/pro`, `/p`).

**Cambios mayores a un spec:**
- Bumpear versión en el header
- Documentar qué cambió respecto a la versión anterior en una línea
- Si la implementación correspondiente ya empezó, evaluar si el plan también necesita rewrite

**Cuando un plan se ejecute:**
- El commit final puede actualizar el README marcando el plan como ✅ Implementado
- Mantener el archivo del plan (es referencia histórica de cómo se construyó la feature)

**Cuándo escribir un spec vs un plan directo:**
- Spec si el feature tiene decisiones de producto, cambios de schema, o múltiples archivos
- Plan directo si es un retrofit/fix puntual cuya intención es obvia

**Lectura obligatoria antes de cualquier plan:**
- `AGENTS.md` end-to-end (principles, data model, libreta sanitaria, user roles, etc.)
- El spec correspondiente (cuando exista)
- Cualquier doc que el plan liste en su sección "0. Antes de tocar nada"

---

## Docs fuera de `docs/superpowers/`

**Activos** (`docs/`) — siguen siendo fuente de verdad en aspectos específicos. Citables como canon en specs/plans nuevos:

- `docs/legal-framework-full.md` — framework legal AR vivo, sigue iterando.
- `docs/org-portal-plan.md` — ✅ Implementado en código (`app/org/[orgToken]/*`). Sigue referenciado como canon de flows en plans recientes (por ej. `foster_ended.payload.reason='adoption'` patrón Flow 7).
- `docs/org-portal-event-flows.md` — Flows 1-9 canónicos del org portal. Referenciado por specs/plans nuevos.
- `docs/org-portal-permissions.md` — capability matrix canon. Referenciada por todos los specs que tocan capabilities.
- `docs/patterns/petition-prerequisites.md` — patrón reusable para pre-condiciones de capabilities.

**Archivados** (`docs/archive/`) — prompts históricos y material 2021. Ver `docs/archive/README.md` para inventario:

- Prompts del rebuild 2026 ya implementados: `event-sourcing-hardening-prompt.md`, `org-portal-prompt.md` (se mantienen como referencia histórica del proceso; el feature está vivo en código).
- Material del proyecto universitario 2021: Carpeta Final, paper CONAIISI, Business Model Canvas, Event Sourcing notes.

Los archivados NO se mantienen activamente. Si algún detalle se vuelve relevante para una decisión nueva, migrarlo a `AGENTS.md` o un spec nuevo en lugar de editar el archivo en `archive/`.

(Notas anteriores mencionaban `v1-closure-prompt.md` y `location-unification-prompt.md` — esos archivos ya no existen, fueron limpiados antes. Esta entrada queda corregida.)
