# Plan: TODAS las mejoras del mapa de Panorama

> Pedido de PO (2026-07-25): "el plan para todas las mejoras del mapa primero,
> luego el resto". Este doc es el plan COMPLETO y accionable del mapa. El resto
> del hito (Track B / OpKpi legibilidad, filtro client-commit global, tablas)
> vive en `2026-07-24-dashboards-explorar-fluido-leer-confiado.md` y va DESPUÉS.
>
> Identidad (fijada, engram `panorama/product-identity`): Panorama es un
> INSTRUMENTO ANALÍTICO — explorar + entender patrones (espacial/temporal) +
> exportar. El mapa es el héroe. Sin acción/CTA, sin costos.

## Cómo está hecho el mapa hoy (grounding)

- **maplibre-gl** (`components/panorama/SituationalMap.tsx`). Coropleta con
  `paint: { "fill-color", "fill-opacity" }` — **sin `*-transition`, así que todo
  cambio de color/dato SALTA** (un `setData`/re-add de capa repinta de golpe).
- **Cámara**: `fitBounds` / `flyTo` / `jumpTo`. El restore desde URL usa `jumpTo`
  (instantáneo, correcto). El drill y el autozoom usan fitBounds/flyTo.
- **Temporal**: `TimeScrubber` emite `asOf` → la consola refetchea las capas
  temporales con `?asOf=<iso>` → `setData` → repaint. La reproducción ("play")
  cicla `asOf` en **frames discretos** (un refetch por frame), sin interpolación.
- **Drill**: click en polígono provincial a escala nacional drillea
  (`SituationalMap.tsx` ~2538); el inset CABA drillea vía `onProvinceDrill`
  (~3221). El click en fila del ranking NO drillea (solo abre detalle).

## Los trabajos, en orden de dependencia/prioridad

### A. Bugs de confianza (PRIMERO — socavan todo lo demás)

**A1 · P1.2 — deep-link roto (la URL compartible no reproduce las capas).**
El bug de misión central: bajo "exportar/compartir vistas", una URL que miente
es lo opuesto al producto.
- Root cause (trazado): el sync de URL de la consola **siempre** escribe
  `layers=` junto a `preset=` (`PanoramaConsole.tsx` ~3093), lo que deja muerta
  la ruta de seed-por-preset del server (`app/gob|admin/panorama/page.tsx`
  requiere `layers` ausente). Al reabrir en frío se siembra solo la capa
  hardcodeada "perdidas" → `mapTableRows` queda vacío (Registros 0). El KPI
  denuncias (49) es correcto porque viene de un path SSR aparte.
- Fix (una de dos): (a) sembrar exactamente las capas que nombra `?layers=`
  (bypass del lookup por preset cuando divergen); o (b) que el guard de
  mount-skip del efecto de fetch de capas dependa de que `hasSeed` cubra los
  layer ids concretos, no un "primer run siempre saltea".
- Verificación: reabrir una URL copiada reproduce mapa + Registros idénticos.

**A2 · P1.3 — unificar interacción ranking↔mapa (click=drill) + hover-preview.**
Hoy: click en el mapa drillea, click en la fila del ranking solo abre detalle —
asimetría confusa. Decidido: **click = drill en todos lados** + hover-preview.
- Cablear `onRankedSelect` (`PanoramaConsole.tsx` ~3444) para que también
  drillee (mirror de `onFeatureClick`/`commitScopeDrill`), no solo `setSelected`.
- Hover-preview sobre `HoverTip` (ya construido): al pasar el mouse por una fila
  (o unidad del mapa), un card con los números clave de esa provincia + "entrar".
  Cero clicks extra para el detalle.
- a11y: el drill por teclado + el foco revelan el preview (patrón de HoverTip).

### B. Fluidez / animación (la inversión grande — el héroe del instrumento)

Principio: para una herramienta cuyo producto ES entender patrones, la animación
—sobre todo la TEMPORAL— es el canal de información, no adorno. **Todo respeta
`prefers-reduced-motion` (duración 0, sin animación) como piso no negociable.**

**B1 · Fase 1 (fundación):**
- **Transiciones animadas de coropleta**: agregar `fill-color-transition` y
  `fill-opacity-transition` (duración ~300-400ms + easing) al paint de las capas
  de choropleth. Al cambiar período/modo/vista/asOf, los colores INTERPOLAN en
  vez de saltar — el ojo sigue QUÉ cambió (leer un patrón). Es feature nativa de
  maplibre (paint-property transitions); reduced-motion → duración 0.
- **Easing de cámara en el drill**: el drill live usa `flyTo`/`easeTo` (animado,
  ~600-800ms) en vez de un corte; el restore-desde-URL sigue con `jumpTo`
  (instantáneo, no se anima una recarga). Verificar qué método usa cada path y
  ajustar solo el drill live.
- **Piso reduced-motion**: un helper único (`useReducedMotion`) que apaga las
  transiciones de paint + el easing de cámara.

**B2 · Fase 2 (héroe — reproducción temporal fluida):**
- La reproducción hoy es frames discretos (refetch por frame). Con la
  `fill-color-transition` de B1, CADA frame ya interpola al aterrizar → play se
  ve animado. Fase 2 lo lleva más lejos: cadencia de frames más suave (prefetch
  del siguiente frame mientras se muestra el actual), control de velocidad, y el
  mapa animándose mientras corre.
- **Vista-ejemplar: zoonosis/brotes** — dinámica espacio-temporal real (ver un
  brote nacer y propagarse). Esterilización queda descartada (stock, sin drama).
- Riesgo/perf: nada de esto sirve sobre un mapa que tironea → 60fps primero
  (ver §perf).

**B3 · Fase 3 (pulido + salida):**
- Transiciones del hover-preview (fade, no snap) — se une con A2.
- Exportar un **frame** (imagen del cuadro actual) y/o una **secuencia** de la
  reproducción — el "exportar" de la identidad del producto.

### C. Control temporal (scrubber + selector)

**C1 · Selector de tiempo — pulido** (afecta el mapa vía la ventana):
- Arreglar la etiqueta YTD ("Año en curso" que se auto-describe "últimos 205
  días" — elegir UN encuadre).
- Anotar/colapsar presets que colisionan en silencio (3y=5y por span del seed —
  ver E-seed): deshabilitar o rotular "sin datos > N años".
- Granularidad menos arbitraria (hoy 90d→12m→3y→5y sin nada intermedio).

**C2 · Coherencia scrubber↔mapa** — YA hecho: P1.1 (aviso de escala anclada al
entrar) + P1.7 (el chip "último evento" aclara que no sigue el scrubber). La
animación B1/B2 lo hace brillar.

### D. Estructura de vistas (los lentes de misión del mapa)

**D1 · Consolidar vistas solapadas** (deliberación de PO, no bloquea código):
- Analizar los solapes reales (Brotes / Síntomas / Riesgo PPP / Cumplimiento
  comparten capas base/señal similares) en `src/modules/panorama/domain/presets.ts`.
- Proponer un set más filoso: cada vista = UNA pregunta de exploración clara
  (test: ¿un ministro la nombra sin confundirla con otra?). Fusionar las que
  fallen. Terminar de matar el KPI-bleed (P1.6 ya sacó denuncias de perdidas).
- Entregable: una propuesta de set + merges para que PO decida.

### E. Salida / exportar (el output del mapa)

**E1 · "Compartir vista"** = A1 arreglado (la URL reproduce el cuadro). Más:
un **frame/one-pager** exportable (alcance, período, capas, top-N, caveat de
privacidad, link) — la forma de sacar un patrón entendido del instrumento.

**E-seed (opcional, no-código):** P1.5 — el seed solo abarca ~2,6 años de
denuncias, así que 3y=5y dan idéntico. Si el demo lo necesita, backfill de filas
sintéticas más viejas para que las ventanas se distingan.

## Transversal

- **Reduced-motion + a11y**: piso en TODA animación (B1-B3). El drill/preview por
  teclado y foco funcionan (patrón HoverTip / drill existente).
- **Performance (60fps es el fundamento de la fluidez)**: la animación sobre un
  mapa que tironea es peor que nada. Revisar el warning WebGL `ReadPixels`
  (probablemente ruido GPU benigno, verificar) y que las capas repinten
  eficiente. Sin esto, B1/B2 no rinden.

## Secuencia sugerida

1. **A1 (deep-link)** — bug de misión, acotado, root cause listo.
2. **A2 (drill + hover-preview)** — UX puntual, ya tiene su primitiva (HoverTip).
3. **B1 (fundación de animación)** — transiciones de coropleta + easing de cámara + piso reduced-motion. Desbloquea el resto.
4. **B2 (reproducción héroe, zoonosis)** — la inversión que hace único al instrumento.
5. **C1 (selector de tiempo)** — pulido rápido.
6. **B3 (hover-preview transitions + export)** + **E1 (compartir/one-pager)**.
7. **D1 (consolidar vistas)** — deliberación PO en paralelo, no bloquea.

## Ya cerrado (referencia)

P1.1 (escala anclada al entrar) · P1.4 (cajón capado, no tapa el toggle) · P1.6
(perdidas sin denuncias off-mission) · P1.7 (tooltip "último evento") · P1.8
(severities es-AR + "acumulado").
