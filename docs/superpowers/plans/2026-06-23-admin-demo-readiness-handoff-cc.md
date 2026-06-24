# Handoff CC — Portal Admin: demo-readiness (funcional + diseño)

> **Origen.** Revisión manual end-to-end del portal `/admin` en Chrome (login `admin@dim.test`), contra el runbook
> [`docs/demo/README.md`](../../demo/README.md) y el plan [`2026-06-22-demo-readiness.md`](./2026-06-22-demo-readiness.md).
> Incluye un design critique del shell de operador. Fecha: 2026-06-23. Reemplaza/consolida
> [`2026-06-23-demo-readiness-fixes-cc-handoff.md`](./2026-06-23-demo-readiness-fixes-cc-handoff.md).
>
> **Veredicto:** **NO grabable todavía.** Blocker de performance (P0) en Programa/Censo/Población + bugs latentes de
> la misma clase. Dos crashes ya corregidos en el working tree (sin tests). Diseño: sólido, con ajustes de jerarquía
> y de estados. SDD/TDD: cada fix lleva test sugerido (test-first).

---

## Resumen por prioridad

| # | Prioridad | Item | Estado |
|---|-----------|------|--------|
| A1 | 🟥 hecho | Crash global `/admin/*` (banner demo cliente→server) | Aplicado, falta test |
| A2 | 🟥 hecho | Crash Programa/Censo/Población (`Date` crudo en `sql`) | Aplicado, falta test |
| P0 | 🟥 abierto | Programa/Censo/Población cuelgan >30s (perf `pet_events`) | **Blocker** |
| P1 | 🟧 abierto | Bugs latentes de `Date` crudo (gob, export, forecast) | Abierto |
| D1 | 🟧 abierto | Top bar sobrecargado + chip de scope domina | Abierto |
| D2 | 🟨 abierto | Sin estado "tardando/timeout" en analítica | Abierto |
| P2/D3 | 🟨 abierto | "38 ≤ 99", doble aviso de demo, capa "% cumplimiento" vacía | Abierto |

---

## Estado por beat (recorrido ejecutivo)

| Beat | Pantalla | Estado |
|------|----------|--------|
| Lo ve | `/admin/panorama` | ✅ KPIs, capas, reproducción temporal, disclosure |
| Mide + planifica | `/admin/programa` (+ Censo / Población) | ❌ **P0** — no crashea (A2) pero cuelga >30s |
| Acciona | `/admin/alertas` | ✅ triage completo: disparada → reconocida → autoridad contactada → resolver |
| Confía | `/admin/libro` | ✅ ledger append-only, enmienda (D0-3), reproducción `?asOf=` |
| Se lo lleva | Informe oficial | ⚠️ sin verificar — comparte métricas census/population; probable P0 |
| Escala | `/admin/acerca/integracion-miarg` | ✅ vista ilustrativa con disclaimer no ocultable (D3) |

---

## FUNCIONAL

### A1 — `app/admin/layout.tsx` · crash global de `/admin/*` 🟥 (fixeado)
`DemoModeBanner.tsx` declara `"use client"` → su export `shouldShowDemoBanner()` es cliente; el `AdminLayout` (server)
la invocaba → "Attempted to call shouldShowDemoBanner() from the server" → **todo `/admin/*`** caía en error boundary.
**Fix aplicado:** flag inline (`process.env.NEXT_PUBLIC_DEMO_MODE === "true"`); helper/test cliente intactos.
**A consolidar (CC):** mover `shouldShowDemoBanner` a módulo server-safe o dejarlo sólo como helper de test.
**Test:** render server-side del layout con flag on/off no debe lanzar; banner visible sólo con on.

### A2 — `lib/metrics/census.ts` · crash Programa/Censo/Población 🟥 (fixeado)
`registryCounts` interpolaba un `Date` crudo en `sql\`\``: `pe.occurred_at >= ${dormancyCutoff}`. Con `postgres-js`
+ `prepare:false` (`db/index.ts`) lanza `ERR_INVALID_ARG_TYPE` ("Received an instance of Date"); drizzle lo envuelve
("Failed query…") y la causa real queda en `.cause`.
**Fix aplicado:** `dormancyCutoff.toISOString()` (cast implícito a timestamptz).
**Test:** integración — `registryCounts(ctx)` con `period.until` real resuelve sin lanzar.

### P0 — Programa / Censo / Población cuelgan o lentísimos 🟥 ABIERTO (blocker)
Tras A2 dejan de crashear pero quedan **>30s en "Cargando…"** sin renderizar (un intento terminó en "network error").
Sospecha: subconsultas correlacionadas `EXISTS/NOT EXISTS` sobre `pet_events` por cada `pets` (p.ej.
`registryCounts.dormant`, `fetchSterilizationCoverage` por provincia) sobre el dataset Panorama (~45k mascotas).
**Acciones:**
1. `EXPLAIN ANALYZE` real contra la DB local sembrada.
2. Verificar que el índice `pet_events_pet_id_occurred_at_idx (pet_id, occurred_at)` esté **aplicado** (¿migración
   faltante? FK no crea índice en PG).
3. Si hay seq scan / anti-join caro: reescribir los `EXISTS` correlacionados como `LEFT JOIN … GROUP BY` o
   pre-agregar "última actividad por mascota".
**Gate:** Programa, Censo, Población e Informe rinden en **< ~3s** con el seed completo (smoke/perf test).

### P1 — Bugs latentes de `Date` crudo (misma clase que A2) 🟧 ABIERTO
Confirmado por tipos (`{ since: Date; until: Date }`). Crashearán cuando el path corra con fecha poblada.
**Fix uniforme:** `.toISOString()` (o `sql.param(date.toISOString())`).

| Archivo:línea | Símbolo | Portal |
|---------------|---------|--------|
| `lib/metrics/population.ts:60-62` | `opts.window.since/until` | Forecast / Panorama / Programa |
| `lib/metrics/custody.ts:241` | `ctx.period.since` | Gob (disputas custodia) |
| `lib/govt-dashboards.ts:2030-2031` | `period.since/until` (`fetchPetsForExport`) | Gob (export CSV) |
| `lib/govt-dashboards.ts:2076-2077, 2118-2119` | `period.since/until` | Gob (dashboards) |
| `lib/data-lifecycle.ts:53, 94` | `cutoff` (confirmar tipo) | Cron / retención |
| `lib/outreach-pipelines.ts:173` | `cutoff` (confirmar tipo) | Gob (outreach) |

> Ya correcto en `admin-metrics.ts`, `surveillance-metrics.ts`, `outreach-pipelines.ts:242-313`, `owner-dashboard.ts:1188`.
**Recomendado:** agregar regla de lint / test de repo que prohíba interpolar `Date` directo en `sql\`\``.

---

## DISEÑO (design critique del shell de operador)

> Base: sistema de diseño "operador" sólido y sobrio; muy buenos error boundary y skeletons; aviso de demo honesto;
> estados de triage claros; Libro append-only con reproducción temporal es un standout. Lo que sigue son ajustes.

### D1 — Top bar sobrecargado; el chip de scope roba el foco 🟧
A 1366px el breadcrumb ("Nueva cuenta") y "Cerrar sesión" **se parten en dos líneas**; en laptops más chicas empeora.
El chip rojo saturado **SUPERADMIN · UNIVERSAL** es el elemento más fuerte de la pantalla, pero es metadata (scope), no
contenido — compite con el H1.
**Fix:** de-enfatizar el chip (variante outline/neutral o integrarlo al cluster "admin · Universal" de la derecha);
colapsar/truncar metadata a la derecha para que el breadcrumb no haga wrap. Afecta `components/layout/*`
(AppShell/topbar) y `OpScopeChip`.
**Test:** snapshot del topbar a 1280/1366px sin wrap; el H1 de la página debe ser el elemento de mayor peso visual.

### D2 — Falta estado "tardando/timeout/vacío" en analítica 🟨
Programa/Censo/Población se quedan en **skeleton para siempre** cuando las queries son lentas → el skeleton miente
("ya casi"). UX-wise, además del fix de P0, agregar: timeout con mensaje + reintento, y un estado vacío honesto.
**Test:** simular fetch lento/fallido → la página muestra estado de demora/error, no skeleton infinito.

### D3 — Pulido para cámara 🟨
- **Umbral de alerta "38 ≤ 99"** (en `/admin/alertas`): lee confuso/poco creíble. Mostrar "38% (meta 70%)" o
  "observado 38 · umbral 70". Sembrar umbral cercano a la meta real (~70) en `seed-demo-scenario.ts`.
- **Doble aviso de demo:** banner global + disclosure propio de `PanoramaShell` cuando ambos están on. Suprimir el de
  Panorama cuando `NEXT_PUBLIC_DEMO_MODE` global está activo.
- **Panorama · capa "% de cumplimiento":** muestra "Sin datos para esta capa en tu cobertura" a nivel provincia/90d
  mientras el resto pinta. Confirmar si debe poblarse con el seed o es esperado.

### A verificar (a11y, no bloqueante)
Contraste del texto secundario gris ("· Universal" y grises menores) ≥4.5:1; focus states visibles; `aria-busy` en
skeletons; label del omnibox de búsqueda.

---

## Repro

```powershell
$env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev   # http://localhost:3000
# login admin@dim.test / Test1234!
# /admin            → OK (con A1)
# /admin/programa   → P0: cuelga >30s   (idem /censo, /poblacion)
# /admin/libro      → OK
# /admin/alertas    → OK
# /admin/govts      → OK (form /admin/govts/new OK)
# /admin/acerca/integracion-miarg → OK
```

## Antes de grabar (reset de estado)
La verificación avanzó la alerta de CABA a "AUTORIDAD CONTACTADA". Resetear:

```bash
pnpm seed:demo:scenario
pnpm demo:verify   # gate verde
```

## Orden sugerido
1. **P0** (perf analítica) — sin esto no hay demo.
2. **P1** (`Date` crudo) — riesgo de crash en el lado gob durante la demo y en prod.
3. **D1 + D2** (top bar + estado de demora) — primera impresión y resiliencia.
4. Consolidar **A1/A2** con tests; **D3** pulido de cámara.
