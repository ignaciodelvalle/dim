# Panorama — revisión B: las 5 vistas restantes + el shell de la consola

> Fecha: 2026-07-25 · Rama `integration/all-20260703` · Servidor de producción local `http://localhost:3000`
> Alcance: `?preset=mortalidad`, `perdidas-reunificacion`, `desierto-veterinario`, `tendencia`, `riesgo-ppp`
> **más el shell compartido por las 11 vistas** (alcance, tiempo, rail derecho, dock inferior, deep-linking)
> **más** la comparación `/admin/panorama` vs `/gob/panorama` con un funcionario real acotado.
>
> Revisión adversarial, read-only. Toda afirmación está anclada a una captura o a código citado.

---

## 0. Método y evidencia

Se manejó el navegador con `scripts/qa-vis.ts` contra el servidor vivo, con dos identidades:

- `admin@dim.test` — SUPERADMIN, alcance universal.
- `govt@dim.test` — GOB, jurisdicción acotada (Tierra del Fuego, Santa Cruz, CABA). Este es **el usuario que importa**: el funcionario provincial/municipal real.

Capturas en `C:/Users/ignac/.claude/jobs/ef3dba5c/tmp/panB/`:

| Archivo | Qué muestra |
|---|---|
| `panB-01-mortalidad.png` | Vista Mortalidad, marco nacional |
| `panB-02-perdidas.png` | Vista Pérdidas y reunificación |
| `panB-03-desierto.png` | Vista Desierto veterinario (90d) |
| `panB-04-tendencia.png` | Vista Tendencia (30d vs 30d) |
| `panB-05-riesgo-ppp.png` | Vista Riesgo PPP (bivariado) |
| `panB2-10-dock-estadisticas.png` | Dock expandido, pestaña Estadísticas |
| `panB3-20-rail-capas.png` | Rail → Capas del mapa |
| `panB3-21-rail-periodo.png` | Rail → Período |
| `panB3-22-rail-timeline.png` | Rail → Línea de tiempo (reproducción temporal) |
| `panB3-23-rail-exportar.png` | Rail → Exportar |
| `panB3-24-rail-acerca.png` | Rail → Acerca |
| `panB4-30-scope-open.png` | Selector de alcance abierto |
| `panB5-40-cordoba-perdidas.png` | Deep link con `?province=AR-X` |
| `panB5-41-desierto-12m.png` | Desierto con `?period=12m` |
| `panB6-50-gob-govt-mortalidad.png` | **`/gob/panorama` con funcionario acotado** |
| `panB6-51-gob-govt-riesgo.png` | Riesgo PPP degradado por falta de jurisdicciones |
| `panB7-60-dock-referencias.png` | Dock → Referencias (cortes de clase) |
| `panB7-61-dock-registros.png` | Dock → Registros (tabla por unidad) |

Cero errores de consola en las cinco corridas. La consola es **técnicamente sólida**; los problemas de esta revisión son de **encoding, honestidad de escala y encuadre de producto**, no de estabilidad.

---

## 1. El shell de la consola — lo que comparten las 11 vistas

El shell es, con diferencia, la mejor pieza del sistema. Vale la pena decirlo antes de romperlo.

### 1.1 Selector de alcance (`panB4-30-scope-open.png`)

**Escenario.** Marta, directora de Zoonosis de la Provincia de Córdoba, entra a Panorama después de una consulta del Ministro. Necesita pasar de "el país" a "mi provincia" a "Río Cuarto" sin perder la vista que estaba mirando.

**Cómo ayuda de verdad.** El pill de alcance abre un panel con `JURISDICCIÓN → Provincia (24 opciones) → Localidad`, con la nota "También podés hacer clic en una provincia del mapa". La caída a la provincia funciona y hace tres cosas correctas a la vez:

1. reencuadra la cámara (`z=6.36` sobre Córdoba),
2. **cambia la granularidad del mapa** de "Provincias" a "Departamentos/partidos" (badge on-canvas),
3. **recalcula los KPI al alcance** y lo declara: *"Indicadores: total del alcance (Córdoba). El mapa muestra el detalle por departamentos/partidos."*

Ese tercer punto es el que casi ningún tablero de gobierno hace bien. Acá está resuelto y declarado.

**Dónde falla.**

- El selector de provincia es un `<select>` nativo de 25 opciones en orden aproximado de padrón (`Todas, CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza…`), no alfabético ni por región. Un funcionario de La Rioja tiene que barrer 18 renglones. No hay búsqueda por tipeo, no hay agrupación NOA/NEA/Cuyo/Patagonia/Centro, no hay "mis jurisdicciones" arriba para el usuario acotado.
- **No hay comparación multi-jurisdicción.** El alcance es un embudo (nacional → 1 provincia → 1 localidad). Marta no puede decir "Córdoba vs Santa Fe vs Entre Ríos" — que es literalmente la pregunta que le va a hacer el Ministro. El único camino es el ranking del dock, que ordena pero no permite elegir el conjunto.
- Con un alcance **no contiguo**, la cámara se rompe: el funcionario `govt@` tiene Tierra del Fuego + Santa Cruz + CABA, y el encuadre resultante es un rectángulo gigante de Patagonia y océano con **CABA fuera de pantalla** (`panB6-50-gob-govt-mortalidad.png`). La única jurisdicción con datos reales queda visible solo en el inset. Es un caso de uso perfectamente normal (autoridad sanitaria con varias delegaciones) y el mapa no lo soporta.

### 1.2 Controles de tiempo (`panB3-21-rail-periodo.png`, `panB3-22-rail-timeline.png`)

**Escenario.** Marta tiene que responder si la situación de julio es peor que la de abril, y después tiene que poder demostrar en un expediente *qué se sabía el 3 de julio*.

**Cómo ayuda de verdad.** Dos controles distintos, bien separados:

- **Período** (rail → calendario): `7 días · 30 días · 90 días · 12 meses · Año en curso · 3 años · 5 años · Personalizado…`. Ocho opciones, cubre desde lo operativo hasta lo plurianual. El pie del dock declara el período activo en texto ("últimos 90 días", "último año").
- **Línea de tiempo** (rail → gráfico, o pestaña del dock): "REPRODUCCIÓN TEMPORAL" con scrubber, botón de play, eje de fechas, ventanas rápidas (`última semana / último mes / último trimestre`) y — esto es lo importante — un selector de **base temporal**:

  > `BASE: [Cuándo ocurrió] [Según lo conocido al momento]`

  Eso es **bitemporalidad explícita** (tiempo de ocurrencia vs. tiempo de conocimiento) expuesta como control de usuario. Es exactamente lo que un auditor, un juzgado o una Auditoría General necesita para distinguir "el brote existía" de "el Estado lo sabía". No conozco otro tablero público argentino que lo exponga. **Es el activo de venta más fuerte de todo Panorama** y hoy está escondido detrás de un ícono sin etiqueta.

  El aviso al pie también es honesto: *"Las capas sin dimensión temporal se atenúan durante la reproducción."*

**Dónde falla.**

- **La leyenda desaparece durante el scrub.** Al abrir la pestaña Línea de tiempo, el dock ocupa la mitad inferior y el pill de leyenda del mapa (`Tendencia de eventos · -86 … 86`) queda tapado (`panB3-22-rail-timeline.png`). El momento en que MÁS se necesita saber si la escala está bloqueada es justo cuando se reproduce el tiempo, y es el único momento en que la escala no se ve.
- El scrubber ocupa una tarjeta de ~230 px y debajo hay ~250 px de blanco puro. La mitad inferior de la pantalla se sacrifica por un control que cabe en un tercio.
- `Escape` cierra los popovers del rail (Capas, Período, Exportar) pero **no** colapsa el dock de línea de tiempo: quedó abierto en los cinco pasos siguientes de la corrida. Inconsistencia de cierre.
- No hay comparación de dos momentos lado a lado. Se puede reproducir, no se puede contrastar "junio vs julio" en la misma pantalla — que es la forma en que realmente se lee un informe.

### 1.3 Rail derecho

Siete botones, todos con `aria-label` (accesibilidad correcta), **ninguno con etiqueta visible**: `Vista · Capas del mapa · Período · Línea de tiempo · Exportar · Actualizar · Acerca`. Un funcionario que entra una vez por trimestre tiene que hacer hover sobre siete íconos para encontrar "Exportar".

- **Capas del mapa** (`panB3-20-rail-capas.png`) — panel con `BASE — UNA A LA VEZ` (14 capas) + `SEÑAL — UNA A LA VEZ` + referencias. Dos defectos concretos:
  1. **El texto está cortado a la derecha.** Todas las descripciones se truncan a mitad de palabra: *"sobre el tot"*, *"(insumo"*, *"meta 80%)"*. Visible en cada renglón de la captura. El panel es `w-[22rem]` con `overflow-y-auto` pero sin manejo del desborde horizontal.
  2. **Solo la capa activa muestra su conteo** (`21 · 3 supr.`). Las otras 13 no dicen nada. El operador no puede saber cuáles tienen datos sin activarlas de a una — y hay al menos una (`cobertura`) documentada en `presets.ts` como que **pinta un mapa vacío**. Descubrir el vacío por prueba y error es el peor onboarding posible.
- **Exportar** (`panB3-23-rail-exportar.png`) — la pieza mejor resuelta del rail: `Copiar vista` (enlace con vista + alcance + período), `Vistas guardadas`, `Exportar CSV`, `Exportar PNG` (con nota de método al pie) e **`Informe de situación`** (imprimible/PDF con indicadores, ranking y método). El verbo EXPORTAR declarado está cumplido de punta a punta.
- **Acerca** (`panB3-24-rail-acerca.png`) — declara el denominador global (*"67.519 mascotas en cobertura · denominador de las tasas (activas o perdidas)"*), la marca temporal del dato y el estado `Datos en vivo`. Higiene metodológica correcta.
- **Actualizar** — refresca. Sin indicación de antigüedad del caché en el propio botón (el dato de frescura vive arriba a la derecha, "Último evento en el alcance").

### 1.4 Dock inferior

Cuatro pestañas + `Expandir/Colapsar`, con el resumen del estado siempre visible a la derecha ("Nacional · todas las provincias · últimos 90 días · 1 capa"). Ese resumen persistente es excelente: nunca se pierde el contexto de lo que se está mirando.

- **Estadísticas** (`panB2-10-dock-estadisticas.png`) — heatmap de "Actividad por día" + **"Ranking de unidades"** con hover que ubica la fila en el mapa y clic que entra a la jurisdicción. El mensaje cuando la capa no es temporal es honesto: *"Activá una capa con dimensión temporal (denuncias, mordeduras, pérdidas, síntomas o zoonosis) para ver la actividad por día."*
- **Registros** (`panB7-61-dock-registros.png`) — tabla cruda por unidad, con conteo de filas, `Descargar CSV` y encabezado explícito: *"Registros (estado actual): 154 en 20 unidades"*. Que el mapa y la tabla sean la misma verdad, y que la tabla sea navegable por teclado, es un logro de accesibilidad real.
- **Referencias** (`panB7-60-dock-referencias.png`) — los cortes de clase del choropleth. Ver §7.1: acá está la falla más grave del sistema.
- **Línea de tiempo** — el scrubber descrito arriba.

### 1.5 Deep-linking

**Funciona, y bien** — dentro de un rol.

`/admin/panorama?preset=perdidas-reunificacion&province=AR-X&period=90d` reconstruye vista + alcance + período, y la URL se enriquece con la cámara (`&z=6.36&lat=-32.299&lng=-63.771`). `?encoding=bivariate` también round-trippea. `Copiar vista` está en el panel de Exportar.

**Falla grave — el enlace no cruza roles.** Un funcionario `govt@` que abre `/admin/panorama?preset=mortalidad` **es redirigido a `/gob`** (el panel de jurisdicción), no a `/gob/panorama`. Se pierden vista, alcance y período: aterriza en una pantalla completamente distinta.

```
goto /admin/panorama?preset=mortalidad  (sesión govt@dim.test)
→ location.href = "http://localhost:3000/gob"
```

Es decir: **si un analista de Nación le manda a un director provincial el link de la vista que acaba de analizar, el director no ve esa vista.** Para una herramienta cuyo verbo declarado es EXPLORAR/ENTENDER/EXPORTAR entre organismos, esto rompe el caso de uso central.

### 1.6 `/admin/panorama` vs `/gob/panorama`

Con la **misma identidad admin**, las dos rutas son prácticamente idénticas: mismos 15 controles con `aria-label`, mismos KPI, mismos 154 registros de mortalidad. Diferencias: el badge (`· UNIVERSAL` vs `· NACIONAL`) y un chip `Datos de demostración` extra en `/gob`.

Con un **funcionario acotado** aparece la diferencia real:

| | `/admin/panorama` (admin) | `/gob/panorama` (govt acotado) |
|---|---|---|
| Alcance | Nacional · todas las provincias | Tierra del Fuego, Santa Cruz, CABA |
| Botón de reencuadre | "Vista nacional" | **"Volver a mi jurisdicción"** |
| Extra en rail | — | **"Ver tus 3 jurisdicciones"** |
| Navegación lateral | Padrón, Adopciones, Moderación, Auditoría, Sistema | Vigilancia, Pérdidas, Mortalidad, Operativos, Decomisos, Denuncias |
| Registros (mortalidad) | 154 en 20 unidades | **3** |
| Mapa | choropleth de 20 provincias | **completamente vacío** |

**El hallazgo que importa:** para el funcionario acotado, la vista Mortalidad **no pinta nada**. Ninguna provincia recibe color; la leyenda se reduce a un swatch sin números y al chip `⊘ k<5 protegido`. La supresión k=5 es correcta y necesaria — pero su efecto es que **Panorama se queda sin instrumento exactamente en la escala donde opera el municipio y la provincia chica**. Un director de Zoonosis de Ushuaia abre la herramienta insignia y ve un mapa gris.

Y el sistema, cuando degrada, lo dice bien (`panB6-51-gob-govt-riesgo.png`):

> "La intensidad de reporte combinada necesita al menos 6 jurisdicciones con datos comparables en ambas capas; en esta vista hay menos (por supresión de privacidad o falta de datos)."

Honestidad impecable. Pero implica que **la vista bivariada insignia es estructuralmente inaccesible para todo operador con menos de 6 jurisdicciones** — es decir, para todos los municipios y casi todas las provincias. Riesgo PPP es, de hecho, una vista solo para Nación.

**Duplicación de rutas.** Dos URLs renderizan la misma consola. ¿Cuál cita un funcionario en un expediente? ¿Cuál se pega en un correo interjurisdiccional? Hoy no hay respuesta, y §1.5 muestra que elegir mal rompe el enlace.

---

## 2. Vista **Mortalidad** (`?preset=mortalidad`)

**La pregunta declarada:** *"¿Dónde se concentra la mortalidad registrada de mascotas?"*

### El escenario

Ricardo, coordinador del Programa de Tenencia Responsable de la Provincia de Buenos Aires, recibe un pedido de informe: *¿hay algún distrito con mortalidad anómala de mascotas registradas?* Abre Mortalidad, marco nacional, 90 días.

### Cómo ayuda

- Un choropleth provincial de 20 unidades con datos + 4 sin datos, y el total del alcance (154) como KPI titular.
- El ranking del dock ordena correctamente por la métrica de la vista (`Peores 10 · Mortalidad registrada`): Buenos Aires 63, CABA 19, Córdoba 14, Corrientes 7, Santa Fe 6…
- La tabla de Registros da las 20 filas exportables, y el hover sobre una fila la ubica en el mapa.

Antes de esto, "mortalidad registrada por jurisdicción" no existía como superficie navegable en ningún lado. Eso es valor real.

### Los artefactos de mapa

Choropleth de relleno sólido clasificado en 5 clases (ColorBrewer Blues, luminancia decreciente), supresión `hatched`, inset de CABA con "valor provincial", badge de granularidad "Provincias".

### Dónde falla — con evidencia

**F-1 (crítico). La leyenda colapsada miente sobre el rango.** El pill dice **`Mortalidad / disposición  2 ▮▮▮▮ 6`** (`panB-01-mortalidad.png`). Un funcionario lee eso como "el rango nacional va de 2 a 6 muertes". El rango real, según la propia tabla de Registros de la misma pantalla, va de **1 (Jujuy, La Pampa) a 63 (Buenos Aires)**.

La causa está en `components/panorama/panorama-labels.ts:177-180`:

```ts
const lo = Math.round(liftedBreaks[0]);
const hi = isMeta ? … : Math.round(liftedBreaks[liftedBreaks.length - 1]);
```

`liftedBreaks` son los **cortes interiores** de la escala clasificada, no el mínimo y el máximo del dato. Con `CLASS_COUNT = 5` hay 4 cortes; el pill imprime el primero y el último y los presenta como extremos de una rampa. La clase superior es abierta (`≥`) y no se señala como tal.

**F-2 (crítico). El mapa aplana un rango de 9× en un solo color.** La pestaña Referencias (`panB7-60-dock-referencias.png`) revela los cortes reales:

```
< 2 | 2 – <3 | 3 – <4,4 | 4,4 – <6,2 | ≥ 6,2 | Sin datos
```

En la clase `≥ 6,2` caen Buenos Aires (63), CABA (19), Córdoba (14) y Corrientes (7). **Cuatro provincias con una diferencia de 9× reciben exactamente el mismo azul.** El mapa es visualmente incapaz de mostrar que Buenos Aires concentra el 41% de toda la mortalidad registrada del país. La política de quantile está optimizada para "contraste balanceado" y, sobre una distribución con cola larga, borra la señal principal.

**F-3 (grave). Conteos crudos sin normalizar.** Buenos Aires (17 M habitantes) y Formosa se comparan por número absoluto. "Dónde se concentra la mortalidad" responde, previsiblemente, "donde hay más mascotas registradas". Ni el toggle `percapita` (que `bienestar` sí declara) ni el denominador del padrón están disponibles en esta vista. La conclusión que un funcionario va a sacar es tautológica.

**F-4 (grave). El pie del dock dice "últimos 90 días"; la capa es de estado actual.** La descripción del panel es correcta (*"estado actual"*), la capa está declarada `temporal: false`, y sin embargo el resumen del dock imprime **"Nacional · todas las provincias · últimos 90 días · 1 capa"**. El selector de período está activo y no cambia nada. Un funcionario que exporte esta vista va a titular su informe "mortalidad de los últimos 90 días" y va a estar publicando un stock acumulado.

**F-5 (medio). La mitad del nombre de la capa no existe.** La capa se llama "Mortalidad **/ disposición**" y la tabla titula la columna "MORTALIDAD / DISPOSICIÓN (CONTEO)". En ninguna parte de la vista hay dato de disposición (cremación, enterramiento, trazabilidad). El panel `/gob` sí tiene "Disposición trazable de fallecimientos 25,0% — Obligación: CABA: Ley 5470". La vista promete una dimensión regulada que no entrega.

**F-6 (medio). Las 4 provincias faltantes son un agujero epistémico.** Referencias las etiqueta simplemente `Sin datos`. Pero "sin datos" puede significar: cero real medido, supresión k<5, o que la provincia no carga. El modelo epistémico declarado del producto tiene cuatro naturalezas (*medido-cero / sin-señal / protegido / censurado*) y la leyenda las colapsa a un gris.

---

## 3. Vista **Pérdidas y reunificación** (`?preset=perdidas-reunificacion`)

**La pregunta declarada:** *"¿Cuántas mascotas perdidas se están reencontrando con su familia?"*

### El escenario

Laura, secretaria de Ambiente de un municipio del conurbano, quiere saber si el registro sirve para lo único que la vecina le pregunta en la calle: *si se me pierde el perro, ¿me lo devuelven?* Y quiere poder comparar su distrito con el de al lado.

### Cómo ayuda

Es, conceptualmente, **la vista más valiosa de las cinco**: mide un **resultado para el ciudadano**, no un insumo administrativo. La tasa de reunificación es la métrica que justifica la existencia del padrón entero ante un intendente.

- Símbolos graduados rojos por unidad (volumen de pérdidas) con un punto teal inscripto (tasa de reunificación).
- KPI: `116 Activas` + `9,4% Tasa de reunificación`, contra `TARGETS.REUNIFICATION_PCT`.
- Al bajar a Córdoba: `7 Activas`, `7,1%` de reunificación, mapa por departamentos, 200 registros.

### Los artefactos de mapa

Símbolo graduado (densidad) + símbolo graduado (tasa) superpuestos. Leyenda: `Pérdidas / avistajes · 1 – ● 210 · ● Reunificación · ⊘ k<5 protegido`.

### Dónde falla — con evidencia

**F-7 (crítico). El ranking contesta la pregunta equivocada.** El dock muestra **`PEORES 10 · REPORTES DE MASCOTAS PERDIDAS`**: Córdoba 210, Buenos Aires 205, Santa Fe 106… Eso es un ranking de **volumen de pérdidas**, es decir, de tamaño de padrón. La vista pregunta por **reunificación**, y el "peores 10" no ordena por reunificación.

La causa es de una línea: `presets.ts` define `rankBy` justamente para esto (`brotes-activos` y `riesgo-ppp` lo usan), y `perdidas-reunificacion` **no lo declara**, así que cae al `base` (`perdidas`). Córdoba aparece como "la peor" cuando lo único que dice el dato es que Córdoba tiene mucha gente con mascota registrada. Un funcionario que lea ese ranking va a sacar exactamente la conclusión opuesta a la correcta.

**F-8 (crítico). El símbolo teal no tiene escala.** La leyenda para reunificación es **un punto de color, sin dominio numérico**. El tamaño del símbolo codifica la tasa 0–100 (según `layers.ts`), pero la leyenda no dice qué tamaño es 10% y cuál es 60%. En `panB-02-perdidas.png` los puntos teal son visualmente casi idénticos entre provincias. **La variable que da nombre a la vista es indescifrable en el mapa.**

**F-9 (grave). El símbolo compuesto se lee mal.** Un anillo rojo grande con un punto teal chico adentro se percibe como "oclusión" (el rojo tapa al teal), no como dos escalas independientes. El ojo no puede separar magnitud absoluta de tasa cuando una está inscripta en la otra. Dos provincias (`panB-02-perdidas.png`, arriba en Jujuy y en La Pampa) muestran teal **sin** anillo rojo: pérdidas suprimidas pero tasa visible — un estado que la leyenda no explica y que puede leerse como "reunificación sin pérdidas".

**F-10 (grave). Tres números distintos para lo mismo, en la misma pantalla.** `Registros 1.202` (dock) · `116 Activas` (KPI) · `210` (máximo provincial de la leyenda) · `210` (Córdoba en el ranking). Ninguno está definido en pantalla. ¿1.202 son eventos de pérdida + avistaje de las dos capas? ¿116 son episodios abiertos hoy? Un funcionario que tenga que citar "las pérdidas del trimestre" no sabe cuál número usar, y va a elegir el más grande.

**F-11 (medio). 9,4% no tiene contexto de meta en el mapa.** El KPI compara contra `TARGETS.REUNIFICATION_PCT`, pero el mapa no ancla el color a esa meta (es densidad, no tasa divergente). No se puede ver *qué jurisdicciones están por encima y por debajo de la meta de reunificación* — que es la pregunta accionable.

---

## 4. Vista **Desierto veterinario** (`?preset=desierto-veterinario`)

**La pregunta declarada:** *"¿Qué zonas llevan más días sin actividad veterinaria registrada?"*

### El escenario

Sofía, del área de Planificación Sanitaria de Nación, tiene que decidir dónde mandar los tres móviles veterinarios del programa federal. Abre Desierto veterinario esperando un mapa de acceso.

### Cómo ayuda

En su forma actual: **no ayuda**.

### Dónde falla — con evidencia

**F-12 (crítico, y es el hallazgo más duro de esta revisión). La vista está completamente saturada: el país entero es un solo color.** `panB-03-desierto.png` muestra las 24 provincias — de Jujuy a Tierra del Fuego, incluidas Malvinas — pintadas del **mismo azul sólido**. La leyenda dice literalmente:

```
Desierto veterinario (días sin actividad)   90 ▮ ≥90
```

Mínimo 90, máximo ≥90. **Cero discriminación entre las 24 unidades.** La confirmación no es solo visual: el propio registro de capas lo documenta (`layers.ts:508-511`, *"Measured 2026-07-25: 23 of 24 provinces sit exactly here"*), y en la corrida vimos 24/24. Sofía no obtiene ninguna información para decidir dónde mandar los móviles: todo el país está igual de mal.

**F-13 (crítico). La métrica no mide lo que su nombre dice.** `repository-choropleth.ts:927` filtra un único tipo de evento:

```ts
eq(petEvents.eventType, "vet_visit_logged")
```

Una vacunación antirrábica, una esterilización, una desparasitación o la implantación de un microchip — todos actos veterinarios, todos registrados en MiMAR — **no cuentan como "actividad veterinaria"**. Por eso la vista puede afirmar "90 días sin actividad veterinaria en todo el país" en la misma pantalla en que el KPI dice **"Cobertura antirrábica 63,6% · +19 pts"**. Las dos cosas no pueden ser ciertas a la vez, y están a 40 píxeles de distancia (`panB-03-desierto.png`).

**F-14 (crítico). La leyenda se rompe con cualquier período que no sea 90 días.** Con `?period=12m` (`panB5-41-desierto-12m.png`) la leyenda imprime:

```
Desierto veterinario (días sin actividad)   365 ▮ ≥90
```

**Mínimo 365, máximo ≥90.** Un rango invertido y sin sentido. La causa: `layers.ts:511` fija `censoredAtMax: 90` como constante estática, mientras que el tope real de censura es la longitud de la ventana (`windowDays`, calculado en `repository-choropleth.ts:913`). El código de leyenda (`panorama-labels.ts:186-190`) evalúa `365 >= 90 → true` y estampa "≥90". Es un bug de una línea con consecuencia directa sobre la credibilidad de un informe.

**F-15 (grave). Los KPI no incluyen la métrica de la vista.** La columna muestra `Cobertura antirrábica` y `Cobertura de esterilización`. **No hay un solo indicador de "días sin actividad"** en la vista que se llama "días sin actividad". No hay mediana nacional, no hay "N provincias en el tope", no hay peor unidad.

**F-16 (medio, pero bien resuelto).** La descripción de la capa tiene la advertencia correcta: *"La ausencia de datos cargados no implica ausencia de veterinarios."* Es la frase exacta que evita que esta vista se use para desfinanciar un territorio. El problema es que está en la descripción de la capa (rail → Capas), no en el mapa ni en la exportación PNG.

---

## 5. Vista **Tendencia** (`?preset=tendencia`)

**La pregunta declarada:** *"¿Dónde hay más o menos incidentes que en el período anterior?"*

### El escenario

Diego, jefe de gabinete de una Secretaría de Salud provincial, prepara el informe mensual. Necesita una línea: *"la situación mejoró/empeoró respecto del mes pasado en X provincias"*.

### Cómo ayuda

- Choropleth divergente anclado en cero, con **polaridad invertida** (más eventos = polo de advertencia ámbar). La elección de polaridad es correcta y no obvia.
- Ventana 30d contra los 30d inmediatamente anteriores — la cadencia operativa adecuada.
- La descripción de la capa es **notablemente honesta**, incluyendo la advertencia del confundidor: *"el reporte de incidentes TAMBIÉN crece con el padrón, así que un aumento sigue pudiendo reflejar más cobertura del sistema; leer el signo junto con la evolución del padrón."*

### Dónde falla — con evidencia

**F-17 (crítico). 21 de 21 provincias apuntan en la misma dirección.** `panB-04-tendencia.png`: **todo el país es teal** (polo de mejora). Ninguna unidad está en ámbar. Un mapa de tendencia en el que ninguna unidad diverge de las demás no es un instrumento analítico: está midiendo un artefacto sistémico (el ciclo de carga de datos), no variación territorial. Diego no puede escribir su línea de informe, porque "mejoraron las 21" no es una afirmación creíble ni útil.

Y es un signo que **se dio vuelta**: `presets.ts:322-325` documenta que en la medición del 2026-07-25 el resultado era *23 arriba / 1 abajo*. Hoy, con la misma vista, son 21 abajo / 0 arriba. Un indicador cuyo signo nacional se invierte por completo no puede ir a un informe firmado hasta que se explique por qué.

**F-18 (crítico). La normalización sigue sin resolver, y el producto lo sabe.** El comentario en `presets.ts` lo dice: *"Normalising changes the unit from a count delta to a rate delta — pending PO call."* Mientras tanto, la vista se sirve como si fuera concluyente. Un delta de conteos sobre un padrón que crece es un indicador de adopción del sistema disfrazado de indicador epidemiológico. La advertencia está en el texto de la capa (tres clics adentro), no junto al mapa.

**F-19 (grave). Ninguno de los tres KPI comparte la ventana del mapa.** El mapa es 30d vs 30d. Los KPI son:

- `1.507 Mordeduras` → **12 MESES FIJOS**
- `116 Pérdidas activas` → **ESTADO ACTUAL**
- `287 Denuncias en el período` → PERÍODO

Es decir, **cero de tres** indicadores pueden corroborar o contextualizar lo que el mapa está diciendo. El funcionario no tiene ningún número que le diga *cuánto* mejoró, solo un color.

**F-20 (grave). CABA desaparece.** Es la única de las cinco vistas donde **no se renderiza el inset de CABA** (comparar el ángulo superior derecho de `panB-04-tendencia.png` contra `panB-01/02/03/05`). CABA es un polígono de 200 km² en un mapa de 2,8 M km²: sin inset, la jurisdicción más densa del país es literalmente invisible en la vista de tendencia.

**F-21 (medio). Tres provincias en gris sin explicación.** `Registros 21` sobre 24 provincias; tres quedan grises. Otra vez, "suprimido por k<5" y "sin cambio medido" y "sin datos" son indistinguibles en el mapa.

---

## 6. Vista **Riesgo PPP** (`?preset=riesgo-ppp`)

**La pregunta declarada:** *"¿Dónde se cruzan mordeduras altas con bajo registro PPP?"*

### El escenario

Verónica, asesora legal de una Dirección de Fauna Urbana, tiene que fundamentar por qué se pide presupuesto para un operativo de registro de perros potencialmente peligrosos (Ley Prov. 14.107). Necesita mostrar que hay territorios donde el riesgo es alto y el registro bajo.

### Cómo ayuda

Es **la vista analíticamente más ambiciosa** del conjunto: un choropleth bivariado 3×3 que cruza la tasa de adopción del registro PPP con la densidad de mordeduras. Esa es exactamente la forma correcta de la pregunta "riesgo × capacidad regulatoria", y es una técnica que casi ningún tablero de gobierno intenta.

Los KPI acompañan bien: `1.507 Mordeduras (12m)` con sparkline, `44,9% Registro PPP`, `36,0% Microchip` — la familia normativa completa de Ley 14.107.

El `ModeSwitcher` está bien explicado: *"Modo del mapa — Cómo se pinta la vista: el riesgo cruza registro PPP bajo × mordeduras altas"*, con toggle `Capas / Intensidad de reporte (bivariado)` y round-trip de `?encoding=bivariate`.

### Dónde falla — con evidencia

**F-22 (crítico). La leyenda bivariada es indescifrable.** En `panB-05-riesgo-ppp.png` la leyenda es un swatch 3×3 de ~20 px con el rótulo `cobertura × señal`. **Sin ejes rotulados, sin indicar qué esquina es "alto riesgo", sin valores de corte.** Verónica está mirando nueve colores sobre el país (rojo, púrpura, teal, gris azulado, verde…) y no tiene forma de saber si el rojo de Santiago del Estero significa "mucha mordedura y poco registro" o lo contrario. Una matriz bivariada sin ejes rotulados no es una leyenda.

**F-23 (crítico). La vista se llama de tres maneras distintas en la misma pantalla.**

- título del panel: **"Riesgo PPP"**
- inset de CABA: **"riesgo"**
- texto explicativo: **"el riesgo cruza registro PPP bajo × mordeduras altas"**
- el toggle que la activa: **"Intensidad de reporte (bivariado)"**
- la leyenda del mapa: **"Intensidad combinada"**

El renombre C2 (de "Riesgo" a "Intensidad de reporte") fue una corrección de honestidad correcta —lo que se mide es intensidad de *reporte*, no riesgo objetivo— pero **se aplicó solo al toggle**. Todo el resto de la vista sigue diciendo "riesgo". Si Verónica cita esta vista en un fundamento administrativo, va a decir "riesgo" y va a estar sobreafirmando exactamente lo que el renombre buscaba evitar.

**F-24 (grave). La leyenda anuncia una capa que no se dibuja.** El pill lista `● Mordeduras / antirrábica` con su punto naranja, pero en modo bivariado la señal está plegada dentro del relleno: **no hay ningún símbolo naranja en el mapa**. La leyenda promete una marca inexistente.

**F-25 (grave). Inaccesible para el usuario objetivo.** Con `govt@` (3 jurisdicciones) la vista se degrada al aviso de "necesita al menos 6 jurisdicciones" (`panB6-51-gob-govt-riesgo.png`) y cae de vuelta al choropleth de tasa PPP simple (leyenda `40% … 80% meta`). El aviso es honesto y bien redactado, pero: **Verónica trabaja en una Dirección municipal. Esta vista no es para ella. Es solo para Nación.** Y Nación no es quien hace operativos de registro.

**F-26 (medio). Nueve colores sin recuento por clase.** No hay forma de saber cuántas provincias caen en la celda "alto riesgo". Un ranking o un conteo por celda convertiría el mapa en una lista accionable.

---

## 7. Hallazgos transversales, ordenados por gravedad

### 7.1 La leyenda colapsada declara un rango falso — afecta a TODAS las capas de densidad

Ya documentado en F-1/F-2/F-14, pero corresponde elevarlo: **no es un problema de la vista Mortalidad, es un problema del componente de leyenda compartido por las 11 vistas.**

`panorama-labels.ts:177-180` imprime el primer y el último **corte interior** como si fueran los extremos del dato. En mortalidad eso produce "2 … 6" sobre un rango real de 1–63. En desierto con 12m produce el absurdo "365 … ≥90".

Además, `class-scale.ts` usa quantile cuando no hay meta. Sobre distribuciones con cola larga (que es la norma en Argentina: Buenos Aires + CABA + Córdoba + Santa Fe concentran la mayor parte de casi todo), quantile **garantiza** que las unidades dominantes se aplasten en la clase superior abierta. El mapa está optimizado para no verse plano, al costo de no mostrar la concentración — que suele ser el hallazgo.

**Es el defecto de mayor impacto de todo Panorama**, porque un funcionario que exporta un PNG con leyenda "2–6" está publicando un dato falso con la marca del Estado.

### 7.2 Seis capas construidas y sin vista que las use

Contando sobre `presets.ts` y `layers.ts` — son **seis**, no cuatro:

`microchip` · `antiparasitario` · `acceso-veterinario` · `indice-territorial` · `refugios` · `clinicas`

Las seis están en el panel de Capas (modo avanzado), o sea que existen, se cargan y se pintan; ninguna tiene vista curada. Dos son especialmente dolorosas:

- **`acceso-veterinario`** (visitas/1.000 mascotas, ventana móvil de 12 meses) es la métrica de acceso que la vista "Desierto veterinario" **debería** estar usando. Es continua, normalizada por población de mascotas y no se satura. Está construida, testeada y huérfana, mientras la vista de acceso muestra un país de un solo color (F-12).
- **`refugios` + `clinicas`** son las capas de **capacidad instalada**. Sin ellas, "desierto veterinario" es un diagnóstico sin contraparte: no se puede ver si la zona silenciosa tiene o no tiene clínicas.

### 7.3 El modelo epistémico declarado no llega al mapa

El producto distingue cuatro naturalezas (medido-cero / sin-señal / protegido / censurado). En pantalla, un funcionario ve: un chip genérico `⊘ k<5 protegido` en el pill, y una única categoría `Sin datos` en Referencias (`panB7-60`). Las cuatro naturalezas se colapsan a un gris. La pestaña Referencias — cuyo trabajo declarado es *"Cómo leer los colores y símbolos del mapa"* — **ni siquiera muestra el símbolo de supresión**.

### 7.4 Cada vista mezcla ventanas temporales sin señalarlo

Sistemático en las cinco: mapa a 90d con KPI `ESTADO ACTUAL`; mapa a 30d con KPI `12 MESES FIJOS`; pie del dock anunciando "últimos 90 días" sobre una capa de estado actual (F-4). Las etiquetas de ventana en los KPI existen y son correctas — pero nadie concilia el conjunto. En Tendencia (F-19) los tres KPI corren en tres ventanas y ninguna es la del mapa.

### 7.5 El deep link no cruza roles, y hay dos URLs para la misma consola

F en §1.5: `/admin/panorama?preset=…` con sesión de funcionario redirige a `/gob` y descarta vista, alcance y período. Para una herramienta interorganismos cuyo verbo es EXPORTAR, esto rompe el flujo de trabajo más común que existe en la administración pública: *"te paso el link de lo que estoy viendo"*.

---

## 8. Mejoras futuras, ordenadas por palanca

**Palanca alta / costo bajo**

1. **Arreglar los extremos de la leyenda** — imprimir min/max reales del dato y marcar la clase superior como abierta (`≥`). Una función, `panorama-labels.ts`. Elimina el riesgo de publicar un rango falso.
2. **`censoredAtMax` derivado de la ventana**, no constante. Elimina el "365 … ≥90".
3. **`rankBy: "reunificacion"` en `perdidas-reunificacion`** — una línea; hace que el "Peores 10" conteste la pregunta de la vista.
4. **Etiquetas visibles en el rail** (o al menos en Exportar y Línea de tiempo). El scrubber bitemporal es el mejor activo del producto y hoy es un ícono de gráfico sin nombre.
5. **Rotular los ejes de la leyenda bivariada** ("registro PPP →" / "↑ mordeduras") y marcar la celda de mayor riesgo.
6. **Unificar el nombre de Riesgo PPP** — terminar de aplicar el renombre C2 al título, al inset y al texto, o revertirlo. Hoy dice las dos cosas.
7. **Corregir el corte de texto en el panel de Capas** y mostrar el conteo de registros de *cada* capa, no solo de la activa.

**Palanca alta / costo medio**

8. **Reemplazar la base de "Desierto veterinario" por `acceso-veterinario`**, o al menos ampliar el predicado de `vet_visit_logged` a la familia completa de eventos veterinarios. La vista pasa de inservible a diagnóstica sin construir nada nuevo.
9. **Toggle per cápita en Mortalidad y en Pérdidas** — la infraestructura existe (`bienestar` la declara). Convierte dos mapas tautológicos en dos mapas informativos.
10. **Leyenda visible durante el scrub** y dock de línea de tiempo compacto (recuperar los ~250 px en blanco).
11. **Escala numérica para el símbolo de reunificación** y separación visual de las dos variables (par de símbolos, o pequeño múltiplo, en lugar del anillo inscripto).
12. **Redirigir `/admin/panorama` → `/gob/panorama` preservando searchParams** para funcionarios acotados. Arregla el enlace interorganismos.
13. **Alta jerarquía para la supresión**: cuatro categorías visibles en Referencias, con el símbolo de cada una.

**Palanca alta / costo alto**

14. **Comparación multi-jurisdicción** (elegir 2-5 provincias/departamentos y verlos lado a lado con la misma escala). Es la pregunta que un funcionario hace siempre y hoy no tiene camino.
15. **Denominadores poblacionales reales** (censo INDEC + estimación de población canina/felina). Sin esto, toda tasa de Panorama está normalizada sobre el padrón de MiMAR — es decir, sobre la variable que más varía entre jurisdicciones.
16. **Vistas curadas para las seis capas huérfanas** — como mínimo "Acceso veterinario" (capacidad + uso) e "Índice territorial".
17. **Resolver la normalización de Tendencia** y, hasta entonces, mostrar el aviso del confundidor **al lado del mapa**, no dentro de la descripción de la capa.

---

## 9. Factores de administración pública que el sistema NO toca

Esta es la sección que más importa para el discurso comercial, porque es lo que un director provincial va a preguntar en los primeros diez minutos de la demo. Panorama declara ser un instrumento de EXPLORAR / ENTENDER / EXPORTAR y **no** un escritorio de decisión, y esa disciplina es correcta. Pero las siguientes son cosas que un usuario real de administración pública argentina necesita, y que hoy no tienen lugar en ningún punto del recorrido.

### 9.1 El expediente — el sistema no habla el idioma del Estado

En la administración argentina nada existe si no está en un expediente. Hoy Panorama produce un CSV, un PNG y un "Informe de situación" imprimible, todos **anónimos, sin número, sin firma y sin trazabilidad**.

Falta: número de expediente / GDE al que se asocia la consulta; **firma digital (Ley 25.506)** o al menos hash verificable en el PDF; un identificador de instantánea inmutable para que el informe citado en un expediente pueda reproducirse idéntico seis meses después. Hoy el `asOf` permite reproducir el *tiempo de ocurrencia*, pero no congela la versión del cálculo ni el estado del padrón. Un informe de Panorama no es prueba documental.

### 9.2 Obligaciones legales de reporte — nadie sabe qué debe informar a quién

Panorama muestra cumplimiento (cobertura antirrábica vs meta 80%, PPP vs benchmark) pero **no muestra la obligación de reportar** ese cumplimiento.

Falta: calendario de obligaciones (campaña antirrábica anual bajo Ley 22.953; informes al Concejo Deliberante; rendiciones de programas provinciales); estado "informado / vencido / pendiente" por jurisdicción; generación del formato exigido por el organismo receptor. El panel `/gob` sí nombra obligaciones ("Obligación: Ley 22.953", "CABA: Ley 5470") — pero es un dato de lectura, no un flujo.

### 9.3 Notificación obligatoria de zoonosis — el eslabón que rompe la cadena sanitaria

Las enfermedades de notificación obligatoria (Ley 15.465) van al **SNVS 2.0 / SISA**, y la sanidad animal a **SENASA**. Panorama ve señales de zoonosis y no tiene ninguna salida hacia esos sistemas: no hay exportación en formato de notificación, no hay envío, no hay acuse de recibo, no hay conciliación entre lo que MiMAR ve y lo que el sistema nacional de vigilancia registra. Un funcionario que detecte un brote en Panorama debe volver a cargarlo a mano en otro sistema, y nadie puede auditar si lo hizo.

### 9.4 Traspaso interjurisdiccional — la frontera administrativa es un muro

Un brote no respeta el límite de partido; una mascota perdida cruza a la provincia de al lado. Hoy no existe: derivar una observación a otra jurisdicción; un caso compartido municipio ↔ provincia ↔ Nación; visibilidad de "esta unidad limítrofe tiene señal, y no es tuya"; ni un registro de quién derivó qué y cuándo. El alcance es un embudo hacia adentro, nunca una conversación hacia el costado. Es probablemente la brecha operativa más grande del producto para un usuario provincial.

### 9.5 Responsabilidad y seguimiento — Panorama no deja rastro de que alguien miró

No hay: asignación de un hallazgo a un responsable; anotación o comentario sobre una unidad ("Corrientes: verificado con el municipio el 12/7"); marcado "revisado"; ni bitácora visible de quién consultó qué vista y qué exportó. Para un organismo sujeto a auditoría —y todos lo están— la ausencia de un rastro de consulta y de una cadena de responsabilidad sobre los hallazgos es un problema de control interno, no de UX.

### 9.6 Capacidad y recursos físicos — la restricción de "no costos" se está aplicando de más

La regla del producto es no mostrar **costos ni presupuesto**, y está bien. Pero eso no debería excluir la **capacidad instalada**, que es información operativa, no financiera: cuántos veterinarios matriculados hay por jurisdicción, cuántos inspectores, cuántos móviles, cuántas dosis de antirrábica en stock, cuántos quirófanos de castración.

Sin ninguna variable de capacidad, "desierto veterinario" es un diagnóstico sin contraparte y "brecha de cobertura" no se puede convertir en un plan. Y las capas `clinicas` y `refugios` —que son exactamente esa contraparte— están construidas y sin vista (§7.2). La restricción de costos se está aplicando de más, y está costando la mitad del valor analítico.

### 9.7 Comunicación al ciudadano y acceso a la información

Falta todo: derivada pública del tablero (portal de datos abiertos con la versión k-anonimizada); figura lista para prensa con nota metodológica; y —lo más concreto— un camino para responder un **pedido de acceso a la información pública (Ley 27.275)**, que tiene plazos legales. Hoy un funcionario que recibe un pedido de "estadísticas de mordeduras por partido del último año" tiene que armarlo a mano desde un CSV, sin trazabilidad de qué versión entregó.

### 9.8 Gobernanza del dato — el problema que explica todos los mapas

Cada mapa de esta revisión está determinado por **quién carga datos y quién no**, y el sistema no expone esa variable en ninguna parte.

Falta: una métrica de completitud/cobertura del padrón **por jurisdicción** (¿qué fracción de la población estimada de mascotas está registrada en Formosa?); alerta de "esta jurisdicción no carga desde el 12 de mayo" dirigida al responsable de carga; una forma de marcar una celda como sospechosa y que eso llegue a alguien; y un indicador de confianza por unidad. El panel `/gob` sí tiene "Confianza: baja · n = 8" — **Panorama no**. Es el dato que evita que un funcionario confunda "no pasa nada" con "no cargamos nada", y es la diferencia entre una herramienta que informa y una que induce a error.

### 9.9 Planificación y metas propias

Las metas son constantes globales (80% antirrábica, 70% esterilización, 80% microchip). Una jurisdicción no puede fijar su propia meta anual, ni cargar un plan, ni ver plan vs. ejecutado, ni proyectar cuántas dosis necesita para pasar de 63,6% a 80%. Panorama describe el presente; no acompaña un ciclo de gestión.

### 9.10 Continuidad y capacitación

Los mandatos duran cuatro años y los equipos rotan. No hay: vistas guardadas institucionales (las "Vistas guardadas" son personales); onboarding en producto; glosario de qué significa cada métrica en términos normativos; ni un "informe de traspaso" que un funcionario saliente le deje al entrante. Para un sistema que aspira a federarse con Mi Argentina, la continuidad institucional entre gestiones es un requisito, no un extra.

---

## 10. Balance

Panorama es un instrumento serio, con decisiones de diseño que se ven poco en el sector público: escala bitemporal expuesta al usuario, supresión k-anónima declarada, degradación honesta cuando no alcanzan las jurisdicciones, KPI recalculados y declarados por alcance, y una tabla accesible que es la misma verdad que el mapa. Cero errores de consola en cinco corridas.

Lo que hoy lo frena no es la ingeniería: son **tres cosas concretas**.

1. **La leyenda dice cosas falsas** (rango "2 … 6" sobre datos 1–63; "365 … ≥90"). Un funcionario puede publicar un dato incorrecto con la marca del Estado, y eso es inaceptable antes que cualquier mejora estética.
2. **Dos de las cinco vistas no discriminan nada** (Desierto veterinario: 24/24 iguales; Tendencia: 21/21 en la misma dirección). Una vista que no separa unidades no es una vista.
3. **El usuario objetivo real —el funcionario provincial o municipal acotado— ve un mapa vacío.** La supresión k=5 es correcta; el problema es que no hay ninguna estrategia de producto para lo que ese usuario debe ver cuando la supresión gana.

Los tres son arreglables. Los dos primeros, con cambios de pocas líneas. El tercero es una decisión de producto que conviene tomar antes de la próxima demo a un municipio.
