# MiMAR · Navigation & perceived-performance audit

> **Fecha:** 2026-07-04 · **Alcance:** QOL de navegación en Next.js 15 App Router — clicks que no responden, loading/skeletons, post-mutación, scroll, prefetch, motion/a11y.
> **Ground truth:** `integration/all-20260703` @ `2b1eebd2` (`git rev-parse --short HEAD`).
> **Método:** lectura de código canónico (`lib/ui/sheet-nav.ts`, `full-page-action-nav.ts`, `ScrollReset.tsx`, `UrlTabs.tsx`, `SheetTriggerLink.tsx`) + inventario de `loading.tsx` / `error.tsx` + búsquedas `rg` sobre patrones prohibidos. Sin browser en vivo en esta pasada — hallazgos de router-drop basados en docblocks, engram #621/#622, verify-report #617/#650 y tests de contrato existentes.
> **Contexto PO:** complementa la conversación sobre qué temas meter en prompts de agente para maximizar QOL de navegación.

---

## 0. Resumen ejecutivo

El repo **ya peleó y ganó** la batalla más dura: el defecto de Next.js 15.5.x donde una soft navigation resuelve 200 pero **no pinta nada**. La respuesta arquitectónica es sólida — History API para `?sheet=` / `?tab=`, full document navigation para tabs SSR y post-mutación, `ScrollReset` keyed on pathname, skeletons con footprint real (Item 8 shipped). Los tests de contrato en rutas calientes (flip card, sheets, UrlTabs) son el modelo correcto.

El gap no es “falta de diseño” sino **cobertura incompleta y drift**:

| # | Hallazgo | Dimensión | Sev | Tipo |
|---|----------|-----------|-----|------|
| N1 | `CaptureBox` sigue usando `router.push/replace` para destinos `?sheet=` en la misma ruta — el fix de `EventCatcherSingle` no se propagó al fallback `/anotar` | Router hot-path | 🔴 Alta | Bug / paridad |
| N2 | ~50 componentes usan `router.refresh()` post-mutación — mismo defecto que `sheet-nav.ts` documenta como **no seguro** | Post-mutación | 🟡 Media | Deuda sistemática |
| N3 | `redirect()` del server action sigue en decenas de writers; solo `/gob/reglas` migró a `redirectTo` + `navigateAfterActionSuccess()` | Post-mutación | 🟡 Media | Deuda sistemática |
| N4 | `loading.tsx`: 20 archivos vs 217 `page.tsx` (~9%); Item 8 cubrió segmentos pesados pero owner secundario (`/cuenta`, `/mis-mascotas` lista, forms) queda en blanco | Perceived perf | 🟡 Media | Cobertura |
| N5 | `error.tsx`: 5 archivos — errores de segmento sin recovery UI dedicada | Resiliencia | 🟡 Media | Cobertura |
| N6 | `prefetch={false}` en 6 archivos; `CaptureBox` quick-chips y varios `<Link>` densos usan prefetch default | Mobile / red | 🟢 Menor | Disciplina |
| N7 | Contrato de navegación **no está en AGENTS.md** ni en `docs/agents/` — vive disperso en docblocks y Wave 2 handoff | Gobernanza agente | 🟢 Menor | Documentación |

**Orden sugerido:** N1 (hot-path owner, reproducción conocida) → N2/N3 (auditoría por superficie: org queues primero) → N4 (loading en `/mis-mascotas`, `/cuenta`, `/libreta/compartir`) → gobernanza N7 para que agentes futuros no reintroduzcan drift.

---

## 1. Lo que ya funciona (no re-litigar)

### 1.1 · Primitivos canónicos

| Primitivo | Archivo | Cuándo usarlo |
|---|---|---|
| Abrir/cerrar sheet/tab same-route | `lib/ui/sheet-nav.ts` | `?sheet=`, `?tab=`, `?lente=` — **History API**, nunca `router.push/replace` |
| Post-mutación que debe refrescar RSC | `closeSheetNavWithFullReload()` | Emergencia card, cualquier SC stale tras sheet |
| Post-action redirect (forms full-page) | `lib/ui/full-page-action-nav.ts` → `navigateAfterActionSuccess()` | Server action devuelve `redirectTo`, cliente hace `location.assign` |
| Tabs con contenido SSR distinto | `components/ui/UrlTabs.tsx` | `window.location.assign` — patrón inmune al router-drop |
| Scroll | `components/layout/ScrollReset.tsx` | Reset solo en `pathname` change, **no** en query-only |
| Trigger de sheet con copy-link | `components/pet-profile/SheetTriggerLink.tsx` | Left-click → `pushSheetUrl`; middle/right-click → `<Link>` normal |

Evidencia de madurez: `lib/ui/sheet-nav.test.ts` (27 referencias), `PetDetailTabsPanel.interaction.test.tsx`, `SheetHost.interaction.test.tsx`, `UrlTabs.test.tsx`, `EmergencyContactSheet.interaction.test.tsx`.

### 1.2 · Item 8 — skeletons (shipped)

```
find app -name 'loading.tsx' | wc -l   → 20
find app -name 'page.tsx' | wc -l      → 217
find app -name 'error.tsx' | wc -l     → 5
```

Segmentos con `loading.tsx` verificados en CI (`__tests__/skeleton.test.tsx`): `/gob`, `/gob/vigilancia`, `/admin`, `/org/[orgToken]`, `/inicio`, `/mis-mascotas/[publicToken]`, superficies públicas Track D (`/p`, `/adoptar`, `/refugios`, `/casos`).

Patrón correcto en `app/gob/loading.tsx`: `<output aria-busy="true" aria-label="Cargando…">` + footprint `OpKpiSkeleton` / `OpCardSkeleton`.

### 1.3 · Hot paths del perfil (bien resueltos)

- `PetActionRow`, `LostCaseBlock`, `MasSheet`, `LibretaFace` → `SheetTriggerLink` + `prefetch={false}`.
- `EventCatcherSingle` → `isSameRouteUrl()` + `pushSheetUrl()` antes de `router.push()` (`components/pet-profile/EventCatcherSingle.tsx:44–49`).
- `EventTimeline` → `prefetch={false}` en filas de evento (`EventTimeline.tsx:118–136`) con comentario explícito del costo en listas densas.

---

## 2. Hallazgos por dimensión

### 2.1 · Router hot-path — N1 (🔴 Alta)

**Qué pasa.** `EventCatcherSingle` ya clasifica same-route vs cross-route. `CaptureBox` — el fallback host de `/anotar` y destino de captura cuando el matcher no resuelve en el perfil — **no**:

```100:102:app/(app)/mis-mascotas/[publicToken]/anotar/CaptureBox.tsx
    startTransition(() => {
      router.push(url);
    });
```

Lo mismo en el `useEffect` de mount (`router.replace(url)` líneas 50–66). Cuando `matchToCaptureUrl` devuelve un `routeOverride` tipo `?sheet=marcar-perdida`, `?sheet=peso`, etc., el destino es **same-route** si el usuario ya está en el perfil, pero también falla si abrió `/anotar` como página fallback: el push soft puede dropear igual.

**Contraste con el fix correcto** (`EventCatcherSingle.go()`):

```44:49:components/pet-profile/EventCatcherSingle.tsx
  function go(href: string) {
    if (isSameRouteUrl(pathname, href)) {
      pushSheetUrl(href);
      return;
    }
    router.push(href);
  }
```

**Impacto.** Es exactamente la clase de bug que motivó `sheet-nav.ts` (Anotar 3/3 drop en prod). El sheet-primary flow del perfil está protegido; el **fallback `/anotar` y la identificación por texto libre dentro del sheet** no.

**Propuesta.**
1. Extraer `go(href)` a un helper compartido (`lib/ui/capture-nav.ts` o re-export desde `sheet-nav.ts`) usado por `EventCatcherSingle`, `CaptureBox`, y cualquier otro writer de capture URLs.
2. Test de contrato: matcher result con `routeOverride: "?sheet=..."` nunca llama `router.push` cuando `pathname` coincide.
3. Quick-action `<Link>` chips en `CaptureBox` (líneas 156–162): considerar `prefetch={false}` + intercept same-route (o `SheetTriggerLink` cuando el href es `?sheet=`).

**Nota de falso positivo descartado:** `chapita/page.tsx` usa `<Link href={...?sheet=chapita}>` desde `/chapita` hacia el perfil — es **cross-route** (pathname distinto), full navigation es correcta ahí.

---

### 2.2 · Post-mutación — N2 router.refresh (🟡 Media)

**Qué pasa.** `sheet-nav.ts` líneas 84–87 documentan explícitamente que `router.refresh()` **no es sustituto seguro** — usa la misma maquinaria de transición que el defecto. Aun así, `rg -l 'router.refresh(' --glob '*.{tsx,ts}'` → **~50 archivos** de producción (excl. tests/docblocks), concentrados en:

| Superficie | Ejemplos | Riesgo percibido |
|---|---|---|
| Colas operador | `BulkApprovalQueueList`, `AdoptionQueueList`, `OrgMascotasBulkList` | Usuario hace bulk action → UI no refleja cambio |
| Org portal | `VolunteerRow`, `OfferingActions`, `ChangeRoleSelect`, membership toggles | Toggle “no pegó” |
| Gob casos | `TriageActions`, `AssignmentActions`, `ReviewActions` | Cola de maltrato/decomisos |
| Owner | `ReminderActions`, `WithdrawApplicationButton` | Menor frecuencia |

**Patrón inmune ya usado en el repo:** `window.location.assign` (UrlTabs, JurisdictionSwitcher, MapChoropleth crossfilter, reglas CRUD).

**Propuesta (gradual, no big-bang):**
- **Tier A (colas + bulk):** post-success → `location.assign` a la misma URL (preserva filtros query) o strip solo el modal state.
- **Tier B (inline toggles):** optimistic UI + revert on error *antes* de depender de refresh.
- **Lint/test:** script CI que falle si un archivo nuevo importa `router.refresh` fuera de una allowlist documentada.

---

### 2.3 · Post-mutación — N3 redirect() en server actions (🟡 Media)

**Qué pasa.** `app/actions/business-rules.ts` migró a `redirectTo` + cliente `navigateAfterActionSuccess()` con evidencia Playwright (verify-report #650). El resto del repo sigue con `redirect()` directo:

| Área | `redirect()` aprox. | Notas |
|---|---|---|
| `src/modules/events/actions.ts` | 17 | Forms de eventos — alto tráfico owner |
| `app/actions/tattoo.ts`, `pregnancy.ts`, `booking.ts`, `upgrade.ts` | varios | Post-submit owner/org |
| Auth (`login`, `complete-identity`) | esperado | Redirect auth es otro contrato |

**Impacto.** Mismo mecanismo documentado en `full-page-action-nav.ts`: el action **sí persiste** (audit_log confirma) pero el usuario **se queda en el form** sin feedback de éxito — sensación de “no cargó”.

**Propuesta.** Extender el patrón `redirectTo` por módulo, empezando por `src/modules/events/actions.ts` (17 writers, mismo UX symptom). No tocar auth redirects en la misma PR.

---

### 2.4 · Loading hierarchy — N4 (🟡 Media)

**Qué pasa.** Item 8 cerró los segmentos **críticos** listados en el handoff Wave 2. El inventario actual muestra brecha en rutas secundarias owner y operador detail:

**Owner sin `loading.tsx` propio (muestra):**
- `app/(app)/mis-mascotas/` (lista)
- `app/(app)/cuenta/**` (portal completo)
- `app/(app)/denuncias/mias`, `denuncias/[id]`
- `app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/*` (17+ forms)
- `app/libreta/compartir/[shareToken]/`

**Gob/admin sin `loading.tsx` local (heredan `app/gob/loading.tsx` o `app/admin/loading.tsx`):**
- Rutas detail: `/gob/maltrato/[id]`, `/gob/cola/[publicToken]`, `/admin/moderacion/[id]`, etc.

**Matiz Next.js:** un `loading.tsx` en `app/gob/` **sí** cubre navegación segment-level hacia hijos mientras no exista un boundary más cercano. `/gob/maltrato/loading.tsx` existe; `/gob/mortalidad` hereda `/gob/loading.tsx` — aceptable.

**Gap real:** navegación **desde** `/inicio` **hacia** `/mis-mascotas` (lista) o `/cuenta` no tiene skeleton dedicado — el shell pinta pero el main puede quedar blanco hasta el round-trip Postgres.

**Propuesta (priorizada PO/demo):**
1. `app/(app)/mis-mascotas/loading.tsx` — `LnCardSkeleton` × N (grid de mascotas).
2. `app/(app)/cuenta/loading.tsx` — filas de settings.
3. `app/libreta/compartir/[shareToken]/loading.tsx` — Tier 2 vet-facing; primera impresión importa.
4. Forms `/eventos/nuevo/*`: el shell del wizard ya existe; evaluar **Suspense interno** antes que 17 `loading.tsx` idénticos.

---

### 2.5 · Error boundaries — N5 (🟡 Media)

Solo 5 `error.tsx`: root, `(app)`, `(public)/p`, `gob`, `org`. Un throw en `/admin/sistema` o `/gob/maltrato/[id]` burbujea al boundary más cercano — a menudo root — con UX genérica.

**Propuesta:** espejar la prioridad de N4: `app/admin/error.tsx`, `app/(app)/mis-mascotas/[publicToken]/error.tsx`. Mensaje es-AR + “Reintentar” + link de escape al portal home.

---

### 2.6 · Prefetch — N6 (🟢 Menor)

`prefetch={false}` explícito en 6 archivos. Hot paths críticos cubiertos (`SheetTriggerLink`, `EventTimeline`, `FutureLedgerList`).

**Drift:** `CaptureBox` quick-action grid usa `<Link href={href}>` sin `prefetch={false}` — al abrir Anotar sheet se montan 8+ prefetches de forms completos.

**Propuesta:** default `prefetch={false}` en cualquier `<Link>` dentro de listas/grids con ≥4 destinos; mantener prefetch en `OWNER_NAV` (3 ítems, hot path real).

---

### 2.7 · Pending states & tap feedback (🟢 en general, 🟡 pockets)

**Bien:** la mayoría de forms de eventos usan `useTransition` + disabled + copy “Registrando…”; `OpButton` soporta `loading`; `CaptureBox` submit muestra “Buscando formulario…”.

**Pockets sin auditar en esta pasada:** algunos `<button type="submit">` crudos en forms secundarios (`EditProfileForm`, `SearchFiltersForm`) — Item 9 del handoff Wave 2 pedía matriz completa; no re-verificada fila por fila aquí.

**Propuesta:** cerrar Item 9 matriz como checklist de PR, no como mega-PR.

---

### 2.8 · Motion & a11y (🟢 baseline OK)

- `prefers-reduced-motion` global en `globals.css`; skeleton shimmer off vía CSS (`__tests__/skeleton.test.tsx`).
- Loading regions: `aria-busy` + SR “Cargando…” en loading.tsx verificados en CI.
- Flip card: `aria-pressed` + label descriptivo testeado en `PetDetailTabsPanel.interaction.test.tsx`.

**Drift menor:** docblock de `components/ui/VaulSheet.tsx` línea 16 aún dice `onClose` “typically calls `router.push`” — contradice `sheet-nav.ts`. Actualizar docblock en un chore PR.

---

### 2.9 · Gobernanza de agentes — N7 (🟢 Menor)

Las reglas de navegación viven en:
- docblocks de `sheet-nav.ts`, `full-page-action-nav.ts`, `UrlTabs.tsx`
- Wave 2 Item 8 handoff (`docs/superpowers/specs/archive/2026-06-18-wave2-ux-hardening-handoff.md`)
- tests de interacción dispersos

**No** hay ancla en `AGENTS.md` § Design rules ni página en `docs/agents/README.md`. Los agentes nuevos pueden reintroducir `router.push(?sheet=)` o `router.refresh()` sin ver el contrato.

**Propuesta:** añadir § “Navigation & perceived performance” a `AGENTS.md` (slim index) con tabla de clasificación A/B/C y links a archivos canónicos — el snippet de prompt de la conversación PO es el borrador.

---

## 3. Matriz de clasificación de navegación (para prompts)

Todo tap/clic debe clasificarse **antes** de elegir API:

| Clase | Condición | API | Ejemplo |
|---|---|---|---|
| **A** | Misma ruta, solo query (`?sheet=`, `?tab=`, `?lente=`) | `pushSheetUrl` / `pushTabUrl` / `replaceTabUrl` | Anotar, Girar credencial/libreta |
| **B** | Misma ruta base, tab cambia **contenido SSR** | `window.location.assign` | `/gob/maltrato?queue=`, `UrlTabs` |
| **C** | Ruta distinta | `<Link>` / `router.push` | Nav `OWNER_NAV`, form full-page |
| **D** | Post server action con redirect | Action retorna `redirectTo`; cliente `navigateAfterActionSuccess()` | Reglas CRUD |
| **E** | Post mutación, RSC stale en misma vista | `closeSheetNavWithFullReload()` o assign | Emergencia card tras save |
| **F** | Post mutación inline en colas | **Evitar** `router.refresh()`; prefer assign u optimistic | Bulk approve |

**Regla de oro:** si el tap no produce feedback visual en **<100ms** (shell, skeleton, pending, o URL change), está mal.

---

## 4. Tests existentes vs gaps

| Área | Cubierto | Falta |
|---|---|---|
| Sheet open/close | `SheetHost.interaction.test.tsx`, refugio sheet tests | — |
| Tab/flip face | `PetDetailTabsPanel.interaction.test.tsx` | — |
| UrlTabs | `UrlTabs.test.tsx` | — |
| Capture same-route | — | Test CaptureBox / shared `go()` helper |
| router.refresh ban | — | Allowlist CI script |
| loading.tsx presence | `__tests__/skeleton.test.tsx` (subset) | Extender lista cuando se agreguen segmentos |

---

## 5. Recomendaciones para prompts de agente (accionable)

Bloque mínimo a pegar en contratos (`docs/agents/` o `AGENTS.md`):

```markdown
## Navigation & perceived performance (mandatory)

1. Classify every navigation (A–F matrix in docs/design/handoffs/2026-07-04-navigation-qol-audit.md).
2. Same-route ?sheet/?tab → lib/ui/sheet-nav.ts ONLY. Never router.push/replace for these.
3. Post-action redirect → redirectTo + navigateAfterActionSuccess(). Never bare redirect() for form CRUD.
4. Never router.refresh() for user-visible refresh — use location.assign or optimistic UI.
5. New heavy segment → loading.tsx with Op*/Ln* skeleton footprint + aria-busy.
6. Dense Link lists → prefetch={false}.
7. ScrollReset: pathname only, not query.
8. Add interaction test if you touch sheet/tab hot path.
```

---

## 6. Verificación sugerida (Claude Code / PO)

| # | Comando / acción | Esperado |
|---|---|---|
| 1 | Abrir perfil → Anotar → identificar “peso 12 kg” | Sheet peso abre sin drop (prod build) |
| 2 | Mismo flujo vía `/anotar?text=pesa 12 kg` | Mismo resultado (N1 fix) |
| 3 | `/gob/maltrato` cambiar tab queue | URL cambia, contenido SSR actualiza |
| 4 | Bulk approve en `/gob/cola` | Filas reflejan estado sin refresh manual |
| 5 | Navegar Inicio → Mis mascotas en throttling 3G | Shell instantáneo + skeleton, no blanco |
| 6 | `pnpm test __tests__/skeleton.test.tsx` | green |

---

## 7. Estado vs críticas anteriores

| Doc previo | Relación |
|---|---|
| Wave 2 Item 8 handoff | N4 parcialmente cerrado (20/217); arquitectura validada |
| `critique-2026-06-24-frontend.md` | Ortogonal (tokens Op/Ln); no solapa |
| verify-report #617 CRITICAL-1 | Origen de `sheet-nav.ts`; N1 es regresión de paridad en CaptureBox |
| verify-report #650 WARNING-1 | Origen de `full-page-action-nav.ts`; N3 es extensión pendiente |

---

*Auditoría read-only · `integration/all-20260703` @ `2b1eebd2` · Sin modificaciones de código en esta pasada.*
