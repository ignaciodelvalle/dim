# Plan: Panorama UI overhaul + chrome operador — handoff a CC (4 PRs)

> **🧭 Orden global: ver [`2026-06-23-CONSOLIDATED-demo-panorama-cc.md`](./2026-06-23-CONSOLIDATED-demo-panorama-cc.md)** (orquestador). Este doc tiene el detalle file-level de los 4 PRs; el orquestador los ubica en las olas y pliega los fixes de cámara B2 (seed Microchip/Antirrábica en PR-3) y B3 (mapa negro en PR-2).

> **Para Claude Code — ejecución autónoma.** Cuatro PRs **independientes** que arreglan el chrome
> del operador y rediseñan la navegación del **Panorama / Centro de Situación Nacional**
> (`/admin/panorama` · `/gob/panorama`), más la carga de la demo y la legibilidad provincia↔localidad.
> Origen: [`docs/panorama-design-critique-2026-06-23.md`](../../archive/panorama-design-critique-2026-06-23.md).
> Severidad: 🔴 correctitud/UX-bloqueante · 🟡 fricción · 🟢 polish. **SDD test-first** (AGENTS.md),
> docs en el mismo PR. `pnpm verify` (tsc + Biome + lint:tokens + lint:ui + next build) + `pnpm test`
> verdes, cero regresiones por PR.
>
> **Antes de tocar código, leer:** (1) el *slim index* de [`AGENTS.md`](../../../AGENTS.md) (~1.5k tokens),
> (2) [§ Design rules → UI conventions](../../../AGENTS.md#design-rules-ui-conventions) (chrome operador,
> `AppShell` como único shell, "nav source = `nav-presets.ts`"), (3)
> [§ Dashboards & projections](../../../AGENTS.md#dashboards--projections-the-consumers) y
> [§ Aggregation & privacy policy](../../../AGENTS.md#aggregation--privacy-policy) (k-anon k=5, supresión),
> (4) la **crítica** linkeada arriba (§1–§5), y (5) este plan entero antes de abrir cada PR.

## Orden de ejecución
**PR-1 → PR-2 → PR-3 → PR-4.** Son independientes y cada uno mergeable solo, pero ese orden minimiza
conflictos: PR-1 (chrome) es quick-win aislado; PR-2 (navegación) es el grande; PR-3 (datos) deja el
seed correcto que hace que PR-4 (reconciliación) muestre números limpios. **No** combinar PRs.

## Cómo verificar las ubicaciones
Anclar por **símbolo + quote**, no por número de línea (los `:NN` son pistas; el código se mueve).
Confirmar con `grep`/`Read` antes de editar. Para ver el Panorama con datos correr `pnpm seed:panorama`
y `NEXT_PUBLIC_DEMO_MODE=true pnpm dev` (el banner de demo solo aparece en `/admin`).

## Decisiones tomadas (no relitigar)
1. **Dos niveles espaciales bloqueados**: *País→Provincias* y *Provincia→Localidades*. Nada "entre medio".
   El nivel de agregación se **deriva** de dónde estás, no es un control primario suelto.
2. **El mapa es el control de navegación primario.** El `AggregationToggle` se degrada a override avanzado
   (o se oculta); el `JurisdictionSwitcher` deja de ser la vía principal para "bajar" a una provincia.
3. **No se toca la política de privacidad** (k-anon k=5, centroides, tope 2.000). PR-4 la hace *legible*, no la cambia.
4. **El seed pseudo-real es solo para la cohorte protagonista.** La multitud de fondo (~46k) sigue por
   bulk insert; no se reescribe por use-cases (sería inviable en tiempo). Ver PR-3.
5. **Paridad de KPIs intacta.** El Panorama lee los mismos fetchers que los dashboards; no recalcular con otra fórmula.

---

## PR-1 — Chrome operador: banner 100 vh + scrollbar del rail 🔴

Rama sugerida: `fix/op-shell-demo-banner-scrollbar`. El más chico y más visible. Cierra §5 de la crítica.

### Hallazgos / cambios

| # | Cambio | Sev | Ubicación / evidencia | Detalle |
|---|---|---|---|---|
| **V1** | El banner de demo rompe el shell de 100 vh | 🔴 | `app/admin/layout.tsx` (`return (<><DemoModeBanner …/><AppShell variant="operator" …/></>)`); `components/layout/AppShell.tsx` (`OperatorShell` → `<div className="flex h-screen overflow-hidden …">`) | El banner es hermano **arriba** de un shell `h-screen` (=100vh) → documento `> 100vh` → scroll externo + footer del rail cortado. Fix abajo. |
| **V2** | Scrollbar del rail resalta sobre el navy | 🟡 | `components/ui/dashboard/OpRailNav.tsx` (`<nav className="… overflow-y-auto …">`); `app/globals.css` (sin reglas de scrollbar — grep `scrollbar` = 0) | Estilar scrollbar fino/translúcido. Aplica también al drawer mobile (`OpMobileDrawer.tsx`, `AppShellDrawer.tsx`). |
| **V3** | Doble contenedor de scroll | 🟡 | `components/layout/AppShell.tsx` (`<main … overflow-hidden>` + inner `<div className="flex-1 overflow-auto …">`) | Tras V1, el body no debe scrollear; un solo eje de scroll (el área interna). Verificar que no queden dos scrollbars. |
| **V4** | Topbar admin `flex-nowrap` puede comprimir el omnibox | 🟢 | `app/admin/layout.tsx` (`<header … flex-nowrap …>`; `/gob` no usa nowrap) | Verificar en 1024–1280 px; permitir colapso del grupo derecho o `min-w` al omnibox. |

### Detalle técnico

**V1 — el shell debe ser la columna de 100 vh, con el banner adentro.** Dos opciones; preferir (A):

(A) Envolver en `app/admin/layout.tsx`:
```tsx
return (
  <div className="flex h-screen flex-col overflow-hidden">
    <DemoModeBanner enabled={demoMode} />
    <div className="min-h-0 flex-1">
      <AppShell variant="operator" …/>
    </div>
  </div>
);
```
y cambiar `OperatorShell` en `components/layout/AppShell.tsx` de `h-screen` a `h-full`:
```tsx
// antes: <div className="flex h-screen overflow-hidden …">
// después: <div className="flex h-full overflow-hidden …">
```
Así el `h-screen` vive una sola vez, en el wrapper que también contiene el banner.

(B) Alternativa: pasar el banner como slot al `OperatorShell` y renderizarlo **arriba del topbar, dentro**
del shell. Más invasivo en el contrato de `AppShell` — usar solo si (A) choca con otros consumidores.

> `/gob` no monta el banner, así que hoy está sano; el fix no debe romperlo. `OperatorShell` con `h-full`
> dentro de un padre que da altura (el `(gob)/layout` no envuelve, pero el shell sigue ocupando la altura
> del `<main>` del root). **Verificar** que `/gob` siga a pantalla completa tras el cambio — si `h-full`
> colapsa sin padre con altura, mantener un fallback `min-h-screen` o envolver `/gob` igual que `/admin`.

**V2 — utilidad de scrollbar temática.** Agregar a `app/globals.css` una clase reusable (no inline) que
respete los design tokens del rail:
```css
.op-scroll {
  scrollbar-width: thin;                 /* Firefox */
  scrollbar-color: rgba(255,255,255,.18) transparent;
  scrollbar-gutter: stable;              /* no salta cuando aparece/desaparece */
}
.op-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.op-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.18); border-radius: 4px;
}
.op-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.28); }
.op-scroll::-webkit-scrollbar-track { background: transparent; }
```
Aplicar `op-scroll` al `<nav>` de `OpRailNav.tsx` y a los `overflow-y-auto` de `OpMobileDrawer.tsx` y
`AppShellDrawer.tsx`. (Si `check-design-tokens.ts` / `lint:tokens` se queja de los rgba literales,
promover a tokens `--op-scroll-thumb` en el bloque `@theme` y referenciarlos.)

### Tests (V1/V2)
- DOM/unit (extender `AppShell.landing.test.tsx` o nuevo `AppShell.operator.test.tsx`): el shell operador
  **no** usa `h-screen` cuando se compone con el banner; la estructura es columna `flex` con `min-h-0 flex-1`.
- Snapshot/clase: `OpRailNav` renderiza la clase `op-scroll`.
- `pnpm verify` + `pnpm test`. Verificación manual: `NEXT_PUBLIC_DEMO_MODE=true` → `/admin` sin scroll
  externo, footer del rail visible; scrollbar del rail fino. `/gob` sigue full-height.

---

## PR-2 — Navegación del mapa: dos niveles bloqueados + autozoom 🔴

Rama sugerida: `feat/panorama-locked-drill-nav`. El PR grande. Cierra §1 y §2 de la crítica.

### Objetivo
Un solo modelo espacial manejado por el mapa: **click en provincia → autozoom + nivel localidad**;
**zoom-out → vuelve al país (nivel provincia)**. Breadcrumb como única "brújula". El `AggregationToggle`
deja de ser control primario.

### Hallazgos / cambios

| # | Cambio | Sev | Ubicación / evidencia | Detalle |
|---|---|---|---|---|
| **N1** | `initialBounds` es mount-only → elegir provincia no mueve el mapa | 🔴 | `components/panorama/SituationalMap.tsx` (`const initialBoundsRef = useRef(initialBounds)`; `map.fitBounds(bbox, { padding: 56, animate: false, maxZoom: 11 })` dentro de `map.on("load")`) | Hacer el encuadre **reactivo**: nuevo prop `focusBounds` que dispare `flyTo`/`fitBounds` cuando cambia (no solo en mount). |
| **N2** | Drill-in por click de provincia | 🔴 | `SituationalMap.tsx` (capa basemap `ar-prov-fill` sobre source `ar-provinces`, polígonos con prop `code`); `onFeatureClick` (hoy solo para puntos/celdas) | Click en polígono de provincia → resolver `code` → `fitBounds(provBbox)` + setear scope (`?province=`) + `level=locality`. |
| **N3** | Drill-out por zoom | 🔴 | `SituationalMap.tsx` (handlers `map.on(...)`; `AR_ZOOM = 3.4`) | `map.on("zoomend")`: si el zoom cae bajo un umbral (p. ej. `< 5`) y hay provincia activa → limpiar `?province=` + `level=province`. |
| **N4** | Degradar `AggregationToggle` a override avanzado | 🟡 | `components/panorama/PanoramaConsole.tsx` (`<AggregationToggle level={level} onChange={onLevelChange} …/>`); `components/panorama/AggregationToggle.tsx` | Moverlo dentro de "Capas (modo avanzado)" o esconderlo cuando el nivel está atado al scope. El nivel pasa a derivarse de `province` presente o no. |
| **N5** | Breadcrumb de scope del mapa | 🟡 | nuevo `components/panorama/PanoramaScopeTrail.tsx`; datos ya disponibles (`scopeLabel` en pages, `province`/`locality` en searchParams) | "Nacional ▸ Salta ▸ Salta Capital", cada nivel clickeable (sube de nivel). Fuente de verdad de dónde estás. |
| **N6** | Desambiguar etiquetas que chocan | 🟢 | `components/gob/JurisdictionSwitcher.tsx` (labels "Provincia"/"Localidad") vs `AggregationToggle` | En contexto Panorama, el filtro = "Ver datos de:"; el eje (si queda visible) = "Resolución del mapa". |

### Detalle técnico

**Bbox de provincia (lo necesita N1/N2).** No hay bbox en `lib/ar-provincias.ts` (`PROVINCES` solo tiene
`code`+`name`; `provinceByCode` devuelve eso). **La geometría ya está cargada**: el basemap
`/geo/ar-provinces.geojson` (`BASEMAP_URL`) se añade como source `ar-provinces`, con polígonos que tienen
prop `code`. Dos caminos:
- **Cliente (preferido):** en el click sobre `ar-prov-fill`, tomar la `feature.geometry` del polígono y
  computar su bbox con la lógica existente (`layersBbox` computa bbox de puntos; escribir un
  `polygonBbox(geometry)` análogo para Polygon/MultiPolygon). Cero round-trips.
- **Server:** reusar `jurisdictionBounds`/`computeBounds` de `lib/gov-scope.ts` (ya computan bbox por
  centroides de localidades) — sirve para gob, pero para admin/nacional el camino cliente es más simple.

**N1 — encuadre reactivo.** Reemplazar el patrón mount-only:
```tsx
// QUITAR: const initialBoundsRef = useRef(initialBounds);  // congela el valor
// El fitBounds inicial puede quedar en map.on("load") usando el primer focusBounds.
// AGREGAR un efecto que reaccione a cambios de focusBounds:
useEffect(() => {
  const map = mapRef.current;
  if (!map || !loadedRef.current || !focusBounds) return;
  map.fitBounds(focusBounds, { padding: 56, animate: true, maxZoom: 11 });
}, [focusBounds]);
```
`focusBounds` lo pasa `PanoramaConsole` desde la provincia seleccionada (`searchParams.province`) o
`undefined` para nacional. Mantener `animate: false` solo para el primer encuadre de carga; el drill
interactivo anima (`animate: true`).

**N2/N3 — coupling zoom ↔ nivel ↔ scope.** El estado fuente sigue siendo los searchParams (`province`,
`locality`). El mapa **emite intención** y `PanoramaConsole` hace `router.replace`:
- Click provincia → `onProvinceSelect(code)` → console hace `router.replace(?province=CODE)` y setea
  `level="locality"`. La page re-renderiza scoped; el `focusBounds` cambia → `flyTo` (N1).
- `zoomend` con zoom `< THRESHOLD` y `province` presente → `onZoomOutToNational()` → console limpia
  `?province=` y setea `level="province"`. El `level` se **deriva**: `province ? "locality" : "province"`.

> Mantener `level` como estado interno **derivado del scope** (no del toggle). El `AggregationToggle`
> (N4) queda como override manual avanzado; cuando el usuario está en nacional, fuerza province; en
> provincia, fuerza locality — pero el default lo da el scope. No romper el caché province/locality ya
> existente en `PanoramaConsole` (`provinceDataRef`/`dataRef`); el cambio de `level` ya dispara refetch.

**Guardas de zoom (N2).** `fitBounds(provBbox, { maxZoom: 11 })` para no sobre-acercar CABA ni dejar muy
lejos a Buenos Aires. Definir `NATIONAL_ZOOM_THRESHOLD` cerca de `AR_ZOOM` (3.4) + margen, p. ej. `5`.

### Decisiones de PR-2 (no relitigar)
- El TimeScrubber, PresetPanel y LayerPanel **no cambian** de comportamiento (controlan *qué* se muestra,
  no *dónde*). Solo se reacomoda el control de "dónde/zoom".
- No se introduce tiles externos ni se cambia el basemap; se reusa `ar-provinces.geojson`.

### Tests (PR-2)
- Unit del helper `polygonBbox(geometry)` (Polygon + MultiPolygon, antimeridiano no aplica a AR).
- Unit de la derivación de nivel: `province` presente → `"locality"`; ausente → `"province"`.
- Componente: click sobre provincia llama `onProvinceSelect(code)`; `zoomend < threshold` con provincia
  → llama `onZoomOutToNational`. (Mockear maplibre como ya se hace en los tests de panorama existentes,
  ver `components/panorama/__tests__/`.)
- `PanoramaScopeTrail`: render de niveles + cada nivel clickeable sube de scope.
- `pnpm verify` + `pnpm test`. Manual: seleccionar Salta → el mapa baja y muestra localidades; rueda
  hacia afuera → vuelve al país.

---

## PR-3 — Carga de demo pseudo-real (cohorte protagonista) 🟡→🔴

Rama sugerida: `feat/demo-seed-pseudo-real`. Cierra §4 de la crítica.

### Problema
`scripts/seed-panorama.ts` (y `seed-storylines-*`, `seed-demo*`) cargan por `db.insert` directo a
`petEvents`/`pets`/`ownerships`/`cases`/`welfareReports`/`enoProcessingQueue`/`eventNotificationOutbox`,
**salteando los use-cases** (comentario explícito ~"Running the real bite→observation use-case [bypass]";
setea `app.allow_event_mutation` para borrar eventos append-only). No es "como lo haría un usuario" → drift
con proyecciones/outbox/derivados.

### Hallazgos / cambios

| # | Cambio | Sev | Ubicación / evidencia | Detalle |
|---|---|---|---|---|
| **S1** | Replay de la cohorte protagonista por use-cases | 🔴 | `src/modules/pets/application/register-pet.ts` (`registerPet`), `src/modules/events/application/writers.ts` (`setPetLostWriter`, `createSymptomObservedWriter`, `recordDiseaseDiagnosisWriter`, …) + subcarpetas `lifecycle/medical/clinical/surveillance/identity` | Nuevo `scripts/seed-demo-spine.ts` (o extender el existente) que arme la cohorte **a través de** estos use-cases, en secuencia cronológica, respetando la máquina de estados. |
| **S2** | Dato correcto: provincia **y** localidad en cada mascota | 🔴 | `registerPet` input (jurisdicción); padrón `lib/ar-localidades.ts` | Toda mascota de la demo con `province` + `locality` resueltos del padrón. Elimina la causa "sin localidad" de §3. |
| **S3** | Bulk de fondo se mantiene, pero documentado + proyecciones | 🟡 | `scripts/seed-panorama.ts`; `pnpm rebuild:projections` (`scripts/rebuild-projections.ts`) | Dejar el bulk solo para densidad nacional, con comentario claro de que **saltea use-cases**; correr `rebuild:projections` al final para estado consistente. |
| **S4** | Derivados por cron real, no a mano | 🟡 | `scripts/close-*.ts`, `scripts/escalate-*.ts`, `scripts/materialize-slots.ts` | Para cierres/escalaciones de la cohorte protagonista, invocar los crons reales en vez de insertar el estado final. |
| **S5** | `demo-verify` reconcilia totales | 🟡 | `scripts/demo-verify.ts` (`pnpm demo:verify`) | Aserciones: (a) por provincia, `total = Σ localidades visibles + suprimidas(k<5) + sin-localidad`; (b) KPIs del Panorama coinciden con los dashboards para el mismo scope/period. |

### Secuencia "como un usuario" (orden de carga)
```
1. orgs / jurisdicciones      (refugios, clínicas, autoridades)
2. usuarios                   (owner/vet/govt)
3. registerPet                (con provincia + localidad)   ← use-case
4. eventos de vida en orden   (vacunación→visita→peso→mordedura→síntoma→…) ← writers/use-cases
5. crons reales               (close-*, escalate-*, materialize-slots)
6. rebuild:projections        (estado de lectura consistente)
7. demo:verify                (reconciliación + paridad KPI)
```

### Decisiones de PR-3 (no relitigar)
- Solo la **cohorte protagonista** (storylines + un slice representativo) va por use-cases. El bulk de ~46k
  sigue por `db.insert` (performance). No reescribir `seed-perf.ts`.
- Mantener el **determinismo** existente (PRNG de semilla fija, ancla `2026-06-20`, tag `PANO-`,
  guard local-only, idempotencia). El cambio es el *camino* de carga, no su ingeniería.
- No cambiar el contrato append-only en producción; el override `app.allow_event_mutation` queda
  **solo** en el path de bulk/cleanup del seed, nunca en el path de use-cases.

### Tests (PR-3)
- `__tests__/seed-demo-scenario.test.ts` ya existe — extender/espejar para el nuevo spine: tras correr el
  seed por use-cases, las proyecciones (pet status, libreta) reflejan la secuencia esperada.
- Test de `demo-verify`: con un dataset chico, la reconciliación cierra y la paridad KPI pasa.
- `pnpm verify` + `pnpm test`.

---

## PR-4 — Reconciliación provincia↔localidad legible 🟡

Rama sugerida: `feat/panorama-province-locality-reconcile`. Cierra §3 de la crítica.

### Hallazgos / cambios

| # | Cambio | Sev | Ubicación / evidencia | Detalle |
|---|---|---|---|---|
| **R1** | Exponer "sin localidad" en el envelope | 🟡 | `src/modules/panorama/application/get-layer-features.ts` (envelope `{ truncated, suppressedCount, level }`) | Agregar `unassignedCount` (registros con provincia pero sin localidad) al envelope de las capas choropleth/aggregated en nivel localidad. |
| **R2** | Línea de reconciliación en vista localidad | 🟡 | `components/panorama/LayerPanel.tsx` (ya muestra `count`, `suppressedCount`, badge "suprimido") y/o `components/panorama/SituationalMap.tsx` (overlay de leyenda) | Mostrar `Total provincia = visibles + N suprimidas (k<5) + M sin localidad`, que cierre a ojo. |
| **R3** | Nota de privacidad en la coropleta | 🟢 | `SituationalMap.tsx` (overlay de leyendas, `provinceLegends`) | "X localidades ocultas por privacidad (k<5)" usando `suppressedCount` ya disponible. |

### Detalle técnico
- `get-layer-features.ts` ya retorna `suppressedCount`; agregar `unassignedCount` con un `count(*)` de
  registros del scope que tienen provincia pero `locality IS NULL`. Threadearlo por
  `ApiResponse` (`app/api/panorama/[layer]/route.ts`) → `LayerPanelState` → UI.
- Tras PR-3, `unassignedCount` debería tender a 0 para la demo; igual mantener el cálculo para datos reales.

### Tests (PR-4)
- Unit/integración de `get-layer-features`: el envelope incluye `unassignedCount` y reconcilia
  (`provinciaTotal === visibles + suppressed + unassigned`).
- Componente: la línea de reconciliación se renderiza en nivel localidad y refleja los tres números.
- `pnpm verify` + `pnpm test`.

---

## Resumen de severidad por PR
- **PR-1** 🔴 V1, 🟡 V2/V3, 🟢 V4 — quick-win, mergear primero.
- **PR-2** 🔴 N1/N2/N3, 🟡 N4/N5, 🟢 N6 — el grande; el de mayor impacto percibido.
- **PR-3** 🔴 S1/S2, 🟡 S3/S4/S5 — consistencia de datos.
- **PR-4** 🟡 R1/R2, 🟢 R3 — legibilidad; se beneficia de PR-3.

*Autor: Claude. Generado 2026-06-23 desde la crítica `docs/panorama-design-critique-2026-06-23.m