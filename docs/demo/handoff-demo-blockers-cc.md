# Handoff (CC) — Bloqueantes de la demo ejecutiva

> Para Claude Code. Tres fixes chicos que destraban el **corte completo** del recorrido (filmable). Ninguno toca schema.
> Origen: revisión visual 2026-06-23 sobre `localhost:3001` (`admin@dim.test`, `NEXT_PUBLIC_DEMO_MODE=true`).
> Verificación esperada al final: `pnpm demo:verify` verde **y** las 3 pantallas renderizan con datos en la primera pintura.

---

## B1 — ForecastChart renderiza vacío (🔴 bloquea el beat "planifica")

**Síntoma:** en `/admin/programa`, la tarjeta "Proyección de vacunación antirrábica" muestra un cuadro blanco. Hay datos (el header dice "3 períodos ocultos (privacidad)", o sea `rabiesTrend.suppressedCount > 0` y `hasRabiesTrend === true`), pero el `<ComposedChart>` de recharts no dibuja.

**Dónde mirar:**
- `components/charts/ForecastChart.tsx` — usa `<ResponsiveContainer width="100%" height={height}>` (height=300). Sospechas en orden: (a) el contenedor padre (`OpCardBody`) colapsa el alto en el primer paint → ResponsiveContainer mide 0; (b) `chartData` con todas las `actual`/`forecast` en `undefined` salvo el vértice de join; (c) hidratación lazy (`ForecastChartDynamic`, `ssr:false`) que no remonta.
- `components/charts/ForecastChartDynamic.tsx` (wrapper `next/dynamic`).
- `lib/metrics/forecast.ts` (`projectSeries`, `ForecastResult`) — confirmar que `points` tiene ≥2 `actual` con `y` numérico.

**Fix sugerido:** dar alto mínimo explícito al contenedor (evitar height 0 del ResponsiveContainer), y agregar un guard: si `points.filter(kind==='actual')` < 2 → renderizar el estado `insufficient` (que ya existe y es honesto) en vez de un SVG vacío. Añadir un test de que el `<figure data-forecast-*>` contiene un `<svg>` no vacío cuando hay datos.

**Aceptación:** con el seed de demo, `/admin/programa` muestra la línea sólida (actuals) + tramo punteado (proyección) y el footnote `n=…, método=…`.

---

## B2 — Microchip y Antirrábica en 0% en todas las provincias (🔴 lee como dato faltante)

**Síntoma:** en "Outliers por provincia" (`/admin/programa`) y en KPIs de `/gob`, Microchip y cobertura Antirrábica dan **0%** en BA, Córdoba, Santa Fe y CABA. Esterilización sí tiene valores reales (40.2 / 33.6 / 31.7 / 38.1%). En cámara, 0% en todas partes parece seed sin poblar, no un outlier.

**Dónde mirar:** `scripts/seed-demo-scenario.ts` / `scripts/seed-panorama.ts` — las series que alimentan `fetchMicrochipPenetration` y `fetchRabiesCoverage` (`lib/compliance-metrics.ts`, `lib/govt-home-kpis.ts`).

**Fix sugerido (additive, idempotente, prefijo `DEMO-`, guard local-only):** emitir eventos `microchip_implanted` y `vaccination_administered` (antirrábica) suficientes para que al menos 2–3 jurisdicciones tengan cobertura > 0 y variada (alguna sobre meta, alguna bajo). Alternativa rápida si no se quiere poblar: ocultar las filas/metricas en 0 universal para que la tabla no muestre métricas vacías.

**Aceptación:** ninguna métrica del recorrido aparece en 0% en el 100% de las jurisdicciones; los outliers leen como hallazgos reales.

---

## B3 — Mapa de Panorama negro en la primera pintura (🟡/🔴 es el centro visual)

**Síntoma:** en `/admin/panorama` (y `/gob/panorama`) el coropleto carga oscuro/vacío. La "Reproducción temporal" atenúa las capas sin dimensión temporal y se ve "Sin datos para esta capa en tu cobertura"; recién al esperar o cambiar de capa aparecen las provincias.

**Dónde mirar:** `components/charts/MapChoropleth.tsx` / `MapChoroplethDynamic.tsx` y el componente de reproducción temporal del Panorama; la capa/seleccion por defecto.

**Fix sugerido:** que la **capa por defecto** sea una con datos poblados (p. ej. "% de cumplimiento") y que la reproducción temporal **no** arranque en un estado que atenúa todo; default a una vista estática poblada. Si una capa no tiene datos, elegir automáticamente la primera que sí los tenga en lugar de mostrar el vacío.

**Aceptación:** al entrar a Panorama, el mapa pinta provincias con color en el primer render, sin interacción previa.

---

### Notas menores (no bloqueantes, del critique)
- Delta implausible "+1169.7% vs mes ant." en esterilizaciones (`/gob`) — acotar ventana del cálculo.
- Unificar tarjeta KPI con sparkline entre `/admin/programa` y `/gob`.
- Verificar contraste de rojo-sobre-rosa (KPIs bajo meta) y banner de demo (≥4.5:1).
