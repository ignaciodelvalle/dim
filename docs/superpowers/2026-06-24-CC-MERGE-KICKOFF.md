# CC kickoff — Merge de la remediación del advisor + sanear Git (2026-06-24)

> **Para Nacho:** copiá el bloque de abajo (entre las líneas) y pegáselo a Claude Code. Hace todo:
> sanea git, mergea el fix de seguridad, corre los reviews y abre el PR. Vos no corrés nada.

---------------------------------- PEGAR A CC DESDE ACÁ ----------------------------------

Sos CC trabajando en el repo DIM/MiMAR. Leé primero `AGENTS.md`, `docs/ops/git-and-workflow.md`,
`docs/superpowers/2026-06-24-supabase-advisor-MERGE-HANDOFF.md` y el plan
`docs/superpowers/plans/2026-06-24-supabase-advisor-errors.md`. Vos sos el dueño de Git; yo no corro
comandos. Dejá el árbol limpio al terminar. **No toques Supabase Cloud** (decisión del owner: el apply
a Cloud quedó diferido).

Hacé esto en orden y reportá al final qué encontraste y qué hiciste:

**Tarea 1 — Sanear Git (PRIMERO, no perder trabajo).**
1. Estoy en la branch `fix/demo-panorama-consolidated`, que **no tiene commits** y arrastra cientos de
   archivos staged. Diagnosticá qué es ese contenido staged antes de tocar nada.
2. Preservá ese trabajo sin riesgo: o bien commitealo con un mensaje claro en una branch de respaldo
   `wip/demo-panorama-rescue`, o `git stash push -u` con un mensaje descriptivo. No lo pierdas y no lo
   dejes colgando.
3. Corré `git fsck --full`. Hubo errores `improper chunk offset(s)` → si fsck confirma corrupción,
   reparála con el runbook de `docs/ops/git-and-workflow.md` (`git gc --prune=now`, `git repack -ad`,
   `git fetch origin`; re-clone solo si hace falta). Confirmá `git fsck --full` sin errores antes de
   seguir.

**Tarea 2 — Mergear el fix de seguridad (solo la branch superset).**
4. Verificá que `fix/sec-advisor-warns` sea superset exacto de `fix/sec-advisor-rls-errors`:
   `git diff fix/sec-advisor-rls-errors fix/sec-advisor-warns -- db/migrations/0113_advisor_security_errors.sql __tests__/rls/coverage.test.ts`
   debe ser **vacío**. (Ya verificado desde Cowork; reconfirmalo.)
5. `git checkout fix/sec-advisor-warns` y dejá verde local:
   `pnpm db:reset && pnpm seed:panorama && pnpm db:migrate && pnpm test && pnpm verify`.
   Criterio de verde: el set de tests que falla == el baseline conocido (± flaky), y
   `__tests__/rls/coverage.test.ts` + `__tests__/rls/function-hardening.test.ts` pasan.
6. Corré los reviews del plugin code-review: `/security-review` sobre los cambios de la branch y
   `/review` contra el plan. Si alguno marca algo real, arreglalo en la misma branch antes del PR.
7. Abrí el PR de `fix/sec-advisor-warns` contra `review/all-session-prs` con el título y cuerpo de la
   sección "Cuerpo del PR" más abajo (usá `gh pr create`). **Cerrá / borrá** `fix/sec-advisor-rls-errors`
   sin mergear: su contenido ya vive dentro de warns.
8. Volvé a la branch en la que estaba (o dejá `git status` limpio en una branch sensata) y reportá.

No apliques nada a Cloud. Cuando termines, decime: qué era el contenido staged de la branch sin
commits, si git estaba corrupto y cómo quedó, y el link del PR.

--- Cuerpo del PR (usalo en `gh pr create`) ---

Título:
fix(sec): cerrar 5 ERROR + WARN críticos del Supabase advisor (0113+0114)

Cuerpo:
## Qué

Remedia los hallazgos del Supabase **security advisor** (corrida 2026-06-24 contra `mardurkdicugnzmpirjd`).

- **0113 — 5 ERROR.** DROP de la vista obsoleta `pets_with_identifiers` (`security_definer_view`,
  sin referencias en el repo, columnas legacy ya dropeadas en 0084) + RLS **deny-all** en
  `rate_limit_buckets`, `_dim_migrations`, `govt_business_rules`, `jurisdictions_census`
  (`rls_disabled_in_public`). La app llega a las cuatro solo por Drizzle/service-role (BYPASSRLS),
  así que deny-all cierra la superficie PostgREST anónima con cero impacto.
- **0114 — WARN críticos.** `SET search_path=''` en 6 funciones (`function_search_path_mutable`) +
  `REVOKE EXECUTE ... FROM anon` en `export_subject_data` / `erase_subject_data` (defensa en
  profundidad; ya se auto-protegen con `auth.uid()`). `db/triggers.sql` pina el mismo `search_path`
  porque el bootstrap re-corre ese archivo después de las migraciones.
- **Tests:** `coverage.test.ts` mueve las 4 tablas a `RLS_REQUIRED`; nuevo `function-hardening.test.ts`.

## Supersesión

`0086` PART 7 documentaba 3 de esas tablas como exclusiones de RLS ("no PII"). El advisor tiene razón
igual: RLS-off + PostgREST = lectura anónima posible. Este PR **revierte conscientemente** esa
exclusión hacia deny-all. `0086` no se edita (migraciones inmutables).

## Verificación

- `pnpm verify` y `pnpm test` en verde sobre el baseline (sin regresiones).
- `/security-review` + `/review` corridos.

## Pendiente (fuera de este PR)

- **Aplicar a Supabase Cloud** (diferido por el owner): correr `db:migrate` contra el `DATABASE_URL`
  de Cloud y re-correr el advisor.
- Leaked-password protection: toggle del dashboard de Auth (no SQL).
- WARN restantes no-code: `extension_in_public`, `rls_policy_always_true` (pets/welfare INSERT),
  `public_bucket_allows_listing` — evaluar aparte.

## Privacy gate

OK — no agrega superficie de PII; cierra lectura anónima en 4 tablas y quita el grant anon en las RPC
de derechos del titular (Ley 25.326).

Plan: docs/superpowers/plans/2026-06-24-supabase-advisor-errors.md
Handoff: docs/superpowers/2026-06-24-supabase-advisor-MERGE-HANDOFF.md

---------------------------------- HASTA ACÁ ----------------------------------
