# Handoff: Panorama v2C — consola fija con overlays sobre el mapa

## Overview
Iteración de **posiciones** sobre el rediseño del Panorama (Centro de Situación Nacional, `/gob`).
De las 4 disposiciones exploradas se eligió la **opción C — overlays**: una **consola fija de pantalla
completa** (la página NO scrollea) donde el mapa ocupa **todo** el alto y ancho libres y **nunca cambia
de tamaño** — todo el cromo (vista, KPIs, alcance, período, acciones y el dock de datos) **flota sobre
el mapa** como overlays. La reproducción temporal ya no es un bloque fijo: vive como tab del dock.

Es una evolución de una feature que **ya existe** en el repo (`app/(gob)/.../panorama`, `SituationalMap`,
`TimeScrubber`, `LayerPanel`, `PresetPanel`, `PanoramaKpiStrip`, `DetailDrawer`, `OperatorShell`,
`lib/analytics/viz-scales.ts`). **Portá estos cambios sobre esos componentes reales** — no es una
feature nueva desde cero.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML/CSS/JS vanilla** — un prototipo
que muestra el look y comportamiento buscados, **no código para copiar tal cual**. La tarea es
**recrear este diseño en el entorno real** (Next.js + React + Tailwind/tokens + MapLibre GL, según el
repo `dim`) usando sus componentes y convenciones establecidas.

Salvedades del prototipo:
- **El mapa es un SVG estático** (choropleth de 24 jurisdicciones + puntos graduados + drill con tween
  de viewBox) que reemplaza a **MapLibre GL** solo para mostrar composición y color. En el repo el mapa
  sigue siendo `SituationalMap` (MapLibre).
- **Los valores por provincia son ilustrativos** (deterministas por seed). Los KPIs nacionales
  (89, 2,4, 28.940, 41,3%…) son los valores de referencia de las cards del DS.
- El botón de zoom, «Exportar PNG», «Exportar CSV», «Vistas guardadas» y «Personalizado…» son stubs
  (muestran toast); el resto de las interacciones es funcional en el prototipo.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados, radios, copy es-AR y estados están
definidos y deben recrearse fielmente. Donde el prototipo difiere del render real (MapLibre), prevalece
MapLibre.

---

## No negociables
1. **Privacidad visible**: unidades con k<5 se muestran **atenuadas** (puntos `suppressionStyle:
   "muted"`, convención del LayerPanel), la leyenda lleva el pill «⊘ k<5 protegido», y en las tablas la
   celda es «Protegido (k<5)» con fondo rayado 45°. Nunca se oculta silenciosamente.
2. **Todo el copy en es-AR** (voseo: «Pasá el mouse…», «Elegí…»).
3. **El pill de alcance es el camino de teclado**: nada depende SOLO del click en el mapa. El menú de
   jurisdicción es operable con ↑/↓/Home/End/Enter/Esc.
4. **El mapa nunca cambia de tamaño**: expandir el dock, abrir menús o cambiar de vista no relayoutea
   el mapa — todo es overlay (`position: absolute` sobre el contenedor del mapa).

---

## Screens / Views

### Panorama v2C (única pantalla, 1920×1080, escala a viewport con letterbox)

**Propósito:** el operador lee la situación nacional/provincial en un mapa a pantalla completa; el
cromo flota encima y los datos tabulares viven en un dock inferior flotante, colapsado por defecto.

**Estructura (z-order de abajo hacia arriba):**
1. **Rail de navegación** (izquierda, `width: 222px`, fondo `--navy #0a3556`) — `OperatorShell` real,
   sin cambios: marca MiMAR / Operador · Nación, «Ministerio de Salud», items (Panorama activo,
   Vigilancia, Casos, Censo, Reglas, Refugios, Organismos), pie avatar «M. Rodríguez / Epidemiología».
2. **Masthead** (fila fija, la ÚNICA fuera del mapa; `background: --card #ffffff`,
   `border-bottom: 1px solid --line #dbe1e7`, `padding: 9px 24px`):
   - crumb «Operador › Panorama» (12px, `--mute #66727c`)
   - título «CENTRO DE SITUACIÓN NACIONAL» (12.5px, 700, uppercase, `letter-spacing: .1em`, `--ink-2`)
   - derecha: fresh chip mono («Datos al 11/07, 09:41»; borde `--line`, radio 999) + botón «Actualizar»
     (`OpButton` secundario, 12px)
3. **El mapa** (`flex: 1` del resto; fondo `--card`): choropleth + capas de punto. Overlays encima:

**Overlays del mapa (todos `position: absolute`, sobre fondo `rgba(255,255,255,.97)`,
`border: 1px solid --line`, sombra `0 10px 30px rgba(20,40,60,.16)`, radio 8px, `padding: 10px`):**

- **Cluster arriba-izquierda** (`top/left: 14px`, `max-width: 330px`, columna, `gap: 9px`):
  - Fila 1: **selector de Vista** (dropdown pill: label «VISTA» 10px 700 uppercase `--mute` + nombre de
    la vista 12.5px 600 + caret ▾; borde `--line`, radio 6px, `padding: 6px 12px`) + **botón Capas**
    con contador (badge azul `--azul #0e5a99`, radio 999, mono 10px, blanco).
  - Debajo: **KPI chips apilados** (columna, `gap: 6px`, `justify-content: space-between`): valor mono
    15px 700 + label 11px `--mute` + delta mono 10.5px `--faint`. Chip = borde `--line`, radio 6px,
    `padding: 5px 12px`. **Activo** (métrica pintando el mapa): borde `--azul`, fondo
    `rgba(14,90,153,.08)`, valor `--azul`. Hover: borde `--celeste #4e97d1`.
    Click → esa métrica pasa a ser la base del choropleth (`aria-pressed`).
- **Cluster arriba-derecha** (`top/right: 14px`, columna alineada a la derecha):
  - Fila 1: **pill de alcance** («◉ Córdoba ▾»; borde y texto `--azul`, fondo `rgba(14,90,153,.06)`,
    radio 999, `padding: 6px 14px`, 12.5px 600) + **período en una línea**: segmented (7 días · 30 días
    · 90 días · 12 meses; radio 999, activo fondo `--azul` texto blanco) + botón «▾ más» (borde
    dasheado; abre Año en curso / 3 años / 5 años / Personalizado…; al elegir uno muestra el nombre y
    pasa a estilo activo).
  - Fila 2: acciones — «Copiar vista» · «Vistas guardadas» (menú) · «Exportar PNG» (`OpButton` sm).
- **«← Volver a Nacional»** (solo en drill): centrado arriba (`top: 14px; left: 50%`), `OpButton` con
  sombra.
- **Zoom** (columna +/−, 32×32): **abajo-derecha** (`right: 14px; bottom: 72px`) — se corre porque
  arriba-derecha está el cluster.
- **Leyenda en UNA línea** (abajo-izquierda, `left: 14px; bottom: 72px` — 72 para dejar lugar a la
  barra del dock): pill blanco radio 999 con: label de la base en 600 («Eventos por unidad» o
  «<métrica> (% vs meta)») + rampa de 5 celdas 14×9px (escala secuencial azul `#eff3ff→#084594` o
  divergente ámbar→teal según el tipo de métrica, de `viz-scales.ts`) + un dot 9px por capa activa con
  su color + **pill k-anon** «⊘ k<5 protegido» (fondo rayado 45°:
  `repeating-linear-gradient(45deg,#f4f6f8 0 3px,#e9edf0 3px 6px)`, tooltip «Unidades con menos de 5
  casos: valor suprimido por k-anonimato (Ley 25.326)»).
- **Dock inferior flotante** (`left/right/bottom: 14px`, radio 10px, borde `--line`, sombra
  `0 16px 44px rgba(20,40,60,.22)`):
  - **Colapsado (default): 41px** — grip ≡, tabs «Registros [conteo]» / «Estadísticas» / «Línea de
    tiempo» (12.5px; activa: `--azul` 600 con subrayado 2px `--azul`; conteo en badge mono azul), y a
    la derecha meta mono 11.5px («Córdoba · últimos 90 días · 2 capas») + «Exportar CSV» + «▴ Expandir».
  - **Expandido: 42% del alto del mapa**, crece hacia arriba SOBRE el mapa (el mapa no se re-layoutea).
    Cuerpo con scroll interno, `padding: 12px 20px`. Click en cualquier tab colapsada también expande.

**Tabs del dock:**
- **Registros**: tabla (`font-size: 12.5px`; th 10px 700 uppercase `--mute`, sticky; celdas
  `padding: 8px 10px`, borde inferior `--line-2 #e8ecf0`; hover fila `--stripe #f7f9fb`): Fecha (mono) ·
  Unidad · Capa · Detalle · Estado. Estados como pills 11px 600 radio 999: Abierta (ámbar
  `--warn #96600e` / fondo `#fff4da`), En curso (azul / `#eef4f9`), Cerrada (gris / `--stripe`),
  **Protegido (k<5)** (gris sobre rayado 45°, columna Detalle «—»). Con drill, las unidades son
  localidades de la provincia; a nivel nacional, las provincias top por la métrica base.
- **Estadísticas**: ranking top-7 de jurisdicciones por la métrica base: # (mono `--mute`) ·
  Jurisdicción · valor (mono) · barra horizontal (6px, radio 999, fondo `--line-2`, fill `--azul`,
  ancho proporcional al máximo) · tendencia («▲ sube / ▼ baja / · estable»). Última fila: «3
  jurisdicciones — Protegido (k<5) — suprimido por k-anonimato». **Hover en fila → la provincia se
  resalta en el mapa** (las demás bajan a `opacity: .18`); **click / Enter → drill**. Nota al pie:
  «Pasá el mouse por una fila para ubicarla en el mapa · click para entrar a la provincia.»
- **Línea de tiempo**: el **TimeScrubber real** en modo compacto+detalle: play ▶, track con ticks de
  fecha (8 abr / 8 may / 8 jun / hoy), thumb azul, «Ahora», bucles pre-filtrados (↺ 7/30/90 días),
  base bitemporal («Cuándo ocurrió» / «Según lo conocido al momento»). **Gating temporal**: si la vista
  es de stock (cobertura/esterilización sin capas temporales), estado «No disponible en esta vista»
  (card dasheada, fondo `--stripe`) con explicación y CTA implícito de sumar una capa de eventos.

## Interactions & Behavior
- **Vista (dropdown)**: elegir un preset precarga base + capas + sus 3 KPIs (mismos presets de
  `PresetPanel`: Brotes activos / Síntomas / % de cumplimiento / Bienestar y fiscalización / Control
  poblacional / Pérdidas y reunificación). Repinta mapa, leyenda, KPIs, dock y scrubber.
- **KPI chip click** → cambia la métrica base del choropleth (sin cambiar de vista).
- **Capas (popover)**: base fija (informativa) + 5 overlays de punto aditivos con checkmark, dot de
  color y conteo mono; toggle repinta mapa/leyenda/meta y re-evalúa el gating temporal.
- **Alcance**: pill → menú «Jurisdicción» con «Nacional (todo el país)» + 24 provincias orden
  alfabético es. Selección = drill (tween de viewBox ~620ms) o reset. **Bidireccional** con click en
  mapa: `onScope` actualiza pill, meta del dock, conteos y tablas. Nota al pie del menú: «También podés
  hacer click en una provincia del mapa.»
- **Drill**: click provincia → zoom + puntos graduados por localidad (radio ∝ √valor; suprimidos
  atenuados). Click en punto → toast con el valor o «Unidad protegida: menos de 5 eventos
  (k-anonimato).» (en el repo real: `DetailDrawer`).
- **Período**: click en segmento actualiza conteos («Registros N» escala con el período) y meta del
  dock. «Personalizado…» es stub con toast.
- **Copiar vista** → copia deep-link `https://mimar.gob.ar/panorama?vista=<id>&alcance=<code|nacional>
  &periodo=<id>` al portapapeles + toast «Enlace copiado: …». **Vistas guardadas** → menú con vistas
  que aplican estado completo (vista+alcance+período) + «Guardar vista actual…».
- **Menús/popovers**: radio 8px, sombra `0 18px 50px rgba(20,40,60,.22)`, item hover `--stripe`,
  seleccionado fondo `rgba(14,90,153,.09)` + ✓; teclado ↑/↓/Home/End/Esc (Esc devuelve el foco al
  trigger); click afuera cierra. En el cluster derecho abren alineados a la derecha.
- **Toast**: `bottom: 60px` centrado, fondo `rgba(12,47,74,.97)`, blanco, 12.5px, ~2.4s.
- **Transiciones**: dock `height .18s ease`; provincias `fill/opacity .5s`; tween de viewBox 620ms
  ease-in-out-cubic.

## State Management
- `vista: 'brotes'|'sintomas'|'cumplimiento'|'bienestar'|'control'|'perdidas'` (default `bienestar`)
- `base: metricId` — métrica del choropleth (la cambia la vista o un KPI chip)
- `layers: layerId[]` — overlays de punto activos (aditivos, sin exclusión)
- `scope: provinceCode|null` + `scopeName` — jurisdicción (drill); null = Nacional
- `period: '7d'|'30d'|'90d'|'12m'|'ytd'|'3a'|'5a'` (default `90d`)
- `dockOpen: boolean` (default false) · `tab: 'registros'|'stats'|'timeline'` (default `registros`)
- Derivados: conteo de registros (escala por período/alcance), gating temporal
  (`TEMPORAL_BASES ∪ capas temporales`), meta del dock.
- Estado inicial del prototipo: Bienestar y fiscalización · Córdoba drilleada · 90 días · dock colapsado.
- Sugerido en el repo: vista/alcance/período/tab en la URL (el deep-link de «Copiar vista» ya define el
  contrato); dockOpen y tab recordados por usuario.

## Design Tokens
Colores (los mismos tokens `ln-op-*` del DS):
`--navy #0a3556` rail · `--azul #0e5a99` acción/activo · `--azul-700 #0a4576` · `--celeste #4e97d1`
hover · `--page #eef1f4` · `--card #ffffff` · `--stripe #f7f9fb` · `--line #dbe1e7` ·
`--line-2 #e8ecf0` · `--ink #16252f` · `--ink-2 #36454f` · `--mute #66727c` · `--faint #95a0a8` ·
`--danger #b71c1c` · `--warn #96600e` · `--ok #1e7a3e`. Rampa secuencial `#eff3ff #c6dbef #6baed6
#3182bd #084594`; divergente ámbar `#f59e0b` → neutro `#f1f5f8` → teal `#0d9488` (de `viz-scales.ts`).
Capas de punto: zoonosis `#9c755f`, mordeduras `#e15759`, decomisos `#76b7b2`, refugios `#4e79a7`,
reunificación `#59a14f`.

Tipografía: **Encode Sans** UI (body 13px; labels 10–12.5px), **IBM Plex Mono** para valores, fechas,
conteos y meta. Radios: 4/6/8px + 999 pills. Sombras overlay: `0 10px 30px rgba(20,40,60,.16)` cards,
`0 16px 44px rgba(20,40,60,.22)` dock, `0 18px 50px rgba(20,40,60,.22)` menús.

## Assets
Sin imágenes. Íconos del rail: SVGs geométricos simples en el prototipo — en el repo usar los lucide
reales vía `components/Icon.tsx`. Fuentes: Encode Sans 400/600/700 + IBM Plex Mono 400/500 (woff2 en
`assets/fonts/`, ya en el repo).

## Files
- `Panorama-v2C.html` — la pantalla, lista para abrir en un browser (stage 1920×1080 con letterbox).
- `panorama-v2-lays.js` — construcción del layout C + interacciones (`PANO_V2L.mount(root,'C')`;
  incluye además los layouts A/B/D explorados y descartados, por si sirven de referencia).
- `panorama-core.js` — motor compartido: mapa SVG (choropleth/puntos/drill), métricas, presets,
  capas, escalas de color y el TimeScrubber.
- `geo-data.js` — geometría de las 24 jurisdicciones (`window.ARG_GEO`).
- `assets/fonts/` — Encode Sans + IBM Plex Mono locales (los `@font-face` van inline en el HTML).
