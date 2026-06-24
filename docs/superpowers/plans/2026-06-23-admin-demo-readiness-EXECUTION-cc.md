# Plan de ejecución autónoma — Portal Admin demo-readiness (para Claude Code)

> **🧭 Orden global: ver [`2026-06-23-CONSOLIDATED-demo-panorama-cc.md`](./2026-06-23-CONSOLIDATED-demo-panorama-cc.md)** (orquestador). Este doc tiene el detalle file-level de los WP; el orquestador define en qué ola corre cada uno y cómo se dedup con Panorama/nav-diferida y los fixes de cámara B1/B2/B3.

> **Para Claude Code. Ejecutá esto de punta a punta, autónomo, sin pedir decisiones.** Todas las decisiones ya están
> tomadas abajo (sección "Decisiones tomadas"). Si algo parece ambiguo, seguí el default explícito; no abras
> preguntas. Reemplaza y consolida `2026-06-23-demo-readiness-fixes-cc-handoff.md` y
> `2026-06-23-admin-demo-readiness-handoff-cc.md`.
>
> **Misión.** Dejar el **recorrido ejecutivo gubernamental (`/admin`) grabable de punta a punta** con
> `NEXT_PUBLIC_DEMO_MODE=true` y los seeds del runbook, sin crashes, con las páginas de analítica rindiendo en
> tiempo razonable, sin bugs latentes de la misma clase, y con el pulido de diseño indicado.
>
> **Contexto/origen.** Revisión manual E2E en Chrome (login `admin@dim.test`) contra
> [`docs/demo/README.md`](../../demo/README.md) y [`2026-06-22-demo-readiness.md`](./2026-06-22-demo-readiness.md).
> Dos crashes ya quedaron corregidos en el working tree (A1, A2) **sin tests**.

---

## Guardrails de autonomía (cómo trabajar)

1. **Branch** `fix/admin-demo-readiness`. Commits **convencionales** y atómicos por work-package
   (`fix(...)`, `perf(...)`, `feat(...)`, `test(...)`), siguiendo [`CONTRIBUTING.md`](../../../CONTRIBUTING.md).
2. **TDD / SDD** (regla del repo): test-first en cada WP. El `domain/` queda puro; las queries solo en
   `infrastructure/` (Hexagonal-lite, ver `docs/architecture/hexagonal-lite.md`).
3. **Local-only.** Nunca correr seeds/migraciones contra DB remota (los seeds ya tienen guard). Trabajar contra
   Supabase local (`pnpm db:start` / `pnpm db:bootstrap`).
4. **Gate antes de cerrar:** `pnpm verify` (typecheck + lint + lint:tokens + lint:ui + lint:authz + build) **verde**,
   más los vitest tocados y, donde se indica, e2e Playwright. `pnpm demo:verify` verde.
5. **Diffs mínimos.** No refactors fuera de alcance. No tocar otros portales salvo lo listado en P1.
6. **Cierre:** dejar la rama lista con todos los commits y **abrir PR** con checklist; resumen de cambios en la
   descripción. Resetear el seed al final (`pnpm seed:demo:scenario`).

## Decisiones tomadas (no volver a abrir)

- **A1:** extraer `shouldShowDemoBanner` a un módulo server-safe `lib/demo-mode.ts` (sin `"use client"`);
  `DemoModeBanner.tsx` y `app/admin/layout.tsx` importan de ahí. (El fix inline actual queda subsumido por esto.)
- **P0:** si el índice existe y aún así es lento, **reescribir** los `EXISTS/NOT EXISTS` correlacionados como
  `LEFT JOIN … GROUP BY` / agregación; si falta el índice, **agregar migración**. Presupuesto duro: **< 3 s** por
  página con el seed completo.
- **P1:** convertir **todos** los `Date` crudos a `.toISOString()` (defensivo donde el tipo no sea obvio) y agregar
  un **test-guard de repo** que falle si aparece un `Date` interpolado en `sql\`\``.
- **D1:** `OpScopeChip` pasa a variante **neutral/outline** (tokens `--ln-op-*`), peso visual menor que el H1; topbar
  en **una sola línea** a ≥1280px (breadcrumb con truncado/elipsis).
- **D2:** timeout de **10 s** en las cargas de analítica → estado "tardando… reintentar" + estado vacío honesto
  (nada de skeleton infinito).
- **D3:** alerta muestra **"observado 38 · meta 70"** (no "38 ≤ 99") y el seed usa umbral **70**; suprimir el
  disclosure propio de `PanoramaShell` cuando el banner global está on; poblar la capa "% de cumplimiento" si el seed
  tiene el hueco.
- **Alcance:** "todo" = A1, A2, P0, P1 (incluye lado gob), D1, D2, D3 + tests. Incluir la página **Informe oficial**
  en el gate de P0 (comparte métricas).

---

## WP0 — Consolidar A1/A2 con tests 🟥

**A1 — `lib/demo-mode.ts` (nuevo) + `components/ui/DemoModeBanner.tsx` + `app/admin/layout.tsx`.**
Mover `shouldShowDemoBanner(envValue)` al módulo server-safe; el banner y el layout lo importan. El layout calcula
`demoMode` con ese helper (server-side OK porque ya no es cliente).
**Tests:** unit de `shouldShowDemoBanner` (on/off); render server-side del `AdminLayout` no lanza; banner visible solo
con `NEXT_PUBLIC_DEMO_MODE=true`.

**A2 — `lib/metrics/census.ts`.** Mantener `dormancyCutoff.toISOString()`.
**Test:** integración contra Postgres local — `registryCounts(ctx)` con `period.until` real resuelve y devuelve los
conteos esperados (antes explotaba con `ERR_INVALID_ARG_TYPE`).

## WP1 — P0: performance de Programa / Censo / Población / Informe 🟥 (blocker)

1. Sembrar (`db:bootstrap` → `seed:panorama` → `seed:test` → `seed:demo:scenario`) y sacar **`EXPLAIN ANALYZE`** de
   las queries de `registryCounts` (dormant) y `fetchSterilizationCoverage` (por provincia) y demás métricas de la
   página.
2. Verificar que el índice `pet_events_pet_id_occurred_at_idx (pet_id, occurred_at)` esté **aplicado**; si falta,
   agregar migración (recordar: una FK no crea índice en PG).
3. Si el plan sigue caro (seq scan / anti-join): reescribir los `EXISTS` correlacionados como `LEFT JOIN … GROUP BY`
   o pre-agregar "última actividad por mascota / esterilización por mascota".
**Acceptance:** Programa, Censo, Población e Informe renderizan **< 3 s** con el seed completo. Agregar smoke test
(integración o e2e) que afirme render < presupuesto y sin error boundary.

## WP2 — P1: bugs latentes de `Date` crudo 🟧

Convertir a `.toISOString()` en: `lib/metrics/population.ts:60-62`, `lib/metrics/custody.ts:241`,
`lib/govt-dashboards.ts:2030-2031, 2076-2077, 2118-2119`, `lib/data-lifecycle.ts:53,94`,
`lib/outreach-pipelines.ts:173` (confirmar tipo; si es `Date`, convertir).
**Guard:** test de repo que escanee `lib/` y `src/` y falle ante un `Date`/variable-fecha interpolada cruda en
`sql\`\``.
**Tests:** por sitio, la métrica/export con un período real resuelve sin lanzar.

## WP3 — D1: topbar + chip de scope 🟧

`components/layout/*` (AppShell/topbar) + `components/ui/dashboard/OpScopeChip`. Chip neutral/outline; topbar sin wrap
a 1280/1366px (truncar breadcrumb). **Test:** Playwright snapshot del topbar a 1280 y 1366 sin wrap; el H1 de la
página tiene mayor peso visual que el chip.

## WP4 — D2: estado de demora/timeout en analítica 🟨

Envolver las cargas de Programa/Censo/Población/Informe con timeout (10 s) → mensaje "tardando… reintentar" + estado
vacío honesto. **Test:** fetch lento/fallido simulado → muestra demora/error, no skeleton infinito.

## WP5 — D3: pulido de cámara 🟨

- `/admin/alertas`: render "observado 38 · meta 70" (formato observado · meta). `scripts/seed-demo-scenario.ts`:
  umbral 70.
- Suprimir disclosure de `PanoramaShell` cuando el banner global está on.
- Investigar capa "% de cumplimiento" (Panorama, provincia/90d) "Sin datos"; poblar el seed si es hueco.
**Tests:** el render de la alerta muestra el nuevo formato; con banner global on, no hay doble disclosure.

## WP6 — Verificación final 🟦

`pnpm verify` verde · vitest de los WP · e2e relevantes · `pnpm demo:verify` verde · recorrido manual de los 6 beats
con `NEXT_PUBLIC_DEMO_MODE=true` sin error y dentro de presupuesto · `pnpm seed:demo:scenario` para resetear estado ·
abrir PR.

---

## Gate global de aceptación (definición de "listo")

Con `NEXT_PUBLIC_DEMO_MODE=true` + seeds del runbook:
1. Los 6 beats renderizan **sin error boundary**: Panorama, Programa(+Censo/Población/Informe), Alertas, Libro,
   cierre Mi Argentina.
2. Programa/Censo/Población/Informe **< 3 s**.
3. Cero `Date` crudo en `sql\`\`` (guard test verde).
4. Topbar sin wrap a ≥1280px; chip de scope no domina el H1.
5. `pnpm verify` y `pnpm demo:verify` verdes; e2e relevantes verdes.
