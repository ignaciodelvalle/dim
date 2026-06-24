# Plan: Paquete J — Forecast / proyección de tendencia · ejecutable

> **Para Claude Code.** Plan ejecutable derivado de
> [`specs/2026-06-22-dashboards-sell-completeness-design.md`](../specs/2026-06-22-dashboards-sell-completeness-design.md)
> §2 (Paquete J). Agrega una **banda de proyección a futuro** sobre las series que ya graficamos: "al ritmo actual,
> ¿cruzamos la meta y cuándo?". **No es ML** — es proyección de tendencia simple (OLS / Holt) sobre los buckets que
> `lib/metrics/trends.ts` + `timeseries.ts` ya producen, con banda de confianza y la línea de meta de `TARGETS`.
> **Sin schema · sin nuevos event types · sin migraciones.** SDD test-first, docs en el PR.
>
> **Reusa lo ya construido:** `fetchKpiTrend(eventType, ctx)` y `fetchRabiesVaccinationTrend(ctx)`
> (`lib/metrics/trends.ts`, devuelven `SingleSeriesTrend = { granularity, points: {x,y}[], suppressedCount }`),
> `bucketGranularityFor`/`dateTruncUnit` (`timeseries.ts`), `TARGETS`/`toneForTarget` (`lib/metrics/targets.ts`),
> `TimeSeriesChart` (`components/charts/`), tokens de `lib/viz-scales.ts`, k-anon + period del paquete metrics-IA.
>
> **Coordinación con la sesión de CC en curso:** las Fases J0–J1 son **archivos nuevos** (cero edición de
> existentes). La Fase J2 es la **única** que edita páginas ya existentes (`/admin/poblacion`, `/admin/programa`) —
> hacerla al final, en commits aislados por página, para minimizar conflicto de merge.

---

## Insight clave: flujo (fácil) vs stock (medio)

| Tipo de serie | Ejemplo | ¿Existe la serie temporal? | Forecast |
|---|---|---|---|
| **Flujo** (eventos/bucket) | `sterilization_performed`/bucket, `vaccination_administered`/bucket | ✅ `fetchKpiTrend(type, ctx)` | 🟩 **inmediato** — proyectar el conteo |
| **Stock / tasa** (cobertura %) | "% de perros con antirrábica vigente" | ❌ se computa como current-state (EXISTS), no hay serie de la **tasa** en el tiempo | 🟨 **medio** — requiere serie de tasa por bucket (Fase J3) |

**Consecuencia de plan:** el valor "easy" se logra proyectando **series de flujo** (Fases J0–J2). El forecast de
**cobertura %** vs meta legal (el más vistoso) depende de construir una serie de tasa-en-el-tiempo → **Fase J3,
diferida**, coordinada con la Fase 0 incremental del vNext (`fetchKpiTrend` ya es la mitad del camino).

---

## Fase J0 — Lib de proyección pura (sin UI, sin DB) 🟩

**Archivos nuevos:**
- `lib/metrics/forecast.ts`
- `lib/metrics/forecast.test.ts` (unit, **sin Postgres** — entrada/salida puras)

**`projectSeries(points, opts)`**
- **Firma:** `(points: Array<{ x: string; y: number }>, opts?: ForecastOpts) → ForecastResult`.
- `ForecastOpts`: `{ horizon?: number /* buckets a futuro, default 3 */; method?: "linear" | "holt" /* default
  "linear" (OLS) */ }`.
- `ForecastResult`:
  ```ts
  type ForecastPoint = { x: string; y: number; lo: number; hi: number; kind: "actual" | "forecast" };
  type ForecastResult = {
    points: ForecastPoint[];      // históricos (kind:"actual", lo=hi=y) + proyectados (kind:"forecast", banda)
    method: "linear" | "holt";
    slopePerBucket: number;       // tendencia (unidades/bucket)
    insufficient: boolean;        // true si < MIN_POINTS (default 4) → no proyectar, solo devolver actuals
  };
  ```
- **Banda de confianza:** intervalo a partir del error estándar de la regresión (residuales), **se ensancha** con
  el horizonte. Para `holt`, banda por varianza del suavizado. No hace falta rigor econométrico — sí honestidad.
- **`targetCrossing(result, target, direction)`** → `(bucketsAhead: number) | null`: estima en cuántos buckets la
  proyección cruza `target` (`"above" | "below"`). `null` si no cruza dentro del horizonte (o si `insufficient`).

**Reglas de robustez (puras):**
- `< MIN_POINTS` (default 4) → `insufficient: true`, devolver solo actuals (la UI muestra "datos insuficientes para
  proyectar").
- Buckets suprimidos por k-anon (gaps): tratar como faltantes, **no** como 0 (no inventar señal). Documentar.
- Serie plana → `slopePerBucket ≈ 0`, banda angosta, `targetCrossing` null si ya está del lado de la meta.

**Tests (J0):**
- Serie lineal ascendente → `slopePerBucket > 0`, proyección extrapola la recta, banda ⊇ tendencia.
- Serie plana → slope ≈ 0; crossing null cuando ya cumple meta.
- `targetCrossing`: con pendiente conocida y meta dada, devuelve el nº de buckets esperado.
- `< MIN_POINTS` → `insufficient:true`, sin puntos forecast.
- La banda del último bucket proyectado es más ancha que la del primero (monotonía del intervalo).

---

## Fase J1 — Componente de chart con banda (nuevo, additive) 🟩

**Archivos nuevos:**
- `components/charts/ForecastChart.tsx` (client; **no toca** `TimeSeriesChart`)
- `__tests__/forecast-chart.test.tsx`

**`ForecastChart`:**
- Props: `{ result: ForecastResult; seriesLabel: string; target?: { value: number; label: string };
  unit?: string; crossing?: number | null }`.
- Render (recharts, tokens de `lib/viz-scales.ts`):
  - Tramo **actual** = línea sólida; tramo **forecast** = línea **punteada**.
  - **Banda** = `Area` entre `lo` y `hi` del tramo forecast (opacidad baja).
  - **Línea de meta** = `ReferenceLine` en `target.value` (color divergente coherente con el resto).
  - Callout/anotación si `crossing != null`: "alcanza la meta en ~N {período}" / si `null` y no cumple:
    "a este ritmo no alcanza la meta en el horizonte".
- **Honestidad (obligatorio):** footnote "Proyección de tendencia — no es una garantía. n={puntos}, método=
  {linear|holt}." Reusar el patrón de `DashboardTooltip` (nota metodológica).
- **A11y:** `role="img"` + `aria-label` describiendo tendencia y crossing; el estado punteado/banda no comunica solo
  por color (la leyenda dice "proyección").
- **Estados:** `insufficient` → render solo actuals + mensaje "Datos insuficientes para proyectar".

**Tests (J1):**
- Con `result` que tiene forecast → existe el segmento punteado + la banda.
- Con `target` → `ReferenceLine` en el valor correcto.
- `insufficient:true` → muestra el mensaje, sin banda.
- `crossing` no-null → renderiza el callout.

---

## Fase J2 — Wiring en dashboards (única edición de páginas existentes) 🟩

> **Estas son las únicas ediciones de archivos existentes del paquete. Commits aislados por página. Coordinar con
> la sesión de CC en curso.** Cada inserción es additive (una card nueva), no reescribe la página.

**J2.1 — `/admin/poblacion` (esterilización, flujo):**
- Serie: `fetchKpiTrend("sterilization_performed", ctx)` (ya disponible) → `projectSeries(points, { horizon: 3 })`.
- Render: card nueva "Proyección de esterilizaciones" con `ForecastChart`, meta = `TARGETS.STERILIZATION_*` si aplica
  como referencia de volumen (si la meta es de cobertura %, mostrar la banda sin línea de meta y dejar la meta-% para
  J3). Mantener el `TimeSeriesChart` actual intacto al lado (no reemplazar).

**J2.2 — `/admin/programa` (antirrábica, flujo):**
- Serie: `fetchRabiesVaccinationTrend(ctx)` → `projectSeries`.
- Render: card "Proyección de vacunación antirrábica" + callout de crossing. Es un beat de venta para el ejecutivo
  ("a este ritmo, llegás/no llegás").

**Tests (J2):**
- Smoke de cada página: la card de proyección renderiza con datos del seed (no crashea con serie corta).
- Con seed de pocos buckets → muestra estado `insufficient` en vez de una recta inventada.

---

## Fase J3 — Forecast de cobertura % (stock) · follow-up 🟨

Diferido: el más vistoso (cobertura vs meta legal 80%), pero requiere una **serie de tasa-en-el-tiempo** que hoy no
existe (la cobertura se computa current-state). Tareas cuando se priorice:
- Nuevo `fetchCoverageRateTrend(ctx, metric)` en `lib/metrics/trends.ts`: % por bucket (numerador EXISTS-vigente /
  denominador población activa del bucket) con k-anon. **Esto sí puede requerir** decidir el denominador histórico
  (población "a fecha del bucket") — coordinar con Paquete E (censo) del vNext.
- Reusa `projectSeries` + `ForecastChart` tal cual (la banda y la meta ya existen).
- Aplica a: cobertura antirrábica (meta 80%), cobertura esterilización (meta programática), penetración de microchip.

---

## Cross-cutting

- **Sin schema / sin event types nuevos.** `projectSeries` y `ForecastChart` son aditivos; `fetchKpiTrend` ya existe.
- **Honestidad estadística** es requisito de aceptación, no decorativo: banda + n + método + rótulo "proyección".
- **k-anon / gaps:** los buckets suprimidos se tratan como faltantes (no 0). Documentar en el header de `forecast.ts`.
- **Período:** la granularidad la fija `bucketGranularityFor(ctx.period)` (semana ≤120d / mes). El horizonte default
  (3 buckets) se expresa en esa misma unidad.
- **Docs en el PR:** nota breve en `docs/architecture/hexagonal-lite.md` (proyección pura → forecast puro) y, si se
  agrega una métrica de glosario, su fórmula + el caveat de proyección.

## Decisiones abiertas

- **§J-D1 — método default.** `linear` (OLS) es el más explicable para un decisor; `holt` capta tendencia con
  suavizado. Default `linear`; exponer `holt` como opción. ¿Alguna serie amerita estacionalidad? (no en v1).
- **§J-D2 — horizonte default.** 3 buckets. ¿Configurable por dashboard o fijo? Default fijo en v1.
- **§J-D3 — meta en flujo vs stock.** En J2 las series son de **flujo** (conteo de eventos); la meta legal es de
  **cobertura %** (stock). No mezclar ejes: en J2 mostrar tendencia de volumen sin línea de meta-%; la meta-% llega
  con J3. Evitar el error de pintar una meta de % sobre un eje de conteos.

## Criterios de aceptación (resumen)

1. `projectSeries` proyecta series de flujo con banda que se ensancha, y estima crossing vs meta (puro, testeado).
2. `< MIN_POINTS` → estado "datos insuficientes", nunca una recta inventada.
3. `ForecastChart` distingue actual (sólido) de proyección (punteado + banda) con footnote de honestidad y a11y.
4. `/admin/poblacion` y `/admin/programa` muestran una card de proyección additive, sin romper los charts actuales.
5. Cero schema / cero event types; tests J0+J1(+J2 smoke) en verde; forecast de cobertura-% explícitamente diferido
   a J3 (no se finge sobre eje de conteos).
