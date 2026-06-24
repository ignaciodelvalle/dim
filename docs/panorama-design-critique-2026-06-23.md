# Design Critique — Panorama / Centro de Situación Nacional · MiMAR / DIM

> Revisión de la consola **Panorama** (`/admin/panorama` y `/gob/panorama`). Foco en las
> cuatro cuestiones que levantó Ignacio: (1) las "barras de subir y bajar" que se solapan,
> (2) el modelo de zoom del mapa (provincia ↔ localidad + autozoom), (3) por qué hay datos
> por provincia que no aparecen por localidad, y (4) cómo se carga el seed de la demo y si
> es una carga "pseudo-real".
> Fecha: 2026-06-23 · Read-only — no se modificó código. Sirve de base para el handoff a CC.
> Severidad: 🔴 crítico (bloquea entender/usar la vista) · 🟡 moderado (fricción) · 🟢 menor (polish).

---

## Overall Impression

El Panorama tiene una **base técnica muy fuerte** — KPIs en paridad con los dashboards,
supresión k-anon visible, reproducción temporal (TimeScrubber), capas con compatibilidad,
disclosure de datos sintéticos y "Acerca de estas métricas". La materia prima es de calidad
pública-sanitaria.

El problema **no es estético, es de modelo mental**: la vista tiene **tres controles distintos
que parecen hacer lo mismo** ("dónde estoy / qué tan cerca miro") y ninguno hace lo único que
el operador realmente espera de un mapa — *hacer click en una provincia y que el mapa baje a sus
localidades, y al alejarse volver al país*. Hoy el zoom del mapa, la agregación y el filtro de
alcance están **desacoplados**, y dos de ellos hasta comparten las mismas etiquetas
("Provincia / Localidad") significando cosas diferentes. Eso es lo que se siente "muy feo".

Las otras dos cuestiones (provincia vs localidad, y el seed) son en realidad **síntomas del
mismo origen**: el dato se carga por inserción directa, sin pasar por el camino real del
usuario, y la diferencia provincia/localidad es mitad privacidad-por-diseño y mitad dato
incompleto — pero **nada de eso se le explica al operador en pantalla**.

---

## 1. Las "tres barras" — un concepto, tres controles desacoplados 🔴

Lo que ve Ignacio en pantalla son, efectivamente, varios controles apilados que tocan la misma
idea ("granularidad / dónde miro"):

| # | Control | Dónde | Qué cambia *de verdad* | Etiqueta que muestra |
|---|---|---|---|---|
| A | **JurisdictionSwitcher** (2 `<select>`) | tarjeta de filtros (`PanoramaShell`) | el **dato que se consulta** (scope: narrowing del query) | "Provincia" / "Localidad" |
| B | **AggregationToggle** (segmented) | riel derecho (`PanoramaConsole`) | **cómo se agregan/pintan** las capas (provincia vs centroides de localidad) | "Provincia" / "Localidad" |
| C | **Zoom nativo del mapa** | sobre el mapa (MapLibre) | solo el **viewport** (no toca dato ni agregación) | — |
| + | PresetPanel ("Vista") y LayerPanel ("Capas") | riel derecho | *qué* capas se muestran (otra dimensión, correcta) | — |

### El diagnóstico

1. **A y B usan literalmente las mismas palabras ("Provincia / Localidad") para cosas
   distintas.** Uno filtra *qué* datos entran; el otro cambia *cómo* se agrupan. Es imposible
   que el operador sepa cuál tocar. Esto solo es garantía de confusión.
2. **C (el zoom, el gesto más intuitivo de "subir y bajar") no hace nada al dato.** Acercarse
   con la rueda no baja a localidades ni cambia la agregación. Por eso "ninguna parece hacer lo
   que necesito": el control que el cuerpo espera usar (zoom) está muerto respecto del contenido.
3. **Elegir una provincia en A NO mueve el mapa.** En `SituationalMap` el `initialBounds` se
   captura **una sola vez al montar** (`initialBoundsRef = useRef(initialBounds)`) y el
   `fitBounds` corre solo en la inicialización del mapa (`map.fitBounds(bbox, … maxZoom: 11)`).
   Cuando cambiás la provincia, el `router.replace` re-renderiza el server, pero el mapa **se
   queda donde estaba** — no hay autozoom. Ese es el "feo" concreto: seleccionás Salta y el
   mapa sigue mostrando todo el país.

En resumen: hay **tres formas de expresar "más cerca / más lejos"** y están sin coser entre sí.

### Cómo resolverlo — un solo modelo espacial, manejado por el mapa

Colapsar A + B + C en **una sola navegación espacial de dos niveles bloqueados**, con un
**breadcrumb** como única "fuente de verdad" de dónde estás:

```
Nacional ▸ Salta ▸ (Salta Capital)
```

- **Dos regímenes bloqueados (lock):**
  - **País → Provincias** — coropleta nacional, agregación = provincia.
  - **Provincia → Localidades** — al entrar a una provincia, agregación = localidad (centroides).
- **Drill-in unificado:** click en una provincia (o elegirla en el breadcrumb) → `flyTo`/`fitBounds`
  a su bbox **y** cambia la agregación a localidad automáticamente. Un solo gesto, un solo efecto.
- **Drill-out por zoom:** al alejarse cruzando un umbral de zoom (`zoomend`), volver a la coropleta
  nacional por provincia. El gesto de "subir" recupera el país.
- **Hacer reactivo el `initialBounds`:** soltar el `useRef` de mount-only y reaccionar al cambio de
  scope con `flyTo` (el bbox por provincia ya es derivable: `lib/gov-scope.jurisdictionBounds`,
  `provinceByCode` + centroides en `ar-provincias`/`ar-localidades`).
- **Degradar el AggregationToggle a "avanzado" o eliminarlo.** Si el nivel se deriva del lugar
  donde estás (país vs provincia), el toggle deja de ser un control primario. Si se conserva,
  **renombrar** para que no choque con el filtro de alcance (p. ej. el filtro = "Ver datos de:"
  y el eje = "Resolución del mapa").
- Mantener **PresetPanel ("Vista") + Capas** como lo que controlan: *qué* se muestra, no *dónde*.
  Esa dimensión está bien; el problema es solo la de "dónde/zoom".

> Resultado esperado: el operador hace lo natural — click en provincia → baja; rueda hacia afuera
> → sube — y los tres controles que hoy compiten se reducen a uno (el mapa) + un breadcrumb.

---

## 2. "¿No sería mejor lockear la vista por provincias y por localidad?" — sí 🟡

La intuición de Ignacio es exactamente la dirección correcta y es la consecuencia natural del
punto 1. Concretamente:

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| Hoy el zoom es libre y continuo, pero la agregación solo tiene 2 estados (provincia/localidad) que no siguen al zoom. Se puede quedar "entre niveles": muy cerca con coropleta de provincia, o lejos con centroides de localidad ilegibles. | 🟡 | **Bloquear a dos niveles semánticos** atados al zoom (país-por-provincia / provincia-por-localidad). Nada "entre medio". |
| Seleccionar provincia no autozooma (ver §1.3). | 🔴 | `flyTo` a la bbox de la provincia al entrar, con `maxZoom` de guarda para no sobre-acercar provincias chicas (CABA) ni sub-acercar las grandes (Buenos Aires). |
| No hay "volver" claro: el operador queda atrapado en una provincia. | 🟡 | Breadcrumb clickeable + drill-out por zoom-out. "Nacional" siempre a un click. |
| El bbox de gob ya se computa server-side, el de admin no. | 🟢 | Unificar: derivar bbox de provincia en cliente al cambiar scope; reusar `jurisdictionBounds` para el caso gob. |

Animación: `flyTo` con `animate: true` para el drill (hoy el `fitBounds` usa `animate: false` por
ser carga inicial — está bien para el mount, pero el drill interactivo debe animar para que se lea
el "bajamos a la provincia").

---

## 3. "¿Por qué hay datos por provincia que no están por localidad?" 🟡

Esto es **mayormente correcto por diseño, pero está mal comunicado**. Hay tres causas que se
suman, y ninguna se le explica al operador en el momento:

1. **k-anonimato (k=5).** Las celdas de localidad con menos de 5 casos se **suprimen** por
   privacidad (el `LayerPanel` muestra el badge "N suprimido/s"; está en el disclosure
   "Privacidad"). La coropleta de **provincia casi siempre supera k=5**, así que el total
   provincial aparece, pero las localidades dispersas desaparecen. La provincia **no** aplica
   esta supresión (su N siempre es ≥5).
2. **Registros sin localidad asignada.** Una mascota con provincia pero sin localidad **suma al
   total provincial pero no tiene celda de localidad** (es la causa real anotada en el critique
   de admin, hallazgo C36: "pets sin provincia asignada"; acá es el caso simétrico por localidad).
3. **Tope de 2.000 puntos por capa.** Puede truncar el detalle a nivel localidad (badge "capá al
   máximo (2.000)").

A esto se suma que el **seed sintético reparte por peso poblacional de provincia** (Censo 2022),
así que los eventos se concentran y **muchas localidades caen bajo k=5** → suprimidas. Es decir:
parte de la "falta de datos por localidad" es un **artefacto del seed**, no del producto.

### Cómo resolverlo — hacer la diferencia legible, no esconderla

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| El operador ve "provincia tiene, localidad no" sin explicación → parece un bug o datos rotos. | 🟡 | En vista localidad, mostrar una **línea de reconciliación**: `Total provincia = localidades visibles + N suprimidas (k<5) + M sin localidad`. Que los números **cierren a ojo**. |
| La supresión se muestra como badge por capa, pero no se suma al relato. | 🟢 | Tooltip/nota al pie en la coropleta: "X localidades ocultas por privacidad". Ya existe el dato (`suppressedCount`), falta exponerlo en el lugar correcto. |
| Dato incompleto (mascotas sin localidad) contamina la comparación. | 🔴 (dato) | Arreglar en el **origen**: que todo registro de la demo tenga provincia **y** localidad (ver §4). Esto elimina la causa #2 de raíz. |
| El seed genera localidades mayormente suprimidas. | 🟡 | Decidir el objetivo: si se quiere **mostrar** detalle por localidad, sembrar ≥5 casos en las localidades "protagonistas"; si se quiere **demostrar la privacidad**, dejar la supresión visible y explicarla. Ambas son válidas — pero hay que elegirla a propósito. |

---

## 4. El seed de la demo: hoy NO es "pseudo-real" 🔴

### Qué hace hoy

`scripts/seed-panorama.ts` (y `seed-storylines-*`, `seed-demo*`) cargan datos por **inserción
directa en las tablas**: `db.insert(petEvents)`, `pets`, `ownerships`, `cases`, `welfareReports`,
`enoProcessingQueue`, `eventNotificationOutbox`, `profiles` (via SQL crudo). **No pasan por los
use-cases ni por los server actions.** Hay incluso un comentario explícito (~línea 1814) de que
se **evita** correr el use-case real bite→observación, y el script setea el override
`app.allow_event_mutation` para poder borrar eventos *append-only* en cada corrida idempotente.

Es un **bulk synthetic insert**: PRNG de semilla fija (determinista), tag `PANO-`, densidad
ponderada por Censo, fecha ancla fija (`2026-06-20`), guard local-only. Muy bien hecho para lo
que es — pero **no es** una carga "como la haría un usuario".

### Por qué importa (los riesgos)

- **Drift respecto del camino real.** Las proyecciones, los eventos derivados (cierres por cron,
  outbox de ENO, observación de rabia a partir de mordedura), notificaciones e invariantes que
  viven en los use-cases **se saltean o se falsifican a mano**. La demo puede mostrar estados que
  el producto real no produce — o saltearse estados que sí produciría.
- **Inconsistencias visibles.** Si la distribución sintética no coincide con lo que los use-cases
  calcularían, aparecen exactamente los desajustes del §3 (provincia vs localidad, KPI vs mapa).
- **No es test de integración.** Una carga real ejercitaría los happy paths; la actual no prueba nada.

### Qué sería "pseudo-real" y cómo lo haría un usuario

Una carga pseudo-real **maneja la demo por los mismos puntos de entrada que usa la gente**, en
**secuencia cronológica** y con el **dato correcto**:

```
1. Orgs / jurisdicciones        (refugios, clínicas, autoridades sanitarias)
2. Usuarios                     (owners, vets, govt) — signup / perfil
3. Mascotas                     (registrar — con provincia Y localidad, microchip, raza)
4. Eventos de vida en orden     (vacunación → visita → peso → mordedura → síntoma → …)
                                  respetando la máquina de estados (no inventar transiciones)
5. Derivados por cron real      (close-*, escalate-*, materialize-slots) — no insertar a mano
6. Proyecciones                 (rebuild-projections.ts) para que dashboards lean estado consistente
```

- **Ventajas:** consistencia garantizada con proyecciones / KPIs / k-anon / outbox; lo que se ve
  en la demo es *demostrablemente alcanzable*; sirve de smoke-test del producto.
- **Costo:** más lento y más código; difícil llegar a 46k mascotas por esta vía.

### Recomendación — híbrido (alinea con AGENTS: eventos append-only, proyecciones first-class)

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| Cohorte protagonista (storylines + un slice representativo) insertada en crudo. | 🔴 | Reproducir esa cohorte **a través de los use-cases / un puerto fino "append event"**, no por `db.insert`. Así disparan proyecciones, outbox y derivados de verdad. El formato storyline ya **es** una secuencia de intents — está listo para replay. |
| Multitud de fondo (los ~46k para densidad nacional). | 🟡 | Mantener el bulk insert **solo** para el fondo, claramente tagueado, y **documentar** que saltea use-cases — pero pasarlo igual por `rebuild-projections.ts` para que los dashboards lean estado coherente. |
| Dato incompleto (sin localidad) y fuera de ventana. | 🔴 | Contrato de "datos correctos": toda mascota con provincia **y** localidad; eventos dentro de la ventana; localidades protagonistas con ≥5 casos (resuelve §3 en origen). |
| Falta verificación de consistencia. | 🟡 | Extender `scripts/demo-verify.ts` para **asegurar** que el total de provincia reconcilia con localidad (visibles + suprimidas + sin-localidad) y que los KPIs coinciden con el mapa. |

---

## 5. Recorrida visual del chrome operador (bugs de UI) 🔴

Pasada adicional sobre el shell `operator` (`/admin` y `/gob`), gatillada por lo que reportó
Ignacio (scrollbar del rail + el banner de demo que "desplaza"). Hallazgos confirmados en código:

| # | Hallazgo | Sev | Ubicación / evidencia | Recomendación |
|---|---|---|---|---|
| **V1** | **El banner de demo desplaza el shell de 100 vh.** En `app/admin/layout.tsx` el `<DemoModeBanner/>` se renderiza como **hermano arriba** del `AppShell` operador, que es `flex h-screen overflow-hidden` (= 100 vh exactos). El banner suma ~30 px → el documento mide `banner + 100vh` → aparece **scroll externo** y el **footer del rail (la tira de usuario) queda cortado bajo el fold**. `/gob` no lo sufre porque no monta el banner. Esto es exactamente "el tab está al 100% y el cartel de demo lo desplaza". | 🔴 | `app/admin/layout.tsx` (`<><DemoModeBanner/><AppShell …/></>`), `components/layout/AppShell.tsx:102` (`OperatorShell` = `h-screen overflow-hidden`) | Envolver en una **columna flex** que sea el 100 vh: `<div className="flex h-screen flex-col overflow-hidden"><DemoModeBanner/><div className="min-h-0 flex-1">{shell}</div></div>`, y que `OperatorShell` use `h-full` / `flex-1 min-h-0` en lugar de `h-screen`. (Alternativa: mover el banner **dentro** del `OperatorShell`, encima del topbar.) |
| **V2** | **El scrollbar del rail izquierdo resalta mucho.** `OpRailNav` usa `overflow-y-auto` sobre el navy oscuro (`bg-ln-op-navy`), y **no hay ningún estilado de scrollbar en todo el repo** (grep de `scrollbar-*` / `::-webkit-scrollbar` = 0 resultados). El scrollbar default del SO (gris claro) contrasta fuerte sobre el navy. | 🟡 | `components/ui/dashboard/OpRailNav.tsx:93` (`overflow-y-auto`), `app/globals.css` (sin reglas de scrollbar) | Scrollbar fino temático, idealmente como utilidad reusable: `scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;` + `::-webkit-scrollbar{width:8px}` / `-thumb` translúcido. Sumar `scrollbar-gutter: stable` para que el contenido no salte. **Nota:** parte del scroll de hoy es *innecesario* y desaparece al arreglar V1 (aparece porque el footer queda empujado fuera del viewport). |
| **V3** | **Dos contenedores de scroll anidados.** `OperatorShell` tiene `main … overflow-hidden` y, adentro, `div flex-1 overflow-auto`. Con el desplazamiento de V1 se pueden ver **dos scrollbars** (el del body por V1 + el interno). | 🟡 | `components/layout/AppShell.tsx:104-108` | Consolidar a un solo eje de scroll una vez resuelto V1 (el body no debería scrollear; solo el área de contenido interna). |
| **V4** | **Topbar de admin con `flex-nowrap`.** El grupo derecho (rol·Universal + ContextSwitcher + "Cerrar sesión") no encoge; en anchos intermedios puede comprimir/empujar el omnibox. `/gob` no usa `nowrap`. | 🟢 | `app/admin/layout.tsx` (`<header … flex-nowrap>`) | Verificar en ~1024–1280 px; permitir que el grupo derecho colapse o que el omnibox tenga `min-w`. |
| **V5** | **El banner es `<output>` a ancho completo, centrado, sin landmark.** Correcto para a11y (`aria-live`), pero al vivir fuera del shell también participa del problema de altura de V1. | 🟢 | `components/ui/DemoModeBanner.tsx` | Se resuelve solo al meterlo dentro de la columna flex de V1. |

> V1 y V2 están **acoplados**: hoy el rail scrollea (y muestra su feo scrollbar) en parte porque
> el banner empuja el footer fuera de los 100 vh. Arreglar V1 primero suele eliminar el scroll
> innecesario; V2 es el polish para cuando el scroll **sí** haga falta (riel largo en pantallas bajas).

---

## Lo que funciona bien (preservar)

- **Paridad de KPIs con los dashboards** (mismo denominador, no recalcula) — es la decisión correcta.
- **Privacidad como ciudadano de primera**: k-anon, centroide en vez de dirección, tope por capa.
- **TimeScrubber** (reproducción temporal) es un diferenciador real y está bien construido (a11y incluida).
- **Disclosure de datos sintéticos + "Acerca de estas métricas"** — credibilidad de producto público.
- **Determinismo del seed** (PRNG fijo, ancla fija, guard local-only, idempotencia) — base sólida; el
  problema es el *camino* de carga, no su ingeniería.

---

## Recomendaciones priorizadas (para el handoff a CC)

1. **🔴 Unificar la navegación espacial (§1 + §2).** Un modelo de dos niveles bloqueados manejado por
   el mapa: click en provincia → autozoom + agregación localidad; zoom-out → país. Breadcrumb como
   fuente de verdad. Hacer reactivo el `initialBounds`. Degradar/renombrar el AggregationToggle para
   que no choque con el filtro de alcance. *Es el cambio de mayor impacto percibido.*
2. **🔴 Carga de demo pseudo-real para la cohorte protagonista (§4).** Replay por use-cases; bulk solo
   para el fondo; `rebuild-projections` siempre; `demo-verify` que reconcilie totales.
3. **🟡 Reconciliación provincia↔localidad visible (§3).** Línea "Total = visibles + suprimidas + sin
   localidad" y nota de privacidad en la coropleta. Arreglar el dato sin-localidad en origen.
4. **🔴 Arreglar el chrome operador (§5).** El banner de demo no debe romper los 100 vh (V1) y el
   scrollbar del rail debe ser fino/temático (V2). Ambos son rápidos y muy visibles. *Puede ir como
   PR chico aparte, antes que el rediseño del mapa.*

---

## Notas para el próximo paso (handoff a CC)

El estilo de handoff del repo ya está internalizado (ver `docs/superpowers/plans/*-cc*.md`):
blockquote inicial "**Para Claude Code — ejecución autónoma**", leyenda de severidad, sección
"**Antes de tocar código, leer**" (slim index de AGENTS.md + secciones relevantes:
`§ Design rules`, `§ Dashboards & projections`, `§ Aggregation & privacy policy`),
"**Por qué (contexto del critique)**", "**Decisiones tomadas (no relitigar)**",
"**Cómo verificar las ubicaciones**" (anclar por símbolo + quote, no por línea), "**Alcance — un
solo PR**" con rama sugerida, **SDD test-first**, `pnpm verify` + `pnpm test` verdes, y tabla de
hallazgos `# / Cambio / Sev / Ubicación / Detalle`. Cuando digas, armo el plan en ese formato —
probablemente como 2–3 PRs (navegación / seed / reconciliación) para mantenerlos independientes.

---

*Autor: Claude. Generado 2026-06-23 a partir de lectura estática de `components/panorama/**`,
`app/{admin,gob}/panorama/`, `components/gob/JurisdictionSwitcher.tsx`, `scripts/seed-panorama.ts`
y `docs/admin-design-critique-2026-06-22.md`. Read-only.*
