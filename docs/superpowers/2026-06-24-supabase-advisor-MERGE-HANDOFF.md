# Handoff — Merge & cierre de la remediación del Supabase advisor (para Claude cowork / CC)

> **Para vos (Nacho) o la próxima Claude.** CC ya implementó la remediación del advisor. El código
> está **completo y verificado en local**, pero **no aplicado a Cloud** (decisión del owner: diferido).
> Este doc define cómo mergear sin pisar nada y qué queda pendiente.
> Plan: [`plans/2026-06-24-supabase-advisor-errors.md`](./plans/2026-06-24-supabase-advisor-errors.md) ·
> Handoff original: [`2026-06-24-supabase-advisor-errors-COWORK-HANDOFF.md`](./2026-06-24-supabase-advisor-errors-COWORK-HANDOFF.md).

---

## TL;DR

- CC entregó **2 branches**. `fix/sec-advisor-warns` es un **superset exacto** de
  `fix/sec-advisor-rls-errors` (`0113` y `coverage.test.ts` byte-idénticos; solo agrega `0114` +
  `triggers.sql` + un test). **Verificado por diff 2026-06-24.**
- **Decisión: mergear SOLO `fix/sec-advisor-warns`** y cerrar `fix/sec-advisor-rls-errors`. Un PR,
  cero conflictos, sin rebase — el camino más seguro dado el estado frágil de git (ver §Git).
- El código está bien (revisado): cierra los 5 ERROR + los WARN críticos, idempotente, no toca datos.
- ⚠️ **Cloud sigue expuesto.** El advisor contra `mardurkdicugnzmpirjd` todavía marca los 5 ERROR.
  Aplicar a Cloud quedó **diferido por el owner** — ver §Pendiente.

## Qué entregó CC (revisado, OK)

| Archivo | Qué hace |
|---|---|
| `db/migrations/0113_advisor_security_errors.sql` | DROP vista `pets_with_identifiers` + RLS deny-all en `rate_limit_buckets`, `_dim_migrations`, `govt_business_rules`, `jurisdictions_census`. Cierra los 5 ERROR. |
| `db/migrations/0114_advisor_security_warns.sql` | `SET search_path=''` en 6 funciones + `REVOKE EXECUTE ... FROM anon` en `export_subject_data` / `erase_subject_data`. Cierra los WARN code-fixables. |
| `db/triggers.sql` (+5 líneas) | Pina `search_path` en `enforce_pet_events_append_only` también acá, porque el bootstrap re-corre triggers.sql DESPUÉS de las migraciones. Buen catch. |
| `__tests__/rls/coverage.test.ts` | Mueve las 4 tablas de `RLS_INTENTIONALLY_EXCLUDED` → `RLS_REQUIRED`. |
| `__tests__/rls/function-hardening.test.ts` | Nuevo: verifica `search_path` pinned + sin grant a anon. |

> Nota de honestidad: el `REVOKE` a `anon` es **defensa en profundidad**, no un exploit fix — ambas
> funciones ya se auto-protegen con `auth.uid()`. Está bien documentado en el header de `0114`.

## Cómo mergear (ejecutá vos en Windows)

```bash
# 1. Confirmá que warns es superset (debe no mostrar diffs en 0113 ni en el test):
git diff fix/sec-advisor-rls-errors fix/sec-advisor-warns -- db/migrations/0113_advisor_security_errors.sql __tests__/rls/coverage.test.ts
#    → sin salida = idénticos (ya verificado desde Cowork).

# 2. Verde local sobre warns:
git checkout fix/sec-advisor-warns
pnpm db:reset && pnpm seed:panorama   # baseline limpio
pnpm db:migrate                        # aplica 0113 + 0114 LOCAL
pnpm test                              # rls/coverage + function-hardening en verde
pnpm verify                            # tsc + Biome + lint + build

# 3. (Recomendado) corré el plugin code-review antes de abrir el PR:
#    /security-review   — sobre los cambios pendientes de la branch
#    /review            — evalúa contra el plan

# 4. Abrí el PR de warns contra review/all-session-prs y CERRÁ rls-errors sin mergear:
gh pr create --base review/all-session-prs --head fix/sec-advisor-warns \
  --title "fix(sec): cerrar 5 ERROR + WARN críticos del Supabase advisor (0113+0114)"
# rls-errors queda obsoleta (su contenido vive dentro de warns) → cerrala / borrá la rama.
```

## ⚠️ Baseline de tests

Mismo baseline conocido de la sesión (~8 archivos pre-existentes ajenos). El cambio acá toca
`rls/coverage.test.ts`: tras `0113` debe quedar **verde** para las 4 tablas nuevas. Si `rls/coverage`
seguía rojo en baseline por `alert_subscriptions`, confirmá que ahora pase (CC también agregó
`alert_subscriptions` a `RLS_REQUIRED`). **Verde** = baseline (± flaky) y los dos tests nuevos pasan.

## Pendiente — NO cerrado todavía

1. **Aplicar a Supabase Cloud.** El fix no está en `mardurkdicugnzmpirjd`; el advisor sigue marcando
   los 5 ERROR ahí. Cuando decidas, corré tu flujo `db:migrate` apuntando al `DATABASE_URL` de Cloud
   (mantiene el tracking en `_dim_migrations`). Re-corré el security advisor después: los 5 ERROR
   deben desaparecer. Hasta entonces, **la exposición sigue abierta en Cloud**.
2. **Leaked-password protection** (WARN) — es un toggle del dashboard de Supabase Auth, no SQL.
   Activalo a mano (Auth → Password security → HaveIBeenPwned).
3. **WARN no code-fixables que quedan**: `extension_in_public` (pg_trgm, unaccent), `rls_policy_always_true`
   (pets/welfare INSERT — probablemente intencional), `public_bucket_allows_listing` (pet-photos).
   Evaluar en un PR aparte si valen la pena.

## §Git — salud del repo (atender pronto)

- **La branch activa `fix/demo-panorama-consolidated` no tiene commits** y arrastra cientos de
  archivos staged. Commiteá o stasheá ese trabajo antes de seguir — estado frágil, riesgo de pérdida.
- Varias operaciones de git tiran `error: improper chunk offset(s) ...` → **objeto/pack corrupto**.
  Corré `git fsck --full` y, si confirma, `git gc` / re-clone del remoto. Puede romper push/CI si no.

## Privacy gate

Sin superficies nuevas de PII; el cambio **cierra** lectura anónima en 4 tablas y quita el grant a
`anon` en las RPC de derechos del titular (Ley 25.326). Gate **OK**.
