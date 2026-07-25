# D1 — Consolidar las vistas de Panorama (propuesta para decisión de PO)

> Item D1 del plan del mapa (`2026-07-25-panorama-mapa-todas-las-mejoras.md`).
> **Esto es una propuesta, no un cambio.** No se fusionó ninguna vista: cuáles
> sobreviven es decisión de producto, y una vista de menos es una pregunta que
> el ministerio deja de poder hacer.
>
> Test que uso en todo el documento: **¿un ministro puede nombrar esta vista sin
> confundirla con otra?** Si no, sobra o está mal nombrada.

## Las 11 vistas de hoy

| # | id | Pregunta que declara | base | señal | grano |
|---|---|---|---|---|---|
| 1 | `brotes-activos` | ¿Dónde hay brotes sobre huecos de vacunación? | cobertura | zoonosis | provincia |
| 2 | `sintomas` | ¿Dónde se concentran los síntomas con alerta? | sintomas | zoonosis | localidad |
| 3 | `cumplimiento` | ¿Quién está bajo la meta antirrábica? | cobertura | — | provincia |
| 4 | `registro-ppp` | ¿Quién tiene bajo registro PPP? | ppp | — | provincia |
| 5 | `bienestar` | ¿Dónde se acumulan denuncias y decomisos? | denuncias | decomisos | localidad |
| 6 | `control-poblacional` | ¿Estamos conteniendo la población? | esterilizacion | — | provincia |
| 7 | `mortalidad` | ¿Dónde se concentra la mortalidad? | mortalidad | — | provincia |
| 8 | `perdidas-reunificacion` | ¿Cuántas perdidas se reencuentran? | perdidas | reunificacion | localidad |
| 9 | `desierto-veterinario` | ¿Qué zonas llevan más días sin veterinaria? | desierto-veterinario | — | provincia |
| 10 | `tendencia` | ¿Dónde hay más o menos que el período anterior? | tendencia | — | provincia |
| 11 | `riesgo-ppp` | ¿Dónde se cruzan mordeduras altas con bajo registro PPP? | ppp | mordeduras | provincia |

## Hallazgo 1 — Hay UNA vista de cumplimiento disfrazada de cuatro

`cumplimiento`, `registro-ppp` y `control-poblacional` son **la misma vista con
distinta métrica**: tasa contra meta, grano provincial, encuadre nacional,
ranking por brecha. Cambia el layer, no la pregunta ni la lectura.

El propio código lo dice, en `presets.ts` sobre `cumplimiento`:

> *"Future: a metric selector (microchip / PPP / esterilización) requires
> dedicated rate layers that don't exist yet; cobertura is the sole rate layer
> in v1."*

**Ese futuro ya llegó**: `ppp`, `esterilizacion` y `microchip` existen hoy como
layers. La razón por la que se abrieron tres vistas separadas dejó de aplicar, y
nadie volvió a cerrarlas.

**Propuesta**: UNA vista "Cumplimiento" con selector de métrica (antirrábica ·
esterilización · PPP · microchip). **4 → 1** (se lleva también el `metrics` de
cada una como preselección por métrica).

Riesgo a nombrar: hoy cada vista aparece en el rail con su propio nombre, y un
funcionario que busca "esterilización" la encuentra por lectura directa. Con el
selector, esa entrada se vuelve un clic más adentro. Mitigación posible: que el
rail liste las métricas como sub-entradas de Cumplimiento.

## Hallazgo 2 — `registro-ppp` y `riesgo-ppp` fallan el test del ministro

Mismo base (`ppp`), nombres a una letra de distancia. `registro-ppp` es la tasa
sola; `riesgo-ppp` es la misma tasa con mordeduras encima y ranking por
mordeduras. **No son dos vistas: es una vista con un overlay.**

**Propuesta**: `registro-ppp` se absorbe en Cumplimiento (hallazgo 1), y
`riesgo-ppp` sobrevive como lo que realmente es — la vista de CRUCE
mordeduras × registro — renombrada a algo que diga el cruce, p. ej. **"Mordeduras
sobre bajo registro PPP"**. Nadie la confunde con "Cumplimiento · PPP".

## Hallazgo 3 — `tendencia` probablemente es una codificación, no una vista

Las otras diez vistas responden *dónde está el problema X*. `tendencia` responde
*¿esto sube o baja?* sobre un delta de dos ventanas — que es exactamente la
naturaleza de `bivariate` y `percapita`, que YA son codificaciones dentro de una
vista (`encodings: ["bivariate"]`), no vistas propias.

**Propuesta a evaluar**: convertir `tendencia` en una tercera codificación
(`?encoding=trend`) aplicable a la vista activa. Ganancia: podés preguntar
"¿la mortalidad sube?" o "¿las denuncias suben?" en vez de solo "¿los eventos
suben?" en abstracto.

**Contra, y es serio**: hoy `tendencia` es un layer con su propia escala
divergente anclada en cero, no una transformación genérica. Convertirla es
trabajo real de datos, no un renombre. Si no hay apetito, la alternativa barata
es renombrarla a lo que mide de verdad ("Variación vs período anterior").

## Hallazgo 4 — Dos smells menores que conviene arreglar igual

1. **`desierto-veterinario` no se lista a sí misma**: su `metrics` es
   `["cobertura", "esterilizacion"]` — la columna de métricas no incluye el
   indicador que la vista pinta. Un operador ve el mapa de días sin actividad
   veterinaria y ningún número que lo cuantifique.
2. **`sintomas` se llama "Síntomas / vigilancia sindrómica"**: la barra tiene
   una barra y jerga epidemiológica. Falla el test del ministro por nombre, no
   por solape. Sugerencia: "Síntomas reportados".

## Resumen de la propuesta

| Acción | Vistas |
|---|---|
| Fusionar en "Cumplimiento" con selector de métrica | `cumplimiento` + `registro-ppp` + `control-poblacional` |
| Renombrar (dice el cruce) | `riesgo-ppp` → "Mordeduras sobre bajo registro PPP" |
| Decidir: codificación o renombre | `tendencia` |
| Renombrar (sacar jerga) | `sintomas` → "Síntomas reportados" |
| Arreglar `metrics` | `desierto-veterinario` |
| Sin cambios | `brotes-activos`, `bienestar`, `mortalidad`, `perdidas-reunificacion` |

**11 → 8 vistas** (7 si `tendencia` pasa a codificación), cada una con una
pregunta que no se confunde con la de al lado.

## Lo que NO propongo, y por qué

- **No fusionar `brotes-activos` con `sintomas`.** Comparten la señal `zoonosis`,
  pero difieren en base, grano (provincia vs localidad) y ventana (90d vs 30d).
  Son dos preguntas de vigilancia distintas: *dónde hay brote confirmado sobre
  hueco de vacunación* vs *dónde aparecen síntomas antes de que haya brote*. La
  segunda es justamente la de detección temprana; fusionarlas la mata.
- **No tocar `mortalidad`, `bienestar` ni `perdidas-reunificacion`.** Bases
  únicas, preguntas únicas, cero colisión de nombre.

## Verificación pendiente antes de ejecutar

Nada de esto se midió contra uso real: no hay telemetría de qué vistas abren los
funcionarios. Si existe (o se puede instrumentar rápido), una semana de datos
vale más que este análisis para decidir qué se fusiona.
