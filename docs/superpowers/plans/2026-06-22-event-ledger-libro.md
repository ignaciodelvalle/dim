# Plan: Paquete L — Libro de eventos (event-sourcing visible) · ejecutable

> **Para Claude Code.** Plan ejecutable derivado de
> [`specs/2026-06-22-dashboards-sell-completeness-design.md`](../specs/2026-06-22-dashboards-sell-completeness-design.md)
> §4 (Paquete L). Hace **tangible** el principio core de AGENTS.md #2 ("las correcciones son eventos nuevos que
> referencian a los anteriores; ningún evento se edita ni se borra"): una vista admin **read-only** que muestra el
> `pet_events` como **libro append-only**, la **enmienda** (`event_amended`) en vez de la edición, y la
> **reproducción temporal** "as of t" del Panorama. **Sin schema nuevo · sin nuevos event types · sin migraciones.**
> El grueso es **proyección (`lib/metrics`) + UI read-only**. SDD test-first, docs en el mismo PR.
>
> **Reusa lo ya construido:** `petEventsScopeClause` (`lib/metrics/scope.ts`), `buildProjectionContext`,
> `lib/amendment.ts` (`getAmendmentsForEvents`, `AMENDABLE_EVENT_TYPES`), `components/ui/AmendedBadge.tsx`, el patrón
> de audit `logOutreachPiiQuery` (`lib/outreach-pipelines.ts`), el deep-link temporal del Panorama
> (`?asOf=<iso>`, ver `app/api/panorama/[layer]/route.ts` + `components/panorama/TimeScrubber.tsx`), `OpKpi` y
> `DashboardFreshnessFooter`.
>
> **Coordinación con la sesión de CC en curso:** todos los archivos de las Fases L0–L1 son **nuevos**. El único
> archivo compartido que se edita es `components/layout/nav-presets.ts` (+ su snapshot test) en la Fase L1.4 —
> hacerlo al final, en un commit aislado, para minimizar conflicto de merge.

---

## Objetivo y no-objetivos

**Objetivo.** Ruta `/admin/libro` (scope universal) que explica event-sourcing en 3 beats concretos, en orden:
1. **Stream inmutable** — feed cronológico de eventos (tipo · actor · jurisdicción · `occurredAt` · `recordedAt`).
2. **Enmienda, no edición** — al expandir un evento enmendado, ver la cadena `event_amended` encima (el original
   permanece; la corrección es un evento nuevo). Es el momento "ajá" de confianza/auditoría.
3. **Reproducción temporal** — deep-link "Ver situación a esta fecha" → `/admin/panorama?asOf=<occurredAt ISO>`.

**No-objetivos (diferidos).** Prueba criptográfica / hash-chain visible (roadmap). Eventos de sistema (disparos de
alerta del Paquete K) en el libro — entran cuando exista ese ledger (§L-D2). Edición/mutación de cualquier tipo
(la vista es estrictamente read-only).

---

## Fase L0 — Proyección + audit (lib, sin UI) 🟩

**Archivos nuevos:**
- `lib/metrics/event-ledger.ts`
- `lib/metrics/event-ledger.test.ts` (integración, contra Postgres local)

**`fetchEventLedger(ctx, filters, cursor)`**
- **Firma:** `(ctx: ProjectionContext, filters: EventLedgerFilters, cursor?: LedgerCursor) → { rows: EventLedgerRow[]; nextCursor: LedgerCursor | null }`.
- **Scope:** vía `petEventsScopeClause(ctx)` — admin universal (sin restricción), govt intersecta sus pares
  jurisdiccionales. **No reimplementar** el scoping.
- **Filtros (`EventLedgerFilters`):** `eventTypes?: EventType[]`, `province?: string`, `locality?: string`,
  `from?: Date`, `to?: Date`, `authorRole?: AuthorRole`. Todos opcionales (combinables).
- **Paginación keyset** sobre `(occurredAt DESC, id DESC)` — usa el índice existente
  `pet_events_pet_id_occurred_at_idx` / `pet_events_event_type_idx`; **nada de OFFSET**. `LedgerCursor =
  { occurredAt: string; id: string }`.
- **`EventLedgerRow`:** `id`, `petPublicToken` (join a `pets`, NO el `petId` crudo), `eventType`,
  `occurredAt`, `recordedAt`, `authorRole`, `authorOrganizationId`, `authorVerified`, `province`, `locality`,
  `hasAmendment: boolean`.
- **Flag de enmienda:** resolver `hasAmendment` con `getAmendmentsForEvents(ids)` de `lib/amendment.ts` (batch
  sobre los ids de la página) — no N+1.
- **PII gating:** la fila **no** incluye datos personales del dueño (ni nombre, ni DNI, ni contacto). Solo
  rol/organización del actor + token público de la mascota. El detalle PII-sensible queda fuera de v1 (la vista es
  un libro de *qué pasó*, no un buscador de personas).

**`logEventLedgerView(actorUserId, filters, resultCount)`**
- Modelar **exactamente** sobre `logOutreachPiiQuery` (`lib/outreach-pipelines.ts`): `db.insert(auditLog)` con
  `action: "pii_queried"`, `payload: { surface: "event_ledger", filters: <resumen>, result_count }`. Fire-and-forget.
- **Sin migración** (payload JSONB). `pii_queried` ya está en `lib/audit-action-labels.ts`.

**Tests (L0):**
- Scope: un `ctx` admin ve eventos de cualquier provincia; un `ctx` govt solo los de sus jurisdicciones (cross-juris
  isolation).
- Keyset estable: dos páginas consecutivas no solapan ni saltan filas; orden `occurredAt DESC, id DESC` determinista
  ante timestamps iguales.
- Filtros: `eventTypes` filtra; rango `from/to` acota; `province/locality` acota.
- `hasAmendment`: un evento con `event_amended` que lo referencia → `true`; uno sin → `false`.
- Audit: cada llamada de "list view" produce un `pii_queried` row con `surface: "event_ledger"`.

---

## Fase L1 — UI `/admin/libro` (read-only) 🟩

**Archivos nuevos:**
- `app/admin/libro/page.tsx` (server component)
- `app/admin/libro/loading.tsx` (skeleton — patrón Wave 2 Item 8)
- `app/admin/libro/EventLedgerRow.tsx` (client — fila expandible con la cadena de enmienda)
- `components/admin/EventLedgerTable.tsx` (presentacional)
- `__tests__/event-ledger-ui.test.tsx`

**`page.tsx`:**
- `await requireAdminOrRedirect()` (admin universal; rechaza admins desactivados).
- Lee filtros de `searchParams` (`tipo`, `provincia`, `localidad`, `desde`, `hasta`, `rol`, `cursor`).
- `ctx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m())` (o el período elegido).
- `const { rows, nextCursor } = await fetchEventLedger(ctx, filters, cursor)` + `logEventLedgerView(...)`.
- Render: header explicativo (1 frase: "registro append-only — nada se edita, todo se anexa"), barra de filtros,
  `EventLedgerTable`, botón "Cargar más" (keyset), `DashboardFreshnessFooter`, empty-state que distingue
  "sin eventos con estos filtros" de "verdadero cero".

**Los 3 beats en la UI:**
1. **Stream:** tabla cronológica con labels es-AR de `eventType` (reusar el mapa de labels existente del timeline;
   NO hardcodear enums crudos), columna actor (rol + org si `authorOrganizationId`), jurisdicción, `occurredAt`
   y `recordedAt` (mostrar ambos: "ocurrió" vs "se registró" — refuerza el modelo).
2. **Enmienda:** filas con `hasAmendment` muestran `<AmendedBadge />`; al expandir (`EventLedgerRow` client),
   cargar y mostrar la **cadena `event_amended`** encima del original (reusar `getAmendmentsForEvents` /
   `applyAmendments`), con copy "Corregido por enmienda — el original se conserva". Este es el beat de venta.
3. **Reproducción temporal:** cada fila lleva un link "Ver situación a esta fecha" →
   `/admin/panorama?asOf=${encodeURIComponent(occurredAt.toISOString())}` (+ `provincia/localidad` si la fila las
   tiene, para que el Panorama abra ya scopeado). Verificar contra el parser `parseAsOf`/`clampAsOf` de
   `app/api/panorama/[layer]/route.ts`.

**A11y (patrón Wave 2 Item 11):** `<table>` con `scope="col"` + `<caption>`; el toggle de expandir con
`aria-expanded`; icon+texto en el badge de enmienda (no color solo); foco manejado al expandir.

**Nav (L1.4 — único archivo compartido):**
- Editar `components/layout/nav-presets.ts`: agregar `{ href: "/admin/libro", label: "Libro de eventos",
  matchPrefix: "/admin/libro" }` a la sección **"Gobernanza"** de `ADMIN_NAV_SECTIONS` (junto a Historial/Servicios).
- Actualizar el snapshot `nav-presets.test.ts` (invariante "ningún href perdido").
- **Hacerlo en un commit aislado al final** (minimiza conflicto con la sesión de CC en curso).

**Tests (L1):**
- Render con una fila enmendada → aparece `AmendedBadge`; al expandir, se ve la cadena `event_amended`.
- Filtro por `tipo` reduce las filas renderizadas.
- El link de reproducción temporal construye `?asOf=<iso>` válido (round-trip con `parseAsOf`).
- Redirect: un caller no-admin a `/admin/libro` es expulsado (extender `e2e/a11y-operator-auth.spec.ts`).
- Empty-state distingue "sin resultados con filtros" de "cero real".

---

## Fase L2 — `/gob/libro` jurisdicción-scoped (opcional, follow-up) 🟨

Mismo `EventLedgerTable` + `fetchEventLedger`, pero:
- `app/gob/libro/page.tsx` con `requireAdminOrGovtOrRedirect()` → `ctx` con las jurisdicciones del govt (scope
  intersect ya lo da `petEventsScopeClause`).
- Entrada de nav en `GOB_NAV_SECTIONS` ("Referencia" o "Confiabilidad").
- Sin código de proyección nuevo (el scoping es el mismo). Marcar como follow-up de bajo costo.

---

## Cross-cutting

- **Sin schema, sin migraciones, sin nuevos event types.** Si algún check de CI exige declarar "no-schema-change",
  anotarlo en el PR.
- **Docs en el PR:** agregar fila a la tabla "Portal surfaces" del `README.md` (`/admin/libro` — Admin — Live) y,
  si se agrega lógica de dominio, una nota en `docs/architecture/hexagonal-lite.md` (proyección pura sobre el log).
- **Reuso de labels:** un solo mapa `eventType → es-AR` (el del timeline). No duplicar.
- **Frescura + denominador:** footer "calculado al {now} · último evento {maxOccurredAt}" (helper `lastIngestAt`
  ya usado en otros dashboards).

## Decisiones abiertas

- **§L-D1 — nombre de ruta.** `/admin/libro` (recomendado, evoca "libro mayor"/ledger) vs `/admin/eventos` (más
  literal pero colisiona conceptualmente con los forms de `eventos/nuevo` del owner). Default: `/admin/libro`.
- **§L-D2 — eventos de sistema.** Cuando exista el ledger de disparos del Paquete K (`alert_firings`), evaluar
  unificarlo en el Libro con un filtro "sistema vs mascota". Diferido — no condiciona L.
- **§L-D3 — profundidad de PII.** v1 no expone PII del dueño en el libro. Si más adelante se quiere "ver al dueño",
  pasa por el mismo gating + `pii_queried` con `surface` distinto. Diferido.

## Criterios de aceptación (resumen)

1. `/admin/libro` lista eventos scopeados, paginados por keyset, con audit `pii_queried` por vista.
2. Las filas enmendadas muestran la cadena `event_amended` sin mutar el original (read-only verificable).
3. El deep-link temporal abre el Panorama "as of" la fecha del evento.
4. No-admin es redirigido; a11y de tabla + toggle cumplida.
5. Cero schema / cero event types nuevos; nav y README actualizados; tests L0+L1 en verde.
