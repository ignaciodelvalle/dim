# UX Gate Mobile — Cursor (OPERADOR)

**Agente:** Cursor (OPERADOR)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Viewport:** 390×844 (iPhone-ish, `Emulation.setDeviceMetricsOverride`)  
**Cuentas:** `govt@dim.test`, `orgadmin@dim.test` (Refugio Test · `DIM-HSPR-M285`), `admin@dim.test` — contraseña `Test1234!`  
**Alcance:** Panel gob, Panorama (mapa/capas/leyenda), tablas densas gob (casos/cola), `/org/…/mascotas`, dashboard admin.

Screenshots: `docs/reviews/results/uxgate-mobile-cursor-screenshots/` (`m01`–`m08`; ver nota m06 abajo).

**Side-effects:** ninguno irreversible. Solo navegación, filtros, presets Panorama (URL mutada), login/logout entre cuentas. Sin submits en colas, casos, adopciones, reglas ni acciones org.

---

## Matriz pantalla × rúbrica

Leyenda: ✅ suficiente · ⚠️ con reservas · ❌ insuficiente / roto  
**Nota mobile:** overflow horizontal · tap targets ≥44px · drawer · scroll interno · mapa usable.

| Pantalla | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Nota mobile |
|----------|------------|---------|---------|-----------------|-----------------|-------------|
| **/gob Panel** | `m01-gob-panel-drawer.png` | CTAs Habilitación/Acta ocupan fila extra | — | ✅ | ✅ KPIs 2×2 legibles | Sin overflow (`scrollWidth=390`). Drawer funciona; 20+ ítems requieren scroll largo. Omnibox trunca placeholder. Hamburger/logout ~24–28px ancho. |
| **/gob/panorama** (presets + mapa) | `m02`–`m04`, `m03` | Footer metodológico muy largo en scroll | Modo “mapa primero” en móvil | ⚠️ | ⚠️ | Presets Vista (342×49px) OK. Mapa ~25% viewport inicial; scroll interno (`overflow-auto`, 2365px). Play ▶ interceptado por canvas MapLibre al tocar. Zoom ±29px. Leyenda flotante legible pero tapa mapa. Capas Personalizar accesibles tras scroll. |
| **/gob/casos** | `m05-gob-casos-table.png` | — | Vista card/móvil o columnas colapsables | ⚠️ | ❌ | Tabla desktop en 390px: código PANO-CASE-* se parte en 5–6 líneas (~58×16px links). Filtros Todos/Abiertos/Cerrados 27px alto. Sin overflow horizontal. |
| **/gob/cola** | *(snapshot; captura m06 corrupta)* | — | Alinear con widget panel | ⚠️ | ✅ empty state claro | Empty state honesto (“No hay solicitudes pendientes en tu scope”). Tabs tipo (Matrículas/Orgs/RUPGA) legibles. **Inconsistente** con panel “Ver todos (20)”. |
| **/org/…/mascotas** | `m07-org-mascotas.png` | — | Menú acciones por card (⋯) | ⚠️ | ✅ cards escaneables | Sin overflow. 5 CTAs/card a 27px alto (102×27 … 111×27). Lista/Tablero toggle OK. Bulk-select visible. Omnibox truncada. |
| **/admin** dashboard | `m08-admin-dashboard.png` | Banner demo (necesario) | — | ✅ | ✅ | KPIs apilados claros. Drawer admin con badges (Alertas 1, Outbox 12). Portales combobox accesible. Párrafo scope universal denso pero legible. |

---

## Hallazgos (severidad)

### Blocker

*(ninguno)*

### Mayor

| ID | Pantalla | Hallazgo | Evidencia |
|----|----------|----------|-----------|
| **M1** | /gob Panel → /gob/cola | **[POCO INTUITIVO]** Widget “Cola de aprobaciones” dice vacío pero enlace **“Ver todos (20) →”** contradice `/gob/cola` (“No hay solicitudes pendientes en tu scope”). Operador móvil no sabe si hay 20 fuera de scope o el contador miente. | Panel snapshot `e37`/`e63` vs `/gob/cola` snapshot `e14`. |
| **M2** | /gob/panorama | **Mapa secundario en móvil:** stack Vista (5 presets) + reproducción temporal empuja el mapa bajo el fold; área visible inicial ~150px. Controles temporales compiten con canvas fijo — click en **“Reproducir la formación de la situación”** interceptado por `<canvas.maplibregl-canvas>` (error MCP). [POCO INTUITIVO] | `m02`, `m04`; CDP click fail top=642 canvas 340×558. |
| **M3** | /gob/casos | **Tabla densa no adaptada:** layout tabular de 4 columnas en 390px vuelve ilegible el identificador CAS-; links 58×16px; filtros estado 27px. Operador puede entrar al caso pero no escanea la cola “de un vistazo”. [POCO INTUITIVO] | `m05`; CDP `rows=34`, filter pills h=27. |
| **M4** | /org/…/mascotas | **Tap targets insuficientes en acciones por animal:** Asignar tránsito / Elegibilidad / Publicar / Finalizar adopción / Transferir miden **27px** de alto — bajo umbral 44px del runbook. Riesgo de toque erróneo (acción irreversible cerca de otras). [POCO INTUITIVO] | `m07`; CDP heights 27px en 5 CTAs × 3 cards. |
| **M5** | Cross-cutting OpShell | **Topbar operador apretada en 390px:** placeholder omnibox truncado (“Buscar persona o casc…”), hamburger 24×40, logout 28×40, zoom Panorama 29×29, play 28×28. Patrón repetido gob/org/admin. [POCO INTUITIVO] | Mediciones CDP en /gob, /gob/panorama, /org/mascotas. |

### Menor

| ID | Hallazgo |
|----|----------|
| m1 | Drawer gob/admin: 20+ enlaces sin búsqueda — scroll largo en una mano. |
| m2 | Panorama: leyenda “Peores 10 jurisdicciones” con copy “Sin jurisdicciones bajo meta” mientras preset muestra 1 fila (CABA) — confusión leve demo. |
| m3 | Org panel Refugio Test: bloque “Tus permisos” (13 filas) empuja acciones útiles en scroll previo a mascotas. |
| m4 | Admin: banner demo amarillo + párrafo scope consumen ~30% del primer viewport antes de KPIs. |
| m5 | /gob/casos: badge días (16D, 92D) útil pero columna Apertura apretada junto a ESTADO. |
| m6 | Panorama: checkboxes capa marcados `readonly` en árbol a11y — capas cambian vía presets Vista, no toggles manuales (curva de aprendizaje). |
| m7 | Captura `m06-gob-cola-empty.png` corrupta (frame org “Sin organizaciones”); cola documentada por snapshot textual. |

---

## Interacciones Panorama (profundidad solicitada)

| Control | Resultado móvil |
|---------|-----------------|
| Presets Vista (Brotes, Cumplimiento, …) | ✅ Cambian URL (`preset=`, `layers=`), mapa y KPIs recalculan. Botones 342×49px. |
| Mapa pan/zoom | ⚠️ Zoom ± accesible (29px). Área táctil mapa pequeña hasta scroll. |
| Leyenda flotante | ✅ Gradiente cobertura antirrábica + meta 80% + Copiar/Exportar legibles (`m03`). |
| Reproducir en el tiempo | ❌ Botón play no recibe tap (canvas intercept). Slider presente pero `readonly` en a11y. |
| Personalizar capas | ⚠️ Requiere scroll ~900px en contenedor interno; opacidad slider legible una vez visible. |
| Alcance y período | ✅ Chips 7d/30d/90d… altura 44px en fila scroll horizontal implícita. |

---

## Log de side-effects

| Acción | Efecto persistente |
|--------|-------------------|
| Login/logout govt → orgadmin → admin | Sesiones cookie — revertido con logout final |
| Panorama preset Brotes activos | URL `?layers=zoonosis,cobertura&period=90d&preset=brotes-activos` (solo UI) |
| Panorama scroll preset cumplimiento | URL previa `?layers=cobertura&period=90d&preset=cumplimiento` |
| /gob/casos filtros | Solo navegación (Todos activo) |
| Org mascotas | Solo lectura listado |

**No ejecutado (irreversible):** aprobar/rechazar cola, finalizar adopción, transferir custodia, acta infracción, cambios reglas, moderación, asignar tránsito.

---

## Veredicto

| Criterio runbook | Resultado |
|------------------|-----------|
| Blockers = 0 | ✅ **0** |
| Mayores ≤ 5 | ✅ **5** (M1–M5, en el límite) |
| **PASS UX Gate Mobile — OPERADOR** | **PASS** |

### Síntesis

- **Funciona en el teléfono** para tareas frecuentes: drawer nav, KPIs panel gob/admin, cards org mascotas, empty states.
- **Debilidad estructural:** superficies “desktop-first” (tabla casos, stack Panorama) y tap targets sub-44px en acciones operativas densas.
- **Prioridad remediación móvil:** (1) card layout o columnas colapsables en `/gob/casos`; (2) Panorama mobile layout — mapa sticky o bottom sheet para capas, z-index play > canvas; (3) menú ⋯ por card en org mascotas; (4) alinear contador cola panel vs `/gob/cola`; (5) topbar responsive (omnibox icono + drawer search).

### Re-run checklist

1. Corregir M1 contador cola.  
2. Panorama: verificar tap play + ≥44px en controles mapa.  
3. Casos: breakpoint card view ≤480px.  
4. Org mascotas: CTA height ≥44px o overflow menu.  
5. Re-capturar `/gob/cola` (`m06`).
