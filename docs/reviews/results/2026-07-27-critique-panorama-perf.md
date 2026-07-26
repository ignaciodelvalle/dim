# Crítica P5 — Performance percibida, medida · Consola Panorama

- **Fecha**: 2026-07-27 · **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4b, ficha P5
- **Superficie**: `/admin/panorama` (Centro de Situación Nacional), build de producción local
- **Datos primarios**: `docs/reviews/results/2026-07-27-critique-screenshots/panorama/perf.json`
  (Playwright + PerformanceObserver, dos corridas: cold / warm de server, contexts frescos)
- **Evidencia de código**: verificada sobre el working tree al momento de esta crítica.

## Perfil de performance: Panorama (P5)

### Números

| Métrica | Cold | Warm | Umbral | Veredicto |
|---|---:|---:|---|---|
| TTFB | 66 ms | 49 ms | — (referencia < 800 ms) | ✅ Sano |
| DOMContentLoaded | 581 ms | 130 ms | — | ✅ Sano |
| Load event | 582 ms | 335 ms | — | ✅ Sano |
| **LCP** | 660 ms | 292 ms | < 2.500 ms | ✅ Holgado (pero ver §Método: server local) |
| **CLS** | 0,0102 | 0,0102 | < 0,1 | ✅ Excelente |
| Canvas del mapa visible | 865 ms | 660 ms | — (métrica propia) | ✅ Aceptable para el flagship |
| JS requests | 33 | 33 | — | ✅ Razonable (ver §El peso) |
| JS transferido | 591 KB | 591 KB | — | ⚠️ Alto para una consola interna; ~48 % es maplibre (lazy) |
| Transfer total | 1.079 KB | 1.079 KB | — | ⚠️ Idem |
| Long tasks (cantidad) | 15 | 12 | — | ⚠️ |
| Long tasks (total) | 1.754 ms | 1.252 ms | — | ⚠️ Main thread ocupado ~1,3–1,8 s durante el arranque |
| **Long task máxima** | **271 ms** | **210 ms** | < 200 ms (presupuesto de una interacción) | ❌ **INP en riesgo** |
| Tab "Registros" (click→settle) | 69 ms | 74 ms | < 200 ms | ✅ Sano |
| Drill click→idle | `null` | `null` | < 200 ms | ⛔ **Dato faltante** — el script no encontró el target del click (ver `pan-FAIL-click.png`); no se puede afirmar nada del drill |

Lectura rápida: **las métricas de carga (LCP, CLS, TTFB) pasan con holgura; la métrica en
riesgo es INP**, que este harness no mide directamente — pero las long tasks son su proxy
y ahí está el problema.

### Lectura: dónde está el riesgo real

**El riesgo es la hidratación del monolito, no la carga.** `components/panorama/PanoramaConsole.tsx`
tiene **5.080 líneas** (`wc -l` hoy; el plan citaba 5.064 — drift menor de la semana), es un
único client component (`"use client"` en línea 1, `export function PanoramaConsole` en línea
211) con **17 `useState`** y ~187 llamadas a hooks en un solo cuerpo de función. Su padre
`PanoramaShell.tsx` es server component (sin directiva), así que **toda la consola —dock,
tabla, KPIs, scrubber, leyendas— hidrata como una sola unidad de trabajo de React**: React no
puede cortar la hidratación de un componente por la mitad. Eso es consistente con lo medido:
12–15 long tasks que suman 1.252–1.754 ms en el arranque, con una máxima de 271 ms (cold) /
210 ms (warm). A eso se le suma la instanciación de maplibre (parse de estilo, capas GeoJSON,
patrón de hatching) que llega al canvas a los 660–865 ms.

**Por qué INP y no LCP.** El presupuesto "bueno" de INP es 200 ms. Un click del operador que
caiga dentro de la long task de 271 ms espera esos 271 ms *antes* de que su handler siquiera
corra — el presupuesto entero de la interacción se consume en cola. En este hardware la
ventana de exposición es ~1–2 s tras el primer paint; en una notebook de gobierno esa ventana
se estira (ver §Método). El dato sano de contraste: **una vez hidratada, la consola responde
bien** — el tab Registros settlea en 69–74 ms. El problema no es el runtime en régimen, es el
pico de arranque.

**Qué está sano y no hay que tocar:**

- **El mapa ya va lazy, y doblemente.** `SituationalMapDynamic.tsx` (líneas 13–27) usa
  `next/dynamic` con `ssr: false`, y adentro `SituationalMap.tsx:465` hace
  `import("maplibre-gl")` dinámico; el CSS de maplibre (línea 96) viaja dentro de ese mismo
  chunk. Verificado en build: el chunk de maplibre (`33ef75ef.5b09dd4542c52c9c.js`, 1.047 KB
  raw / ~274 KB gz) **no figura** en el manifest eager de `/admin/panorama/page`. No proponer
  "lazy del mapa": ya está hecho y bien hecho.
- **CLS 0,0102 no es suerte.** El skeleton del mapa es un canvas oscuro con
  `min-h-[440px]` dentro del sizer `h-full` (`SituationalMapDynamic.tsx:20-24`) — reserva el
  espacio y no flashea blanco. No tocar.
- **El shell streamea.** `app/admin/panorama/page.tsx:75` envuelve el board en `Suspense` con
  `PanoramaBoardSkeleton`, el seed de KPIs va como promise sin await y la capa se sirve con
  budget (`PAGE_BUDGET_MS = 9000`). TTFB 49–66 ms y DCL 130 ms warm confirman que el lado
  server está resuelto.
- **Las fuentes no bloquean.** `app/layout.tsx` carga Encode Sans + IBM Plex por
  `next/font/google` con `display: "swap"`, self-hosted desde `/_next/static`. Sin render
  blocking de fuentes; el CLS medido lo corrobora.

### El peso (591 KB de JS)

Composición verificada contra `app-build-manifest.json` y los chunks del build
(`.next/static/chunks/`, 8,5 MB totales para *todas* las rutas):

| Pieza | Tamaño | Eager/Lazy |
|---|---:|---|
| maplibre-gl (`33ef75ef.…js`) | 1.047 KB raw / **~274 KB gz** | **Lazy** (fuera del manifest; carga apenas monta la consola) |
| Ruta `/admin/panorama` — 21 chunks del manifest | **~284 KB gz** | Eager |
| — de los cuales: `57d681f4-…js` (vendor React/Next) | 169 KB raw / 53 KB gz | Eager |
| — `76678-…js` (vendor compartido) | 170 KB raw / 45 KB gz | Eager |
| — `25576-…js` (**contiene PanoramaConsole**) | 151 KB raw / 41,5 KB gz | Eager |
| polyfills (fuera del manifest) | 113 KB raw / ~39 KB gz | Eager |

La aritmética cierra: 284 (eager) + 274 (maplibre) + ~39 (polyfills) ≈ **~597 KB gz** vs
591 KB medidos. Conclusiones:

- **~48 % del JS de la página es maplibre.** Es el costo del flagship cartográfico y ya está
  detrás de la frontera lazy correcta; su costo real no es la red sino el **parse/compile de
  1 MB raw + la instanciación del mapa**, que contribuye a las long tasks post-hidratación.
- **Los 33 requests no son fragmentación patológica.** Son los 21 chunks del manifest +
  runtime/loading/page + el chunk lazy del mapa, sobre HTTP/2 multiplexado con el chunking
  granular estándar del App Router. Consolidarlos no movería ninguna métrica medida; no
  perseguir esto.
- `next.config.ts` ya declara `optimizePackageImports: ["lucide-react", "recharts",
  "maplibre-gl"]`. Nota: **recharts no aparece en el manifest de panorama** (el
  `CalendarHeatmap` del panorama es custom, `calendar-heatmap-grid.ts`) — el chunk de
  recharts del build pertenece a otras rutas. No atribuirle peso acá.

### Método y límites

Nota de honestidad metodológica — esto va con el doc, no en letra chica:

1. **Hardware cloud ≠ notebook del funcionario.** Estas corridas salieron de un contenedor
   cloud con CPU y disco muy por encima del parque típico de una oficina provincial. Los
   números valen como **relativos** (entre interacciones, entre cold/warm, contra sí mismos
   tras un fix), no como absolutos de campo.
2. **"Warm" es warmth del server Next, no caché del browser.** Cada corrida usa un context
   fresco de Playwright (así lo declara el propio `perf.json`); la mejora warm (LCP 660→292,
   DCL 581→130) mide caches del lado server, no la experiencia de segunda visita real con
   HTTP cache.
3. **Sin throttling de CPU ni de red.** Con una CPU 4× más lenta —normal en una notebook de
   gobierno de 5 años— la long task de 271 ms se proyecta a **>1 s**, y la suma de 1,75 s de
   long tasks a varios segundos de main thread bloqueado. Eso es **extrapolación, no
   medición**: la Prioridad 3 propone convertirla en medición.
4. **Una sola página, una sola interacción medida.** Solo `/admin/panorama` con su preset
   default; la única interacción cronometrada fue el tab Registros. **El drill click no se
   midió** (el selector del script no encontró el target — `drillClickToIdleMs: null`,
   captura `pan-FAIL-click.png`); ese dato falta y esta crítica no lo inventa.
5. **INP no se midió directamente** (requiere interacciones reales bajo carga); las long
   tasks son proxy. El veredicto "INP en riesgo" es inferencia fundada, pendiente de
   confirmación con web-vitals en campo.

### 3 Prioridades

1. **Partir la unidad de hidratación del monolito** — `components/panorama/PanoramaConsole.tsx`
   (5.080 líneas, 17 `useState`, un solo `"use client"`). Extraer a client components propios
   las subtrees que no participan del primer paint —los tabs del dock (Registros / tabla /
   informe), `SavedViewsPopover`, `TimeScrubber`— montándolas con `next/dynamic` o diferidas
   post-mount (`useEffect` + `requestIdleCallback`), de modo que React hidrate el frame del
   mapa + KPIs primero y el resto en tasks separadas y cortas. Criterio de aceptación
   medible: re-correr este mismo script y que **ninguna long task supere 200 ms** (hoy: 271).
2. **Cerrar el dato faltante: drill e INP reales.** (a) Corregir el selector del drill en el
   script de P5 y re-correr para obtener `drillClickToIdleMs` — es LA interacción del
   flagship y hoy no tiene número. (b) Agregar un reporter liviano de `web-vitals` (`onINP`,
   `onLCP`) gated a demo/staging en el layout de `/admin`, para que el próximo ciclo tenga
   INP de campo en vez de proxys. Archivos: script de la crítica (re-run) +
   `app/admin/layout.tsx` para el reporter.
3. **Corrida con throttling como gate, no como anécdota.** Repetir el harness con CDP
   `Emulation.setCPUThrottlingRate(4)` (+ red "Fast 3G" opcional) y fijar presupuesto:
   LCP < 2,5 s y long task máx < 200 ms **bajo throttling**. Convierte la extrapolación del
   §Método en medición y le pone un techo verificable al crecimiento del console (que ya
   drifteó 5.064→5.080 líneas en una semana). Archivo: el script Playwright de P5,
   idealmente commiteado a `scripts/` como utilidad repetible.

---

**Veredicto en 3 líneas:** La carga del Panorama está bien resuelta —LCP 292–660 ms, CLS
0,0102, mapa lazy de verdad, skeleton sin saltos— y no hay que tocar nada de eso. El riesgo
real es INP: la hidratación del client component único de 5.080 líneas más el boot de maplibre
producen 12–15 long tasks (máx 271 ms) que en una notebook de gobierno se proyectan a >1 s de
main thread bloqueado justo cuando el operador empieza a clickear. Partir la unidad de
hidratación, medir el drill que faltó y repetir con CPU 4× son las tres jugadas; el peso
(591 KB, ~48 % maplibre) es el costo asumido del flagship y está bien pagado.
