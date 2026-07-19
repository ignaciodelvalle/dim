# Auditoría de performance — Informe consolidado (load time)

> Auditoría orquestada READ-ONLY (2026-07-19). 26 agentes: medición real + 6 áreas
> (server/client) + verificación adversarial + síntesis. Panorama, admin/gob,
> perfiles de mascota, credencial pública, landing. Cada hallazgo HIGH/CRITICAL
> pasó por un escéptico que intentó refutarlo.

## 1. Resumen

La salud general de load time es **buena en localhost pero engañosa**: los tiempos medidos (todas las rutas públicas < 50 ms) son un piso local sin red ni RTT de base productiva. El dolor real no está en el bundle del navegador — maplibre (1 MB) y recharts (284 KB) están **correctamente code-split** y no cargan en las rutas públicas ni en el credencial. El dolor está en el **servidor**: los dashboards autenticados (`/gob`, panorama) disparan abanicos de **~40-48 consultas SQL contra un pool de solo 2 conexiones**, lo que serializa todo en ~20 tandas y produce la cola de ~1,7 s. En segundo lugar hay **desperdicio puro y repetido** — la misma consulta de censo corre 5 veces, la de cobertura antirrábica 3 veces, dos bucles N+1 en la página de crons — todo eliminable sin cambiar comportamiento. En rutas públicas el costo dominante es el CSS global (194 KB render-blocking) y, solo para usuarios logueados, dos validaciones de sesión en serie.

**Dónde invertir primero:** reducir el *número de consultas* del abanico de `/gob`/panorama (NO subir el pool — re-dispara un incidente documentado de conexiones). Los quick-wins de deduplicación de abajo ya recortan ~13 consultas del abanico sin riesgo.

## 2. Top quick-wins (CONFIRMADOS, bajo costo / alto retorno)

| # | Impacto | Esfuerzo | Archivo | Qué hacer |
|---|---------|----------|---------|-----------|
| 1 | ~0,2-0,5 s en `/admin/sistema/crons` | quick | `lib/analytics/admin-metrics.ts:663` / `:449` | Reemplazar el bucle "una consulta por cron" (N+1, ~22 viajes) por **un solo** `SELECT DISTINCT ON (cron_name) … ORDER BY cron_name, started_at DESC, id DESC`. El patrón ya existe en `fetchFailedCronNames`. |
| 2 | ~100-200 ms en home `/gob` | quick | `lib/analytics/mortality-metrics.ts:120` | La tarjeta Mortalidad solo muestra `total` y `traceableRate` (consulta #1) pero corre **5 consultas en serie**. Crear `fetchMortalityHeadline()`. |
| 3 | ~150-250 ms TTFB en cada perfil de mascota | quick | `app/(app)/mis-mascotas/[publicToken]/page.tsx:395` | 5 lecturas independientes corren en serie. Unificarlas en **un solo `Promise.all`**. |
| 4 | 60-120 ms por carga panorama/`gob` | quick | `src/modules/panorama/application/get-panorama-kpis.ts:445` | `fetchRabiesCoverage` corre 3× recomputando denominador/censo **byte-idénticos**. Calcular el denominador **una vez**. |
| 5 | ~20-90 ms; libera conexiones | quick | `lib/analytics/govt-home-kpis.ts:583` | `fetchCensusPopulation` corre **5×** una tabla estática de 24 filas que **ya está cacheada en memoria** (`repository.ts:4130`). |
| 6 | Recorta consultas + join en `/gob` | quick | `lib/analytics/govt-dashboards.ts:563` | Home solo muestra `activeCount` pero corre `fetchLostPets` (≤500 filas) + join. Camino count-only. |
| 7 | Slider de opacidad fluido | quick | `PanoramaConsole.tsx:1798` + `SituationalMap.tsx:1988` | Cada tick del slider **re-sube todo el GeoJSON**; la opacidad es solo `setPaintProperty`. Sacar `opacities` de las deps de `activeLayers`. |
| 8 | Menos carga DB en escaneo QR | quick | `app/(public)/p/[publicToken]/page.tsx:113` y `:222` | Row de la mascota consultado **2×**. Envolver en `React.cache`. (Concurrentes → ~0 ms reloj; ahorro de DB, no de pintado.) |

## 3. Big rocks (estructurales confirmados, esfuerzo dedicado)

1. **Abanico de `/gob` home: ~40 consultas contra pool de 2** — `app/gob/page.tsx:157`. Costo servidor dominante del producto. Pool real **max:2** (no 3). Palanca: **bajar el conteo de consultas** (quick-wins 4-6 ya sacan ~13); el paso grande es consolidar `count() FILTER` sobre `pet_events` con el mismo scope en menos consultas multi-métrica.
2. **Abanico de KPIs de Panorama: ~48 statements, mismo pool** — `get-panorama-kpis.ts:443`. Misma clase; el remedio real son las deduplicaciones (4-5), no tocar el pool.
3. **`globals.css` 194 KB render-blocking en toda ruta** — `app/layout.tsx:13`. **Magnitud corregida ~3×:** Tailwind v4 emite una sola hoja; mover skins `.lp-*` a CSS Modules gana ~10,5 KB gz (no una hoja mínima). Vale, pero acotado.
4. **Refetch de Libreta re-corre auth + acceso en el 100% de los perfiles** — `PetDetailTabsPanel.tsx:172`. **Reencuadrado:** NO es camino crítico (el credencial se pinta por SSR) — es **trabajo de backend desperdiciado**. Fix seguro: `LibretaFace` en su propio `<Suspense>` reusando el acceso ya resuelto. ⚠️ **Rechazado:** pasar el acceso desde el cliente (`requirePetAccess` es la frontera de seguridad — Drizzle saltea RLS).

## 4. Por área

### Panorama — servidor
- ✅ Abanico ~48 statements / pool max:2 (big rock #2). ✅ `fetchRabiesCoverage` 3× (qw 4). ✅ `fetchCensusPopulation` 5× (qw 5).
- ⚪ No verificados: `fetchActiveZoonosis` 6 consultas para una sub-línea de tooltip; falta dedup `React.cache` entre KPIs y capa seed.

### Panorama — cliente
- ✅ `setData` re-sube GeoJSON sin chequeo de identidad (dispara con slider de opacidad y scrub, NO con dock/legend/cámara). ✅ Slider fuerza re-upload (qw 7; en tableros provinciales el costo es recálculo de escala, no subida).
- ⚠️ SituationalMap sin `React.memo` (PLAUSIBLE, frecuencia inflada — solo re-renderiza al cruzar bordes; `React.memo` no ataca el camino citado; el fix real es resaltado imperativo de fila).

### admin / gob
- ✅ Mortalidad 5→1 (qw 2). ✅ Sobre-fetch Pérdidas (qw 6). ✅ `fetchCronRuns` N+1 (qw 1). ✅ Abanico ~40 (big rock #1).
- ⚠️ `fetchCronHealth` N+1 (PLAUSIBLE, impacto inflado — ninguna página llama a ambas cron funcs; es un solo N+1 ~22, no ~44).

### perfiles (mascotas)
- ✅ Refetch Libreta re-autentica (big rock #4). ✅ Waterfall ~5 awaits (qw 3; prod 150-250 ms).
- ⚪ No verificados: `PetOpenCasesSection` re-consulta casos en memoria; carrusel corre proyección de todo el hogar para dots; `fetchPetEventsForProfileV2` sin acotar; QR inline serial.

### público / landing
- ✅ Row 2× por escaneo (qw 8; ~0 ms reloj). ⚠️ Rate-limit serializado antes de la lectura (mecanismo real, impacto **refutado** — gatea TTFB no la cola; ⚠️ rechazado rate-limiter en memoria por invariante multi-instancia; fix válido: lectura en paralelo al límite).
- ⚪ No verificados: 3 consultas de vacunación donde 1 alcanza; `StorySection` sobre-hidrata 460 líneas estáticas; QR del hero por request; landing forzado dinámico por `getUser()`.

### data / bundle
- ✅ `globals.css` (magnitud ~3× corregida, big rock #3). ✅ Layout público `getUser()` bloqueante (solo logueados; usar `getClaims()`/`getSession()` local).
- ⚠️ Middleware `getUser()` apilado (bajo valor; el fix con impacto rompe refresco de cookies + `x-pathname`).
- ⚪ No verificados: CSP reconstruida por request; 5 familias de fuentes / 14 pesos globales; sin `browserslist` → polyfills 110 KB.

## 5. Descartado (verificado y bajado de la lista)

- **Rate-limit infla la cola de `/p`** — REFUTADO (gatea TTFB, pocos ms).
- **`getUser` de middleware infla TTFB de `/p` para todos** — REFUTADO (anónimos no hacen red; fix con impacto es inseguro).
- **`globals.css` → hoja mínima, 30-80 ms** — magnitud REFUTADA (~10,5 KB gz real).
- **`fetchLostPets` ilimitado** — REFUTADO (hay `.limit(500)`; costo de viajes, no payload).
- **`React.memo` en SituationalMap corta jank por mouse-move** — frecuencia inflada.
- **Crons pagan N+1 dos veces (~44)** — REFUTADO (un solo N+1 ~22).
- **Refetch Libreta suma 100-250 ms de load** — reencuadrado (backend desperdiciado, no camino crítico).
- **Pet row 2× agrega 20-80 ms de pintado** — REFUTADO (concurrente, ~0 ms).
- **maplibre-gl (1 MB) + recharts (284 KB) en bundle** — NO es defecto (code-split correcto). Vigilar regresiones con un lint que impida value-imports desde rutas públicas.
