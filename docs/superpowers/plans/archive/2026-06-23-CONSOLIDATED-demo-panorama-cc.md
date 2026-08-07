> **▶ ARCHIVADO 2026-08-04** — triage de planes: el trabajo que describe está shippeado (verificado contra el árbol). Se conserva por su método y su evidencia; como plan de trabajo, está cerrado.

# Plan CONSOLIDADO — Demo-readiness + Panorama + fixes de cámara (orquestador CC)

> **Para Claude Code — single source of truth del orden.** Consolida **todo lo pendiente** después del cierre del
> [`2026-06-22-MASTER-PLAN-cc.md`](../2026-06-22-MASTER-PLAN-cc.md) (que dejó AC/PERF/L/J/K/DEMO/AUTHZ mergeados y
> `demo:verify` verde). La revisión en vivo posterior abrió **3 handoffs** + **3 fixes de cámara** (de la
> revisión Cowork 2026-06-23, ver [`docs/demo/design-critique-recorrido-ejecutivo-2026-06-23.md`](../../demo/design-critique-recorrido-ejecutivo-2026-06-23.md)
> y [`docs/demo/handoff-demo-blockers-cc.md`](../../demo/handoff-demo-blockers-cc.md)). Este doc **ordena y dedup**; el
> detalle file-level vive en los planes linkeados — abrir cada uno antes de ejecutar su ola.
>
> **Misión:** dejar el recorrido ejecutivo (`/admin` + salto a `/gob`) **grabable de punta a punta, terminado y con
> datos válidos** — sin Forecast en blanco, sin métricas en 0% universal, sin mapa negro en la primera pintura.
>
> Convenciones heredadas: SDD test-first · es-AR UI / inglés código · tokens `ln-op-*` · docs en el mismo PR ·
> `pnpm verify` + `pnpm test` verdes por PR · local-only (guards de seed) · sin `Co-Authored-By`.

---

## Estado de ejecución (CC · 2026-06-23) — rama `fix/demo-panorama-consolidated`

> Consolida #730 (EXEC) + #731 (NAV) por ancestría (sale de `review/all-session-prs`, hace ff-merge de #731) y
> agrega lo nuevo encima. **Camino crítico para filmar (Olas 0+1) COMPLETO + gate verde.**

| # | Tarea | Estado |
|---|-------|--------|
| 1 | EXEC-WP1 perf < 3 s (índice `ownerships(pet_id)`) | ✅ hecho (#730) |
| 2 | EXEC-WP0 `lib/demo-mode.ts` + census `Date` | ✅ hecho (#730) |
| 3 | EXEC-WP2 `Date` crudo → ISO + guard | ✅ hecho (#730) |
| 4 | **CAM-B1 Forecast en blanco** | ✅ hecho (este branch) |
| 5 | **CAM-B2 seed Microchip/Antirrábica (no 0% universal)** | ✅ hecho (este branch) |
| 6 | EXEC-WP5 alerta "38·70" + sin doble disclosure | ✅ hecho (#730) |
| 7 | **PAN-PR-1 chrome operador (banner 100vh + scrollbar)** | ✅ hecho (este branch) |
| 8 | EXEC-WP3 topbar 1 línea + chip scope | ✅ hecho (#730) |
| 9 | PAN-PR-2 + CAM-B3 nav del mapa drill + autozoom | ⬜ **diferido** (browser-heavy, no bloquea filmar; ver nota) |
| 10 | PAN-PR-4 reconciliación prov↔loc | ⬜ diferido |
| 11 | NAV D1–D7 nav diferida | ✅ hecho (#731) |
| 12 | EXEC-WP4 timeout analítica | ✅ hecho (#730) |
| 13 | EXEC-WP6 gate global | ✅ `verify` + `demo:verify` + `pnpm test` verdes |

> **PR-3 completo (S1–S5, replay por use-cases)** y **PAN-PR-2/B3 (drill del mapa)** + **PAN-PR-4** quedan
> diferidos: son mejoras de calidad/UX, no bloqueantes de filmación (el orquestador mismo los ubica tras el
> camino crítico, y el gate dice que se puede filmar evitando el coroplético). B2 cubre la parte de PR-3 que la
> cámara necesita (datos válidos, sin 0% universal). El mapa **ya pinta datos** (capas de cumplimiento devuelven
> celdas — verificado); B3 pule la primera pintura/atenuación temporal y va con PR-2.

---

## Planes que orquesta (detalle file-level en cada uno)

| Ref | Plan detallado | Qué cubre | Estado |
|-----|----------------|-----------|--------|
| **EXEC** | [`2026-06-23-admin-demo-readiness-EXECUTION-cc.md`](./2026-06-23-admin-demo-readiness-EXECUTION-cc.md) (WP0–WP6) | perf analítica, `Date` crudo, topbar, timeout, pulido de cámara | ⬜ pendiente |
| **PAN** | [`2026-06-23-panorama-ui-overhaul-cc-handoff.md`](./2026-06-23-panorama-ui-overhaul-cc-handoff.md) (PR-1→PR-4) | chrome operador, nav del mapa drill, seed pseudo-real, reconciliación prov↔loc | ⬜ pendiente |
| **NAV** | [`2026-06-23-population-cycle-deferred-nav-handoff.md`](./2026-06-23-population-cycle-deferred-nav-handoff.md) (D1–D7) | affordance de nav *deferred* (ciclo de población) | ⬜ pendiente |
| **CAM** | *este doc* — B1/B2/B3 de la revisión Cowork | Forecast en blanco · métricas 0% · mapa negro | ⬜ nuevo |

> Los dos handoffs de demo más viejos (`2026-06-23-demo-readiness-fixes-cc-handoff.md` y
> `2026-06-23-admin-demo-readiness-handoff-cc.md`) ya están **subsumidos por EXEC** (lo dice su header). No ejecutarlos
> aparte.

---

## Fixes de cámara nuevos (B1/B2/B3) y cómo se integran

| ID | Hallazgo (Cowork 2026-06-23) | Dedup / dónde vive | Acción |
|----|------------------------------|--------------------|--------|
| **B1** | **Forecast en blanco.** `/admin/programa` "Proyección de vacunación antirrábica" dibuja un SVG vacío pese a haber datos (header "3 períodos ocultos"). | **Nuevo.** Adyacente a EXEC-WP2 (`Date` crudo en `lib/metrics/population.ts` alimenta el forecast) pero el SVG vacío es un bug de render distinto. | Ver **Ola 0 · paso 4**. Fix de contenedor + guard `insufficient`. |
| **B2** | **Microchip y Antirrábica en 0%** en TODAS las provincias (outliers `/admin/programa` y KPIs `/gob`). Solo Esterilización tiene datos reales. | Solapa **PAN-PR-3** (seed pseudo-real) + **EXEC-WP5** (capa "% cumplimiento"). | Plegado en **Ola 1 · seed** (extiende PAN-PR-3). |
| **B3** | **Mapa de Panorama negro** en la primera pintura; la reproducción temporal atenúa todo. | Solapa **PAN-PR-1/PR-2** (N1 `initialBounds` mount-only) + datos de capa. | Plegado en **Ola 2 · PAN-PR-2** + seed de Ola 1. |

---

## Olas de ejecución (orden recomendado)

> Razón del orden: primero lo que **bloquea filmar** (perf + render roto), luego **integridad de datos** (lo que se ve
> en cámara), después **chrome/UI del Panorama**, y al final **pulido de nav** y verificación. Archivos compartidos
> calientes: `app/admin/layout.tsx` (EXEC-WP0 ↔ PAN-PR-1), `OpRailNav.tsx`/`nav-presets.ts` (PAN ↔ NAV), scripts de
> seed (PAN-PR-3 ↔ B2 ↔ EXEC-WP5). Por eso esos pares van juntos/seguidos.

### Ola 0 — Correctitud y blockers de filmación
1. **EXEC-WP1 · Perf** Programa/Censo/Población/Informe **< 3 s** (EXPLAIN ANALYZE → índice/migración → reescribir `EXISTS` correlacionados). *Blocker.*
2. **EXEC-WP0 · A1/A2** módulo server-safe `lib/demo-mode.ts` + fix `Date` en `lib/metrics/census.ts` (+tests).
3. **EXEC-WP2 · `Date` crudo** → `.toISOString()` en los 6 sitios + **test-guard de repo** (falla si hay `Date` interpolado en `sql\`\``).
4. **B1 · Forecast en blanco** — en `components/charts/ForecastChart.tsx`: dar alto mínimo al contenedor (evitar `ResponsiveContainer` con alto 0) y guard: `< 2` actuals → estado `insufficient` (ya existe) en vez de SVG vacío. Test: con seed, el `<figure data-forecast-*>` contiene `<svg>` no vacío. *(Confirmar antes si WP2 ya lo resolvió aguas arriba.)*

### Ola 1 — Integridad de datos de la demo (lo que se ve en cámara)
5. **PAN-PR-3 + B2 · Seed pseudo-real** — cohorte protagonista + **poblar Microchip y Antirrábica** (eventos `microchip_implanted` y `vaccination_administered` antirrábica) en ≥2–3 jurisdicciones con cobertura variada (alguna sobre/bajo meta) → ninguna métrica en 0% universal. Incluye poblar la capa **"% de cumplimiento"** del Panorama (cierra EXEC-WP5·capa). Additive, idempotente, prefijo `DEMO-`, guard local-only.
6. **EXEC-WP5 (resto) · Pulido de cámara** — `/admin/alertas` formato **"observado 38 · meta 70"** (umbral 70 en `seed-demo-scenario.ts`); suprimir el disclosure propio de `PanoramaShell` cuando el banner global está on.

### Ola 2 — Chrome operador + UI de Panorama
7. **PAN-PR-1 · Chrome operador** — banner de demo dentro del shell de 100 vh (V1), scrollbar fino del rail (V2), un solo eje de scroll (V3), topbar sin comprimir omnibox (V4). *Coordinar con EXEC-WP0-A1 en `app/admin/layout.tsx`.*
8. **EXEC-WP3 · D1 topbar** — topbar en una sola línea a ≥1280px (breadcrumb truncado) + `OpScopeChip` neutral/outline (no domina el H1).
9. **PAN-PR-2 + B3 · Nav del mapa** *(el PR grande)* — drill de dos niveles bloqueado + autozoom; **N1 `initialBounds` reactivo** (`focusBounds` con `flyTo/fitBounds`) para que el mapa pinte en el primer render; capa por defecto con datos; la reproducción temporal no arranca atenuando. Cierra B3.
10. **PAN-PR-4 · Reconciliación** provincia↔localidad legible (privacidad k-anon *legible*, no se cambia).

### Ola 3 — Pulido de navegación y resiliencia
11. **NAV · Nav diferida** (D1–D7) — `NavItem.deferred` → render no-interactivo en `OpRailNav`/drawer, pill "Próximamente", fuera del tab order, con tests.
12. **EXEC-WP4 · D2 timeout** — cargas de analítica con timeout 10 s → "tardando… reintentar" + estado vacío honesto (sin skeleton infinito).

### Ola 4 — Verificación final (gate)
13. **EXEC-WP6 + gate global** — `pnpm verify` verde · vitest de los WP · e2e relevantes · `pnpm demo:verify` verde · recorrido manual de los 7 beats con `NEXT_PUBLIC_DEMO_MODE=true` sin error y dentro de presupuesto · `pnpm seed:demo:scenario` para resetear el estado de la alerta · abrir PR(s).

---

## Lista de tareas · orden · estimación

> Estimación en sesiones CC (1 sesión ≈ ½ día). Son aproximadas; el camino crítico a filmar es **Ola 0 + Ola 1**.

| # | Ola | Tarea | Plan | Sev | Estimación |
|---|-----|-------|------|-----|-----------|
| 1 | 0 | Perf analítica < 3 s | EXEC-WP1 | 🔴 blocker | 0.5–1 día |
| 2 | 0 | `lib/demo-mode.ts` + fix census `Date` (+tests) | EXEC-WP0 | 🔴 | 1–2 h |
| 3 | 0 | `Date` crudo → ISO + guard de repo | EXEC-WP2 | 🟧 | 2–4 h |
| 4 | 0 | **Forecast en blanco** | CAM-B1 | 🔴 | 1–3 h |
| 5 | 1 | Seed pseudo-real **+ Microchip/Antirrábica + capa % cumpl.** | PAN-PR-3 + CAM-B2 | 🔴 | 0.5–1 día |
| 6 | 1 | Pulido cámara (alerta "38·70", doble disclosure) | EXEC-WP5 | 🟨 | 1–2 h |
| 7 | 2 | Chrome operador (banner 100vh, scrollbar) | PAN-PR-1 | 🔴 | 2–4 h |
| 8 | 2 | Topbar 1 línea + chip de scope | EXEC-WP3 | 🟧 | 2–4 h |
| 9 | 2 | **Nav del mapa drill + autozoom (mapa pinta 1er render)** | PAN-PR-2 + CAM-B3 | 🔴 | 1–1.5 días |
| 10 | 2 | Reconciliación provincia↔localidad | PAN-PR-4 | 🟡 | 0.5 día |
| 11 | 3 | Nav diferida (ciclo de población) | NAV | 🟡 | 0.5 día |
| 12 | 3 | Timeout/estado vacío en analítica | EXEC-WP4 | 🟨 | 2–3 h |
| 13 | 4 | Verificación final + PRs | EXEC-WP6 | 🟦 | 1–2 h |

**Total aproximado: ~5–7 días CC.** Mínimo para **filmar el corte completo terminado**: tareas **1–6** (Olas 0+1, ~2–3 días) — eso ya destraba Forecast, datos válidos y pulido de cámara. Lo demás (Panorama UI, nav diferida) sube la calidad pero no bloquea la grabación si se filma evitando el mapa coroplético.

---

## Gate de "listo para filmar el corte completo"
Con `NEXT_PUBLIC_DEMO_MODE=true` + `seed:panorama` + `seed:demo:scenario`:
1. Los 7 beats renderizan sin error boundary y **< 3 s** las páginas de analítica.
2. **Forecast dibuja** línea sólida + proyección punteada (no SVG vacío).
3. **Ninguna métrica en 0% universal** (Microchip/Antirrábica pobladas) ni capa de mapa vacía en la primera pintura.
4. Alerta muestra "observado 38 · meta 70"; sin doble disclosure de demo.
5. `pnpm verify` y `pnpm demo:verify` verdes.
