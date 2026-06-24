# Handoff — Errores de seguridad del Supabase advisor (para Claude cowork / Claude Code)

> **Para la próxima Claude (o quien ejecute/teste).** El Supabase **security advisor** marcó
> **5 ERROR** en el proyecto `DIM` (`mardurkdicugnzmpirjd`). Este handoff es para que Claude Code los
> remedie en **un PR**: una migración `0113` + update del test de cobertura RLS. **Todavía no está
> implementado** — es un encargo, no un reporte de algo hecho.
> Plan: [`plans/2026-06-24-supabase-advisor-errors.md`](./plans/2026-06-24-supabase-advisor-errors.md).
> Fuente: corrida del advisor desde Cowork, 2026-06-24 (5 ERROR · 21 WARN · 6 INFO).

---

## TL;DR

- **1 PR** que cierra los **5 ERROR** de seguridad. Rama sugerida: `fix/sec-advisor-rls-errors`.
- **1 migración** `db/migrations/0113_advisor_security_errors.sql` (DROP de una vista + RLS deny-all
  en 4 tablas) + **edición de `__tests__/rls/coverage.test.ts`** en el mismo PR.
- ⚠️ **Tensión de diseño:** 4 de los 5 errores son tablas que el proyecto **excluyó de RLS a
  propósito** (`0086` PART 7 + el test lo enforce). No es un bug a tapar — hay que decidir
  conscientemente. La resolución (deny-all, patrón ya existente) está en el plan §Tensión.
- Debe pasar **`pnpm verify`** y **`pnpm test`** con **0 regresiones** sobre baseline, y al re-correr
  el advisor los 5 ERROR deben desaparecer.
- No toca datos de eventos (append-only intacto). No edita migraciones viejas (forward-only).

## Los 5 errores

| # | Lint | Objeto | Fix |
|---|------|--------|-----|
| 1 | `security_definer_view` | vista `public.pets_with_identifiers` | **DROP** — vista compat obsoleta (columnas legacy dropeadas en 0084), cero referencias en el repo |
| 2 | `rls_disabled_in_public` | `public.rate_limit_buckets` | RLS **deny-all** (acceso por Drizzle) |
| 3 | `rls_disabled_in_public` | `public._dim_migrations` | RLS **deny-all** (sólo lo escribe `scripts/migrate.ts`) |
| 4 | `rls_disabled_in_public` | `public.govt_business_rules` | RLS deny-all **o** policy de lectura pública — ver paso 0.2 |
| 5 | `rls_disabled_in_public` | `public.jurisdictions_census` | RLS deny-all **o** policy de lectura pública — ver paso 0.2 |

Remediación oficial Supabase: <https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view>
· <https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public>

## Cómo ejecutarlo (Claude Code)

### 1. Levantar el entorno (una vez)
```bash
# Docker Desktop tiene que estar corriendo.
pnpm db:status        # confirma que la DB local está healthy
pnpm seed:panorama    # datos sintéticos con volumen (opcional para este PR)
pnpm dev              # http://localhost:3000  (no estrictamente necesario)
```
### 2. Hacer el trabajo
Seguí el plan paso a paso: **Paso 0** (verificar refs de la vista + si hay lectura anónima de las
tablas de referencia) → **Paso 1** (migración `0113`) → **Paso 2** (mover 4 tablas a `RLS_REQUIRED`
en el test) → **Paso 3** (documentar que `0086` PART 7 queda superado).
### 3. Aplicar y verificar
```bash
pnpm db:migrate   # corre 0113 vía scripts/migrate.ts (tabla public._dim_migrations)
pnpm test         # Vitest; rls/coverage.test.ts debe quedar verde con el nuevo RLS_REQUIRED
pnpm verify       # tsc + Biome + lint:tokens + lint:ui + next build
```
### 4. Confirmar el cierre
Volvé a correr el **security advisor** (desde Cowork con el Supabase MCP, o el linter de Supabase).
Los **5 ERROR** tienen que desaparecer. Si `govt_business_rules`/`jurisdictions_census` quedaron con
policy de lectura pública en vez de deny-all, igual cierran el ERROR.

## ⚠️ Baseline de tests (LEER antes de asustarse con fallos)

`review/all-session-prs` ya arrastra **~8 archivos de test que fallan**, pre-existentes y **ajenos** a
esto: `govt-dashboards`, `macro-invariants`, `maltrato-sql-queue`, `mortality-disposition`,
`operator-breadcrumbs`, `outreach-pipelines`, `rls/coverage`, `server-actions-auth-coverage`.

> **Ojo:** `rls/coverage` está en ese baseline por la tabla `alert_subscriptions` (mig 0108). Este PR
> **toca ese mismo archivo** — al moverle 4 tablas a `RLS_REQUIRED`, asegurate de que el fallo
> resultante sea **sólo** el pre-existente (si seguía rojo) y que tus 4 tablas pasen. Idealmente,
> corré `pnpm db:reset && pnpm seed:panorama` para un baseline limpio y confirmá que tras `0113` el
> test queda **verde**.

Hay además ~3 tests de integración **flaky** por estado de DB acumulado. Si ves uno nuevo, corrélo
aislado: `pnpm test <archivo>` — siempre pasan solos.

**Criterio de "verde":** el set que falla == baseline (± flaky), `rls/coverage` pasa para las 4 tablas
nuevas, y el advisor ya no marca los 5 ERROR.

## Orden de merge

PR único, ramifica de `review/all-session-prs` (o la base activa de la sesión). Sin supersesiones.
La migración `0113` es aditiva (DROP de vista no usada + ENABLE RLS) y corre en CI/prod vía
`pnpm db:migrate`.

## Migración

`db/migrations/0113_advisor_security_errors.sql` — forward-only, idempotente
(`DROP VIEW IF EXISTS` + `ENABLE ROW LEVEL SECURITY` no-op si ya está). Sin `-- dim:no-transaction`
(nada de `CREATE INDEX CONCURRENTLY` ni `ALTER TYPE`). Runner: `scripts/migrate.ts`, tracking en
`public._dim_migrations`.

## Si Claude Code tiene que decidir (puntos de criterio)

- **La vista**: por defecto **DROP**. Sólo recreá `WITH (security_invoker = on)` si el grep del paso 0.1
  encuentra un uso nuevo. Verificado 2026-06-24: cero usos fuera de su propia migración.
- **govt_business_rules / jurisdictions_census**: **deny-all** salvo que el paso 0.2 encuentre un
  cliente **supabase-js anónimo** leyéndolas. La app hoy las lee por Drizzle (server) → deny-all es
  seguro. Si encontrás lectura anónima, usá policy `for select to anon, authenticated using (true)`.
- **No edites `0086`** ni ninguna migración ya aplicada — son inmutables. Todo en `0113`.

## Nota de honestidad

Esto **no es** "5 bugs olvidados". Cuatro de los cinco son una **decisión de diseño explícita y
testeada** del proyecto (tablas de referencia/ops marcadas como no-PII en `RLS_INTENTIONALLY_EXCLUDED`).
El advisor las marca igual porque RLS-off + exposición a PostgREST = lectura anónima posible, incluso
sin PII. La remediación propuesta **revierte conscientemente** esa exclusión hacia deny-all (defensa en
profundidad), no la "arregla" a ciegas. Si el owner prefiere mantener la exclusión y silenciar el lint,
es una opción válida también — pero entonces no se cierra el ERROR. Decidir antes de mergear.

## Privacy gate (AGENTS.md §Privacidad)

No se introduce ninguna superficie nueva de PII; al contrario, se **cierra** lectura anónima sobre
4 tablas. Ninguna policy expone `payload` crudo, `magic_link`, ni DNI. Gate **OK**.

## Fuera de alcance (follow-up, otro PR)

WARN críticos que el owner no pidió pero conviene encarar después: `erase_subject_data` /
`export_subject_data` ejecutables por `anon` (Ley 25.326), leaked-password protection off, y
`function_search_path_mutable` x7. Detalle en el plan §Fuera de alcance.
