# Wave 4 — Govt actionability + interactive dashboards — technical dev handoff (Items 20–23)

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-18 · **Wave 4 del paquete metrics-IA**
> · Umbrella: `2026-06-18-metrics-ia-handoff-design.md` · De la review Govt/Admin + la crítica de viz 2026-06-18.
>
> **SECUENCIA:** corre **al FINAL del bloque autónomo, después de Wave 3.** CC ejecuta: **NO reordenar ni interrumpir lo en curso.**
> Orden interno: **23 (primitivas, foundational) → 20 → 21 → 22.** Items 2–4 (dashboards) y 20–22 consumen las primitivas de Item 23.
>
> ⚠️ **Coordinación con CC en vivo:** CC está agregando los GeoJSON multinivel (`ar-departments.geojson`, `caba-barrios.geojson` — modificados hoy). **Item 23 NO redefine esos datos**; pone la *interactividad* detrás del mismo `MapChoropleth`. La granularidad geográfica es de CC; el comportamiento del componente es de este item.

**Contexto.** La capa de viz es moderna y bien elegida (MapLibre GL, recharts, imports dinámicos, fallback `<details>` accesible, `prefers-reduced-motion`). Govt mide bien el "qué" (Items 2–4: vigilancia/disposición/compliance) pero faltan: performance de campañas (pedido en `AGENTS.md → Dashboards › Sanitary authority`), los pipelines accionables de outreach (los "cross-cutting projection examples" de AGENTS), y la interactividad/descriptividad de los componentes. **Todo proyección/UI sobre datos existentes — sin schema.**

Tokens/comp reales: `Op*`, `MapChoropleth` (MapLibre; props `geojsonUrl`, `data: {code,value,label}`, `colorScale`), `TimeSeriesChart` (recharts), `MapChoroplethDynamic`/`TimeSeriesChartDynamic` (code-split), PeriodPicker, JurisdictionSwitcher, el patrón de PII-query logging (ya usado en `/gob/usuarios`).

---

## Item 23 — Interactive dashboard primitives 🟡 (foundational — hacer primero en la Wave)

### Overview
Hoy los gráficos *muestran* pero no *dejan operar ni explican*: tooltips pelados, KPIs como número suelto, sin drill-down, sin cross-filter, sin "as of", color hardcodeado. Este item crea las **primitivas compartidas** que Items 2–4 y 20–22 consumen, para no parchear cada pantalla.

### 23.1 `MapChoropleth` v2 (sobre el MapLibre existente)
| Capacidad | Spec |
|---|---|
| **Drill jerárquico** | clic en una región baja de nivel: provincia → departamento → barrio (usa los 3 GeoJSON que CC ya provee). Mantener breadcrumb de nivel + "volver". |
| **Cross-filter** | la selección se refleja en `searchParams` (mismo patrón que PeriodPicker/JurisdictionSwitcher) → filtra KPIs + charts de la página. |
| **Escala tokenizada** | `colorScale` deja de ser hex literal; viene de `lib/viz-scales.ts` (secuencial para choropleth), **colorblind-safe** (liga Item 11). |
| **Join robusto (el bug de "ayer")** | normalizador `code` ↔ `feature.properties.code` por nivel (ISO provincia / INDEC depto / id barrio CABA). Manejo explícito de "feature sin dato" (gris tenue) y "dato sin feature" (lista aparte, no se pierde). **Test del join por nivel.** |
| **A11y (conservar)** | `<details>` con tabla de datos bajo el mapa; `aria-label` descriptivo; teclado para seleccionar región. |

### 23.2 `OpKpi` v2 (backward-compatible, props nuevas opcionales)
| Prop nueva | Tipo | Efecto |
|---|---|---|
| `info` | `{ definition, formula?, caveat? }` | tooltip "ⓘ": qué mide / cómo se calcula / nota k-anon |
| `delta` | `{ value, period }` | variación vs período previo (↑/↓ con tono) |
| `sparkline` | `number[]` | mini-serie inline (recharts, sin ejes) |
| `drillHref` | `string` | KPI clickeable → lista de registros que lo componen |

### 23.3 `DashboardChart` + `DashboardTooltip`
- Wrapper sobre recharts con **tooltip descriptivo**: unidad + valor absoluto + % + nota metodológica (ventana, k-anon). Reemplaza el `<Tooltip/>` pelado.
- **Freshness** compartido: "Datos al {hora}" (force-dynamic = por request) + botón refrescar por vista.
- **Export** consistente: CSV/anonimizado por vista (reusa el patrón de `gob/analytics/export`).

### States / edge / a11y
| Caso | Comportamiento |
|---|---|
| sin datos | empty state (no chart vacío); el mapa muestra todo gris + nota |
| celda < k | suprimida (Item 0 `suppressSmallCells`); el tooltip lo explica |
| reduced-motion | sin animación (ya soportado en TimeSeriesChart) |
| carga | skeleton (liga Item 8); el shell no se bloquea |
| keyboard | drill y selección operables sin mouse |

### Por qué foundational
Items 2–4 ya existirán cuando llegue la Wave 4 → **refactor opcional** para que adopten `OpKpi v2`/`MapChoropleth v2` (no obligatorio retroactivo, pero recomendado en el mismo PR donde se tocan). Items 20–22 los consumen nativos.

---

## Item 20 — Performance de campañas (govt) 🟡

### Overview
`AGENTS.md → Dashboards › Sanitary authority` pide *"Active campaign performance — enrollments, completions, no-shows, geographic reach"*. El spec de health-campaigns construyó el lado **proveedor** (offerings + booking + asistencia attended/no-show en `agenda`); falta la vista **autoridad**.

### Spec
- Superficie: `/gob/campañas` (o tab en `/gob/analytics`). Scope-aware (jurisdicción) + período.
- Por offering sanitario relevante de la jurisdicción: **enrollment** (bookings), **completion** (attended), **no-show**, **alcance geográfico** (choropleth via Item 23 — barrios alcanzados).
- Proyección sobre bookings + asistencia (datos ya existentes). Sin schema.
- KPIs con `OpKpi v2` (delta vs campaña previa, drill a la lista de turnos).

### Edge / a11y
- Jurisdicción sin campañas activas → empty state con qué es una campaña. Reusa a11y de Item 11.

---

## Item 21 — Pipelines accionables de outreach 🟡

### Overview
Los "cross-cutting projection examples" de AGENTS son **acciones**, no solo métricas: *"pets con antirrábica vencida → contact pipeline"*, *"barrios con densidad de stray-scan en alza → pre-posicionar recursos"*, *"vets con mayor throughput de esterilización → reconocimiento"*. Items 2–4 dan el número; falta convertirlo en **lista objetivo exportable**.

### Spec
- Patrón "del dato a la acción": desde un KPI (Item 23 `drillHref`) → **lista de registros objetivo** PII-scoped (jurisdicción del operador) → **export** para campaña de contacto.
- **PII-scope + log obligatorio:** reusa el patrón de PII-query logging de `/gob/usuarios` (cada vista de la lista deja audit). Las listas son **operativas y scoped**, no agregados públicos — distintas de los KPIs k-anonimizados.
- 3 pipelines v1: (a) antirrábica vencida por jurisdicción; (b) densidad de stray-scan en alza por barrio; (c) ranking de throughput de esterilización por vet (reconocimiento).

### States / edge / a11y
| Caso | Comportamiento |
|---|---|
| lista vacía | "Sin pets que cumplan el criterio en tu jurisdicción" |
| export | anonimizable según destino; el PII-export queda en audit |
| sin capability | la acción no se muestra |

---

## Item 22 — Analytics enhancements 🟢

### Overview
Tres mejoras baratas sobre lo ya construido.

| Mejora | Spec |
|---|---|
| **Ranking cross-region** | tabla rankeada (top/bottom barrios o provincias por cobertura/mortalidad) junto al choropleth en `/gob/analytics`. Sobre los fetchers existentes. |
| **Atajo "Analítica nacional" en admin** | desde `admin/page.tsx`, entrada a `/gob/analytics` en modo todas-las-provincias (el view analista-nacional ya existe ahí; solo señalizarlo, no duplicar). |
| **Preview de impacto de reglas** | en el form de regla de negocio (PPP peso/lista): "esta regla afecta a ~N pets" **antes** de confirmar (el spec de govt-business-rules ya re-evalúa; falta el preview). |

### A11y
- Tabla de ranking con `<th scope>` + caption; el atajo admin con label claro.

---

## Cierre por item (todos)
SDD test-first, Biome/typecheck verdes, docs en el mismo PR, flippear fila en `docs/superpowers/README.md`. **Sin schema en toda la Wave 4** (proyección/UI). Item 23 primero; 20–22 lo consumen. Coordinar Item 23 con la rama de geojson de CC (datos de CC, comportamiento de este item).

## Lo que NO está en Wave 4
- Datos GeoJSON multinivel (los provee CC — no redefinir).
- Proveedor de tiles real (ARSAT / OF-1 — decisión de ops del dueño, no de este item).
- Reporte oficial externo ENO/SISA/SENASA (follow-up diferido; Item 3 solo mide el SLA del outbox).
- Cambios de schema (no hay).

---

## Próximo paso (pendiente de wiring)
Este spec está **standalone a propósito** — todavía NO está cableado en umbrella/README/kickoff porque CC está ejecutando y esos índices se estaban pisando. **Cuando CC pare**, reconciliar en una pasada: agregar Wave 4 (Items 20–23) al umbrella §4, al índice del README y al kickoff (al final del bloque autónomo, después de Wave 3).
