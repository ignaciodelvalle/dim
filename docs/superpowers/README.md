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
| 1 | **Event catalog cleanup** | `plans/2026-05-18-event-catalog-cleanup.md` | Bloquea custody-disputes (Admin Fase 10). Estructural — borra event_types redundantes, agrega CI test EVENT_TYPES↔PayloadSchemas, refactorea bite events. |
| 2 | **Admin page Fase 11 (regional dashboards `/gob/vigilancia` + `/gob/perdidas`)** | `plans/2026-05-18-admin-page-fases-10-14.md` (Fase 11) | Sin dependencias. Da valor visible inmediato al govt portal — surfacea las señales de surveillance que ya fluyen pero no se ven. ~½ día. |
| 3 | **Admin page Fase 12 (admin metrics `/admin/sistema`)** | (mismo plan, Fase 12) | Salud del sistema visible al admin: DAU, queue age, decisiones, govt activity. ~½ día. |
| 4 | **Admin page Fase 13 (bulk ops en queues)** | (mismo plan, Fase 13) | Multi-select + bulk approve/reject/revoke. ~1 día. |
| 5 | **Admin page Fase 14 (auto-expiry cron + cron_runs)** | (mismo plan, Fase 14) | Cron diario que cierra requests pending 60d+. Tabla cron_runs compartida con scheduling. ~½ día. |
| 6 | **Admin page Fase 10 (custody disputes)** | (mismo plan, Fase 10) | Post-cleanup. La más grande — tablas `custody_disputes` + `custody_dispute_parties`, surface `/gob/disputas`. ~2 días. |
| 7 | **Catálogo INDEC de localidades** | `plans/2026-05-18-localities-catalog-indec.md` | Bugfix grande: admin escribe localidad como texto libre y rompe scope-match. Importa los ~4500 localidades de INDEC a tabla `ar_localities`, agrega `<LocalityCombobox>` typeahead, valida 7 server actions, normaliza rows existentes. Sin dependencias. ~2 días. |

---

## All specs & plans

### Specs (design docs)

| Spec | Status | Plan | Notas |
|------|--------|------|-------|
| `2026-05-15-timeline-type-filter-design.md` | ✅ Implementado | `plans/2026-05-15-timeline-type-filter.md` | `EventTimeline` tiene prop `chips` + `DEFAULT_FILTER_CHIPS` export |
| `2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | ✅ Implementado | `plans/2026-05-16-health-campaigns-and-scheduling.md` | Provider polymorphic (org o vet independiente via sub-rutas `/pro/servicios`). Approval routing a govt scope-matching + admin fallback. Paths `/org/[orgToken]`, `/pro`, `/gob`, `/admin`. 10 fases. |
| `2026-05-17-admin-page-design.md` (v2.3) | ✅ Implementado (Fases 0-9) | — | Cuatro roles (`owner`, `vet`, `govt`, `admin`), dos `account_type`s (personal / institutional). Surfaces `/gob` y `/admin` activos. Migraciones 0010/0011/0015/0016. Fases 10+ continúan en `2026-05-18-admin-page-next-phases-design.md`. |
| `2026-05-18-admin-page-next-phases-design.md` (v3.0) | 🟢 Ready for CC | `plans/2026-05-18-admin-page-fases-10-14.md` | Fases 10-14 + placeholders 15-25. Custody disputes (10), dashboards regionales gobierno (11), métricas admin (12), bulk ops (13), auto-expiry cron (14). Fase 10 depende del event-catalog-cleanup. |
| `2026-05-18-localities-catalog-design.md` (v1.0) | 🚫 **Superseded** por v2.0 — no implementar | — | Versión inicial chiquita (catálogo curado de 94 entradas hardcoded en TS). Reemplazada antes de implementar por v2.0 que importa el catálogo INDEC completo (~4500). Se mantiene en el repo como referencia histórica del razonamiento. |
| `2026-05-18-localities-catalog-indec-design.md` (v2.0) | 🟢 Ready for CC | `plans/2026-05-18-localities-catalog-indec.md` | **Reemplaza v1.0**. Catálogo INDEC completo (~4500 localidades) importado a tabla `ar_localities` desde datos.gob.ar (CPPDyL), typeahead `<LocalityCombobox>` con debounce + ranking exact>prefix>contains, validación server-side en 7 server actions, script de migración one-shot para rows existentes, soft-delete de localidades removidas entre versiones. 5 fases (A-E) + operación manual post-merge. ~2 días. |
| `2026-05-17-symptom-disease-surveillance-design.md` | ✅ Implementado | `plans/2026-05-17-symptom-disease-surveillance.md` | Match fuzzy texto libre → enfermedades reportables → signal silencioso a autoridad. Owner no ve diagnósticos. |
| `2026-05-17-lost-and-found-complete-design.md` (v1.1) | 🟢 Ready for CC | `plans/2026-05-17-lost-and-found-complete.md` | Microchip cross-check + return-to-owner + broadcast + disclosure prefs owner-controlled + enriched flow para pets sin chip. 7 fases. Paths via `/org/[orgToken]/mascotas/{petToken}`. |
| `2026-05-17-bidirectional-geocoding-design.md` | 🟢 Ready for CC | `plans/2026-05-17-bidirectional-geocoding.md` | Sync bidireccional text ↔ map pin vía Nominatim/OSM proxy. Estandariza `LocationFields` como entry point único. UX-only, sin schema changes. ~1 día. |
| `2026-05-18-bite-rabies-observation-design.md` | 🟢 Ready for CC | `plans/2026-05-18-bite-rabies-observation.md` | Reportar mordedura → `bite_inflicted` + `rabies_observation_started` (atómico) → período de 10 días con escalada a `urgent` si surveillance detecta rabia high-spec → cierre auto negativo (cron) o profesional. Anclaje legal: Decreto 4669/1973 PBA, Ord. CABA 41.831/1987, Res. MS 1144/2018. 6 fases, ~3-4 días. |

### Plans (implementation, listos para Claude Code)

| Plan | Status | Spec relacionado | Notas |
|------|--------|------------------|-------|
| `2026-05-15-timeline-type-filter.md` | ✅ Implementado | `specs/2026-05-15-timeline-type-filter-design.md` | — |
| `2026-05-16-event-agent-foundations.md` | ✅ Implementado | — (diseño en chat) | `lib/event-agent-registry.ts` con `EVENT_AGENT_REGISTRY` + `buildAgentDeeplink()`. Form de peso retrofitteado como referencia de URL-prefill (acepta `?kg=&occurredAt=&notes=`). Tests en `lib/event-agent-registry.test.ts`. |
| `2026-05-16-vecino-mascota-en-transito.md` | ✅ Implementado | — (diseño en chat) | `custodyKind` field en `PetForm`, `shelter_custody` ownership branch en `createPetAction` |
| `2026-05-16-libreta-sanitaria-parte-a.md` | ✅ Implementado | — | `lib/libreta-sanitaria.ts` con `LIBRETA_SANITARIA_EVENT_TYPES`, `NON_LIBRETA_EVENT_TYPES`, `LIBRETA_FILTER_CHIPS`, helpers + test de cobertura |
| `2026-05-16-libreta-sanitaria-parte-b.md` | ✅ Implementado | — | Ruta `/mis-mascotas/{token}/libreta` con vista agrupada + cronológica + print stylesheet. Componentes `LibretaSanitariaView`, `LibretaIdentityHeader`. Grouping en `lib/libreta-sanitaria.ts`. |
| `2026-05-16-libreta-sanitaria-parte-c.md` | ✅ Implementado | — | Tabla `libreta_share_tokens`, ruta pública `/libreta/compartir/[shareToken]`, server actions `createLibretaShareAction`/`revokeLibretaShareAction`, `SharesManager` owner UI, view-tracking via `pet_events` type `libreta_shared_viewed`. |
| `2026-05-17-mimar-rebrand-and-portal-restructure.md` | 🟡 Doc-first done; brand copy pending | — | Paths alineados (`/pro`, `/gob`); falta pasada de copy user-facing (DIM → MiMAR en surfaces) si todavía queda alguno. |
| `2026-05-17-code-rename-refugio-to-org.md` | ✅ Implementado | — | `app/refugio/` ya no existe; código vive en `app/org/[orgToken]/`. |
| `2026-05-17-symptom-disease-surveillance.md` | ✅ Implementado | `specs/2026-05-17-symptom-disease-surveillance-design.md` | 5 fases shipped (Fases 3+4 combinadas en un solo commit por estar acopladas). Catálogo de 23 síntomas, matcher fuzzy, `outbreak_signal` event type, server action + form, integration tests. TODO inline en `routeOutbreakSignalNotification` para swap a govt-scope routing cuando lande admin page Fase 0. |
| `2026-05-17-lost-and-found-complete.md` | ✅ Implementado | `specs/2026-05-17-lost-and-found-complete-design.md` | 7 fases shipped en PRs #49–#55. Cross-check + match flow + disclosure prefs + enriched + return-to-owner + broadcast + polish. |
| `2026-05-17-bidirectional-geocoding.md` | 🟢 Ready for CC | `specs/2026-05-17-bidirectional-geocoding-design.md` | Fase única: server action `app/actions/geocoding.ts` proxy a Nominatim con rate limit + refactor `LocationFields` mode="point" con text + map sincronizados + migración de `MarkLostForm`. Tests con fetch mockeado, sin hits reales a Nominatim en CI. ~1 día. |
| `2026-05-18-bite-rabies-observation.md` | 🟢 Ready for CC | `specs/2026-05-18-bite-rabies-observation-design.md` | 6 fases: schema (3 events nuevos + columna `pets.rabies_observation_status`), owner reporting + UI, surveillance escalation hook, cron auto-close diario, org-side reporting, death-during-observation hook, surface admin/govt. Hooks en `createSymptomObservedAction` y en `death_recorded` existentes. Reusa routing govt-fallback-admin de surveillance. ~3-4 días. **Nota: cuando `event-catalog-cleanup` se aplique, este plan se actualiza a v1.1 para usar `incident_reported` con `incident_type='bite_inflicted'` en lugar de event_type propio.** |
| `2026-05-18-event-catalog-cleanup.md` | 🟢 Ready for CC | — | Cleanup estructural del catálogo: borra 4 events redundantes (subsumidos por `clinical_info_logged`), refactorea bite events bajo `incident_reported`, agrega 5 events nuevos (adoption_withdrawn, custody_dispute_raised/resolved, microchip_replaced/revoked), deprecada `adoption_application_reviewed`, agrega `pets.in_custody_dispute` column, CI coverage test `EVENT_TYPES↔PayloadSchemas`, refresh AGENTS.md Event catalog + nueva subsección "Cross-cutting event design patterns" documentando los 4 patterns. 10 pasos en 1 PR. ~1 día. **Pre-requisito de `bite-rabies-observation` y de Admin page Fase 10 (`custody_dispute_*` events).** |
| `2026-05-18-admin-page-fases-10-14.md` | 🟢 Ready for CC | `specs/2026-05-18-admin-page-next-phases-design.md` (v3.0) | Cinco fases independientes (excepto F10 que depende de event-catalog-cleanup), cada una = 1 PR. Orden recomendado: 11 → 12 → 13 → 14 → 10 (o 10 al frente si el cleanup ya se aplicó). Fase 11 regional dashboards, F12 admin metrics, F13 bulk ops, F14 auto-expiry cron + cron_runs table, F10 custody disputes (la más grande). |
| `2026-05-18-localities-catalog-indec.md` | 🟢 Ready for CC | `specs/2026-05-18-localities-catalog-indec-design.md` (v2.0) | 5 fases (A-E) más operación manual post-merge. A schema (migración 0019), B import script desde datos.gob.ar, C helpers + server action de search, D `<LocalityCombobox>` + refactor admin forms y LocationFields, E validación server-side en 7 actions + normalize de rows existentes. Cada fase = 1 PR. ~2 días total. |
| `2026-05-16-health-campaigns-and-scheduling.md` | ✅ Implementado | `specs/2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | 10 fases shipped en 7 commits (`f0430f3`..`8ed5a9a`). Schema (4 tablas polymorphic + reminders FK), aprobación org/vet via `findAuthoritiesForJurisdiction`, schedule rules, materialización cron + script + botón, owner search + book (advisory lock + DB constraint para races), attendance + cancelaciones, integración con flujo existente, review UI en `/gob/servicios` + `/admin/servicios`, polish. 24h reminder cron documentado como TODO en `plans/2026-05-18-scheduling-24h-reminder-cron-todo.md`. |

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

## Specs históricos (organización del repo previa al rebuild)

Estos viven fuera de `docs/superpowers/` pero conviene mencionarlos:

- `docs/event-sourcing-hardening-prompt.md` — ✅ Mayoría implementado (Zod schemas, validateEventPayload, append-only triggers, projection rebuild script). UUIDv7 pendiente (irrelevant hasta primer projector).
- `docs/org-portal-plan.md` — ✅ Implementado (`app/refugio/*`, intake, foster, transfer, adoption flows existen). Pendiente: code rename a `app/org/[orgToken]/` — ver `plans/2026-05-17-code-rename-refugio-to-org.md`.
- `docs/org-portal-event-flows.md`, `docs/org-portal-permissions.md`, `docs/org-portal-prompt.md` — referencia del proceso ejecutado.
- `docs/v1-closure-prompt.md`, `docs/location-unification-prompt.md` — prompts históricos de cierres de iteración.

Estos no se mantienen activamente. Si algún detalle suyo se vuelve relevante, conviene migrarlo a `AGENTS.md` o un spec nuevo.
