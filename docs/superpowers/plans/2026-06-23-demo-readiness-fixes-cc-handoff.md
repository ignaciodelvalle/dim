# Handoff CC — Fixes de demo-readiness (recorrido ejecutivo gob)

> **Origen.** Revisión manual end-to-end del recorrido ejecutivo gubernamental en Chrome (login `admin@dim.test`),
> contra el runbook [`docs/demo/README.md`](../../demo/README.md) y el plan
> [`2026-06-22-demo-readiness.md`](./2026-06-22-demo-readiness.md). Fecha: 2026-06-23.
>
> **Veredicto:** todavía **NO grabable**. Un blocker de performance abierto (P0) en Programa/Censo/Población, más
> bugs latentes de la misma clase que ya rompieron el portal. Dos crashes ya fueron corregidos durante la revisión
> (ver "Ya aplicado"). SDD/TDD: cada fix abajo lleva su test sugerido (test-first).

---

## Estado por beat (recorrido ejecutivo)

| Beat | Pantalla | Estado |
|------|----------|--------|
| Lo ve | `/admin/panorama` | ✅ OK — KPIs, capas, reproducción temporal, disclosure "Datos de demostración" |
| Mide + planifica | `/admin/programa` (+ Censo / Población) | ❌ **P0** — ya no crashea (fix aplicado) pero **cuelga / >30 s sin renderizar** |
| Acciona | `/admin/alertas` | ✅ OK — cadena de triage completa: disparada → reconocida → autoridad contactada → resolver |
| Confía | `/admin/libro` | ✅ OK — ledger append-only, enmienda presente (D0-3), reproducción temporal (`?asOf=`) funciona |
| Se lo lleva | Informe (reporte oficial) | ⚠️ Sin verificar — comparte las métricas de census/population; probable mismo P0 |
| Escala | `/admin/acerca/integracion-miarg` | ✅ OK — vista ilustrativa con disclaimer no ocultable (D3) |

---

## Ya aplicado durante la revisión (revisar y consolidar con test)

Ambos cambios quedaron en el working tree, **sin tests todavía**. Hay que cubrirlos antes de mergear.

### A1 — `app/admin/layout.tsx` · crash global de `/admin/*` 🟥 (fixeado)
`DemoModeBanner.tsx` declara `"use client"`, lo que vuelve cliente a su export `shouldShowDemoBanner()`.
El `AdminLayout` (server component) la invocaba → "Attempted to call shouldShowDemoBanner() from the server" →
**toda ruta `/admin/*` caía** en el error boundary. Lo introdujo el commit de demo-readiness (`feat(demo)…`).

**Fix aplicado:** no importar la función cliente en el layout; calcular el flag inline
(`process.env.NEXT_PUBLIC_DEMO_MODE === "true"`). El helper y su test quedan intactos para el lado cliente.

**Mejor solución a evaluar (CC):** mover `shouldShowDemoBanner` a un módulo server-safe (sin `"use client"`),
o dejarlo sólo como helper de test. Test: render del layout server-side con el flag on/off no debe lanzar.

### A2 — `lib/metrics/census.ts` · crash de Programa/Censo/Población 🟥 (fixeado)
`registryCounts` interpolaba un objeto `Date` crudo dentro de un fragmento `sql\`\``:
`pe.occurred_at >= ${dormancyCutoff}`. Con `postgres-js` + `prepare:false` (ver `db/index.ts`), esa serialización
lanza un error de Node **`ERR_INVALID_ARG_TYPE`** ("The 'string' argument must be of type string… Received an
instance of Date"). Drizzle lo envuelve como `DrizzleQueryError` ("Failed query: …") y la causa real queda en
`.cause` (por eso no se ve el código pg en el navegador).

**Fix aplicado:** bindear `dormancyCutoff.toISOString()` (string → cast implícito a timestamptz en el `>=`).

**Test sugerido:** integración contra Postgres local — `registryCounts(ctx)` con un `ctx.period.until` real
debe resolver sin lanzar y devolver los conteos esperados (hoy ese path explota).

---

## P0 — Programa / Censo / Población cuelgan o son lentísimos 🟥 ABIERTO (blocker de demo)

Tras A2, `/admin/programa` deja de crashear pero queda **>30 s en "Cargando…"** (skeleton), sin llegar a
renderizar; en un intento el request RSC terminó en "network error". Censo y Población usan las mismas métricas.

**Sospecha principal (a confirmar con la DB/terminal, no pude acceder a la DB local desde el sandbox):**
las métricas de census/population corren **subconsultas correlacionadas `EXISTS/NOT EXISTS` sobre `pet_events`
por cada `pets`** (p. ej. `registryCounts.dormant`, `fetchSterilizationCoverage` por provincia) sobre el dataset
del Panorama (~45 k mascotas + eventos). Hay que:

1. Sacar el **`EXPLAIN ANALYZE`** real de esas queries contra la DB local sembrada.
2. Verificar que el índice `pet_events_pet_id_occurred_at_idx (pet_id, occurred_at)` (definido en `db/schema.ts`)
   **esté aplicado** en la DB de la demo (¿migración faltante? recordar: FK no crea índice automático en PG).
3. Si el plan hace seq scans / anti-join caro: reescribir los `EXISTS` correlacionados como `LEFT JOIN … GROUP BY`
   o pre-agregación, o materializar el "última actividad por mascota".

**Gate:** Programa, Censo, Población y el Informe deben renderizar en **< ~3 s** con el seed completo.
Idealmente cubrir con un test de performance o, mínimo, un smoke test que asegure que las páginas resuelven.

---

## P1 — Bugs latentes de Date crudo (misma clase que A2) 🟧 ABIERTO

Mismo patrón: `Date` interpolado crudo en `sql\`\``. Crashearán con `ERR_INVALID_ARG_TYPE` cuando el path corra con
el parámetro de fecha poblado. Confirmado por tipos (`{ since: Date; until: Date }`). **Fix uniforme: `.toISOString()`**
(o `sql.param(date.toISOString())`). Auditar y normalizar todos:

| Archivo:línea | Símbolo | Portal afectado |
|---------------|---------|-----------------|
| `lib/metrics/population.ts:60-62` | `opts.window.since/until` (`Date`) | Forecast / Panorama / Programa |
| `lib/metrics/custody.ts:241` | `ctx.period.since` (`Date`) | Gob (disputas de custodia) |
| `lib/govt-dashboards.ts:2030-2031` | `period.since/until` (`fetchPetsForExport`) | Gob (export CSV) |
| `lib/govt-dashboards.ts:2076-2077, 2118-2119` | `period.since/until` | Gob (dashboards) |
| `lib/data-lifecycle.ts:53, 94` | `cutoff` (confirmar tipo) | Cron / retención |
| `lib/outreach-pipelines.ts:173` | `cutoff` (confirmar tipo) | Gob (outreach) |

> La mayoría del código ya usa `.toISOString()` bien (`admin-metrics.ts`, `surveillance-metrics.ts`,
> `outreach-pipelines.ts:242-313`, `owner-dashboard.ts:1188`). Estos son los que quedaron crudos.

**Acción recomendada:** además de fixearlos, agregar una **regla de lint** (o un test de repo) que prohíba
interpolar un `Date` directo en `sql\`\`` — para que no reaparezca. Test por sitio: la métrica/export con un período
real resuelve sin lanzar.

---

## P2 — Menores / pulido para cámara 🟨

- **Panorama · capa "% de cumplimiento":** muestra "Sin datos para esta capa en tu cobertura" a nivel provincia/90 d,
  mientras el resto de las capas pintan. Confirmar si debería poblarse con el seed o es esperado.
- **Alertas · umbral "38 ≤ 99":** el umbral 99 lee raro en cámara (¿por qué 99?). Para credibilidad, sembrar un
  umbral cercano a la meta real (~70) en `seed-demo-scenario.ts` de modo que el "observado 38 < meta 70" cuente solo.
- **Banner de demo:** confirmado que aparece con `NEXT_PUBLIC_DEMO_MODE=true` (PowerShell: `$env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev`).
  Sin el flag no aparece — documentar/forzar en el comando de la demo.

---

## Repro

```powershell
$env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev   # http://localhost:3000
# login admin@dim.test / Test1234!
# /admin            → OK (con A1)
# /admin/programa   → P0: cuelga >30s
# /admin/censo      → idem
# /admin/poblacion  → idem
# /admin/libro      → OK
# /admin/alertas    → OK
```

## Antes de grabar (reset de estado)
Durante la verificación se avanzó la alerta de CABA a "AUTORIDAD CONTACTADA". Re-correr el seed para volver a
"DISPARADA":

```bash
pnpm seed:demo:scenario
pnpm demo:verify   # gate verde
```

## Orden sugerido
1. **P0** (Programa/Censo/Población perf) — sin esto no hay demo.
2. **P1** (Date crudo) — riesgo de crash en el lado gob durante la demo y en producción.
3. Consolidar **A1/A2** con tests.
4. **P2** pulido.
