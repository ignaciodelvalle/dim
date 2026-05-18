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
| 0 | **MiMAR rebrand + portal restructure** | `plans/2026-05-17-mimar-rebrand-and-portal-restructure.md` | Doc-first: AGENTS.md + specs/plans alignment con brand MiMAR, paths `/org/[orgToken]`, `/gob`, `/admin`, `/pro`. Pre-requisito de los demás planes para que las URLs no diverjan. ~3-4 horas. |
| 1 | **Libreta Sanitaria — Parte B** | `plans/2026-05-16-libreta-sanitaria-parte-b.md` | Parte A landed (`lib/libreta-sanitaria.ts` exists). B is the dedicated `/libreta` route — the visible payoff of the rename. ~1 día. |
| 2 | **Libreta Sanitaria — Parte C** | `plans/2026-05-16-libreta-sanitaria-parte-c.md` | Tier-2 shareable libreta. The killer adoption feature (dueños pueden mostrar libreta a un vet con un link). Reusa componentes de Parte B. ~2-3 días. |
| 3 | **Code rename `/refugio` → `/org/[orgToken]`** | `plans/2026-05-17-code-rename-refugio-to-org.md` | Rename físico de carpetas con middleware redirect. Pre-requisito para que campaigns y lost-and-found escriban código con paths correctos. Cuando admin page Fase 0 lands, el rename debería estar mergeado para que la spec esté alineada cuando se implemente. ~medio día. |
| 4 | **Event-agent foundations** | `plans/2026-05-16-event-agent-foundations.md` | Registry + reference URL-prefill (peso form). Foundational para el futuro agente conversacional. ~1 día. |
| 5 | **Lost & Found completo** | `plans/2026-05-17-lost-and-found-complete.md` | 7 fases: cross-check + match flow + disclosure prefs + enriched flow + return-to-owner + broadcast + polish. El feature donde MiMAR honra su promesa de microchip. ~1.5 semanas. Idealmente después del code rename (prioridad 3). |
| 6 | **Symptom → disease surveillance** | `plans/2026-05-17-symptom-disease-surveillance.md` | 5 fases: catálogo de síntomas + matcher + outbreak_signal event + notification. Activación del dashboard zoonosis. Dependencia parcial con admin page Fase 0 (para routing a govts en lugar de solo admin fallback). ~2-3 días. |
| 7 | **Health campaigns + scheduling** | `plans/2026-05-16-health-campaigns-and-scheduling.md` | 10 fases: schema → approval workflow → schedule rules → materialización cron → owner search/book → org attendance → owner cancellation → integration con form existente → sub-rutas `/pro/servicios` + `/pro/agenda` → polish. Sistema completo de turnos veterinarios. Idealmente después del code rename (prioridad 3). ~2 semanas. |

**Bloqueadas por specs sin plan todavía:**

| Feature | Spec | Bloqueado por |
|---------|------|---------------|
| Admin page (4 roles + govt + cuentas institucionales) — surfaces `/admin` y `/gob` | `specs/2026-05-17-admin-page-design.md` | Falta escribir plan. Sugerido empezar por Fase 0 (schema foundation) en plan separado. La spec destraba dos surfaces: `/gob` (govt scope-bound) y `/admin` (meta-admin universal). |

---

## All specs & plans

### Specs (design docs)

| Spec | Status | Plan | Notas |
|------|--------|------|-------|
| `2026-05-15-timeline-type-filter-design.md` | ✅ Implementado | `plans/2026-05-15-timeline-type-filter.md` | `EventTimeline` tiene prop `chips` + `DEFAULT_FILTER_CHIPS` export |
| `2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | 🟢 Ready for CC | `plans/2026-05-16-health-campaigns-and-scheduling.md` | Provider polymorphic (org o vet independiente via sub-rutas `/pro/servicios`). Approval routing a govt scope-matching + admin fallback. Paths `/org/[orgToken]`, `/pro`, `/gob`, `/admin`. 10 fases. |
| `2026-05-17-admin-page-design.md` (v2.2) | 🟡 Spec only — needs plan | — | Cuatro roles (`owner`, `vet`, `govt`, `admin`), dos `account_type`s (personal / institutional). Split de surfaces: `/gob` (govt scope-limitado por localidad) y `/admin` (meta-admin universal). Phasing en 9 fases. |
| `2026-05-17-symptom-disease-surveillance-design.md` | 🟢 Ready for CC | `plans/2026-05-17-symptom-disease-surveillance.md` | Match fuzzy texto libre → enfermedades reportables → signal silencioso a autoridad. Owner no ve diagnósticos. |
| `2026-05-17-lost-and-found-complete-design.md` (v1.1) | 🟢 Ready for CC | `plans/2026-05-17-lost-and-found-complete.md` | Microchip cross-check + return-to-owner + broadcast + disclosure prefs owner-controlled + enriched flow para pets sin chip. 7 fases. Paths via `/org/[orgToken]/mascotas/{petToken}`. |

### Plans (implementation, listos para Claude Code)

| Plan | Status | Spec relacionado | Notas |
|------|--------|------------------|-------|
| `2026-05-15-timeline-type-filter.md` | ✅ Implementado | `specs/2026-05-15-timeline-type-filter-design.md` | — |
| `2026-05-16-event-agent-foundations.md` | 🟢 Ready for CC | — (diseño en chat) | `lib/event-agent-registry.ts` + retrofit del peso form. Foundational para el futuro agente conversacional. |
| `2026-05-16-vecino-mascota-en-transito.md` | ✅ Implementado | — (diseño en chat) | `custodyKind` field en `PetForm`, `shelter_custody` ownership branch en `createPetAction` |
| `2026-05-16-libreta-sanitaria-parte-a.md` | ✅ Implementado | — | `lib/libreta-sanitaria.ts` con `LIBRETA_SANITARIA_EVENT_TYPES`, `NON_LIBRETA_EVENT_TYPES`, `LIBRETA_FILTER_CHIPS`, helpers + test de cobertura |
| `2026-05-16-libreta-sanitaria-parte-b.md` | 🟢 Ready for CC | — | Ruta dedicada `/mis-mascotas/{token}/libreta` con vista agrupada por propósito clínico + print stylesheet |
| `2026-05-16-libreta-sanitaria-parte-c.md` | 🟢 Ready for CC | — | Tier-2 shareable: tabla `libreta_share_tokens`, ruta pública gateada por token, owner-side share management |
| `2026-05-17-mimar-rebrand-and-portal-restructure.md` | 🔵 In progress | — | Doc-first rebrand: AGENTS.md + README + todos los specs/plans + brand copy mínimo en código |
| `2026-05-17-code-rename-refugio-to-org.md` | 🟢 Ready for CC | — | Rename físico `app/refugio/` → `app/org/[orgToken]/` con middleware redirect. Prerequisito: este rebrand mergeado. |
| `2026-05-17-symptom-disease-surveillance.md` | 🟢 Ready for CC | `specs/2026-05-17-symptom-disease-surveillance-design.md` | 5 fases. Hoy routea solo a admins; cuando admin page Fase 0 mergee, una pasada chica extiende a govts en scope vía `/gob`. |
| `2026-05-17-lost-and-found-complete.md` | 🟢 Ready for CC | `specs/2026-05-17-lost-and-found-complete-design.md` | 7 fases. Empezar por Fase 1 (schema foundation). |
| `2026-05-16-health-campaigns-and-scheduling.md` | 🟢 Ready for CC | `specs/2026-05-16-health-campaigns-and-scheduling-design.md` (v2.1) | 10 fases. Empezar por Fase 0 (schema: 4 tablas + polymorphic provider columns). Idealmente después del code rename. |

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
