# Plan unificado para CC — backlog consolidado (2026-06-22)

> **Single source of truth de lo que QUEDA**, después de la sesión de auditoría + la pasada de verificación en
> vivo del branch `review/all-session-prs` (con `seed:panorama` cargado, ~46k mascotas). Consolida los planes
> detallados (linkeados abajo) en un backlog ordenado, y agrega el feature nuevo de **granularidad
> provincia↔localidad**. SDD test-first, docs en el mismo PR. Severidad: 🔴 · 🟡 · 🟢.

## Verificado en vivo (✅ cerrado — no rehacer)
- 🌟 **Panorama** (`/admin/panorama` + `/gob/panorama`): mapa por capas + basemap AR, 8 capas, multi-capa, drawer → "Abrir expediente", **replay temporal** (capas no-temporales atenuadas), KPIs, filtros, banner "Datos de demostración" + "Acerca de estas métricas". Fiel al spec.
- **Data enrichment** landeó: zoonosis (14), decomisos (6, con expedientes), esterilizaciones (vets ranking), pérdidas (105).
- **Admin fixes**: 404 branded en `/admin`, auditoría humanizada + acento, `/admin/govts/new` con `*` + breadcrumbs localizados ("Gobiernos › Nueva cuenta") + acentos, Campañas construida (ex-404), fechas de Outreach ("sin registro").

## Backlog ordenado (lo que queda)

### P0 — 🔴 bloqueante (regresión nueva)
**U1 — ✅ HECHO** (`feat/dashboards-trends` `406149d9`, integrado en `review/all-session-prs`): helper
`truncBucket()` inlinea la unidad del `date_trunc` vía `sql.raw` (re-whitelisteada, injection-safe), reusado en
select/groupBy/orderBy de las 4 fetchers. Test DB-backed `lib/metrics/trends.test.ts` (las 4 fns resuelven sin
throw contra Postgres local — un test puro no cazaba el fallo de plan). El executive-smoke e2e (#704) cubre la
clase de ruta. Verificado: tsc 0 · 199 tests · `/gob/mortalidad` + `/gob/analytics` levantan.

**U1 · `lib/metrics/trends.ts` — `date_trunc` con unidad como bind param tumba dos dashboards.**
Las dos funciones de tendencia (D1) hacen `date_trunc($N, "pet_events"."occurred_at")` con `'month'` pasado como
bind param y la query falla:
- `fetchDeathCausesTrend` (`trends.ts:59`) → `/gob/mortalidad` crashea (digest `3570919338`).
- `fetchOutbreakSignalsTrend` (`trends.ts:67`) → `/gob/analytics` crashea (digest `1487991369`).
**Fix:** inliná la unidad del `date_trunc` (literal / `sql.raw`) en vez de bindearla — arregla los dos.
**Test:** unit de cada trend fn devuelve filas; e2e GET 200 de `/gob/mortalidad` y `/gob/analytics`.

### P1 — 🟡 pre-entrega al ejecutivo (cerrar gate)
**U2 · Verificar/cerrar residuos de admin & dashboards** (detalle en `2026-06-22-admin-fresh-sweep-fixes.md` A1-A7 y `2026-06-22-dashboards-deep-dive.md` D1-D7):
- A2 🟡 **RuleImpactBanner no calcula** ("No se pudo calcular el impacto") — operador crea regla PPP province-wide a ciegas. (No re-verificado este pase.)
- D3 🟡 **enums/inglés restantes**: validar `/gob/analytics` H1 ("Analytics"→"Analítica"), causas "illness/Euthanasia", y el nit nuevo **"Enrollment"** en el subtítulo de Campañas.
- D4 🟡 **disposición reconcilia** (Trazabilidad vs Desconocida vs 100%) — desbloquea al arreglar U1 (mortalidad).
- A7 🟢 cuentas `system:*` separadas en `/admin/admins`. A3 🟢 barrer acentos restantes (sistema/organizaciones/servicios) + el **copy-lint** que lo previene.

**U3 · Exec gate [VERIFICAR]** (detalle en `2026-06-22-executive-e2e-readiness.md`): magic-link primer login, páginas de detalle/drill, sub-dashboards (zoonosis/investigaciones/decomisos/disputas), **descarga real del CSV**, **mobile en dispositivo**, y 1 workflow de aprobación end-to-end. (Yo hago esta pasada en vivo cuando U1 esté tapado.)

**U4 · Cobertura de datos restante** (detalle en `2026-06-22-panorama-data-coverage.md`): completar lo que aún quede en 0 — **PPP** (`dangerous_breed_attested`), **adopción** (`adoption_finalized`), **microchip** a tasa realista, **B3 trazabilidad** (campo de instalación en `death_recorded`), y **campañas** (hoy `/gob/campanas` renderiza vacío). Gate: ningún KPI de la fila principal en 0 por falta de datos.

### P2 — ⭐ feature nuevo: granularidad provincia ↔ localidad
**U5 · Eje de agregación seleccionable (Provincia / Localidad) en el Panorama y en los dashboards.** Ver §Diseño abajo.

### P3 — 🟢 durable (lock-in)
**U6 · Guardrails** (detalle en `2026-06-21-design-system-hardening.md`):
- **e2e "executive smoke"**: GET 200 + sin error boundary sobre **toda** ruta de `GOB_NAV`/`ADMIN_NAV` × {detalle de cada lista} → caza regresiones como U1 y links muertos solos.
- copy-lint es-AR / no-enum-crudo + lint de 44px/color-only + catálogo `/design` + deprecación de gemelos.

---

## §Diseño — U5: granularidad provincia ↔ localidad

**Deseabilidad:** alta. Es el drill natural nacional→provincia→localidad y **unifica** lo que hoy está partido
(`/gob/analytics` rankea por **provincia**; `/gob/mortalidad` "distribución por **localidad**"). Un solo eje
seleccionable en vez de widgets distintos.

**Viabilidad (decidido):**
- **Provincia → coropleta.** ✅ Viable ya: el basemap GeoJSON de provincias que el Panorama renderiza se colorea
  por métrica; denominador desde `jurisdictions_census`. Agregación por `provinceCode`.
- **Localidad → puntos / clúster / heat.** ✅ Ya implementado (centroides `ar_localities` + jitter).
- **Localidad → coropleta rellena.** ❌ Diferido: no hay polígonos de las ~4k localidades (solo centroides);
  importar boundaries INDEC es pesado. Para localidad se usa puntos/heat (no relleno).

**Diseño:**
1. **Toggle de granularidad** "Provincia / Localidad" en el Panorama (junto a los filtros Provincia/Localidad
   que ya existen — ojo: esos son **filtro de alcance**; esto es el **eje de agregación**, son cosas distintas).
2. Provincia = coropleta sobre polígonos; Localidad = puntos/clúster/heat (modos ya existentes).
3. Opcional v1.1: **auto-cambio por zoom** (zoom out → provincia/coropleta, zoom in → localidad/puntos), estilo Gotham.
4. **Una sola función de rollup** en `lib/metrics` parametrizada por `level: 'province' | 'locality'`, reusada por
   el Panorama **y** por los widgets de distribución de los dashboards (un solo lugar, consistencia de números).
5. **k-anon**: en localidad se mantiene la supresión `<5` (ya está); en provincia no hace falta (celdas grandes).
6. **Alcance**: empezar por el Panorama (capas de coropleta: cobertura, mortalidad, densidad), después extender el
   toggle a los widgets "distribución por localidad/provincia" de mortalidad/analytics (que pasan a compartir el rollup).

**Esfuerzo:** medio. Lo nuevo es el **modo provincia-coropleta** (colorear polígonos por métrica) + el toggle + el
rollup parametrizado. Sin schema nuevo. Importar polígonos de localidad queda como futuro opcional.

**Tests:** el rollup por `province` y por `locality` devuelve totales consistentes (suman igual); coropleta de
provincia colorea las 24 jurisdicciones; toggle cambia el render sin recargar; k-anon suprime localidades chicas.

---

## Log de verificación 2026-06-22 (evidencia)
Panorama (map/capas/drawer/replay/KPIs/disclaimer/about) ✓ · zoonosis 14 / decomisos 6 / vets-ranking ✓ ·
404 branded `/admin` ✓ · auditoría humanizada + acento ✓ · govts/new `*`+breadcrumbs+acentos ✓ · Campañas ✓ ·
Outreach fechas ✓ · **mortalidad + analytics CRASHEAN (U1)** · "Enrollment" inglés (nit) · CSV/mobile/scoped-govt sin verificar.

## Planes detallados (referencia)
`2026-06-21-national-situational-console-design.md` (Panorama spec) · `…-national-situational-console.md` (plan) ·
`2026-06-21-panorama-demo-dataset.md` · `2026-06-22-panorama-data-coverage.md` · `2026-06-22-admin-fresh-sweep-fixes.md` ·
`2026-06-22-dashboards-deep-dive.md` · `2026-06-22-executive-e2e-readiness.md` · `2026-06-21-design-system-hardening.md` ·
`2026-06-20-ux-audit-remediation.md`.

> Al cerrar cada item, marcar acá y en `docs/superpowers/README.md`. Orden: **U1 ya** → U2/U3/U4 (gate) → U5 (feature) → U6 (durable).
