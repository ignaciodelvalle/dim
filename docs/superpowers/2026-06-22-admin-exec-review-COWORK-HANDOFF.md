# Handoff — Admin executive-review remediation (para Claude cowork)

> **Para la próxima Claude (o quien revise/testee).** Estado de la remediación de la auditoría
> ejecutiva del perfil **admin** (40 hallazgos C1–C40). Todo entregado como **10 PRs abiertos**.
> Plan: [`plans/2026-06-22-admin-executive-review-fixes.md`](./plans/2026-06-22-admin-executive-review-fixes.md) ·
> Critique fuente: [`../admin-design-critique-2026-06-22.md`](../admin-design-critique-2026-06-22.md).

---

## TL;DR

- **10 PRs abiertos** (#714–#723) contra `review/all-session-prs`, uno por slice del plan. Cierran C1–C40.
- Cada PR pasa **`pnpm verify`** (tsc + Biome + lint:tokens + lint:ui + next build) y **`pnpm test`** con **0 regresiones** sobre el baseline.
- Ramifican **independientes desde la base** (no stackeados). **Mergear en orden PR-1 → PR-10.** PR-7 **supersede** el stopgap de C22 de PR-1 (ver "Orden de merge").
- DB local: Docker Desktop + Supabase (postgres `127.0.0.1:54322`), ya sembrada con `pnpm seed:panorama`.

## Los 10 PRs

| PR | # | Rama | Hallazgos |
|----|---|------|-----------|
| 1 | [#714](https://github.com/ignaciodelvalle/dim/pull/714) | `fix/sec-admin-queue-counts` | C1 C2 C3 C22 |
| 2 | [#715](https://github.com/ignaciodelvalle/dim/pull/715) | `fix/admin-destructive-confirmations` | C4 C5 C6 C7 C8 C10 |
| 3 | [#716](https://github.com/ignaciodelvalle/dim/pull/716) | `fix/admin-audit-trail-body` | C11 C12 |
| 4 | [#717](https://github.com/ignaciodelvalle/dim/pull/717) | `chore/admin-operator-data-cards` | C13 C14 C15 C16 |
| 5 | [#718](https://github.com/ignaciodelvalle/dim/pull/718) | `fix/admin-surface-boundaries` | C17 C18 C19 |
| 6 | [#719](https://github.com/ignaciodelvalle/dim/pull/719) | `fix/sec-magic-link-handling` | C20 |
| 7 | [#720](https://github.com/ignaciodelvalle/dim/pull/720) | `fix/admin-rosters-evidence-scale` | C21 C23 C24 C9 |
| 8 | [#721](https://github.com/ignaciodelvalle/dim/pull/721) | `fix/admin-ia-landing-nav` | C25 C26 C27 C28 |
| 9 | [#722](https://github.com/ignaciodelvalle/dim/pull/722) | `fix/admin-filters-tables` | C29 C30 C31 C32 |
| 10 | [#723](https://github.com/ignaciodelvalle/dim/pull/723) | `chore/admin-consistency-polish` | C33–C40 + docs |

---

## Cómo testear

### 1. Levantar el entorno (una vez)
```bash
# Docker Desktop tiene que estar corriendo (arrancalo a mano si no).
pnpm db:status        # debe listar la DB local healthy
pnpm seed:panorama    # datos sintéticos con volumen (cola, casos, observaciones, moderación, outbox)
pnpm dev              # http://localhost:3000
```
El portal admin vive en **`/admin`** y requiere una cuenta **institucional admin**. Si no tenés una,
seedeala por Supabase Studio (`http://127.0.0.1:54323`) — ver AGENTS.md §Bootstrap (insert en `profiles`
con `account_type='institutional', role='admin'`). Los tests de integración usan `admin@dim.test`.

### 2. Testear UN PR
```bash
git checkout fix/sec-admin-queue-counts   # (o el branch que quieras)
pnpm dev
```
> **Ojo migración (PR-7):** la columna `profiles.is_system` (mig `0109`) ya está aplicada en tu DB local.
> Es aditiva y con default — las otras ramas la ignoran (su `schema.ts` no la referencia). No rompe nada.

### 3. Testear TODO junto (integrado) — ✅ LISTO
Existe el branch **`qa/admin-exec-review-integrated`** con los 10 PRs mergeados en orden (#714 → #723),
con los conflictos de supersesión ya resueltos (C22→C21 toma la versión `is_system` de PR-7). Está verde:
`tsc` + `pnpm verify` + `pnpm test` (8 fallos baseline pre-existentes + 1 flaky `admin-institutional` por
timeout de hook bajo carga, **33/33 aislado** — no regresión). Para QA del portal completo:
```bash
git fetch origin && git checkout qa/admin-exec-review-integrated
pnpm db:status && pnpm seed:panorama   # mig 0109 (is_system) ya está aplicada local; si reseteaste, pnpm db:migrate
pnpm dev    # http://localhost:3000/admin
```
> Es un branch de **integración para QA**, no para mergear a develop. Lo que se mergea son los 10 PRs en orden.

### 4. Correr la suite
```bash
pnpm test        # Vitest, necesita la DB corriendo
pnpm verify      # tsc + Biome + lint:tokens + lint:ui + next build
```

---

## ⚠️ Baseline de tests (LEER antes de asustarse con fallos)

`review/all-session-prs` **ya tiene 8 archivos de test que fallan**, pre-existentes y **ajenos** a admin.
Ninguno lo introdujo esta remediación — lo verifiqué corriendo la suite sobre la base limpia:

```
govt-dashboards · macro-invariants · maltrato-sql-queue · mortality-disposition
operator-breadcrumbs · outreach-pipelines · rls/coverage · server-actions-auth-coverage
```
(`rls/coverage` y `server-actions-auth-coverage` fallan por la tabla `alert_subscriptions` sin clasificar,
de la migración 0108 — no por nada de estos PRs.)

Además hay **~3 tests de integración FLAKY** que rotan por corrida (estado de DB acumulado por `seed:panorama`
+ muchos runs): `org-invitations`, `pet-cache-rederivation`, `role-upgrade`, `admin-revocations`,
`escalate-stale-decomiso-handoffs`, `symptom-surveillance`, `create-clinic-wizard`, `admin-institutional` (timeout bajo carga).
**Si ves uno nuevo: corrélo aislado** (`pnpm test <archivo>`) — siempre pasan solos. Para baseline limpio: `pnpm db:reset && pnpm seed:panorama`.

**Criterio de "verde" por PR:** el set de archivos que falla == esos 8 (± flaky), y los tests nuevos del PR pasan.

---

## Orden de merge y supersesiones (IMPORTANTE)

Mergear **PR-1 → PR-10**. Como ramifican de la base (no stackeados), los PRs que tocan los mismos archivos
piden resolución **trivial** si se mergean fuera de orden. La supersesión clave:

- **PR-7 reemplaza el stopgap de C22 de PR-1.** PR-1 excluye cuentas system del guard de "último admin" por
  `display_name LIKE 'system:%'` (stopgap, con `TODO(C21)`). PR-7 introduce la columna DB **`profiles.is_system`**
  (mig `0109`) y reescribe el guard para usarla. **Al mergear, gana la versión de PR-7** en
  `app/actions/admin-institutional.ts`, `app/admin/admins/[userId]/page.tsx` y `__tests__/admin-institutional.test.ts`.
- Otros solapes menores (mismo archivo, distinto hunk): `app/admin/cola/page.tsx` (PR-1 reescribe / PR-2 agrega `type`),
  `app/admin/programa/page.tsx` (PR-2/4/8/9/10), `app/admin/usuarios/page.tsx` (PR-1/4/5), `app/admin/auditoria/page.tsx`
  (PR-3 target / PR-9 filtros), `components/admin/RuleImpactBanner.tsx` (PR-7), `app/admin/adopciones|censo|poblacion`.
  Todos resuelven tomando ambos cambios (no se pisan semánticamente, salvo el caso C22→C21).

## Migración

`db/migrations/0109_profiles_is_system.sql` (PR-7) — aditiva, idempotente:
`ADD COLUMN is_system boolean NOT NULL DEFAULT false` + backfill `WHERE display_name LIKE 'system:%'`.
Ya aplicada en la DB local. Al mergear PR-7, corre en CI/prod vía `pnpm db:migrate` (runner custom `scripts/migrate.ts`, tabla `public._dim_migrations`).

---

## Checklist de QA manual (qué clickear, qué esperar)

| PR | Pantalla | Qué probar | Esperado |
|----|----------|------------|----------|
| 1 | `/admin/cola` | Con muchas pendientes | Pagina (footer ← →), subtítulo = total real, no renderiza todo |
| 1 | `/admin/outbox` vs badge nav | Con breaches en pág. 2 | Banner = badge del nav (mismo número global) |
| 2 | detalle admin/govt → "Resetear credentials" | Click | Pide **motivo** + confirmar antes de rotar |
| 2 | `/admin/cola` → Seleccionar todo → Aprobar | Mezcla con RUPGA | Desglose por tipo + **warning RUPGA (CUD)** |
| 2 | `/admin/observaciones/[token]` → outcome "POSITIVO rabia" | Submit | Bloquea hasta tipear "CONFIRMO" o tildar reconocimiento |
| 2 | `/admin/moderacion/[id]` → "Confirmar como spam" | — | Warning de irreversibilidad + checkbox |
| 3 | detalle admin/govt → audit log | — | Muestra **actor + motivo + N evidencias** (no solo el code) |
| 3 | `/admin/auditoria` | Una fila de aprobación | Muestra **"sobre: {target}"** con link a la entidad |
| 4 | `/admin/cola/[token]` | — | Tarjetas estructuradas (no `JSON.stringify`) |
| 4 | `/admin/outbox` | Columna "Evento origen" | Linkea a `/p/{token}` (no UUID muerto) |
| 5 | `/admin/casos` | Click en la mascota | Va a `/p/{token}` (operador), **no** `/mis-mascotas` |
| 5 | `/admin/usuarios` | — | Placeholder dice "por nombre" (sin DNI) |
| 5 | `/admin/observaciones` como **govt** | — | Eyebrow dice "Gobierno", no "Admin" |
| 6 | reset/crear cuenta → panel del magic link | — | **Enmascarado** + "Revelar"; copia funciona oculta; TTL = "1 hora" |
| 7 | `/admin/admins` | — | Cuentas `system:` separadas (flag `is_system`) |
| 7 | desactivar admin/govt → elegir archivo, **cancelar** | — | No queda evidencia huérfana (sube en submit) |
| 7 | `/admin/govts` | Govt con 0 localidades | Badge "sin localidades — no puede operar" |
| 8 | `/admin` (landing) | — | Copy ya **no** dice que la cola "vive en Gobierno"; arranca con la tira KPI |
| 8 | nav del riel admin | — | Sección "Analítica" (Programa primero) separada de "Confiabilidad" |
| 9 | `/admin/casos` y `/admin/moderacion` | — | Filtros status/kind/jurisdicción + búsqueda |
| 9 | `/admin/auditoria` | — | Dropdown de **actor** + dropdown de **acción por etiqueta** |
| 9 | `/admin/censo`, `/poblacion`, `/programa` | Fila de provincia | Es link drilleable (→ panorama) |
| 9 | `/admin/censo` (primera carga) | — | Chip de período coincide con los datos (trailing-12m) |
| 10 | revocar localidad | — | Botón **rojo** (no amarillo) como las otras destructivas |
| 10 | tras desactivar/asignar/revocar | — | La fila se refresca sola (sin recargar) |
| 10 | `/admin/adopciones` | KPI tasa de retorno | Si >100%, muestra `%*` + caveat prominente |

---

## Si la cowork Claude tiene que continuar/verificar

- **Convención por PR:** SDD test-first, es-AR en UI / inglés en código, tokens `ln-op-*`, sin `Co-Authored-By`.
- **Helpers nuevos reutilizables** (puros, testeados): `lib/admin-approval-queue.ts`, `lib/outbox-queries.ts`,
  `lib/audit-entry-view.ts` (NUNCA expone `magic_link`), `lib/audit-target-link.ts`, `lib/destructive-confirmation.ts`,
  `lib/approval-queue-breakdown.ts`, `lib/approval-payload-view.ts`, `lib/use-evidence-upload.ts`,
  `lib/revocation-evidence-path.ts`, `lib/rule-impact-gate.ts`, `lib/govt-roster.ts`, `lib/magic-link-ttl.ts`,
  `lib/admin-province-link.ts`, `lib/parse-registries.ts`, `lib/surveillance-eyebrow.ts`, `components/admin/AdminKpiStrip.tsx`.
- **C36 — nota de honestidad:** el <100% en la tabla de provincias NO es por supresión k-anon (la coropleta
  provincial no suprime; k-anon es a nivel localidad vía `byLocality` en `lib/metrics/census.ts`). La causa real
  es pets **sin provincia asignada** — el footnote dice eso, no la suposición del critique. Verificar antes de afirmar.
- **Privacy gate** (AGENTS.md §Privacidad): se respetó en PR-3 (no se expone `payload` crudo ni `magic_link`),
  PR-5 (no se reintrodujo DNI), PR-6 (credencial enmascarada). Cualquier cambio nuevo a esas superficies debe re-pasar el gate.
