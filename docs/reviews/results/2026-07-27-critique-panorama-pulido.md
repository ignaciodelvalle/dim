# Crítica de diseño: Panorama — pulido y micro-estados (P4)

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4b, ficha P4. Lente: QA de
> diseño obsesivo sobre "pulido de lo existente". Desktop 1440 (capturas reales: 1512×950).
>
> **Evidencia**: `docs/reviews/results/2026-07-27-critique-screenshots/panorama/` — 12 PNG +
> `pan-index.json` + `perf.json`. **Limitación declarada**: 6 de los 12 PNG son
> byte-idénticos (`pan-entry` = `pan-entry-full` = `pan-drill-mid` = `pan-drill-settled` =
> `pan-back-settled` = `pan-FAIL-click`, mismo md5) — la secuencia de drill falló en captura
> y son todos el frame de entrada. Evidencia visual única: **7 imágenes** (entry, desierto,
> acceso, mortalidad, brotes, registros, referencias). Los estados **no capturados** —
> frame stale, celda censurada, capa truncada al tope, drill con nombres largos — se
> evaluaron **desde código** y cada veredicto lo declara. `consoleErrors: []` (limpio).
>
> **`[ENTORNO]`** (no criticable, regla §2 del plan): magnitudes sintéticas (149 denuncias,
> 75 mordeduras, 21 unidades suprimidas); sparsity del mapa en `pan-desierto.png` a zoom
> localidad (catálogo INDEC parcial); la cámara clavada en La Plata con alcance "Nacional"
> en desierto/acceso (estado residual del harness tras el drill fallido); y los VALORES
> exactos de los cortes de clase (salen de la distribución sintética) — aunque la REGLA de
> formateo que los muestra con decimales sí es del código y sí se critica.
>
> `perf.json` (cruce con P5, una sola línea): CLS 0,0102 — excelente, nada "salta" al
> cargar. Las 15 long tasks (1.754 ms total, máx. 271 ms) caen en la hidratación inicial:
> el único costo de pulido percibido es que los primeros hovers/clicks del funcionario
> pueden caer en una pausa. P5 lo profundiza; acá no se convierte en hallazgo.

---

## Impresión general

La consola tiene una arquitectura de micro-estados **excepcional para un producto de esta
edad**: cuatro naturalezas epistémicas de vacío (falló / medido-cero / protegido / sin
señal), estados vacíos que explican el porqué ("no es que no haya datos"), supresión k-anon
visible por ley en cuatro superficies, y un export cuyo scope viaja serializado dentro del
archivo. El esqueleto de honestidad está. Lo que falla es la **capa de terminación fina**:
el mismo número se formatea distinto según la superficie (hasta con punto decimal en una
consola es-AR), tres contadores distintos describen "cuántos datos hay" en el mismo panel
sin reconciliarse a la vista, la jerga k<5 solo se decodifica para el usuario de mouse
paciente, y los cortes de clase de una capa de CONTEOS muestran "6,8". Es el patrón típico
de un equipo que resolvió los problemas difíciles (epistemología, privacidad, a11y
estructural) y dejó pasar los fáciles (un `toFixed`, un nombre de archivo, una celda sin
de-énfasis). Todo lo que sigue es barato de arreglar y ninguno requiere rediseño.

---

## Checklist de micro-estados (los 10 focos, uno por uno)

### 1. Chip "k<5 protegido" — ¿explica o es jerga? · Veredicto: 🟡 explica solo al que hoverea

- Visible en TODOS los shots (leyenda inferior, `pan-entry.png` … `pan-registros.png`):
  pill con trama diagonal + "⊘ k<5 protegido". El fondo hatched replica la trama del mapa
  — buen puente visual (`LegendPill.tsx:211-220`).
- La explicación existe en tres lugares: `title` nativo ("Unidades con menos de 5 casos:
  valor suprimido por k-anonimato (Ley 25.326)", `LegendPill.tsx:217`), el panel expandido
  del pill (`PanoramaSuppressionNotice`, `PanoramaConsole.tsx:5002`) y la tab Referencias
  ("Protegido por privacidad (k<5)", `pan-referencias.png`).
- **Pero**: el texto del chip en sí es jerga pura ("k<5" no significa nada para el
  funcionario de ronda5), la decodificación por hover depende de un `title` nativo
  (delay del browser ~1 s, **invisible para teclado y touch**), y el chip es mobiliario
  permanente ("NEVER hidden") — no distingue "hay supresión en ESTA vista" de "existe la
  política": en `pan-entry.png` (burbujas, sin supresión activa) luce idéntico que en
  brotes con 21 unidades suprimidas. Un chip que parece indicador de estado pero es
  cartel institucional.

### 2. Celdas suprimidas y censuradas — ¿cómo se VEN? · Veredicto: 🟡 se distinguen leyendo, no escaneando; censurado no existe a nivel celda

- **Suprimida**: en la tabla Registros se ve como texto "Protegido (k<5)" alineado a la
  derecha en la columna VALOR (`pan-registros.png`, filas Almagro/Balvanera/Barracas) —
  correcto que nunca sea un número (invariante §5, `panorama-map-table.ts:87-92`). Pero se
  renderiza con **la misma clase que los valores reales** (`MapDataTable.tsx:309`, mismo
  color/peso que "8" y "42"): escaneando la columna, nada separa dato de dato-retenido. El
  popup fijado SÍ la de-enfatiza (`pano-pin-muted`, `map-popup.ts:186`) — la tabla quedó
  atrás de su propio sistema.
- **Sin dato**: se distingue textualmente ("Sin dato", `panorama-map-table.ts:90-91`) y en
  el mapa ("Sin datos (solo contorno)" vs trama, documentado en `pan-referencias.png`).
  La tricotomía valor/protegido/sin-dato existe y está bien separada semánticamente. ✔
- **Censurada** (`61649555`, "una cota no es un valor") — **evaluada desde código,
  no capturable**: hoy NINGUNA capa declara `censoredAtMax` (el rediseño del desierto lo
  retiró explícitamente — `src/modules/panorama/domain/layers.ts:536` "NO censoredAtMax"),
  así que la maquinaria está dormida. Cuando reviva: la leyenda compacta marca el extremo
  "≥N" (`panorama-labels.ts:195-200`) y el ranking muestra el aviso de empate en el tope
  ("el valor es un piso, no una diferencia", `PanoramaDataTable.tsx:364-375`, un `<output>`
  correcto) — pero SOLO si TODAS las filas están en el tope. Una mezcla (3 censuradas, 7
  medidas) renderiza las censuradas como números lisos indistinguibles de mediciones:
  `buildLayerReadout` no tiene estado `censored` (`map-popup.ts:121-159`), ni la tabla ni
  el popup pueden marcar "≥90" por celda. La cota vuelve a disfrazarse de valor en cuanto
  no es unánime.

### 3. ResultCount "mostrando N de M" y truncamientos de capa · Veredicto: 🔴 tres contadores sin reconciliar; el primitivo compartido no se usa

- `pan-registros.png` muestra el choque completo en una sola pantalla: tab **"Registros 0"**
  (badge), línea "Eventos en el período: **0 en 0 unidades** (+21 protegidas por
  k-anonimato)", y abajo "**72 filas**" sobre una tabla llena. (Nota de evidencia: el "24"
  que menciona la ficha aparece en `pan-desierto.png`; el shot de la tab Registros abierta
  corresponde a la vista Brotes y dice "0".) Cada número es individualmente honesto —
  0 eventos visibles, 21 unidades retenidas, 72 filas de valor-por-unidad — y el panel
  hasta lo explica en prosa (`PanoramaConsole.tsx:4017-4051`). Pero el QA obsesivo lee:
  "0", "0 en 0", "72". Tres respuestas a "¿cuánto hay acá?" a 60 px de distancia, sin una
  frase que las anude. El funcionario de 10 minutos concluye "está roto" o repite el número
  equivocado en la reunión.
- El primitivo **`components/ui/ResultCount.tsx` existe exactamente para esto** ("la misma
  tarea, doce redacciones" — su propio docstring) y Panorama no lo usa: "72 filas"
  (`MapDataTable.tsx:263`) no afirma si es todo o un corte ("Mostrando 72 de 72" habría
  cerrado la duda).
- **Truncamiento de capa (tope 2.000)**: en los shots no hay capa truncada (no capturado;
  evaluado desde código). La divulgación en pantalla vive SOLO como chip dentro del panel
  Capas (`LayerPanel.tsx:172-179`) — la tabla Registros, donde el operador lee los datos,
  no dice nada ("72 filas" secas), y el CSV sí lo confiesa como comentario `#`
  (`MapDataTable.tsx:118-120`). Divulgación fragmentada: honesta en el archivo, muda en la
  superficie de lectura. Además el copy del chip está roto: **"capá al máximo (2.000)"**
  (`LayerPanel.tsx:177`) no es español — "capá" es voseo imperativo de "capar", un tropiezo
  particularmente desafortunado en un producto veterinario. Debería ser "al tope (2.000)"
  o "capa truncada (2.000)".

### 4. Formatos es-AR — toda cifra de los shots · Veredicto: 🔴 un punto decimal vivo en código + cortes con decimales en conteos

Revisión cifra por cifra de los 7 shots: **lo agrupado, agrupa bien** ("2.184" en
`pan-acceso.png`, "1 – 49", "936", "45,6%", "33,9%", "+19 pts", "+30%", "149", "368" —
separador de miles con punto y coma decimal correctos). Las inconsistencias van en la
tabla de la sección siguiente; las dos graves:

- **"−15.6 pts" con PUNTO decimal** en la columna "Brecha vs meta" del ranking
  (`PanoramaDataTable.tsx:444`, `row.gap.toFixed(1)`) y en su preview de hover
  (`RankedRowPreview.tsx:47`) — mientras el popup, la tabla del mapa y el CSV usan
  `formatSignedGap` con es-AR correcto ("−15,6", `map-popup.ts:106-111`). El mismo número,
  con dos ortografías, en la misma consola. No visible en los shots (ninguno abre el
  ranking rate con brecha) — **hallazgo de código, verificado en la línea exacta**.
- **Cortes de clase con decimales para una capa de CONTEOS**: `pan-referencias.png` lista
  "< 5 / 5 – <6 / 6 – <6,8 / 6,8 – <16 / ≥ 16" bajo el título "Vacunaciones antirrábicas ·
  conteos por división". Un conteo jamás vale 6,4: el corte "6,8" es el cuantil
  interpolado crudo (`class-scale.ts:96-104`) que `formatBound` conserva con un decimal
  para |n| < 10 (`MapLegends.tsx:63-66`) sin mirar si la capa es entera. Y "5 – <6" es un
  intervalo que contiene un solo entero disfrazado de rango. `[ENTORNO]` en los valores,
  código real en la regla.

### 5. Overflow de nombres largos · Veredicto: 🟢 con reserva declarada — las tablas envuelven; el punto débil son las tarjetas KPI

- Tablas: ninguna celda usa `truncate` — "Santiago del Estero" o "Tierra del Fuego,
  Antártida e Islas del Atlántico Sur" envuelven a segunda línea (`MapDataTable.tsx:306-308`,
  `PanoramaDataTable.tsx:412`). El preview de ranking (256 px fijos) también envuelve.
  La leyenda compacta clampa a 2 líneas con historia previa de fix documentada
  (`LegendPill.tsx:114-125`). **No verificable en pixels** (los shots de drill fallaron;
  ninguna vista muestra esas provincias en tabla) — veredicto desde código, declarado.
- El overflow real y visible está en las **tarjetas KPI**: `pan-brotes.png` muestra
  "Cobertura antirrábica …" y "Señales de zoonosis (p…" + "activas hoy: 5 (rabia +
  mordeduras…" — dos truncamientos en una tarjeta, y el paréntesis que muere abierto
  esconde justo el calificador que distingue capas ("(perros, 12m)"). El label se recupera
  por `title` (`KpiChips.tsx:103`); la línea secundaria truncada NO tiene recuperación
  (`KpiChips.tsx:177` — el `title` de la tarjeta lleva label+método, no el secundario).

### 6. Tooltips — qué existe, delay, posición · Veredicto: 🟡 dos sistemas conviven; el bueno no llegó al rail

Inventario desde código:

| Superficie | Mecanismo | Delay | Teclado/touch |
|---|---|---|---|
| Rail derecho (7 íconos) | `title` nativo (`PanoramaRail.tsx:128`) | del browser (~1 s) | ✗ |
| Chips KPI (label, delta, "estado actual", "período") | `title` nativo (`KpiChips.tsx:103,112,154,163,170`) | del browser | ✗ |
| Chip k<5, pill demo, pill "Último evento", badges de capa | `title` nativo | del browser | ✗ |
| Filas del ranking | Card custom `role="tooltip"` fixed, anclada a la celda del label, Esc la cierra, focus la abre igual que hover (`PanoramaDataTable.tsx:248-285,457-471`) | instantáneo | ✔ |
| Unidad clickeada en mapa | Popup fijado `role="dialog"`, texto seleccionable (`map-popup.ts:172-207`) | click | ✔ |
| `components/ui/HoverTip.tsx` (el primitivo accesible del repo) | **sin usos en panorama** | — | — |

El patrón bueno (preview de ranking: posición calculada con flip en el borde, WCAG 1.4.13
dismissible, paridad hover/focus) demuestra que el equipo sabe hacerlo. Todo lo demás
quedó en `title`, que no tiene delay controlable, se ancla al cursor, y deja a teclado y
touch sin nada — en un rail cuyos íconos no tienen label visible (ver foco 10).

### 7. Focus visible y navegación por teclado del dock · Veredicto: 🟢 sólido — de lo mejor de la consola

- Anillo de foco global `:focus-visible` con tokens (`app/globals.css:466-475`) — ningún
  componente de panorama lo suprime.
- La barra de tabs del dock es **APG de manual**: `role="tablist"/"tab"/"tabpanel"`,
  roving tabindex real (`tabIndex={index === rovingIndex ? 0 : -1}`), flechas + Home/End,
  activación manual (foco no cambia panel hasta Enter/Space), `aria-controls` válido en
  ambos estados porque el tabpanel existe siempre (`PanoramaDock.tsx:76-116,166-236`).
- Headers ordenables como `<button>` reales con `aria-sort` (`PanoramaDataTable.tsx:317-335`);
  filas de ranking enfocables con preview por focus y `aria-describedby` correcto.
- Rail: Esc cierra restaurando foco al trigger, `aria-expanded`/`aria-controls`/
  `aria-pressed` completos (`PanoramaRail.tsx:88-105,128-133`). Único faltante: declara
  `role="toolbar"` pero no implementa navegación por flechas (APG toolbar = un tab stop +
  flechas); hoy son 7 paradas de Tab. Menor, y consistente.
- Anuncios `aria-live`/`<output>` en cambios de alcance, KPIs stale, capas degradadas
  (`PanoramaConsole.tsx:3797-3812,4955-4964`). Notable.

### 8. Export CSV — botón, feedback, nombre, scope · Veredicto: 🟡 el contenido es ejemplar; el envoltorio no

- **Scope en el header: SÍ, verificado** (`e1c0d396`). `viewScopeCsvHeaderLines`
  (`lib/ui/view-scope-descriptor.ts:479-496`) antepone el bloque `#`: mandato, vista
  (solo si se acotó), grano, corte temporal, digest de vista y la línea canónica
  re-parseable — cableado en ambos caminos (`MapDataTable.tsx:111` vía `buildMapTableCsv`;
  `PanoramaConsole.tsx:3591,4076`). El PNG lleva digest en el pie (`panorama-export.ts:78-80`).
  Y los comentarios `#` de truncamiento por capa viajan también. Esto es mejor que el
  estándar de la industria.
- **Feedback al click, asimétrico**: el camino del rail (ícono descargar →
  panel "Exportar" → "Exportar CSV") dispara toast "Descarga iniciada: panorama-mapa.csv"
  (`PanoramaConsole.tsx:4592`, fix Cowork B7) y su estado deshabilitado explica por qué
  ("No hay datos por unidad para exportar en esta vista", `:4598-4605`). El botón
  "Descargar CSV" de la tabla Registros (`pan-registros.png`, arriba a la derecha;
  `MapDataTable.tsx:264-272`) baja **el mismo artefacto en silencio** — un builder, dos
  affordances, un solo feedback.
- **Nombre de archivo**: estático **`panorama-mapa.csv`** en los dos caminos
  (`MapDataTable.tsx:267` con `filename="panorama-mapa"`; `PanoramaConsole.tsx:4588`).
  Dos exports de vistas distintas en el mismo día → `panorama-mapa (1).csv` en Descargas,
  y toda la reproducibilidad del header queda enterrada bajo un nombre que no dice ni
  alcance ni fecha. El descriptor que ya viaja adentro tiene todo para nombrar el archivo.

### 9. Badge "Datos de demostración" y "Último evento en el alcance" · Veredicto: 🟢 jerarquía correcta

- `pan-entry.png` (crop verificado): pill ámbar con borde warn ("Datos de demostración")
  junto a pill neutra de contorno ("Último evento en el alcance: 26/7, 05:39 p. m.").
  La advertencia pesa más que la procedencia — jerarquía de honestidad correcta, ambas
  ancladas al masthead que no scrollea (`PanoramaConsole.tsx:4702-4735`), ambas con
  `title` explicativo, y el comentario H7 muestra que el wording "en el alcance" está
  razonado (evita leer "Salta tiene datos viejos").
- Dos nits: la explicación de ambas vive solo en `title` (hover-only, ver foco 6), y la
  hora "05:39 p. m." — 12 horas CON cero a la izquierda — es un híbrido que es-AR no usa
  (o "5:39 p. m." o, mejor para un centro de situación, "17:39";
  `PanoramaConsole.tsx:4726-4732`, mismo patrón en `PanoramaKpiFooter.tsx:82`).
- El aviso stale-frame (**no capturado; evaluado desde código**): `<output>` warn, se
  renderiza junto al scrubber al pie del mapa (`PanoramaBoardNotices.tsx:39-46` →
  `scrubberDock`, `PanoramaConsole.tsx:3951`) — adyacente a la causa (el scrub), pero en
  `text-xs` al fondo del viewport mientras los números citables (KPIs) están arriba a la
  izquierda: en orden de lectura, el número llega antes que la confesión. Mitigado porque
  el refetch as-of de KPIs tiene SU aviso propio dentro de la columna de métricas
  ("No pudimos actualizar los indicadores…", `PanoramaConsole.tsx:4955-4964`) — ese sí se
  ve antes de citar. Nota adicional: el aviso de capa degradada vive DENTRO del panel
  expandible del pill de leyenda (`PanoramaConsole.tsx:5004-5012`) — honestidad detrás de
  un click, aunque el mapa muestra su propia carta all-suppressed (`all-suppressed-notice.tsx`).

### 10. Iconos de la columna derecha — ¿se autoexplican? · Veredicto: 🟡 convencionales salvo uno, pero sin red visible

De `pan-entry.png` + `railItems` en código: grilla (Vista), capas con badge numérico
(Filtro/Capas), calendario (Período), línea de tendencia (Línea de tiempo), descarga
(Exportar), refresh (Actualizar), info (Acerca). Descarga/refresh/info/calendario/capas se
autoexplican por convención. La **grilla para "Vista"** es el eslabón débil: lee como
"dashboard/apps", no como "elegir preset de análisis" — y es el PRIMER ícono, la puerta de
entrada conceptual. El badge sobre capas tiene nombre accesible propio ("ajustes sobre la
vista", `PanoramaRail.tsx:145-157`) — bien. Pero la única forma de conocer los nombres es
hover con `title` nativo (foco 6): el funcionario de touch o el apurado navegan a ciegas la
primera vez. Estados activo (fondo azul) y deshabilitado (40% + cursor) correctos;
"Actualizar" hasta cambia su label a "Actualizando…" (`PanoramaConsole.tsx:4639`).

---

## Formatos y microtipografía (tabla de inconsistencias)

| # | Dónde se ve | Qué muestra | Qué debería | Archivo:línea | Sev. |
|---|---|---|---|---|---|
| F1 | Ranking "Brecha vs meta" + preview de fila (no en shots; código) | `−15.6 pts` — punto decimal | `−15,6 pts` — reusar `formatSignedGap` (es-AR, minus Unicode) | `PanoramaDataTable.tsx:444`, `RankedRowPreview.tsx:47` | 🔴 |
| F2 | `pan-referencias.png`, clases de "conteos por división" | "5 – <6", "6 – <6,8", "6,8 – <16" | Cortes enteros para capas de conteo ("5", "6", "7 – 15", "≥ 16") | `MapLegends.tsx:63-66` + `class-scale.ts:96-104` | 🟡 |
| F3 | Pill masthead, todos los shots | "05:39 p. m." — 12 h con cero inicial | "17:39" (24 h, estándar estatal) o "5:39 p. m." | `PanoramaConsole.tsx:4726-4732`, `PanoramaKpiFooter.tsx:82` | 🟡 |
| F4 | Leyenda compacta, rama classed (latente; hoy los máximos son chicos) | `${Math.round(hi)}` sin agrupar → "12345" si supera mil | `toLocaleString("es-AR")` como ya hace la rama fallback (:204-205) | `panorama-labels.ts:185-199` | 🟡 |
| F5 | `pan-acceso.png` leyenda | "Acceso veterinario (actos/1.000) (conteo)" — doble paréntesis con unidades en conflicto | Un solo calificador: "Acceso veterinario · conteo" (la tasa /1.000 no es lo pintado en este modo) | título vía `legendRampTitle`/`countReadoutLabel` (`map-popup.ts:65,82-84`) | 🟡 |
| F6 | `pan-brotes.png` vs `pan-registros.png` vs `pan-referencias.png` | La misma capa con tres nombres: "Cobertura antirrábica (perros, 12m)" (dock y tabla), "Vacunaciones antirrábicas (conteo)" (leyenda), "Vacunaciones antirrábicas · conteos por división" (referencias) | Un nombre canónico por capa + un calificador de modo | registry de labels en `src/modules/panorama/domain/layers.ts` | 🟡 |
| F7 | Ranking vs tabla vs informe (código) | Precisiones mezcladas del mismo dato: "64%" (`Math.round`), "64,4%" (`maximumFractionDigits:1`), "−12 pts" (informe, redondeado), "−15,6" (popup, 1 decimal) | Una regla de precisión por métrica, compartida | `PanoramaDataTable.tsx:436`, `map-popup.ts:99`, `panorama-informe.ts:263` | 🟢 |
| F8 | Brecha ausente: tabla del mapa vs ranking (código) | `MapDataTable` deja la celda VACÍA (`row.gap ?? ""`); `PanoramaDataTable` pone "—" | Unificar en "—" visible + texto accesible "sin meta" (la lección de `438e40cb`: el cero/ausencia se DICE en la celda, no en un title invisible — acá ni title hay) | `MapDataTable.tsx:313-315` vs `PanoramaDataTable.tsx:444` | 🟢 |
| F9 | KPI deltas, `pan-brotes.png` | "+19 pts" — "pts" como abreviatura de puntos porcentuales | "p. p." (RAE) o glosario; al menos consistente en informe/preview (hoy sí) | `KpiChips.tsx:116` | 🟢 |
| F10 | Chip de truncamiento del panel Capas (código; no capturado) | "capá al máximo (2.000)" — copy rota (imperativo de "capar") | "al tope (2.000)" / "capa truncada (2.000)" | `LayerPanel.tsx:177` | 🟡 |

Verificados y CORRECTOS (para que el consolidado no los re-audite): miles con punto en
"2.184" (leyenda acceso, rama fallback con `toLocaleString`), badges de tab con
`toLocaleString` (`PanoramaDock.tsx:202`), coma decimal en "45,6%"/"33,9%"/"0,01",
minus Unicode "−" en brechas del popup, `tabular-nums` en columnas numéricas y badges,
"%" pegado al número de forma uniforme en toda la consola (convención interna consistente
— no es hallazgo), fechas "26/7" del pill.

---

## Usabilidad (tabla)

| # | Hallazgo | Evidencia | Archivo:línea | Sev. |
|---|---|---|---|---|
| U1 | Tres contadores sin reconciliar en el mismo panel: tab "Registros 0", "0 en 0 unidades (+21 protegidas)", "72 filas" — lectura de 10 s concluye "está roto" | `pan-registros.png` | `PanoramaConsole.tsx:4022-4038`, `panorama-map-table.ts:134-167`, `MapDataTable.tsx:263` | 🔴 |
| U2 | "Protegido (k<5)" en celda con idéntico estilo que un valor — no se distingue escaneando; el popup sí lo silencia (`pano-pin-muted`), la tabla no | `pan-registros.png` filas Almagro/Balvanera/Barracas | `MapDataTable.tsx:309` | 🟡 |
| U3 | Chip "⊘ k<5 protegido": jerga decodificada solo por `title` hover; nada para teclado/touch; no distingue "aplica ahora" de "existe la política" | todos los shots | `LegendPill.tsx:211-220` | 🟡 |
| U4 | `ResultCount` (primitivo compartido "Mostrando N de M") sin adoptar: "72 filas" no afirma completitud; el truncamiento al tope 2.000 solo se confiesa en el panel Capas y en el CSV, nunca en la tabla | `pan-registros.png`; código | `components/ui/ResultCount.tsx` (sin uso), `MapDataTable.tsx:263`, `LayerPanel.tsx:172-179` | 🟡 |
| U5 | Export CSV: nombre estático `panorama-mapa.csv` en ambos caminos + toast solo en el camino del rail (el botón de la tabla baja en silencio) | `pan-registros.png` botón "Descargar CSV"; `pan-entry.png` rail | `MapDataTable.tsx:264-272`, `PanoramaConsole.tsx:4588-4592` | 🟡 |
| U6 | Tarjetas KPI con doble truncamiento; la línea secundaria truncada no se recupera ni por hover | `pan-brotes.png` ("Señales de zoonosis (p…", "activas hoy: 5 (rabia + mordeduras…") | `KpiChips.tsx:121,177` | 🟡 |
| U7 | Tooltips de dos velocidades: `title` nativo (rail, chips, pills — delay browser, sin teclado/touch) conviviendo con el preview custom accesible del ranking; `HoverTip` del repo sin usar en panorama | código (foco 6) | `PanoramaRail.tsx:128`, `KpiChips.tsx:103` vs `PanoramaDataTable.tsx:457-471` | 🟡 |
| U8 | Celda censurada indistinguible de medición cuando el empate no es total (estado hoy dormido — ninguna capa declara `censoredAtMax`) | código; no capturable | `map-popup.ts:121-159` (sin estado censored), `layers.ts:536` | 🟡 |
| U9 | Aviso de capa degradada dentro del panel expandible del pill de leyenda — honestidad a un click de distancia | código | `PanoramaConsole.tsx:5004-5012` | 🟡 |
| U10 | Referencias documenta solo la capa coroplética: la capa de puntos activa ("Zoonosis / señales", visible como dots grises en el mapa) no tiene entrada en el panel "cómo leer" | `pan-referencias.png` (panel cierra tras "Sin datos"; la vista tiene 2 capas) | `MapLegends.tsx` (secciones render-derived) | 🟡 |
| U11 | ScaleControl de MapLibre sin skin: caja translúcida con borde negro default, se ve extraña sobre coropletas saturadas — el único control sin el sistema visual de la consola | `pan-acceso.png` ("5 km" gris sobre azul) vs `pan-entry.png` | `SituationalMap.tsx:598` (sin CSS para `maplibregl-ctrl-scale`) | 🟢 |
| U12 | `role="toolbar"` en el rail sin navegación por flechas (7 paradas de Tab); anillo de foco delegado al global (funciona, pero el botón Cerrar del panel trae su propio ring — dos criterios) | código | `PanoramaRail.tsx:113,138-142,213` | 🟢 |
| U13 | Ícono "Vista" (grilla) no se autoexplica como "elegir preset"; nombres del rail solo descubribles por hover | `pan-entry.png` columna derecha | `PanoramaConsole.tsx` railItems / `PanoramaRail.tsx:128` | 🟢 |
| U14 | Fallback "—" como nombre de unidad sin label (unidad anónima en tabla) — sin explicación si llegara a renderizarse | código | `panorama-map-table.ts:56` | 🟢 |

---

## Lo que funciona bien

No tocar; citarlo como referencia en otros scopes:

1. **Los vacíos con naturaleza epistémica** — `rankingEmptyState` distingue falló /
   medido-cero / protegido / sin-señal con copy que enseña ("Sin señales no es lo mismo que
   sin problema", `PanoramaDataTable.tsx:182-222`); la tabla del mapa explica el vacío por
   zoom ("no es que no haya datos", `MapDataTable.tsx:202-215`). Es el mejor patrón de
   micro-estados del producto.
2. **El dock como tablist APG completa** — roving tabindex, flechas, activación manual,
   `aria-controls` estable (`PanoramaDock.tsx`). Y el preview de ranking con paridad
   hover/focus + Esc (`PanoramaDataTable.tsx:248-285`).
3. **El scope que viaja en el CSV** (`viewScopeCsvHeaderLines`) y el digest en el pie del
   PNG: artefactos que se auto-describen, con línea canónica re-parseable
   (`lib/ui/view-scope-descriptor.ts:479-511`).
4. **La privacidad visible en capas redundantes** — trama en mapa, chip permanente,
   fila-resumen del ranking, "(+N protegidas)" en el conteo, carta all-suppressed sobre el
   canvas. La política nunca es invisible (el problema del foco 1 es de decodificación, no
   de presencia).
5. **El panel Exportar consolidado**: cada acción con su nota de alcance debajo, estado
   deshabilitado que explica por qué, "· copiada" inline en Copiar vista
   (`PanoramaConsole.tsx:4550-4634`).
6. **Jerarquía de los avisos de honestidad del masthead** (demo ámbar > procedencia neutra)
   y el aviso stale de KPIs dentro de la columna de métricas, junto a los números que
   califica.
7. **CLS 0,0102** — la carga no empuja nada; el esqueleto respeta el layout final.

---

## 3 Prioridades con fix + archivo

1. **🔴 Erradicar el punto decimal de la brecha** — reemplazar los dos `row.gap.toFixed(1)`
   por el `formatSignedGap`/`toLocaleString("es-AR", { maximumFractionDigits: 1 })` que ya
   existe en `map-popup.ts:106-111` (exportarlo y consumirlo), de modo que ranking, preview,
   popup, tabla e informe impriman la misma brecha con la misma ortografía.
   **Archivos**: `components/panorama/PanoramaDataTable.tsx:444`,
   `components/panorama/RankedRowPreview.tsx:47` (y unificar la precisión de
   `panorama-informe.ts:263` en la pasada). Esfuerzo: minutos; riesgo: nulo (tests de
   snapshot de texto).

2. **🔴→🟡 Reconciliar los tres contadores del panel Registros** — (a) adoptar
   `ResultCount` para la línea de la tabla ("Mostrando 72 de 72 valores por unidad" — y
   con capa truncada, la variante capped "los primeros N — hay más" + hint), (b) sumar las
   protegidas al badge o a su `title` ("0 (+21 protegidas)"), y (c) de-enfatizar la celda
   "Protegido (k<5)" (color `text-ln-op-mute` + mini-ícono de trama, como ya hace el popup
   con `pano-pin-muted`) para que la columna se escanee. Con eso "0 / 0-en-0 / 72" deja de
   leerse como contradicción y el truncamiento por fin aparece donde se leen los datos.
   **Archivos**: `components/panorama/MapDataTable.tsx:263,309`,
   `components/panorama/PanoramaConsole.tsx:4022-4038` (badge:
   `PanoramaDock.tsx:200-204`), `components/ui/ResultCount.tsx` (consumo). De paso:
   corregir "capá al máximo" en `components/panorama/LayerPanel.tsx:177`.

3. **🟡 Nombre de archivo del CSV + feedback simétrico** — derivar el filename del
   descriptor que el archivo ya lleva adentro: `panorama-<scope-slug>-<AAAA-MM-DD>[-<digest>].csv`
   (helper puro junto a `viewScopeCsvHeaderLines`), usarlo en ambos caminos y agregar el
   mismo toast del rail al "Descargar CSV" de la tabla. Dos exports de vistas distintas
   dejan de pisarse en Descargas y ambos botones confirman.
   **Archivos**: `components/panorama/MapDataTable.tsx:267` (prop `filename` ahora
   derivada), `components/panorama/PanoramaConsole.tsx:4067,4588-4592`,
   `lib/ui/view-scope-descriptor.ts` (helper de slug).

*(Cuarta en cola si entra en la tanda: cortes enteros para capas de conteo —
`MapLegends.tsx:63-66` recibiendo `valueKind` y redondeando+deduplicando breaks.)*

---

**Balance**: 2 🔴 · 12 🟡 · 6 🟢 (20 hallazgos; F1/U1 son los dos rojos). Ningún
hallazgo requiere rediseño: es deuda de terminación sobre una arquitectura de estados que
ya es la referencia interna del producto.
