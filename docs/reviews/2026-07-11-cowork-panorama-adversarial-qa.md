# Panorama — QA adversarial cowork (browser + código)

**Fecha:** 2026-07-11 (ART) · **Rama:** `integration/all-20260703` @ `53df8c22` · **Sesión revisada:** `f91504ab..HEAD` (73 commits)
**Método:** Claude in Chrome sobre local `:3000` con 3 cuentas (admin universal · `lucas` 5 juris · `govt-local` 1 barrio) + 2 agentes adversariales sobre el rewrite del mapa. Verificado contra `docs/reviews/critique-map.md` + `tier1–5-decisions.md` (verificar, no re-reportar). No creé datos (solo lectura/navegación).

---

## TL;DR

- **Fence jurisdiccional: SÓLIDO** — live (3 pruebas de fuga) + código (path-by-path). No encontré agujero.
- **Supresión k-anon en display: hermética** — las 5 rutas de render; nada pinta un valor suprimido como dato.
- **1 bug NUEVO confirmado en vivo:** desync al usar **Atrás** del navegador (preset/capas no re-sincronizan con la URL).
- **1 HIGH de efectividad (código, confirmado en vivo):** la escala clasificada cae a **equal-interval** (el branch quantile está muerto) → mapas "planos" en distribuciones sesgadas. Es la promesa central del rewrite, a medio entregar.
- **1 HIGH operacional latente (código):** el **cube no puede refrescar a escala nacional** en Vercel como está cableado.
- Nits de reconciliación (count-vs-rate al drillear) y copy.

---

## 1. Seguridad — fence jurisdiccional (lo más importante) ✅

**Live — intenté fugarme y no pude:**
- `lucas` (5 localidades, default CABA) → forcé `?province=AR-V` (Tierra del Fuego) y `?province=AR-Y` (Jujuy), ambas con datos a nivel admin: en los dos casos el mapa dibuja **solo la geometría** (contorno), overlay **"Sin datos para esta capa en este alcance"**, KPIs **0%**, "**Sin datos en tu alcance**". Sin fuga.
- `govt-local` (Palermo) → forcé el **padre** `?province=AR-C` (CABA): el mapa muestra todos los barrios pero **solo Palermo tiene datos**; Recoleta/Belgrano/Caballito quedan "sin datos (solo contorno)". El fence intersecta a **grano localidad**, no solo provincia.

**Código (agente adversarial, sin agujero):** scope server-derived y uniforme en `page`, `/api/panorama/[layer]`, `/api/panorama/scope`, `loadUnitHistory` (fix US-1 `373afec` verificado) y cube reads (admin-gated, `load-layer-features-cube.ts:102`); migración `0140` scopea las lecturas PII de govt por provincia **y** localidad; subsunción CABA solo aplica a CABA (no sobre-otorga).

**LOW (código, defensa en profundidad):** `/api/panorama/scope/route.ts:45-83` no valida `province ∈ allowedProvinces` — hoy inofensivo (solo devuelve geografía de padrón, pública), pero agregá el guard `narrowGovtScope` **antes** de sumarle cualquier campo derivado del scope, o el día que alguien lo haga se vuelve fuga.

---

## 2. Mapa — hallazgos en vivo (admin `/admin/panorama`)

| # | Sev | Hallazgo | Evidencia / repro |
|---|-----|----------|-------------------|
| MAP-1 | 🟠 **Alta (efectividad)** | **Escala clasificada = equal-interval, no quantile.** El branch quantile nunca dispara porque la fill siempre pasa un `lockedDomain` no-nulo (`resolveScrubDomain({live:…})`). Los docstrings prometen quantile — falso | **Live:** al drillear Río Negro, los breaks del choropleth de departamento son **48 / 89 / 131 / 172** (pasos de ~41 = intervalos iguales). En provincia sesgada colapsa a una clase → "se ve plano", justo lo que el rewrite venía a matar. (`class-scale.ts:100`) |
| MAP-2 | 🟠 Media (correctitud) | **Desync en Atrás del navegador.** El botón Atrás revierte `preset`/`layers` en la URL pero **la vista no re-sincroniza**: tab activo, leyenda, burbujas y KPIs quedan en el preset anterior | **Live:** drill Río Negro → cambio a "Bienestar" → **Atrás**. La URL vuelve a `preset=cumplimiento`, pero la pantalla sigue mostrando Bienestar (burbujas + "Denuncias de bienestar" + KPI 54). El scope (provincia) sí re-sincroniza; el preset/capas no. Una URL compartida/recargada no coincide con lo visto. |
| MAP-3 | 🟡 Media (reconciliación) | **Encoding count-vs-rate al drillear.** A nivel provincia el relleno es **tasa** (`<40/…/≥80% meta`); al drillear pasa a **conteos** (`<48/48–89/…/≥172`) mientras el KPI headline sigue en **tasa** (69,1%) | **Live:** Río Negro, cobertura antirrábica. Riesgo real de leer el mapa como % de cobertura cuando en realidad colorea conteos. (El agente lo marca como diferencia v1 documentada; igual es un misread.) |
| MAP-4 | ⚪ (refutado, ambos paths) | **H2 "el preset dropea el drill": NO reproduce** ni por click-en-mapa ni por el `<select>` | **Live:** (1) drill `province=AR-R` por mapa → cambio de preset → URL **mantuvo** la provincia + vista drilleada. (2) drill `province=AR-X` (Córdoba) por el **`<select>` de Alcance** → cambio a "Bienestar" → URL `preset=bienestar…&province=AR-X` intacta + pill "Córdoba" + 267 denuncias. El static de H2 (`applyPreset` con `useSearchParams` stale) **no se manifiesta en runtime** en ningún path. |
| MAP-5 | 🟡 Baja (deep-link) | **`level=locality` a escala nacional → mapa vacío.** Una URL con `level=locality` y sin provincia deja el choropleth en "Sin datos para esta capa en todo el país" (toggle en "Localidades") hasta pasar a "Provincias" | **Live:** entrar limpio está OK; el edge aparece al reusar/compartir una URL drilleada y volver a nacional — los KPIs cargan pero el mapa queda vacío. |

**Verificado bien en vivo:** choropleth clasificado de 4 clases + leyenda de swatches discretos, leyenda k-anon ("Dato protegido — menos de 5 registros"), inset de comunas CABA, scrubber que se auto-deshabilita por vista ("No disponible en esta vista"), presets/KPIs que actualizan, drill que vuela la cámara + cambia el pill + escribe `?province=` en la URL, y **re-encuadre al re-clickear el mismo preset**.

**Solo-código (no verificado en vivo, del agente adversarial):**
- **M1 🟡:** el **inset CABA** usa la rampa continua vieja en capas *sequential* (`SituationalMap.tsx:2859-2867`) → su color no coincide con el polígono clasificado del mapa principal. (En capas *meta* el inset usa `colorForValue`, correcto — que es lo que vi en vivo.)
- **M2 🟡:** el **histograma agregado** del scrubber ignora el scope drilleado (`searchParams` stale, `PanoramaConsole.tsx:1997`) → muestra actividad **nacional** bajo una provincia drilleada. Misma raíz que MAP-2. (Conteos nacionales honestos → sin problema de privacidad, pero scope equivocado.)
- **L (varios):** leyenda de provincia anuncia una categoría "Dato protegido" que el choropleth de provincia nunca renderiza (vestigial); `NaN` cae en la clase más baja en vez de no-data (`class-scale.ts:168`, endurecer a `Number.isFinite`); labels half-open (`40–60 / 60–80`) no desambiguan el 60.

**Supresión k-anon (display): HERMÉTICA.** El agente verificó las 5 rutas de render (provincia nunca suprimible; división → hatch; círculo → `COLOR_SUPPRESSED`; popup → "Dato protegido" chequeado antes de formatear valor; bivariado → null+hatch), con fallback sólido si el patrón de hatch falla. `No-data (#414855)` ≠ `Suprimido (#d1d5db)` ≠ rampa de datos.

---

## 3. Estados degradados — `govt-local` (Palermo, 1 barrio) ✅ honestos

- **Legend colapsa** a "Todos / Sin datos (solo contorno)" con n=1 (no intenta clasificar un solo dato).
- **Capa sparse (síntomas/vigilancia):** el mapa muestra "**Sin datos para esta capa en este alcance**" (punto puntual suprimido) mientras el KPI reporta el **agregado** ("1 rabia · 0 lepto"). Supresión de la ubicación mapeable + agregado visible al operador de esa jurisdicción — comportamiento correcto.
- **Nits:**
  - KPI dice "**Recalculado para CABA**" para un operador scopeado a **Palermo** — copy o denominador ambiguo (¿es de CABA o de Palermo? El mapa sugiere Palermo). Confirmar.
  - Pill fuera de scope muestra el **código crudo** ("AR-V", "AR-Y") en vez del nombre de provincia.
  - Stray "**0**" en `/login` (probable `{count && …}` render leak).

---

## 4. Cube / operacional — HIGH latente (código) 🔴

El refresh del cube corre los **reads pesados** en el pool `analyticsDb`, cuyo `statement_timeout` se hornea a **15 s** desde env en *module-load*. El timeout de 120 s está puesto en el **write client**, no en los reads. La cron de Vercel importa `refreshCube` **estáticamente** → el pool se construye con 15 s antes de que corra el handler, y las env de Vercel son por-deployment, no por-invocación.

**Repro (escala nacional, el tier que tier1-CB2 recomienda):** un read de departamento de Buenos Aires (~96 s medido) tira `57014` a los 15 s → como la construcción es **una txn atómica** en loop, **un solo metric-provincia over-15s falla todo el cube** → el retry determinístico también falla → `status='error'` → a las 6 h el reader cae a live para **todo** (el cube no aporta nada). Subir el env a 120 s **project-wide** reabre el death-spiral que el backstop de 15 s frena (queries de request-path con 120 s de cancel server-side, `withDbBudget` abandona a los 8 s pero no cancela el backend). **Fix:** un handle de analytics dedicado (session-pooler, como ya lo es el write client) con timeout largo **solo para los reads del builder**. Latente hoy (`CUBE_READS` OFF), pero bloquea encender el cube a escala.

---

## 5. Residuales k-anon (previamente surfaced — verificados AÚN abiertos)

Estos ya estaban en tus `tier*-decisions`; los verifico sin cambios, por trazabilidad (si ya decidiste diferirlos, ignorá):
- **KA1 🔴:** `complementarySuppress` promueve exactamente 1 hermano (`if (n!==1) continue`) y no ensancha a intervalo-factible ≥k → differencing `{A:1,B:5}` recuperable vía la marginal de densidad provincial. (`anonymity.ts:107-138`)
- **KA2 🟠:** densidad por provincia publicada **cruda** (sin k-anon, `repository.ts:940-962`) → alimenta KA1.
- **KA4 🟡:** `queryTrend` (buckets diarios) + lista de 20 eventos sin cota inferior a k una vez pasado el guard grueso; ventana angosta del scrubber en `mortalidad` expone fecha + `disposition_method` de una muerte individual bajo una celda ≥5.
- **CB1 🟡:** el reader del cube hardcodea `truncated:false` → un drill de BA (~2000 localidades INDEC) rompería paridad live-vs-cube + claim de completitud falso. Compone con el HIGH de §4 (BA es el locus de falla en ambos).

---

## 6. Verificado FIXED (spot-check, holding)
Suppression display (5 rutas) · boundary 40/60/80 → clase superior (pinned por test) · re-click preset re-frames · Back/Forward **scope** sync + abort de bundle stale · masthead pill trackea el drill cliente · leyenda seq de provincia trackea el fill scrub-locked · US-1 subsumption fence (`373afec`) · KA3/KA5/KA6 · CB2/CB3 (paridad set-equal) · reconciliation single-sourcing (`metricPredicate` comparte los EXISTS con los KPI; `check-metric-labels` guarda la colisión de labels) · migración `0140` (R1/R2).

---

## 7. Prioridad

1. **(efectividad) MAP-1 / H1:** activar quantile de verdad para capas *sequential* (o documentar honestamente que es equal-interval y corregir los docstrings). Es la promesa central del rewrite.
2. **(correctitud) MAP-2 + M2:** el bug real de esta familia es el **desync en Atrás** (MAP-2) — la vista no re-deriva preset/layers desde la URL en `popstate`; el histograma (M2) comparte la raíz. **H2 quedó refutado en vivo en ambos paths** (mapa y `<select>`) — no es bug.
3. **(operacional) §4:** handle de reads dedicado con timeout largo antes de encender `CUBE_READS` a escala nacional.
4. **(privacidad, si no está ya decidido) KA1/KA2:** cerrar el differencing por la marginal de densidad.
5. **(pulido) MAP-3** (encoding count-vs-rate al drillear) · copy "Recalculado para CABA"→localidad · pill código-crudo → nombre · stray "0" en `/login`.

---

## Anexo — cobertura live de esta sesión
- **admin** `/admin/panorama`: presets (cumplimiento + bienestar), Capas, drill click→Río Negro (cámara/pill/URL/level), cambio de preset drilleado, **Atrás** del navegador.
- **lucas** (5 juris): default CABA (read legítimo), fuga forzada `?province=AR-V` y `?province=AR-Y` → 0 datos.
- **govt-local** (Palermo): default (solo Palermo con datos), síntomas (supresión puntual + agregado), bienestar, fuga forzada del padre `?province=AR-C` → solo Palermo.
- **Verificado extra:** drill por el **`<select>`** de Alcance (Córdoba AR-X) → H2 refutado también acá; **Vistas guardadas** existe ("guardá esta vista con un nombre para volver más tarde"); edge `level=locality` nacional (MAP-5).
- **No** disparé: **Export PNG** (presente y habilitado; no lo ejecuté para evitar un diálogo "Guardar como" del SO que bloquea la extensión), capa *sequential* con inset CABA (M1, ya confirmado por código), reproducción del scrubber en loop.
