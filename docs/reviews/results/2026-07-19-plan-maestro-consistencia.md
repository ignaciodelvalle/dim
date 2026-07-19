# Plan maestro — Consistencia + visualización profesional (pre-demo)

> **Framing (PO):** consistencia + visualización profesional es el ÚLTIMO paso
> antes de la demo. Este documento es VIVO — acumula todo lo que vamos
> encontrando (filtros, roadmap admin/govt, islas de diseño). Se actualiza a
> medida que avanzamos. Mobile de admin/govt está DE-priorizado (nunca migra a
> nativa; se queda web app).
>
> Última actualización: 2026-07-19.

---

## 0. Estado de un vistazo

| Frente | Estado | Próximo |
|---|---|---|
| **A. Base de filtros** (single-source período + commit strategy + `OpFilterBar`) | ✅ HECHO + pusheado (`725408c3..ec50b10b`) | Validación visual de pilotos (PO) |
| **A′. Pilotos** (`/gob/perdidas`, `/gob/maltrato`) | ✅ HECHO — ejes en rail unificado | Confirmar render tras refresh del `:3000` |
| **B. Regalos olvidados** (ejes ya cableados, control faltante) | ⏳ CONGELADO hasta OK de pilotos | 6-8 pantallas |
| **C. Filtros nivel-nacional** (export honra filtros, saved views, combinación libre) | ⏳ Futuro | Post-B |
| **Cola → Op-kit** | 🔄 En vuelo (writer `a194fe28`) | Merge + verify |
| **Roadmap admin/govt** (5 puntos no-filtro) | 📋 Planificado | Ver §3 |
| **Islas de diseño + fences** | ✅ Auditado (§4) | Widen `lint:buttons`, add `lint:select`, dedupe Panorama |

---

## 1. Filtros — panorama completo

### Qué ya está (base, HECHO)

1. **Eje de período single-sourced** — `lib/metrics/period-presets.ts`:
   `PRESET_WINDOW_DAYS` (id→días) es la ÚNICA tabla. `analytics-period.ts`
   re-exporta; `resolveAnalyticsPeriod` la lee. Se acabaron los presets
   divergentes (7/30/90/365/1095/1825).
2. **Commit strategy unificada** — `lib/ui/filter-commit.ts`:
   `serverNavCommit` (el `window.location.assign` sancionado para el bug
   router-drop de Next 15.5.18) y `makeShallowCommit` (Panorama). Colapsó las 3
   copias de `updateParams` (`PeriodPicker`, `JurisdictionSwitcher`, `UrlTabs`).
3. **`OpFilterBar`** (`components/ui/dashboard/OpFilterBar.tsx`, 334 líneas) —
   UN componente declarativo. Regiones: fila período+jurisdicción · ejes de
   dominio como `OpSelect` (idioma único) + slot `children` · chips activos +
   "Limpiar todo". Todos los commits vía `serverNavCommit`.

### Pilotos (HECHO)

| Pantalla | Ejes expuestos en el rail | Nota |
|---|---|---|
| `/gob/perdidas` | **Especie** (perro/gato/otro) | `fetchLostPets` ya aplicaba `eq(pets.species)`; "otro" = match exacto `species='other'` |
| `/gob/maltrato` | **Tipo · Severidad · Estado** | ya aplicados por `buildMaltratoListConditions`; tabs de cola = workflow, no status |

### Fase B — "regalos olvidados" (ejes YA cableados, sólo falta el control)

El predicado y la columna EXISTEN; sólo falta exponerlos en el rail. Barato.

- **Especie** (perro/gato) — portar a censo, poblacion, mortalidad, vigilancia.
- **Estado** (activo/perdido/fallecido) — ya vive en `PetStatusFilter`; portar a censo/poblacion.
- **`caseKind` / `org_type` / `verified-only`** — columnas + `eq()` existen; sólo el control.
- **Grano jurisdiccional** — predicado existe.

> Medium (NO barato): age-band (necesita helper de bucketing), verified-only en
> programa (condición matrícula). Expensive: "estado de vacunación actual"
> (columna denormalizada) — NO venderlo como barato.

### Fase C — nivel nacional

- Export honra los filtros activos (no exporta el dataset completo ignorando el rail).
- `deltaV2` sweep en las ~9 pantallas sin él (primitivo ya existe en `OpKpi`; `campanas` es template).
- Saved views (URL compartible ya lo permite; formalizarlo).
- Combinación libre de ejes.

---

## 2. Lección de Panorama — ¿la estamos aprovechando?

Panorama usa **shallow History.pushState + refetch cliente** (consola client-side).
Los ~17 dashboards de gob/admin son **server components** que leen `searchParams`
por request → NO pueden usar el patrón de Panorama sin un rewrite per-page o un
upgrade de Next. Por eso el `serverNavCommit` (hard-nav) es el idioma correcto
para ellos HOY. **Lo que sí se cosechó:** el vocabulario de filtros (período,
jurisdicción, ejes, chips) ahora es UN componente compartido en vez de N copias.
Igualar el "sin reload" de Panorama = decisión de PO (pilotear rewrite de 1-2
dashboards, o apostar upgrade de Next). Ver cierre nocturno §3.

---

## 3. Roadmap admin/govt (no-filtro) — plan por punto

> Objetivo: que admin/govt se sienta CLARO, FÁCIL, CONSISTENTE y de nivel
> nacional. Mobile de-priorizado (web app).

1. **Nav / identidad + skip-link** — cabecera consistente entre gob/admin/org,
   con salto de teclado al contenido. Hoy hay hardcodeos (`gob/organizaciones`
   fuerza `/gob` y expulsa al admin). Cierra orientación + a11y de una.
2. **`ConfirmDialog` rollout** — toda acción irreversible con el MISMO patrón de
   confirmación. Hoy "Aceptar" transferencia (irreversible) es de un clic
   mientras rechazar pide confirmación (asimetría peligrosa).
3. **`deltaV2` sweep** — coincide con Fase C de filtros; unifica cómo se lee el
   cambio temporal en todos los KPI.
4. **Primitivo de tabla/lista** — un `CaseQueue`/`Ledger` para las row-lists
   simples que hoy se reinventan (§4-F). Las tablas de analítica bespoke quedan
   como están (legítimas).
5. **`useStepFocus` helper** — NINGÚN wizard mueve el foco al cambiar de paso
   (signup, alta, mark-lost, denuncia, mordedura, servicios). Un helper compartido
   cierra el a11y de clase en varios dominios.

> Panorama-a-Op-kit = su propio proyecto futuro (PO: "proyecto propio, más adelante").

---

## 4. Islas de diseño + método de detección (auditado 2026-07-19)

**Componente canónico por concepto:** `components/ui/REGISTRY.md` (autoritativo).
Dos skins: `Ln*` (ciudadano) / `Op*` (operador).

### Islas confirmadas (barato → difícil)

| # | Isla | Dónde | Costo |
|---|---|---|---|
| A | `DeltaGlyph` clonado verbatim | `PanoramaKpiTile.tsx:22`, `KpiChips.tsx:40` | barato |
| B | KPI card paralelo (no usa `OpKpi`) | `panorama/KpiChips.tsx:93` | medio (diverge por diseño: tags de base temporal + delta neutro) |
| C | Dos sparklines (SVG vs recharts) | `panorama/Sparkline.tsx` vs `OpKpiSparkline.tsx` | medio |
| D | `<button>` crudos fuera del fence | 401 en 199 `.tsx`; fence sólo cubre `{gob,admin,org}` | medio (volumen) |
| E | `<select>` crudos sin fence | 99 en 47 archivos pese a `Ln/OpSelect` | medio |
| F | Tablas/listas a mano | 76 archivos; mezcla legítimo + islas | difícil (review-gated) |

**Corrección honesta:** empty-states están MAYORMENTE on-standard (el grep de
"No hay" da falsos positivos porque `LnEmptyState` consume esos strings como
props). Tablist ya está fenced y quemándose. Modales OK.

### Método de detección (fences CI — el patrón a copiar)

Cada fence: glob `{app,components}/**`, regex por línea, hard-fail o ratchet-baseline.

**Nuevos fences (mayor valor primero):**
- `lint:select` — **hacer primero**, mayor valor / menor riesgo. Migrar a `Ln/OpSelect`.
- `lint:buttons` — **widen** el glob a la superficie ciudadana (baseline separado citizen/operator, NO mezclar conteos).
- `lint:kpi-tile` — flag de `<div>` con firma KPI (serif-value + micro-label) fuera de `OpKpi`.
- `lint:sparkline` — ban `<polyline>`/recharts trend fuera de los 2 archivos.
- ❌ `lint:empty-state` — NO como string-fence (false positives). Review only.
- ❌ `lint:table` — impracticable (bespoke legítimo > islas). Juicio humano.

**Comando único** (`lint:islands`, encadenar en `verify`):
```
pnpm lint:buttons && lint:tablist && lint:ui && lint:tokens \
  && lint:select && lint:kpi-tile && lint:sparkline && lint:dupes
```

### Feature con lenguaje paralelo

- **Panorama** — CONFIRMADO, la grande: ~19.661 líneas, ~40 `.tsx`, NO aparece
  en `REGISTRY.md`. KPI card + sparkline + delta glyph + tablas + legends propias.
  Objetivo: **catalogar y dedupe**, no forzar chrome de operador. Reusa `OpKpi`
  en `PanoramaKpiTile` pero lo forkea en `KpiChips`.
- On-standard (NO islas): credencial pública, org portal (`Op*`), charts (gobernado
  por skill `dataviz`), landing (superficie de marketing, folds en el gap de botón-D).

**Los 3 movimientos más baratos de alto valor:** widen `lint:buttons` a ciudadano ·
add `lint:select` · dedupe `DeltaGlyph`/sparkline de Panorama en primitivos registrados.

---

## 4bis. Hallazgos nuevos (2026-07-19, sesión visualización)

- **`verify` estaba ROJO en la rama** — el cierre nocturno reportó "verify verde"
  pero era falso para `lint:tokens`: las CTAs de mis-mascotas (`e0e9c3d2`) y el
  foster toggle (`2c34485c`) aterrizaron con px arbitrarios (`gap-[7px]`,
  `rounded-[3px]`, `text-[13px]`…). **Corregido** (`0bd18d1f`, snap a scale
  tokens) → `verify` entero verde de nuevo. **Lección:** el "verde" de un cierre
  debe pegar el output de `pnpm verify` COMPLETO, no checks targeted.
- **CTAs de mis-mascotas siguen siendo copias inline de `LnButton`** — el snap a
  tokens tapó el fence, pero la deuda real es que son botones a mano. Follow-up:
  convertir a `LnLinkButton` (modo ancla) — esto también las mete bajo el
  fence de botones cuando se widee a la superficie ciudadana (§4). Un tiro, dos
  problemas.
- **`LnCheckbox` hardcodea `ln-azul` (token ciudadano) bajo skin operador** —
  gap de token latente (flag del writer de la cola). No tocado (blast radius
  global); candidato al `lint:select`/token-harmonization sweep.
- **`JurisdictionSwitcher` usa tokens ciudadanos (`ln-line`/`ln-card`) dentro de
  dashboards operador** — misma clase de gap. El `OpFilterBar` no lo restila
  (compartido); harmonizar sus tokens a `ln-op-*` es follow-up con validación en
  vigilancia + panorama embebido.

## 4ter. OpFilterBar v2 — rediseño de visualización (HECHO, sin commitear)

Respuesta al "se ve barebones" del PO. Sin tocar los componentes compartidos:
- **Header de identidad** — eyebrow "Filtros" con icono (antes sólo aria-label).
- **Rail unificado** — período + jurisdicción + ejes fluyen y ENVUELVEN juntos
  en un `flex-wrap` (antes: grid 2-col + fila separada). En pantalla ancha van
  en una línea; en angosta apilan limpio.
- **Labels consistentes** — un solo caption `text-sm` para Período + ejes,
  igualado al tamaño de los labels de jurisdicción (antes: ejes `text-xs`,
  jurisdicción `text-sm` — mismatch visible).
- **Responsive de selects** — `w-full` en mobile, `w-auto` en `sm+` (antes:
  `w-auto` fijo).
Pendiente: **validación visual del PO** antes de commitear.

## 4quater. Honestidad de filtros — auditoría de data-flow (2026-07-19) 🔴 PRIORIDAD

> El PO detectó que el mapa de perdidas no responde a la jurisdicción. Auditoría
> profunda (agente read-only) confirmó: **varios filtros se muestran activos
> pero NO tocan los datos.** Invariante violado: (events, filtros) → view.
> "Si un filtro está en la barra, TODO debe responder, o explicitar qué no y por qué."

### Gaps confirmados

| Pantalla | Elemento | Filtro que ignora | Bug / Legítimo | Acción |
|---|---|---|---|---|
| perdidas | KPIs + mapa + lista | **province/locality** (no-op deliberado D4, pero el chip se muestra activo) | BUG | Cablear scope (todas las otras `/gob` ya lo hacen) |
| perdidas | mapa | auto-zoom + scope | BUG | Pasar `visibleCodes` (mecanismo ya existe en MapChoropleth) |
| perdidas | tasa reunificación | **especie** | LEGÍTIMO (benchmark poblacional RSPCA) | Microcopy honesto en el tooltip |
| maltrato | período (control entero) | — nada lo lee | BUG | **PO decidió: SACARLO** (cola viva, period-agnostic) |
| maltrato | KPIs | kind/severity/status/admin-province (la lista SÍ los honra) | BUG | Paridad KPI↔lista |

### Ejecución (numbers-moving → verificación de paridad obligatoria)
- **Tanda maltrato** (en curso): `OpFilterBar` gana `showPeriod` → maltrato pasa
  `showPeriod={false}`; `fetchWelfareMetrics` toma kind/severity/status +
  admin-scope para igualar la lista. Cola tabs = workflow, NO status (no filtran KPIs).
- **Tanda perdidas** (siguiente, mismo `govt-dashboards.ts` → serial): pasar
  `filteredJurisdictions` (govt) / admin province-locality a `fetchLostPets` +
  `fetchPerdidasMetrics` (ya acepta el opt) + `buildProjectionContext`; cablear
  `visibleCodes` al mapa; microcopy de reunificación.

### Principio para el resto del sistema
Este patrón (chip activo ↔ dato sin filtrar) es candidato a **fence**: un control
de filtro cuyo param no se lee en ninguna query de la página es deuda de
honestidad. Barrer las ~17 pantallas de `/gob`+`/admin` por el mismo gap es
follow-up post-demo.

## 5. Decisiones de PO pendientes (no auto-ejecutar)

- **Cutover a `main` (#760)** — puede disparar deploy de prod. Es tuyo.
- **Fase B/C de filtros** — arrancan tras tu OK de los pilotos.
- **Viaje transfronterizo** — construir form o esconder tras flag.
- **"Sin reload" nivel Panorama** — pilotear rewrite o apostar upgrade Next.
- **Migraciones** — forward-only, aplicar a remoto es tuyo.
