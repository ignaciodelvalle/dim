# D1 — Consolidar las vistas de Panorama (EJECUTADO 2026-08-15)

> Item D1 del plan del mapa (`2026-07-25-panorama-mapa-todas-las-mejoras.md`).
> **Estado: ejecutado.** El PO ratificó la fusión de la familia de cumplimiento
> (5 vistas → 1 con selector de métrica) y el renombre de `riesgo-ppp`; la
> corrida WP1 del programa de decrowding (2026-08-15) la implementó. Los
> hallazgos 3 y 4 quedaron explícitamente FUERA de esta ejecución (ver abajo).
>
> Test que uso en todo el documento: **¿un ministro puede nombrar esta vista sin
> confundirla con otra?** Si no, sobra o está mal nombrada.

## Las 15 vistas previas a la fusión

Cuando esta propuesta se escribió había 11 vistas; entre la propuesta y la
ejecución la ola de orphan-wiring (2026-07-26) sumó cuatro más (`microchip`,
`antiparasitario`, `acceso-veterinario`, `indice-territorial`), tres de ellas
del MISMO molde de cumplimiento — el problema que este documento nombraba se
agravó solo. El estado real pre-fusión:

| # | id | Pregunta que declara | base | señal | grano |
|---|---|---|---|---|---|
| 1 | `brotes-activos` | ¿Dónde hay brotes sobre huecos de vacunación? | cobertura | zoonosis | provincia |
| 2 | `sintomas` | ¿Dónde se concentran los síntomas con alerta? | sintomas | zoonosis | localidad |
| 3 | `cumplimiento` | ¿Quién está bajo la meta antirrábica? | cobertura | — | provincia |
| 4 | `antiparasitario` | ¿Quién tiene baja cobertura antiparasitaria? | antiparasitario | — | provincia |
| 5 | `microchip` | ¿Quién está lejos de la meta de identificación? | microchip | — | provincia |
| 6 | `registro-ppp` | ¿Quién tiene bajo registro PPP? | ppp | — | provincia |
| 7 | `bienestar` | ¿Dónde se acumulan denuncias y decomisos? | denuncias | decomisos | localidad |
| 8 | `control-poblacional` | ¿Estamos conteniendo la población? | esterilizacion | — | provincia |
| 9 | `mortalidad` | ¿Dónde se concentra la mortalidad? | mortalidad | — | provincia |
| 10 | `perdidas-reunificacion` | ¿Cuántas perdidas se reencuentran? | perdidas | reunificacion | localidad |
| 11 | `desierto-veterinario` | ¿Qué proporción no recibió NINGUNA atención? | desierto-veterinario | — | provincia |
| 12 | `acceso-veterinario` | ¿Cuánta atención sostiene cada jurisdicción? | acceso-veterinario | — | provincia |
| 13 | `tendencia` | ¿Dónde hay más o menos que el período anterior? | tendencia | — | provincia |
| 14 | `riesgo-ppp` | ¿Dónde se cruzan mordeduras altas con bajo registro PPP? | ppp | mordeduras | provincia |
| 15 | `indice-territorial` | ¿Quién está más lejos de las tres metas a la vez? | indice-territorial | — | provincia |

## Hallazgo 1 — Había UNA vista de cumplimiento disfrazada de cinco (EJECUTADO)

`cumplimiento`, `registro-ppp`, `control-poblacional`, `microchip` y
`antiparasitario` eran **la misma vista con distinta métrica**: tasa contra
meta, grano provincial, encuadre nacional, ranking por brecha. Cambiaba el
layer, no la pregunta ni la lectura.

**Lo que se implementó** (`src/modules/panorama/domain/presets.ts`):

- UNA vista `cumplimiento` (label "Cumplimiento") con `metricOptions` — el
  selector de métrica del rail Vista (`ComplianceMetricSelector`, patrón
  radiogroup igual al PresetPanel):
  Antirrábica · Esterilización · Registro PPP · Microchip · Desparasitación.
- Cada opción porta el `base` y el `metrics` (columna de métricas curada) de la
  vista absorbida, textual. La PRIMERA opción (Antirrábica) espeja el
  base/metrics del preset — todo camino de código que no conoce el selector se
  comporta como el `cumplimiento` pre-fusión.
- Cambiar de métrica pasa por el MISMO `applyPreset` que un click de vista
  (base/metrics/URL `layers=` sustituidos antes del commit — sin camino
  paralelo), y `derivePreset` matchea el set de capas de CADA opción, así el
  badge queda en "Cumplimiento" y nunca cae a "personalizada".
- La brecha conocida se mantiene declarada: no existe un `PanoramaKpiId`
  `antiparasitario`, así que esa opción no puede encabezar su propio indicador
  (hereda los vecinos honestos zoonosis + cobertura de la vista absorbida).

La mitigación de descubribilidad que la propuesta pedía (que "esterilización"
siga siendo encontrable) es exactamente el selector: las métricas se listan como
sub-entradas de Cumplimiento en el panel Vista.

## Hallazgo 2 — `registro-ppp` y `riesgo-ppp` fallaban el test del ministro (EJECUTADO)

`registro-ppp` se absorbió en Cumplimiento (hallazgo 1) y `riesgo-ppp` se
renombró a **`cruce-mordeduras-ppp`** — label "Mordeduras sobre bajo registro
PPP" — que dice el CRUCE que muestra. Conserva idénticos base/señal/rankBy/
encodings (`bivariate`)/framing/metrics; solo cambian id y label.

## Hallazgo 3 — `tendencia` como codificación: **NO ratificado**

La propuesta de convertir `tendencia` en `?encoding=trend` **no fue ratificada
por el PO**. `tendencia` SIGUE siendo una vista propia (es un layer con su
escala divergente anclada en cero — convertirla era trabajo real de datos, no
un renombre). Cualquier retoma requiere decisión de producto nueva.

## Hallazgo 4 — Smells menores: **fuera de alcance, diferido**

Ni el `metrics` de `desierto-veterinario` (no se lista a sí misma — sigue sin
existir su KPI) ni el renombre de `sintomas` ("Síntomas reportados") entraron
en esta ejecución. Quedan como deuda nombrada, no como olvido.

## El catálogo final — 11 vistas

La cuenta: 15 pre-fusión − 4 absorbidas = **11** (la aritmética "→ 8" de la
propuesta original asumía también el hallazgo 3 y contaba sobre las 11 de
entonces; no aplica al catálogo ejecutado).

| # | id | label |
|---|---|---|
| 1 | `brotes-activos` | Brotes activos |
| 2 | `sintomas` | Síntomas / vigilancia sindrómica |
| 3 | `cumplimiento` | Cumplimiento (selector: antirrábica · esterilización · PPP · microchip · desparasitación) |
| 4 | `bienestar` | Bienestar y fiscalización |
| 5 | `mortalidad` | Mortalidad |
| 6 | `perdidas-reunificacion` | Pérdidas y reunificación |
| 7 | `desierto-veterinario` | Desierto veterinario |
| 8 | `acceso-veterinario` | Acceso veterinario |
| 9 | `tendencia` | Tendencia |
| 10 | `cruce-mordeduras-ppp` | Mordeduras sobre bajo registro PPP |
| 11 | `indice-territorial` | Índice territorial |

## La garantía de compatibilidad — `LEGACY_PRESET_ALIASES`

Los ids retirados **resuelven para siempre** (tableros guardados, links
compartidos, deep links de /gob, historial del navegador). La tabla en
`presets.ts`:

| id legado | resuelve a | base que reconstruye |
|---|---|---|
| `registro-ppp` | `cumplimiento` | `ppp` |
| `control-poblacional` | `cumplimiento` | `esterilizacion` |
| `microchip` | `cumplimiento` | `microchip` |
| `antiparasitario` | `cumplimiento` | `antiparasitario` |
| `riesgo-ppp` | `cruce-mordeduras-ppp` | (sin override — set completo ppp + mordeduras) |

La garantía es DOBLE, y la segunda mitad es la que importa: el id resuelve **y
sus CAPAS también**. `getPreset()` acepta alias (todo call site que solo
necesita el objeto lo obtiene gratis); `resolveLegacyPreset()` reconstruye
además el set de capas que ese id siempre pintó, y es lo que consume la siembra
SSR (`build-panorama-board.ts`) y el resync de popstate. El modo de falla que
esto previene: un `?preset=control-poblacional` pelado que resuelve el id pero
siembra la cobertura por defecto — pérdida de métrica silenciosa. Está pineado
por `build-panorama-board.seed.test.ts` (un caso por alias) y por los tests de
alias en `presets.test.ts` / `view-state-url.test.ts` (el parse normaliza al id
canónico, así las URLs se auto-curan).

## Lo que NO se hizo, y por qué

- **No fusionar `brotes-activos` con `sintomas`.** Comparten la señal `zoonosis`,
  pero difieren en base, grano (provincia vs localidad) y ventana (90d vs 30d).
  Son dos preguntas de vigilancia distintas; fusionarlas mata la de detección
  temprana.
- **No tocar `mortalidad`, `bienestar` ni `perdidas-reunificacion`.** Bases
  únicas, preguntas únicas, cero colisión de nombre.
- **No fusionar `desierto-veterinario` con `acceso-veterinario`.** Déficit e
  intensidad son dos medidas que divergen en el medio de la distribución (ver
  el razonamiento en `presets.ts`); ninguna subsume a la otra.
