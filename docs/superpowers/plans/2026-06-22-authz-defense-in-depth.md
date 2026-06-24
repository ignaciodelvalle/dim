# Plan: Defensa en profundidad de autorización — guard único + lint anti-action-sin-guard

> **⛔ NO TOMAR TODAVÍA — backlog.** Para Claude Code, pero **diferido a propósito**: corre **DESPUÉS** de
> [`2026-06-22-access-control-hardening.md`](./2026-06-22-access-control-hardening.md), que entrega el fix puntual
> de seguridad (AC1: el guard de `/gob` que no chequeaba `deactivatedAt`). Este plan **generaliza** ese fix para que
> esa clase de bug sea **imposible de reintroducir** — no vuelve a tocar el síntoma, ataca la causa. Mientras el plan
> de access-control no esté mergeado, este queda en cola. No bloquea nada en curso.
>
> **Tesis** (misma que [`2026-06-21-design-system-hardening.md`](./2026-06-21-design-system-hardening.md)): un fix
> puntual es una foto; un guard consolidado + un lint en CI **corren en cada commit para siempre**. *"Si no está
> enforced, no existe."* Se eligen las dos jugadas **durables y baratas** (consolidación + lint). La tercera (RLS como
> red de datos) queda **fuera de este plan**: es un proyecto mayor con su propio spec — ver Fase 2, que es solo el
> encuadre, **no** ejecución.
>
> SDD test-first, docs en el mismo PR, sin cambios de schema/rutas. Cada fase es 1+ sesión de CC.

---

## Contexto del modelo (del critique de acceso)

La autorización vive **solo en el borde** (`actions.ts`); Drizzle se conecta a Postgres bypasseando RLS en las
superficies de operador (admin/gob) por diseño. Es **una sola capa**: si un guard falta o está incompleto, el dato
queda expuesto. AC1 fue de la segunda clase — el guard existía pero le faltaba el check de desactivación.

Hay que separar **dos** clases de bug, porque cada jugada cubre una distinta:
1. **Guard ausente** — una action `"use server"` sin ninguna llamada a un `require*`. → la caza el **lint** (Fase 1.2).
2. **Guard incorrecto/incompleto** — el guard existe pero le falta un check (AC1), o se usó el guard equivocado
   (el de gob donde hacía falta admin-only). → la mata la **consolidación** (Fase 1.1) y la regla de
   route↔guard (Fase 1.3).

## Evidencia base (scan 2026-06-22)

- **Dos guards institucionales divergentes** en `lib/auth-guards.ts`: `requireAdminOrRedirect` **sí** rechaza
  `deactivatedAt !== null` (línea 121); `requireAdminOrGovtOrRedirect` **no** (líneas 78-93). `requireDecomisoPrincipal`
  reusa el segundo (línea 163-168), así que hereda lo que tenga. La divergencia **es** la causa raíz de AC1.
- **Patrón de lint hermano ya existe**: `scripts/check-ui-invariants.ts` corrido por `pnpm lint:ui`, encadenado en
  `pnpm verify` (`typecheck && lint && lint:tokens && lint:ui && build`). Hay fixtures en `scripts/__fixtures__`.
  → el lint de authz se **modela sobre este**, no se reinventa el arnés.
- **RLS no está ausente**: existe `scripts/rls-smoke.ts` + `pnpm rls:smoke` (cubre las tablas con policies, p.ej.
  superficies públicas/owner). Lo que bypassa RLS es la **conexión de operador**. Por eso "reintroducir RLS" es en
  realidad *extender cobertura + rutear las queries de operador por una conexión user-scoped* — alcance grande → Fase 2.
- Call sites de escritura que gatean por el guard compartido: `app/actions/admin-proposals.ts:288,300,314` (y todo
  `/gob/*`).

---

## Fase 1 — Guard institucional único + lint anti-action-sin-guard · *la jugada durable*

### 1.1 Consolidar los guards (mata la clase "guard incompleto")
**Meta:** que sea estructuralmente imposible que un guard institucional omita el check de desactivación.

1. Extraer en `lib/auth-guards.ts` un helper privado, p.ej. `loadActiveInstitutionalProfile(userId, { allow })`, que:
   - lee el profile (vía `getProfileCached`),
   - rechaza si el rol no está en `allow` (`['admin']` o `['admin','govt']`),
   - **siempre** rechaza `accountType !== 'institutional'` y `deactivatedAt !== null`.
2. Reescribir `requireAdminOrRedirect` y `requireAdminOrGovtOrRedirect` como **wrappers finos** sobre ese helper
   (cada uno pasa su `allow`). `requireDecomisoPrincipal` sigue reusando el de adminOrGovt → queda cubierto.
3. El check de desactivación deja de estar duplicado/olvidable: vive en **un solo lugar**.
- **Test (first):** matriz parametrizada — para cada guard, una cuenta `{rol válido}` **activa** pasa; la misma
  **desactivada** es rechazada; rol inválido rechazado; `accountType='personal'` rechazado. Esto vuelve AC1
  imposible de regresar.

### 1.2 Lint `check-authz-guards.ts` (mata la clase "guard ausente")
**Meta:** ninguna server action puede mergearse sin invocar un guard.

1. Nuevo `scripts/check-authz-guards.ts` (espejo de `check-ui-invariants.ts`), corrido por un script nuevo
   `lint:authz` y **agregado a `pnpm verify`** (y a `deploy:staging` si corresponde).
2. Regla: por cada archivo con `"use server"` bajo `app/**/actions.ts`, `app/actions/*.ts` y
   `src/modules/**/actions.ts`, cada `export`ed `async function` debe contener (directa o transitivamente vía un
   helper whitelisteado) una llamada a un guard `require*OrRedirect` / `require*Principal` / `requireOrgAccessByToken`.
   - Allowlist explícita para las pocas actions deliberadamente públicas (p.ej. flujos anónimos de denuncia) vía
     un comentario-marcador `// authz:public <razón>` — para que la excepción sea **visible y justificada**, no silenciosa.
3. Fixtures pass/fail en `scripts/__fixtures__` (una action con guard → pass; una sin guard y sin marcador → fail).
- **Acceptance:** el repo entero pasa `lint:authz` en verde; agregar una action sin guard rompe CI.

### 1.3 (Opcional, mismo PR si es barato) Regla route↔guard
**Meta:** atajar el "guard equivocado".

- En el mismo `check-authz-guards.ts`: las páginas/layouts bajo `app/admin/**` deben usar `requireAdminOrRedirect`
  (no el de gob); las de `app/gob/**`, el guard adminOrGovt. Heurística simple sobre imports/llamadas por carpeta.
- **Acceptance:** fixtures; cero violaciones en el árbol actual tras la consolidación 1.1.

> Al cerrar Fase 1, marcar en [`docs/superpowers/README.md`](../README.md) y referenciar que **deprecó AC1** del plan
> de access-control (de fix puntual a guardrail permanente).

---

## Fase 2 — RLS como red de datos · *ENCUADRE, no ejecución — requiere spec propio*

> **No ejecutar desde este plan.** Esto es el alcance para un spec futuro (`specs/AAAA-MM-DD-operator-rls-net-design.md`).
> Una RLS a medias es **peor** que ninguna (falsa sensación de seguridad), así que no se improvisa dentro de una
> sesión de hardening. Se documenta acá para que la decisión quede trazada y CC **no** la tome por su cuenta.

Alcance a especificar antes de cualquier código:
- Rutear las queries de operador (admin/gob) por una **conexión user-scoped** (claims/`set_config`) en vez de la
  conexión que hoy bypassa RLS — el cambio estructural central, y el de mayor riesgo.
- Escribir/auditar policies por tabla sensible (PII de profiles, eventos, casos), reusando y extendiendo el arnés
  `scripts/rls-smoke.ts` ya existente.
- Definir la convivencia edge + RLS (qué valida cada capa) para evitar drift y debugging opaco de "por qué no vino
  esta fila".
- Presupuesto de performance (overhead por request con RLS activa en queries de operador con volumen).

Entrada de backlog sugerida en el README: *"Operator RLS net — defensa en profundidad de datos. Depende de Fase 1
de este plan. Spec pendiente. Esfuerzo: grande."*

---

## Resumen de ejecución
- **Ahora:** nada — este plan está en cola detrás de `access-control-hardening`.
- **Después de ese merge:** Fase 1.1 → 1.2 → (1.3 si es barato). Una o dos sesiones de CC.
- **Futuro, fuera de acá:** escribir el spec de Fase 2 (RLS) cuando se priorice.
