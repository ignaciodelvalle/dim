# `docs/archive/`

Material histórico del proyecto. Se conserva para auditoría, referencia institucional, y para entender decisiones pasadas — **no se mantiene activamente**.

> 2026-05-21: `Carpeta Final-DIM 2021.docx` (9.3 MB) was removed from this folder per the iconic-dataset cleanup plan Phase 9.3. Still in git history if needed (`git log --diff-filter=D -- "docs/archive/Carpeta Final-DIM 2021.docx"`).

## Qué hay acá

### Documentos del proyecto original (2021)

- **`CONAIISI DIM (Camera-Ready).docx`** — paper publicado en el congreso CONAIISI 2021 por el equipo original.
- **`Business Model Canvas.jpg`** — canvas del modelo de negocio de la versión 2021.
- **`Event Sourcing.docx`** — notas internas del equipo original sobre event sourcing como modelo.

### Prompts históricos del rebuild (2026)

Prompts que se usaron para construir features grandes en el rebuild. El feature ya está implementado; estos archivos son la fotografía del prompt que disparó el trabajo, útil como referencia histórica del proceso, no como spec viva.

- **`event-sourcing-hardening-prompt.md`** — prompt que llevó a la implementación del hardening del event-sourcing (Zod schemas estrictos, `validateEventPayload`, append-only triggers, projection rebuild script). **Mayoría implementado**; UUIDv7 quedó pendiente como irrelevante hasta primer projector real.
- **`org-portal-prompt.md`** — prompt que disparó el build del org portal completo (`/org/[orgToken]/*`). El feature está implementado; algunos extractos de este doc todavía se citan como canon en specs/plans recientes (por ej. el patrón de `foster_ended.payload.reason='adoption'` siendo programmatic-only). Cuando se cite, anotar como referencia histórica — no es la fuente de verdad viva.

### Specs superseded (movidas acá en sprint 1 PR-007, 2026-05-27)

- **`2026-05-18-maltreatment-reporting-design.md`** — denuncia de maltrato. Proponía una arquitectura de `ghost_subject` pets que el código no implementó: la versión real vive en la tabla `welfare_reports` con `subjectKind` enum polimórfico (`db/schema.ts:885-983`, `app/actions/welfare.ts`, `app/denuncias/nueva/`). Para trabajar el feature ver `docs/superpowers/plans/2026-05-18-welfare-reports-polish.md`.
- **`05-pro-portal-design.md`** — portal `/pro` para vets independientes. Deprecado: el flujo del vet independiente vive ahora dentro del org portal (`/org/[orgToken]/...`), no existe `app/pro/`. Spec se conserva por su análisis del journey "vet sin clínica", útil si en el futuro se reabre.

## Qué NO está acá (mantenido en `docs/`)

- **`docs/legal-framework-full.md`** — framework legal AR vivo, sigue iterando.
- **`docs/org-portal-plan.md`** — plan ejecutivo activo, referenciado por plans recientes como canon de flows.
- **`docs/org-portal-event-flows.md`** — Flows 1-9 canónicos del org portal. Referenciados por specs/plans nuevos.
- **`docs/org-portal-permissions.md`** — capability matrix canon. Referenciada por todos los specs que tocan capabilities.
- **`docs/patterns/*`** — patrones reutilizables (`petition-prerequisites.md` etc.).
- **`docs/superpowers/specs/*`** y **`docs/superpowers/plans/*`** — specs y plans vivos del feature roadmap.

## Política de retención

- **Nada se borra de acá.** Es archivo histórico, no temporal storage. Auditoría + continuidad institucional cuando vuelvan los miembros del equipo 2021.
- **Si algún detalle de estos archivos se vuelve relevante para una decisión nueva**, migrarlo a `AGENTS.md` o a un spec nuevo en `docs/superpowers/specs/`. No editar acá.
- **Cuando algo en `docs/` deja de mantenerse activamente**, evaluar moverlo acá. Criterio: ¿alguien en una sesión nueva debería leerlo como autoridad sobre algo vivo? Si no, archive.
