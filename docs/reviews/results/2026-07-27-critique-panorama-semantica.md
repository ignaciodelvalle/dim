# Crítica de diseño: Panorama — semántica del delta (P1)

> **Encargo**: ficha P1 del plan 2026-07-26 (= focos de C7 §4). Persona: **funcionario
> curioso** — mira 10 minutos, cree lo que ve, repite lo que entendió en una reunión.
> Vara: cada elemento que pueda inducir una **frase falsa en esa reunión** es un hallazgo.
>
> **Evidencia**: bundle `results/2026-07-27-critique-screenshots/panorama/` (7 capturas
> distintas; `pan-entry`, `pan-entry-full`, `pan-drill-*`, `pan-back-settled` y
> `pan-FAIL-click` son byte-idénticas — el drill falló y esos estados no existen en el
> bundle). Código: `src/modules/panorama/domain/layers.ts`, `presets.ts`, `ranking.ts`,
> `caption.ts`, `view-state-caption.ts`; `components/panorama/PanoramaConsole.tsx`,
> `panorama-console-helpers.ts`, `panorama-labels.ts`, `SituationalMap.tsx`,
> `MapDataTable.tsx`, `PanoramaDataTable.tsx`, `KpiChips.tsx`, `map-popup.ts`.
>
> **Declaraciones de alcance**:
> - El **frame temporal (asOf)** no está capturado → su aviso se evalúa desde código y
>   se marca como tal (§Usabilidad F-12).
> - El **dock está colapsado en todos los shots de preset** → el ranking "Peores N" y el
>   panel Estadísticas se evalúan desde código y se marca (F-11).
> - **Secuencia de cámara**: los presets se capturaron tras un drill fallido + back; en
>   `pan-desierto`/`pan-acceso`/`pan-brotes` la cámara quedó clavada en AMBA/La Plata
>   (escala 5 km). La *persistencia* de cámara la juzga P2; acá solo se juzga si el
>   estado resultante **comunica su alcance** (F-7).
> - `[ENTORNO]` no criticable y no criticado: sparsity de drill a localidad (catálogo
>   parcial), volumen sintético (~12.8k mascotas), chip "Datos de demostración". Los
>   valores puntuales (45,6%, 67–79, etc.) son sintéticos; los hallazgos son
>   estructurales, no de datos.

## Impresión general

La consola dice la verdad en las capas profundas y la contradice en la superficie que el
funcionario lee primero. El trabajo semántico del 25-26/07 es real y está bien hecho
*donde se hizo*: la polaridad existe como concepto de dominio (`higherIsBetter`,
`ranking.ts`), el desierto ahora mide algo que discrimina, los renombres honestos
("Vacunaciones antirrábicas (conteo)") existen, y los estados vacíos distinguen
"protegido" de "nadie reportó". Pero la **última milla** — la leyenda colapsada, el
caption del dock, los endpoints del ramp, las tiles KPI — quedó fuera del delta: es
exactamente ahí donde el funcionario de 10 minutos forma la frase que va a repetir. En
2 segundos la pantalla de entrada (pan-entry) sí funciona: selector → vista → 2 KPIs →
mapa con una burbuja dominante → leyenda → dock; "¿por dónde empiezo?" tiene respuesta
(la burbuja más grande). El problema no es densidad: es que tres de los números más
citables de la pantalla (rango de leyenda, período del dock, KPI truncado) inducen
frases falsas.

## Lo que el funcionario se lleva a la reunión (frase por preset)

| Preset (captura) | Frase que se lleva | ¿Correcta? |
|---|---|---|
| Bienestar y fiscalización (`pan-entry.png`) | "149 denuncias de bienestar en los últimos 90 días, concentradas en Buenos Aires; 175 activas acumuladas." | **CORRECTA** — KPI con tag PERÍODO, acumulado aclarado, burbuja mayor legible. |
| Desierto veterinario (`pan-desierto.png`) | "El desierto veterinario nacional es del 45,6%." | **FALSA** — 45,6% es la *cobertura antirrábica* (KPI truncado "Cobertura antirrábica …"); la vista no titula su propio número (F-5). |
| Desierto veterinario (`pan-desierto.png`) | "Entre el 67% y el 79% de las mascotas del país no recibe atención veterinaria." | **DOBLEMENTE FALSA** — 67–79 son breaks interiores del clasificador, no el rango real (24,6→80,7 según `layers.ts:532-534`) (F-3); y es "sin atención **registrada** en MiMAR", matiz que el label de la leyenda omite (F-2). |
| Acceso veterinario (`pan-acceso.png`) | "Las zonas oscuras son las peor atendidas — ahí están los desiertos." | **INVERTIDA** — en el estado capturado el oscuro es 2.184 (más actos = mejor servido/más poblado). Nada en la leyenda dice cuál punta es la buena (F-1). |
| Mortalidad (`pan-mortalidad.png`) | "368 muertes en los últimos 90 días; por provincia van de 4 a 15." | **DOBLEMENTE FALSA** — es un stock de estado actual (la card dice "Estado actual", el dock dice "últimos 90 días": gana el dock porque acompaña al número 368 del badge) (F-4); y 4–15 son breaks, no el rango (F-3). |
| Brotes activos (`pan-brotes.png` + `pan-registros.png`) | "No hay registros de brotes en el período: la tab dice Registros 0." | **FALSA** — hay 13 señales (KPI) y 21 unidades protegidas por k-anonimato; el badge de la tab dice "0" sin calificar (F-6). |

Cuatro de seis frases citables son falsas o invertidas. Esa es la medida del hallazgo.

## Usabilidad (tabla)

| # | Sev. | Hallazgo | Evidencia | Archivo | Fix propuesto |
|---|---|---|---|---|---|
| F-1 | 🔴 | **La leyenda de acceso-veterinario no declara polaridad y el oscuro cambia de bando con el zoom.** A nivel provincia el ramp se invierte (oscuro = menos actos = peor); a nivel división `computeClassScale` nunca recibe `invert` y pinta conteos crudos (oscuro = más mascotas atendidas). `higherIsBetter` aparece UNA vez en todo SituationalMap (línea 1415, solo ruta provincial). La leyenda capturada — "Acceso veterinario (actos/1.000) (conteo) · 5 → 2.184" — es además autocontradictoria (tasa + conteo en el mismo título, porque `acceso-veterinario` es la única capa de conteo-fallback SIN `countLabel`). | `pan-acceso.png` (leyenda inferior; oscuro en 2.184) | `SituationalMap.tsx:1415` vs `1462/1488`; `layers.ts:399-440` (sin `countLabel`); `panorama-labels.ts:146-148` | Declarar el fallback: `countLabel: "Mascotas con acto veterinario"` en la capa; sumar palabra de polaridad a los endpoints del pill (`panorama-labels.ts:163-209`, p. ej. min "menos atención" / max "más atención"); decidir UNA convención (oscuro = alarma) y pasar `invert` también a la rama de división, o no reutilizar el mismo ramp para el conteo. |
| F-2 | 🔴 | **El label del desierto pierde el "registrada".** La leyenda dice "% de mascotas sin atención"; el caption de dominio dice "sin atención veterinaria **registrada**" y la description insiste: "la ausencia de registro no implica ausencia de atención". El label — la línea más leída — contradice la nota de honestidad de su propia capa. La *dirección* sí se autoexplica ("sin atención" no se lee como cobertura al revés): el problema es el overclaim, no la polaridad. | `pan-desierto.png` (leyenda) | `layers.ts:546` (label) vs `:548` (description) y `:582` (caption.measure) | Label → "Desierto veterinario (% sin atención registrada)". |
| F-3 | 🔴 | **Endpoints de leyenda = breaks interiores en choropleths provinciales: el rango publicado es falso.** La rama sin `divisionLegend` usa `liftedBreaks[0]`/`[último]` como min/max — el propio comentario documenta el caso vivo ("Mortalidad pintaba 1..63 bajo una leyenda 2 … 6") pero el fix solo cubrió la rama de división. Mortalidad muestra "4 … 15"; desierto "67 … 79" contra un rango real nacional 24,6→80,7. Es superficie exportable (PNG con sello). | `pan-mortalidad.png`, `pan-desierto.png` (leyendas) | `panorama-labels.ts:177-201` (esp. 185-188) | Pasar los extremos reales de los features provinciales (como ya hace la rama división) — el `provinceSeqLegend` puede cargar min/max además de breaks. |
| F-4 | 🔴 | **Dos relojes en la misma pantalla: la card dice "Estado actual", el dock dice "últimos 90 días".** `explainViewState` tiene la rama `allLayersAreCurrentState` (el CRÍTICO de QA ronda 5 se arregló ahí); `buildViewMeta.periodLabel` no la tiene y estampa el período del picker sin condición. El dock además nunca declara el corte asOf. El número más citable (368, badge Registros) queda pegado al reloj equivocado. | `pan-acceso.png`, `pan-mortalidad.png` (card vs esquina inferior derecha del dock) | `panorama-console-helpers.ts:492-517` (esp. 511) vs `view-state-caption.ts:131-134,154`; `PanoramaConsole.tsx:3985` | Computar `periodLabel` con la misma regla ("estado actual" cuando toda capa activa es current-state) y sumar "· al {fecha}" cuando `asOf` está activo. |
| F-5 | 🟡 | **La vista desierto/acceso no titula su propio número y muestra KPIs de polaridad opuesta, truncados.** "45,6% Cobertura antirrábica …" (truncado, pierde "(perros, 12m)") + "33,9% esterilización" junto a un mapa "% sin atención 67–79": tres porcentajes irreconciliables (100−45,6 ≠ 67–79) sin puente. El gap está *declarado en comentario* de código ("KNOWN GAP, stated rather than hidden") — invisible para el funcionario. | `pan-desierto.png`, `pan-acceso.png` (columna KPI) | `presets.ts:381-383,446-450`; `KpiChips.tsx:121` (`truncate`, recuperación solo por `title`) | Crear el KpiId propio (desierto %/actos por 1.000) o una línea reconciliadora ("El mapa mide ausencia; estas tiles miden cobertura"); reemplazar truncado por wrap en labels de 2 líneas. |
| F-6 | 🟡 | **"Registros 0" / "Eventos en el período: 0 en 0 unidades (+21 protegidas por k-anonimato)" / "72 filas" con valores 8 y 42 — cuatro números sin puente.** El contador y la nota son honestos uno a uno, pero el badge de la tab dice "0" pelado: leída de izquierda a derecha la pantalla parece contradecirse (KPI 13 señales vs Registros 0). | `pan-brotes.png` (badge), `pan-registros.png` (contador + tabla) | `PanoramaConsole.tsx:4023-4037` (contador), `:3583-3586` (`dockBadgeCount`) | Calificar el badge cuando hay supresión total ("0·prot." o tooltip "0 publicables · 21 protegidas"), o computarlo como filas de tabla cuando el total de eventos es 0 pero hay unidades. |
| F-7 | 🟡 | **El caption declara "Nacional · todas las provincias" mientras el mapa muestra un recorte de La Plata a 5 km.** [Secuencia declarada: cámara heredada de un drill fallido — la persistencia es de P2.] Lo que es de P1: ninguna superficie distingue *scope de datos* de *encuadre de cámara*. En `pan-acceso`/`pan-brotes` la nota "Indicadores: total del alcance… El mapa muestra el detalle por localidades" mitiga; en `pan-desierto` (capa province-only) no hay nota alguna y un screenshot compartido de esa pantalla dice "así está el país" mostrando calles vacías. | `pan-desierto.png` (escala 5 km + caption nacional) vs `pan-acceso.png` (con nota) | `PanoramaConsole.tsx:4896-4898` (screenExplanation), `view-explanation-screen.ts` | Cuando el viewport no contiene el scope declarado, calificar: "Encuadre parcial del mapa — los datos siguen siendo {scope}". |
| F-8 | 🟡 | **"⊘ k<5 protegido" es jerga en el punto de máxima visibilidad.** La explicación buena existe — "N celdas con menos de 5 casos ocultas por privacidad (k-anonimato)" — pero está a un click (expandir leyenda) o en Referencias ("Protegido por privacidad (k<5)"). El funcionario entiende que le *protegen algo*, no qué ni por qué; "k<5" puede leerse hasta como flag de calidad de datos. | `pan-desierto.png`, `pan-acceso.png`, `pan-brotes.png` (chip), `pan-referencias.png` | `LegendPill.tsx:6` y test :73; `PanoramaSuppressionNotice.tsx:58-62` (la buena copy) | Chip → "⊘ <5 casos · protegido" + `title` con la frase completa de PanoramaSuppressionNotice. |
| F-9 | 🟡 | **Tres nombres para la misma capa en una pantalla** — card "Cobertura antirrábica (perros, 12m)", leyenda "Vacunaciones antirrábicas (conteo)", Referencias "Vacunaciones antirrábicas · conteos por división", KPI "Cobertura antirrábica … 45,6%". El renombre honesto (countLabel) es correcto en sí; lo que falta es el puente "son la misma capa, mostrada como conteo". Además los buckets de Referencias — "5 – <6", "6 – <6,8" — son decimales sobre conteos enteros: parecen un error y son incitables ("hay divisiones con 6,8 vacunaciones"). Lo perceptual del ramp es de P3; el sinsentido semántico de los cortes es de acá. | `pan-brotes.png`, `pan-referencias.png`, `pan-registros.png` | `layers.ts:344-350` (countLabel), `MapLegends.tsx:257-266` | Sub-línea en Referencias ("= Cobertura antirrábica, en conteos a este nivel"); redondear breaks de capas de conteo a enteros en `class-scale.ts`. |
| F-10 | 🟢 | **"Brecha vs meta": diseño correcto, dos detalles.** La columna solo aparece cuando alguna fila tiene meta (en el estado capturado — conteos por barrio — está oculta: correcto); celda vacía ≠ 0 ("un 0 leería como 'exactamente en meta'"); signo −=debajo de la meta con menos tipográfico real, y el popup da el ancla ("meta 80% · −15,6"). Faltan: la unidad en el header (¿puntos porcentuales?) y consistencia con el chip del ranking que escribe "−N pts". | `pan-registros.png` (columna ausente con conteos, correcto) | `MapDataTable.tsx:74-78,290-316`; `map-popup.ts:104-117` | Header → "Brecha vs meta (pts)"; unificar formato con el chip del ranking. |
| F-11 | 🟢 | **Ranking "Peores N" — evaluado desde código, NO capturado (dock colapsado en todos los shots).** Lo cableado está bien: polaridad pasada en los 3 puntos (consola → `rankWorstUnits`/`rankUnitsInScope` → tabla), orden por defecto ascendente para higher-is-better, heading que nombra el criterio y renuncia a "Peores" cuando ordena volumen ("Mayor volumen N · métrica" + "un conteo no es un nivel"). **Riesgo residual PLAUSIBLE**: la guarda `rankLocalityRateCount` solo mira `dataType === "rate"`; acceso-veterinario es `density`, así que a nivel división su ranking ordenaría conteos ascendentes bajo "Peores 10 · acceso veterinario (actos/1.000)" — coronando al barrio más chico. Mismo agujero raíz que F-1 (el fallback de conteo de acceso no está declarado en ningún eje). | — (no capturado; se declara) | `ranking.ts:92-94,153-189`; `PanoramaConsole.tsx:3404-3405,3433,3445,4126`; `PanoramaDataTable.tsx:288-293,342-346` | Extender la guarda de coerción a capas `valueKind: "rate"` con fallback de conteo, no solo `dataType === "rate"`. |
| F-12 | 🟢 | **Frame temporal (asOf) — evaluado desde código, NO capturado.** El aviso es multi-superficie y llega antes del número: la card dice "al {fecha} (tiempo de {validez\|transacción})", las tiles stock cambian a badge warn "ESTADO ACTUAL · NO VARÍA CON LA FECHA", un `<output>` confiesa el frame que no cargó, el informe imprime "Situación al {fecha}", y colapsar el dock parkea el frame a live (no puede quedar un corte sin control visible). El único agujero es el dock caption (ya contado en F-4): con asOf activo seguiría diciendo "últimos 90 días" sin corte. | — (no capturado; se declara) | `view-state-caption.ts:157-160`; `KpiChips.tsx:147-157`; `PanoramaBoardNotices.tsx:39-46`; `panorama-console-helpers.ts:531-548`; `panorama-informe.ts:223-227` | Cubierto por el fix de F-4. |

## Jerarquía visual

- **La entrada está bien jerarquizada** (`pan-entry.png`): título de sección → selector
  de alcance → vista → KPIs → mapa → leyenda → dock. El elemento dominante (burbuja
  mayor) coincide con la respuesta a la pregunta del preset. En 2 segundos se sabe qué
  es y dónde mirar.
- **El número más grande de cada vista no es el número de la vista** (F-5): en desierto
  el 45,6% en bold es *otra* métrica; el dato que da nombre a la vista vive solo en la
  leyenda, en cuerpo chico. La jerarquía tipográfica le da el podio al inquilino
  equivocado.
- **La polaridad no tiene NINGÚN portador verbal**: se codifica solo en el orden del
  ramp (provincia) y el orden del ranking (no capturado). Para las dos capas invertidas
  el peso jerárquico de "cuál punta es mala" es cero (F-1). El único lugar del sistema
  donde la polaridad se *dice* es el endpoint "…% meta" de las capas con meta.
- El caption del dock (esquina inferior derecha, mudo y gris) es sin embargo el texto
  que ancla los números del badge — y es el que miente sobre el período (F-4). Lo de
  menor jerarquía visual es lo de mayor jerarquía semántica: mala asignación.

## Consistencia

- **Dos builders de caption con reglas distintas** para la misma información
  (`explainViewState` con rama estado-actual y corte asOf; `buildViewMeta` sin ninguna)
  — F-4. El precedente interno ya existía: `caption.ts:33-45` documenta que el mismo
  dato ("últimos 1095 días" vs "últimos 3 años") divergió entre superficies y se unificó;
  esta es la misma clase de bug, un par de superficies más allá.
- **El renombre honesto de conteo es inconsistente por omisión**: cobertura,
  esterilización, microchip, ppp y antiparasitario tienen `countLabel`; acceso — la capa
  que MÁS lo necesita por ser la invertida — no (F-1).
- **Tres redacciones del chip k-anon** ("⊘ k<5 protegido" / "Protegido (k<5)" /
  "Protegido por privacidad (k<5)") y una cuarta, la buena, escondida en la expansión
  (F-8).
- **Formato del gap**: "−15,6" en tabla, "meta 80% · −15,6" en popup, "−N pts" en chip
  de ranking (F-10). Direccionalmente coherentes, tipográficamente tres dialectos.
- La dedup de captions (9861b872) **no rompió la completitud**: vista + scope + período
  siguen todos presentes una vez cada uno (pill de scope, card de vista, dock). Lo que
  quedó es la contradicción de período entre card y dock (F-4), no un faltante.

## Accesibilidad

- **Bien**: tabla accesible con `caption` sr-only y `aria-sort`; celdas protegidas con
  texto ("Protegido (k<5)"), nunca color solo; avisos en `<output>`/`aria-live`;
  `tabular-nums` en columnas; menos tipográfico real en gaps; los empty states explican
  causa (zoom/protegido/sin datos) en texto.
- **Labels truncados con recuperación solo-hover** (F-5): el `title` es inalcanzable en
  touch y el texto visible queda amputado también para lectores con baja visión que
  agrandan fuente. "Señales de zoonosis (p…" no es un label accesible.
- **La polaridad es solo-color/solo-orden** (F-1): un usuario daltónico que no separa
  bien los extremos del ramp azul no tiene NINGÚN texto que diga cuál punta es la buena;
  un usuario de lector de pantalla recibe los valores de la tabla accesible sin la
  dirección ("peor = menos" no se anuncia en ningún lado). La palabra de polaridad del
  fix de F-1 es también el fix de a11y.
- El canvas WebGL delega su accesibilidad a Registros — correcto — pero entonces el
  badge "Registros 0" (F-6) es la *puerta* accesible a los datos anunciando que no hay
  nada.

## Lo que funciona bien

- **La cadena de polaridad del ranking** (dominio → consola → tabla, con el bug del
  re-sort cazado y documentado) y el heading que renuncia a "Peores" cuando el orden es
  volumen, con la nota "un conteo no es un nivel: más registros no significa peor
  situación" — la mejor frase del producto.
- **La epistemología de los vacíos**: "protegido" ≠ "nadie reportó" ≠ "es el zoom, no el
  mundo" ("Alejá el mapa… no es que no haya datos"). Y "21 unidades del alcance SÍ
  reportaron, pero mostrarlas identificaría casos".
- **El popup "meta 80% · −15,6"** — ancla + signo + magnitud en cinco palabras.
- **`captionFor`**: "Cada área es una provincia. Relleno = …, últimos 90 días. Meta 80%."
  — plantilla honesta que hasta degrada bien a "conteo por unidad (no porcentaje)".
- **El desierto como %** es una mejora enorme sobre "días sin actividad": todas las
  provincias discriminan, el 100% es medible, no hay censura que disclamar; y la
  dirección de "sin atención" se entiende sola (solo falta "registrada", F-2).
- **La nota de alcance** "Indicadores: total del alcance (Nacional…). El mapa muestra el
  detalle por localidades" — exactamente el puente que falta generalizar (F-7).
- **`indice-territorial` con meta definicional 100**: el endpoint "100% meta" hace que la
  capa invertida *diga* su polaridad — la prueba de que el patrón del fix de F-1 ya
  existe en el sistema.
- Los badges de base temporal por tile (ESTADO ACTUAL / PERÍODO / 12 MESES FIJOS) y el
  parkeo del frame asOf al colapsar el dock.

## 3 Prioridades

1. **Que las capas invertidas digan su polaridad donde se lee** (F-1 + F-2, 🔴):
   `countLabel` para acceso-veterinario y "registrada" en el label del desierto en
   `src/modules/panorama/domain/layers.ts` (líneas 411 y 546); palabra de polaridad en
   los endpoints del pill en `components/panorama/panorama-labels.ts:163-209` (patrón ya
   probado por "…% meta"); `invert` también en la rama de división de
   `components/panorama/SituationalMap.tsx` (~1462/1488) o convención única
   oscuro=alarma. Extender la guarda de coerción del ranking a `valueKind: "rate"`
   (`PanoramaConsole.tsx:3404-3405`) cierra F-11 de paso.
2. **Un solo reloj por pantalla** (F-4 + F-12, 🔴): darle a `buildViewMeta`
   (`components/panorama/panorama-console-helpers.ts:492-517`) la misma rama
   estado-actual que `view-state-caption.ts:131-134` y el sufijo "· al {fecha}" con asOf
   activo. Un helper compartido de "frase temporal del view" mata la clase entera de
   bug (tercera recurrencia documentada: #14 del 07-23, CRÍTICO ronda 5, esta).
3. **Endpoints de leyenda veraces en choropleths provinciales** (F-3, 🔴):
   `components/panorama/panorama-labels.ts:177-201` debe recibir los extremos reales de
   los datos provinciales (hoy solo la rama división los tiene) — es la superficie que
   se exporta con sello de Estado, y el propio comentario del archivo ya describe el
   incidente que esta rama todavía reproduce.
