# Panorama IA v2 — design spec (IA reframe + cartografía)

**Estado:** propuesta de diseño para validación del PO. NO es implementación.
**Alimenta:** un SDD posterior. **Rama base:** `integration/all-20260703`.
**Ruta:** `/gob/panorama` (Centro de Situación Nacional) — el selling point de gobierno.

Fuentes que este spec integra:
- Framework declarativo — `src/modules/panorama/domain/{types,layers,presets,compatibility,geojson,reading}.ts` + `components/panorama/*`.
- Benchmark cartográfico (Cursor) — `docs/design/handoffs/2026-07-04-panorama-cartography-benchmark.md` (veredicto: el "green blob" nacional es un **render-policy faltante**, no una mala arquitectura; el framework es 80% de lo que hace falta).
- Design-QA del rediseño Fase 1 — `docs/design/handoffs/2026-07-04-panorama-design-qa.md` (YES-WITH-NITS).

---

## 0. Resumen ejecutivo

Tres controles hoy compiten por el mismo eje mental y se **pisan**:

| Control | Qué controla hoy | Problema |
|---|---|---|
| **Preset (VISTA)** | qué pregunta responde el mapa | correcto, pero no reencuadra el contexto completo |
| **Alcance (scope)** | provincia / localidad que se ve (`JurisdictionSwitcher`) | eje Provincia/Localidad |
| **Agregación (`AggregationToggle`)** | provincia / localidad de agrupación | **mismo eje Provincia/Localidad** → colisión conceptual |

**Decisión de layout (la central):** los tres NO son iguales. Son una jerarquía de tres capas ortogonales — **VISTA → Alcance → Capa** — y la agregación deja de ser un control: pasa a ser una **propiedad derivada** de (alcance + zoom). Se **elimina `AggregationToggle`**.

- El nivel de agregación lo decide el mapa: nacional → relleno por provincia; entrás a una provincia → burbujas/relleno por localidad. Un solo gesto (click en provincia) fija alcance + agregación fina.
- Cada VISTA reencuadra TODO a la vez: título, leyenda, **caption en lenguaje llano**, y la lectura automática.
- Los presets son el default fácil; **"Personalizar"** (capa/opacidad) deja de ser un `<details>` enterrado y pasa a un affordance visible-pero-secundario.

**La extensión del descriptor** (una sola, no un rewrite): `renderPolicy` (mark por nivel administrativo) + `suppressionStyle` (trama vs apagado) + `caption` (materia prima para la frase llana). Todo declarativo: agregar una capa sigue siendo una entrada más en `layers.ts`.

**Phasing:** P0 = reframe de IA + render-policy (relleno provincial nacional) + panel Peores-N con **tabla accesible** (Ley 26.653) + trama de supresión + dominio fijo [0,100] + click-provincia + copiar-vista + export PNG. Fase 2 = coropleta real por localidad (necesita polígonos), modo Δ, capa "¿Dónde actuar?", bivariado/H3.

**Top preguntas al PO:** (1) ¿el nivel lo dispara el zoom, la selección de alcance, o ambos? (2) ¿N=10 o 15 en Peores-N? (3) ¿de dónde salen los polígonos de localidad (INDEC/GCBA)? (4) ¿fórmula de la capa prioridad?

---

## 1. El modelo de IA — taxonomía de controles

### 1.1 Tres ejes ortogonales

```
┌─────────────────────────────────────────────────────────────────┐
│  VISTA        "¿Qué pregunta estoy respondiendo?"                 │
│  (preset)     → reencuadra TÍTULO + LEYENDA + CAPTION + LECTURA   │
│               → el "cambio de contexto"                           │
│               p.ej. "% de cumplimiento" · "Brotes activos"        │
├─────────────────────────────────────────────────────────────────┤
│  ALCANCE      "¿Qué territorio miro?"                             │
│  (scope)      → Nacional · Provincia · Localidad                  │
│               → DERIVA la agregación (ya no hay toggle aparte)    │
│               → click en provincia = un gesto: entra + afina      │
├─────────────────────────────────────────────────────────────────┤
│  CAPA         "¿Qué indicador?"  (Personalizar)                  │
│  (layer)      → base / señal / referencia (modelo F2 intacto)     │
│               → secundario y visible, NO enterrado                │
└─────────────────────────────────────────────────────────────────┘
```

La regla que mata la colisión: **la agregación NO es un control** — es `derivedLevel(scope, zoom)`. Antes el operador podía elegir "Alcance: Provincia Salta" + "Agregación: Provincia" (redundante) o "Agregación: Localidad" (mostrando localidades de todo el país → blob). Ahora el nivel es una consecuencia visual del alcance, exactamente como CDC FluView / ECDC Atlas.

**Regla de derivación (propuesta, ver Pregunta PO #1):**

```
scope = nacional  y  zoom < Z_LOCALITY   → level = "province"   (relleno)
scope = provincia (o zoom ≥ Z_LOCALITY)  → level = "locality"   (dentro de esa provincia)
scope = localidad                        → level = "locality"   (foco en esa localidad)
```

`Z_LOCALITY ≈ 5` (umbral de cámara). El alcance seleccionado en el switcher **gana** sobre el zoom (si elegís una provincia, ves localidades aunque estés alejado; el mapa hace autozoom — ya existe en `SituationalMap.tsx:360–391`).

### 1.2 Wireframe — desktop (lg)

```
 CENTRO DE SITUACIÓN NACIONAL
 Panorama            [ 📌 Nacional · todas las provincias ]         ← chip alcance (ícono lucide, no emoji)
 ─────────────────────────────────────────────────────────────────
 › Cobertura antirrábica cae 12% vs período anterior; 0 de 2        ← LECTURA (reframe por VISTA)
   indicadores mejoran; cobertura actual 42% (meta 80%).

 VISTA   ┌───────────┐┌───────────┐┌───────────┐┌──────────┐┌────────────┐
         │% cumplim. ││Brotes act.││Bienestar  ││Síntomas  ││Control pobl│  ← presets = fila (aria-pressed)
         └───────────┘└───────────┘└───────────┘└──────────┘└────────────┘
            ▲ activo

 Cada área es una PROVINCIA. Relleno = cobertura antirrábica,        ← CAPTION llano (del descriptor)
 estado actual. Meta 80%.

 ⚠ 3 localidades ocultas por privacidad (k-anonimato).              ← supresión (zero-click)

 › Reproducir en el tiempo                                          ← scrubber (details, default-cerrado)

 ┌──────────────────────────────────────────┐  ┌───────────────────────┐
 │                                          │  │ PEORES 10 JURISDICCIONES│  ← panel Peores-N
 │        MAPA (coropleta provincial)       │  │ ── hover-sync con mapa ─│
 │   amber = bajo meta · teal = sobre meta  │  │ 1 Formosa    31% ▁▂▃    │
 │                                          │  │ 2 Chaco      38% ▁▁▂    │
 │   [ leyenda: 0 ──meta80── 100 ]          │  │ 3 Santiago   40% ▂▂▃    │
 │   [ ⧉ Copiar vista ] [ ⭳ PNG ]           │  │ …                       │
 │                          [ Datos al …]   │  │ [ Ver tabla completa ↧ ]│
 └──────────────────────────────────────────┘  ├───────────────────────┤
                                                │ ALCANCE Y PERÍODO   › │  ← details
                                                │ PERSONALIZAR        › │  ← details (visible, secundario)
                                                └───────────────────────┘

 [ KPI strip — 7 tiles, demotado bajo el mapa ]                     ← evidencia de respaldo
```

Cambio vs hoy: el panel Peores-N ocupa la columna derecha (hoy `220px` con solo `details`); los `details` de Alcance/Personalizar bajan debajo del panel. El mapa gana el `Copiar vista`/`PNG` y el sello "Datos al …" en su propio chrome.

### 1.3 Wireframe — mobile (base)

```
 CENTRO DE SITUACIÓN NACIONAL
 Panorama   [ 📌 Nacional ]
 ─────────────────────────────
 › Cobertura antirrábica cae 12%…      ← lectura (2–3 líneas, wrap)

 VISTA  [ % cumplimiento ▾ ]           ← presets colapsan a SELECT/scroll horizontal
                                          (aria-pressed en scroll-snap chips)
 Cada área es una provincia. Relleno
 = cobertura, estado actual. Meta 80%. ← caption

 ⚠ 3 localidades ocultas (privacidad)

 ┌─────────────────────────────┐
 │      MAPA (full-bleed)       │
 │   [⧉] [⭳]        [Datos al…] │
 └─────────────────────────────┘

 ▸ Peores 10 jurisdicciones            ← details, default-cerrado en mobile
 ▸ Reproducir en el tiempo
 ▸ Alcance y período
 ▸ Personalizar

 [ KPI strip apilado ]
```

En mobile el panel Peores-N y el scrubber son `details` (una decisión por vez); el mapa sigue siendo héroe. La tabla completa abre en sheet/scroll propio.

### 1.4 Presupuesto de controles en el primer paint

Objetivo del rediseño Fase 1: ≤8. El design-QA marcó que en producción eran ~11 porque el scrubber era first-class (ya se cerró en `details`). Con IA v2:

- 5 presets (VISTA) + chip de alcance (read-only) + 2 botones de mapa (copiar/PNG) + 3 `details` (Peores-N en mobile, Reproducir, Alcance, Personalizar).
- **Se elimina el `AggregationToggle`** → un control menos y, más importante, un eje mental menos. El panel Peores-N no es un "control" sino lectura sincronizada (no cuenta contra el budget de decisión).

---

## 2. La extensión del descriptor (`PanoramaLayer`)

Una sola extensión, declarativa. Agregar una capa sigue siendo **una entrada** en `layers.ts`.

### 2.1 Tipos nuevos (`domain/types.ts`)

```ts
/** Cómo se dibuja una capa en un nivel administrativo dado. */
export type RenderMode =
  | "choropleth-fill"    // relleno de polígono (rate @ provincia; rate @ localidad cuando haya polígonos)
  | "graduated-symbol"   // burbuja proporcional al valor (density/signal)
  | "clustered-points";  // pins agrupados (reference — nunca agregado)

/**
 * Política de render por nivel administrativo (la extensión #1 del benchmark).
 * Resuelve el "green blob": el nivel NACIONAL usa relleno provincial; las
 * burbujas por localidad solo aparecen cuando la cámara/el alcance entran a
 * una provincia. `autoLevel` es el umbral de cámara que fuerza el nivel.
 */
export type RenderPolicy = {
  province: RenderMode;
  locality: RenderMode;
  /** Debajo de belowZoom, forzar este nivel (nacional → province). */
  autoLevel?: { belowZoom: number; level: AggregationLevel };
};

/** Trama para celdas suprimidas (honestidad espacial del k-anon). */
export type SuppressionStyle = "muted" | "hatched";

/**
 * Materia prima para el caption llano por-vista. El builder puro
 * captionFor(layer, level, period) arma la frase es-AR; el descriptor solo
 * declara las palabras, nunca la oración final (domain sigue framework-free).
 */
export type LayerCaption = {
  /** Nombre de la unidad por nivel: { province: "provincia", locality: "localidad" }. */
  unit: Record<AggregationLevel, string>;
  /** La medida, en llano: "eventos de cobertura antirrábica", "denuncias de bienestar". */
  measure: string;
  /**
   * Cómo se ancla en el tiempo la frase:
   *  - "period"  → "últimos 90 días" (capa temporal, event-windowed)
   *  - "current" → "estado actual"   (rollup de estado: cobertura, mortalidad)
   */
  window: "period" | "current";
};
```

### 2.2 Campos nuevos en `PanoramaLayer`

```ts
export type PanoramaLayer = {
  // …campos actuales (id, label, geomType, source, color, privacy, temporal,
  //   dataType, complianceTarget)…

  /** Política de render por nivel administrativo. Reemplaza la regla implícita
   *  hoy dispersa en SituationalMap.tsx:432–527. */
  renderPolicy: RenderPolicy;

  /** Trama de supresión. Rate/choropleth → "hatched"; density-point → "muted". */
  suppressionStyle: SuppressionStyle;

  /** Materia prima del caption llano por-vista. */
  caption: LayerCaption;
};
```

### 2.3 Cómo queda cada capa (declarativo)

| Capa | `renderPolicy.province` | `renderPolicy.locality` | `autoLevel` | `suppressionStyle` | `caption.measure` / `window` |
|---|---|---|---|---|---|
| `cobertura` (rate) | `choropleth-fill` | `choropleth-fill`¹ | `belowZoom:5 → province` | `hatched` | "cobertura antirrábica" / `current` |
| `esterilizacion` (rate) | `choropleth-fill` | `choropleth-fill`¹ | `belowZoom:5 → province` | `hatched` | "cobertura de esterilización" / `current` |
| `mortalidad` (density-choro) | `choropleth-fill` | `graduated-symbol`² | `belowZoom:5 → province` | `hatched` | "mortalidad registrada" / `current` |
| `perdidas` (density) | `graduated-symbol` | `graduated-symbol` | `belowZoom:5 → province` | `muted` | "reportes de mascotas perdidas" / `period` |
| `mordeduras` (density) | `graduated-symbol` | `graduated-symbol` | `belowZoom:5 → province` | `muted` | "eventos de mordedura / antirrábica" / `period` |
| `denuncias` (density) | `graduated-symbol` | `graduated-symbol` | `belowZoom:5 → province` | `muted` | "denuncias de bienestar" / `period` |
| `zoonosis` (signal) | `graduated-symbol` | `graduated-symbol` | `belowZoom:5 → province` | `muted` | "señales de zoonosis" / `period` |
| `refugios` (reference) | `clustered-points` | `clustered-points` | — (ignora nivel) | `muted`³ | "refugios registrados" / `current` |
| `decomisos` (reference) | `clustered-points` | `clustered-points` | — | `muted`³ | "decomisos" / `period` |

¹ Coropleta real por localidad **requiere polígonos** (hoy solo hay centroides, `build-features.ts:243–244`). **Fase 2.** En P0, `locality` de rate cae a `graduated-symbol` divergente (círculo coloreado por la escala divergente, no por tamaño), interino y honesto.
² `mortalidad` no tiene polígono por localidad → símbolo graduado al bajar de nivel; el label "coropleta" solo aplica a provincia (el benchmark marcó el label como engañoso a nivel localidad).
³ Referencia no agrega, así que no hay celdas suprimidas; `suppressionStyle` es no-op.

### 2.4 El builder del caption (puro, `domain/reading.ts` o `domain/caption.ts`)

```ts
// Ejemplo de salida. Puro: sin DB/React/Next. Lee renderPolicy para elegir la
// palabra del mark ("área" para fill, "burbuja" para symbol) y caption.window.
captionFor(cobertura, "province", period90d)
// → "Cada área es una provincia. Relleno = cobertura antirrábica, estado actual. Meta 80%."

captionFor(mordeduras, "locality", period90d)
// → "Cada burbuja es una localidad. Tamaño = eventos de mordedura / antirrábica, últimos 90 días."
```

Regla de armado: `Cada {área|burbuja} es una {unit[level]}. {Relleno|Tamaño} = {measure}, {estado actual|últimos N días}.` + (si `complianceTarget`) `Meta {target}%.`

**Framework hook:** el caption se renderiza en un componente nuevo `PanoramaCaption.tsx` entre `PresetPanel` y `PanoramaSuppressionNotice` (`PanoramaConsole.tsx:1361`). Se recalcula cuando cambia VISTA, alcance o período — es el vehículo del "cambio de contexto" (C).

---

## 3. Las mejoras cartográficas

Cada una: qué se ve · copy es-AR · encoding (dataviz) + nota de paleta · hook de framework.

### 3.1 Render-policy por nivel administrativo — el #1

**Qué se ve.** A escala nacional el mapa es un **relleno de provincia** (coropleta), no 2.000+ círculos apilados. Al entrar a una provincia (click o zoom ≥ Z_LOCALITY), aparecen las localidades — burbujas graduadas para density/signal, relleno cuando existan polígonos.

**Encoding (dataviz).** *La forma sigue el trabajo del dato:* magnitud de una **tasa** → coropleta de relleno (área = comparabilidad entre provincias); magnitud de un **conteo** → símbolo graduado (área del círculo ∝ valor, nunca radio). Nunca burbujas densas donde los centroides se solapan (root cause del blob).

**Paleta.** Density/mortalidad secuencial: `RAMP_BLUE` (una sola tinta, claro→oscuro) — ya existe en `viz-scales.ts`. Rate: escala divergente (§3.2).

**Hook.** `renderPolicy` en el descriptor (§2); branch de render en `SituationalMap.tsx:432–467` lee `derivedLevel(scope, zoom)` + `layer.renderPolicy[level]`; el autozoom por jurisdicción ya existe (`SituationalMap.tsx:360–391`). Se elimina `AggregationToggle.tsx` y su estado `level` como control (queda como estado derivado).

### 3.2 Escala divergente anclada en `complianceTarget` + dominio fijo [0,100]

**Qué se ve.** Para capas `rate` (cobertura, esterilización): amber = bajo meta, neutro = en meta, teal = sobre meta. La leyenda **nombra el umbral** (`meta 80%`). Dominio **fijo [0,100]** para todas las provincias — Buenos Aires no se lava por una provincia caliente; comparabilidad cruzada.

**Copy es-AR.** Leyenda: `0 ── meta 80% ── 100`, con etiquetas `Bajo meta` (amber) / `En meta` / `Sobre meta` (teal). Caption ya trae `Meta 80%`.

**Encoding.** *Diverging = dos tintas + gris/neutro en el midpoint significativo* (la meta, no el promedio del dato). Ya construido: `provinceDivergentColorExpr` + `divergentStops` anclan el neutro exactamente en `target`.

**Paleta (CVD-safe, verificada en código).** Amber `#f59e0b` (bajo) → slate-50 `#f8fafc` (meta) → teal `#0d9488` (sobre). Es el eje **azul–naranja**, seguro para deuteranopía/protanopía (separa por tono Y luminancia, no por el eje rojo-verde prohibido). Fuente: PuOr de ColorBrewer adaptado. **Extender a nivel localidad** (hoy localidad de rate cae a conteo-densidad, `repository.ts:907` — lo desmiente la premisa "% cumplimiento").

**Cambio concreto.** Pasar `domainBounds: { min: 0, max: 100 }` fijo a `provinceDivergentColorExpr` para capas rate (hoy usa el rango observado). Hook: `province-choropleth-style.ts:88–127`, leyenda `SituationalMap.tsx:986–1016`.

### 3.3 Panel Peores-N + tabla accesible (Ley 26.653)

**Qué se ve.** A la derecha del mapa, "Peores 10 jurisdicciones" ordenadas por (a) **distancia bajo meta** para presets de tasa, o (b) **conteo de eventos** para presets de densidad. Hover en fila → resalta la feature en el mapa (`feature-state`); hover en mapa → resalta la fila. Enter/click → abre `DetailDrawer`. Mini-sparkline por fila (tendencia).

**Tabla accesible — first-class, no un extra.** "Ver tabla completa" abre una `<table role="table">` **ordenable, filtrable, sin WebGL**: misma proyección que el mapa. Es el **camino de lector de pantalla** al mismo dato y un **requisito legal (Ley 26.653 de Accesibilidad de la Información en las Páginas Web)** para el handoff de gobierno. Hoy el `aria-label` del mapa es solo un conteo de puntos (`SituationalMap.tsx:955–956`) — no hay acceso a valores.

**Copy es-AR.** Título `PEORES 10 JURISDICCIONES`; columnas `Jurisdicción · Cobertura · Brecha vs meta · Tendencia`. Botón `Ver tabla completa`. Estado vacío: `Sin jurisdicciones bajo meta en este alcance.` (invitación, no error).

**Encoding.** El ranking colapsa el mapa a una lista ordenada — *a veces la mejor forma no es un gráfico sino una tabla ordenada*. Sparkline = línea fina de 2px, sin ejes, un solo color de tinta (no el color de serie). El color del mark en la fila lleva identidad; el número lleva token de tinta.

**Hook.** Componente nuevo `RankedUnitsPanel.tsx` + `PanoramaDataTable.tsx`, alimentados por la misma proyección que `get-layer-features.ts`; `feature-state` sync en `SituationalMap.tsx`; click → `DetailDrawer.tsx` (ya existe).

### 3.4 Honestidad espacial del k-anon — trama, no desaparición

**Qué se ve.** Las celdas suprimidas por k-anon (< 5 casos) se rellenan con **trama diagonal (hachura 45°)**, perceptualmente distinta de "sin dato" (relleno gris sólido). Hoy ambas leen como gris apagado sobre canvas oscuro (`COLOR_SUPPRESSED #d1d5db` vs `COLOR_NO_DATA #e5e7eb`) → se confunden.

**Copy es-AR.** Tooltip: `Datos insuficientes (protegidos por privacidad · k-anonimato)`. Leyenda del mapa: alinear a `Datos insuficientes (privacidad)` (hoy dice solo `Suprimido`, más débil que las coropletas del dashboard — nit P2 del design-QA). Píldora agregada (`PanoramaSuppressionNotice`) ya existe y es honesta.

**Encoding.** *Textura para el caso incierto/suprimido* — hachura ONS/Eurostat-standard. Distingue "no puedo mostrarte esto por privacidad" de "no hay dato". A nivel provincia, opcionalmente contorno "área con supresión" cuando muchas localidades hijas están suprimidas.

**Hook.** `suppressionStyle: "hatched"` en el descriptor (§2); patrón `fill-pattern` en `province-choropleth-style.ts` + `SituationalMap.tsx:494–498`; mantener `PanoramaSuppressionNotice.tsx` como agregado.

### 3.5 Modo Δ-vs-período (coropleta de cambio) + sparklines de KPI

**Qué se ve.** Toggle **junto al scrubber** (no lo reemplaza): "Δ vs período anterior". El mapa pasa a colorear **Δpp** (cambio en puntos porcentuales o Δ%) contra el período anterior de igual duración. Los KPIs suman una sparkline chica cada uno (la sala de situación lee *movimiento*, no solo nivel).

**Copy es-AR.** Toggle: `Nivel` / `Δ vs período anterior`. Leyenda del modo Δ: `−  sin cambio  +`. Caption en modo Δ: `Cada área es una provincia. Color = cambio vs período anterior.`

**Encoding.** *Diverging centrado en 0* (cero = sin cambio, el ancla significativa): un polo para caídas, otro para subidas, neutro en 0. **La valencia importa:** para cobertura, subir es bueno (teal arriba); para mordeduras/zoonosis, subir es malo (amber arriba) — el signo de color sigue `KNOWN_KPIS.goodUp` (ya definido en `reading.ts:44–56`), no el signo del número crudo.

**Hook.** Nueva proyección temporal + `valueKind: "delta"` (extensión chica de schema/loader en `repository.ts`); segunda capa de fill en `SituationalMap.tsx`; toggle en el bloque del scrubber (`PanoramaConsole.tsx:1370–1383`). **Fase 2** (más pesado).

### 3.6 Compartir (deep-link) + exportar PNG/PDF con pie de metadatos

**Qué se ve.** Botón `⧉ Copiar vista` (el estado de tablero ya está URL-encoded: `layers`, `level→scope`, `preset`, `period` — `PanoramaConsole.tsx:11–19`; agregar `asOf` y `scope` a la URL canónica). Botón `⭳ PNG` (y PDF en fast-follow) que exporta el mapa **con pie de metadatos**: `Datos al {fecha} · Fuente: registro DIM + Censo 2022 (INDEC) · Metodología: {link} · Alcance: {…} · Período: {…} · {N} celdas suprimidas`.

**Copy es-AR.** `Copiar vista` → toast `Vista copiada al portapapeles`. `Exportar PNG`. Pie: `Datos al 4 jul 2026 · MiMAR · Nacional · últimos 90 días`.

**Encoding / propósito.** Es el flujo de **briefing** para intendentes: una diapositiva con procedencia audita­ble. El export embebe alcance/período/supresión para el rastro de auditoría.

**Hook.** `map.getCanvas().toDataURL()` + composición de un footer canvas; UI en el chrome del mapa (`SituationalMap.tsx`); share ya casi listo en `map-layer-nav.ts:34–37`.

### 3.7 Capa derivada "¿Dónde actuar?" (prioridad)

**Qué se ve.** Un preset/capa que colapsa **brecha de cobertura × población de mascotas** a un solo **rank legible por intendente**: "brecha grande + muchos perros = actuar acá primero". Un solo número/ranking, no dos capas mentales.

**Copy es-AR.** VISTA `¿Dónde actuar?`; pregunta `¿Qué jurisdicciones combinan mayor brecha de cobertura y más población canina?`; caption `Cada área es una provincia. Prioridad = brecha vs meta × población canina registrada.`

**Encoding.** `priority = (target − coverage) × registered_dogs`, con **k-anon suprimiendo denominadores chicos**. Render P0: **relleno secuencial** de una tinta (`RAMP_ORANGE` o `RAMP_PURPLE`, claro→oscuro = menor→mayor prioridad) + el **Peores-N** como salida principal (el intendente lee la lista, no integra dos capas). Bivariado (coverage × densidad en matriz 3×3) es Fase 2 — analista lo ama, intendente lo sufre.

**Hook.** Nueva capa derivada en `layers.ts` + loader en `repository.ts`; o campo computado sobre `cobertura`. Preset nuevo en `presets.ts`.

---

## 4. Phasing

### P0 — el slice de rediseño (lo que Cursor dice primero: render-policy + Peores-N/tabla)

1. **Reframe de IA** — eliminar `AggregationToggle`; `level` derivado de (scope, zoom); click-provincia = un gesto (alcance + nivel fino); `PanoramaCaption` llano por-vista; VISTA reencuadra título+leyenda+caption+lectura; "Personalizar" visible-pero-secundario.
2. **Render-policy** — descriptor `renderPolicy` + relleno provincial a escala nacional (mata el blob).
3. **Dominio fijo [0,100]** en leyendas de tasa + extender divergente a localidad (símbolo divergente interino).
4. **Peores-N + tabla accesible** (Ley 26.653) — hover-sync map↔fila, ordenable, sin WebGL.
5. **Trama de supresión** (`suppressionStyle: "hatched"`) + alinear copy de leyenda.
6. **Click-provincia → scope + nivel** (cablear `onFeatureClick` existente).
7. **Copiar vista + export PNG** con pie de metadatos.

### Fase 2 — cuando la vista nacional ya es legible

8. **Coropleta real por localidad** para tasas — **necesita infra nueva: polígonos de localidad** como asset público (`public/geo/ar-localities.*.json`). Hoy solo hay centroides.
9. **Modo Δ vs período** (coropleta de cambio) + sparklines de KPI.
10. **Capa "¿Dónde actuar?"** (prioridad = brecha × población).
11. **Bivariado** (coverage × densidad) / **H3-hexbin** para densidad de eventos sin polígonos — segundo-mejor vs coropleta administrativa real.

### Flags de infra nueva (bloquean Fase 2)

- **Polígonos de localidad** (INDEC / GCBA) como asset `public/geo/…` — sin esto, la coropleta real por localidad no existe; P0 usa símbolo divergente interino.
- **Proyección Δ** en el repositorio (`valueKind: "delta"`, período anterior de igual duración).
- **Denominador de población canina registrada** por jurisdicción para la capa prioridad.

---

## 5. Preguntas abiertas para el PO

1. **Disparador del nivel.** ¿El nivel localidad lo dispara el **zoom** (Z≈5), la **selección de alcance** en el switcher, o **ambos** (recomendado: alcance gana sobre zoom)? Afecta cuán "mágico" se siente el mapa.
2. **Peores-N.** ¿**N=10 o 15**? ¿Orden por defecto por preset (tasa → brecha; densidad → conteo) o siempre configurable?
3. **Polígonos de localidad.** ¿De dónde salen (INDEC / GCBA / padrón propio)? Bloquea la coropleta real por localidad (Fase 2). ¿Quién provee/valida el asset?
4. **Fórmula de la capa prioridad.** ¿`(meta − cobertura) × población` lineal, o con pesos? ¿Qué denominador de población (canina registrada, Censo, mascotas activas)?
5. **Δ período.** ¿Comparar contra el **período anterior de igual duración** (default) o un período fijo elegido por el operador?
6. **Export.** ¿**PNG primero** y PDF en fast-follow? ¿El pie de metadatos debe incluir el conteo de celdas suprimidas siempre (recomendado, auditoría)?
7. **"Personalizar" secundario.** ¿Aceptás que capa/opacidad salga del `<details>` a un panel visible-pero-secundario, aun cuando eleva levemente la densidad del primer paint?

---

## Apéndice — mapa de hooks de framework

| Cambio | Archivo(s) |
|---|---|
| `renderPolicy` / `suppressionStyle` / `caption` en descriptor | `src/modules/panorama/domain/types.ts`, `layers.ts` |
| Builder de caption (puro) | `src/modules/panorama/domain/caption.ts` (nuevo) |
| Nivel derivado `derivedLevel(scope, zoom)` + eliminar toggle | `components/panorama/PanoramaConsole.tsx`, borrar `AggregationToggle.tsx` |
| Render branch por nivel | `components/panorama/SituationalMap.tsx:432–527` |
| Escala divergente + dominio [0,100] | `components/panorama/province-choropleth-style.ts`, `lib/analytics/viz-scales.ts` |
| Panel Peores-N + tabla accesible | `RankedUnitsPanel.tsx`, `PanoramaDataTable.tsx` (nuevos), `get-layer-features.ts` |
| Trama de supresión | `province-choropleth-style.ts`, `viz-scales.ts` (`COLOR_SUPPRESSED`) |
| Modo Δ | `repository.ts` (proyección), `SituationalMap.tsx` (fill Δ) |
| Copiar vista / export PNG | `SituationalMap.tsx`, `map-layer-nav.ts` |
| Capa prioridad | `layers.ts`, `presets.ts`, `repository.ts` |
| Caption component | `PanoramaCaption.tsx` (nuevo), montado en `PanoramaConsole.tsx:1361` |
</content>
</invoke>

---

## Decisiones del PO (resueltas 2026-07-04)

1. **Disparador del nivel localidad: AMBOS — zoom Y alcance.** Principio rector: *no agrupar perdiendo precisión si la visualización lo banca correctamente*. Al hacer zoom (aun en alcance nacional) se muestra el detalle de localidad; seleccionar un alcance también. Se prefiere la mayor precisión que renderice bien.
2. **Worst-N = 10.**
3. **Polígonos de localidad: la fuente más confiable / de mejores polígonos** (decisión de implementación — priorizar calidad de geometría; INDEC u otra fuente oficial abierta).
4. **NO capa "¿dónde actuar?" / NO score derivado / NO bivariado-a-ranking.** Postura de producto: *solo data útil y honesta; no inventamos métricas ni recomendamos next-actions todavía*. → Se ELIMINAN del scope: la priority-layer, el bivariado colapsado a rank, y cualquier recomendación prescriptiva. El panorama muestra datos crudos/agregados honestos, nada de composites opacos.
5. **"Personalizar": simple por ahora**, a criterio del diseño (default recomendado).

**Efecto en el phasing:** P0 sin cambios (IA reframe + render-policy + Worst-N + tabla accesible + hatch de supresión + dominio [0,100] + click-provincia + copiar-vista/PNG). Fase 2 pierde la priority-layer y el bivariado (cortados por decisión de producto); queda choropleth real por localidad + modo Δ.
