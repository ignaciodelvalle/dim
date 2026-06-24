# Plan maestro CC — backlog pendiente y listo para implementar (2026-06-22)

> **Para Claude Code — handoff autónomo.** Single source of truth de lo que queda **listo para construir ahora**,
> después de cerrar la remediación admin executive-review (40 hallazgos, 10 PRs) + una pasada de QA en vivo. Consolida
> **7 planes ejecutables activos** (+1 diferido) + **1 fix de performance** que salió del QA en vivo.
>
> Este doc es el **orquestador**: secuencia, dependencias, conflictos de merge, migraciones, **git (manejado por CC,
> el owner no toca nada)** y los decisiones **ya tomadas**. Cada workstream tiene su **plan detallado** linkeado — CC
> abre el plan detallado antes de ejecutar cada uno. **No quedan decisiones abiertas que bloqueen a CC.**
>
> Convenciones (heredadas): SDD test-first · es-AR en UI / inglés en código · tokens `ln-op-*` · docs en el mismo PR ·
> sin `Co-Authored-By`.

---

## 0. Decisiones tomadas (con el owner, 2026-06-22) — NO re-litigar

1. **Objetivo de demo = "corte completo"**, con la **Bandeja de alertas (K) incluida** antes de filmar. K está en el
   camino crítico (no se difiere).
2. **`/admin/cola|usuarios|organizaciones` → se borran** (AC3). El nav admin repunta a `/gob/*` (el admin conserva
   scope universal vía el layout de `/gob`). Se mantienen los 308 del middleware para bookmarks. **Verificado:**
   `/gob/cola` **ya tiene keyset pagination** (`fetchPendingApprovalsPage`, `COLA_PAGE_LIMIT=200`) → el keyset de PR-1
   en `/admin/cola` era duplicado; borrarlo no pierde nada. El trabajo real de AC3 es **garantizar que `/gob/cola`
   (y usuarios/organizaciones) le den al admin la vista de scope universal** (todas las jurisdicciones).
3. **Localidad focal de la demo = CABA.** Todo el escenario `DEMO-` (outliers, alerta que cruza umbral, handoff a
   govt) se concentra en CABA. El `govt@dim.test` se asigna a CABA.
4. **Paquete I (Informe oficial / PDF) = DIFERIDO.** No se construye en este batch. Se saca del set activo y del beat
   "se lo lleva" de la demo. (Queda en backlog; el plan `reporte-oficial-pdf.md` sigue válido para cuando se retome.)
5. **Bandeja de alertas — sólo `active_zoonosis` abre investigación formal** (`openOutbreakInvestigationAction`). El
   resto de métricas (SLA de cola, cobertura, microchip, denuncias) usan **"registrar seguimiento" (nota)**, no
   expediente. (§K-D2 resuelto.)

**Defaults baked (decididos por defecto — CC los implementa, configurables después, no pregunta):**
- **K-D3 disparo de alertas:** **cron** `api/cron/evaluate-alerts`, cadencia **diaria** (alinear con los crons
  existentes en `vercel.json`); configurable. No depender de que un admin abra Programa.
- **K-D5 canal de contacto:** notificación **in-app (outbox)** en v1; mail/SMS diferido.
- **K-D4 audit de transiciones:** columnas `*_at`/`*_by` en `alert_firings` (sin nuevo `AUDIT_LOG_ACTIONS`).
- **J-D1/D2 forecast:** método `linear` (OLS), horizonte 3 buckets.
- **L-D1 ruta del libro:** `/admin/libro`.
- **Demo-D3:** como K está en scope, el seed **corre la evaluación una vez** para materializar el `alert_firings`.
- **Mi Argentina (D3) / banner demo (D2) / dos cortes:** ya decididos en el plan demo (cierre ilustrativo con
  disclaimer; banner siempre on en demo).

---

## 1. Git / integración (manejado por CC — el owner no hace nada)

> **Estado actual (verificado):** los 10 PRs de la remediación (#714–#723) **NO** están en `review/all-session-prs` ni
> en `develop`. Están integrados, con conflictos resueltos y **verdes**, sólo en `qa/admin-exec-review-integrated`
> (`= review/all-session-prs + 10 merges`, con la resolución C22→C21 a la versión `is_system` de PR-7).
> `review/all-session-prs` es la línea de sesión (78 commits adelante de `develop`).

**Estrategia (CC ejecuta, en orden):**

1. **Paso 0 — landear la remediación en la base.** La integración resuelta ya vive en
   `qa/admin-exec-review-integrated`. CC: mergear esa integración a **`review/all-session-prs`** (la base).
   - Camino simple: `git checkout review/all-session-prs && git merge --no-ff qa/admin-exec-review-integrated`.
   - Camino PR-por-PR (si se prefiere historial limpio): mergear #714→#723 **en orden**, tomando en el conflicto C22
     la versión `is_system` de PR-7 (igual que ya resolvió la rama qa).
   - Verificar `pnpm verify && pnpm test` (baseline de 8 fallos pre-existentes — §7).
2. **Base de trabajo = `review/all-session-prs`** (ya con la remediación).
3. **Una rama por workstream** desde la base, PR de vuelta a la base. Nombres sugeridos:
   `fix/ac-access-control-hardening`, `perf/admin-audit-casos`, `feat/ws-l-libro`, `feat/ws-j-forecast`,
   `feat/ws-k-alertas`, `chore/ws-demo-readiness`, `fix/authz-defense-in-depth`.
4. **Orden de merge en archivos compartidos:** §3 (importante para `nav-presets.ts` y las migraciones).
5. **`develop`** se actualiza desde `review/all-session-prs` en un checkpoint de release **futuro** — fuera de este
   handoff. No mezclar a `develop` por workstream.

> El working tree del repo **ya fue restaurado** (estaba corrupto: 51 archivos truncados; se reescribieron desde HEAD).
> Si CC ve un `.git/index.lock` colgado, borrarlo antes de operar.

---

## 2. Mapa de dependencias y olas de ejecución

```
OLA 0 — Seguridad + correctitud (arrancar ya; archivos casi disjuntos → paralelizable)
   ├─ WS-AC   access-control-hardening   (AC1 🔴 → AC2 → AC3 → AC4)   [sin schema]
   └─ WS-PERF auditoría/casos perf        (índice audit_log + default casos)  [1 migración aditiva]

OLA 1 — Features sin schema (additive)
   ├─ WS-L  Paquete L · Libro de eventos      (L0 lib → L1 UI → L1.4 nav)
   └─ WS-J  Paquete J · Forecast              (J0 lib → J1 chart → J2 wiring poblacion/programa)
        (WS-I Informe DIFERIDO — ver §0.4)

OLA 2 — Feature con schema (camino crítico de la demo)
   └─ WS-K  Paquete K · Bandeja de alertas    (K0 migración 🟨 → K1 dominio/writer → K2 bandeja → K3 nav/badge)

OLA 3 — Capstone demo (corte COMPLETO, incluye K)
   └─ WS-DEMO demo-readiness                  (D0 seed → D1 cuentas → D2 banner → D3 cierre MiArg → D4 verify)

OLA 4 — Durable / bloqueado (NO arrancar todavía)
   ├─ WS-AUTHZ authz-defense-in-depth   ⛔ corre DESPUÉS de que WS-AC mergee
   └─ WS-RETIRE gob-analytics-retirement 🚧 bloqueado en vNext E/F (fuera de alcance). Solo Fase 0 (audit) hacible hoy.
```

**Camino crítico a la demo:** Paso 0 (git) → WS-AC(AC1) → WS-L + WS-J → WS-K → WS-DEMO. AC2-4 y WS-PERF entran en
paralelo sin gatear la demo. (Fallback si K se complica: "corte temprano" sin K = L+J+DEMO, ver §8.)

---

## 3. Archivos compartidos (conflictos de merge) — LEER ANTES DE PARALELIZAR

### 3.1 `components/layout/nav-presets.ts` (+ `nav-presets.test.ts`) — el hotspot
Lo tocan **3** workstreams activos (RETIRE está bloqueado):
- **WS-AC (AC3):** repunta `/admin/cola|usuarios|organizaciones` → `/gob/*`; extiende el test ("ningún href de
  `ADMIN_NAV_SECTIONS` matchea una regla 308 del middleware").
- **WS-L (L1.4):** agrega `{ href: "/admin/libro", … }` a la sección **"Gobernanza"**.
- **WS-K (K3):** agrega `{ href: "/admin/alertas", … }` a la sección **"Operaciones"**.
> **Orden de merge en este archivo:** AC3 → L1.4 → K3. **Rebasar, no merge-3-way.** La edición de nav es el **último
> commit** de cada workstream; cada uno re-corre `nav-presets.test.ts`.

### 3.2 `app/admin/programa/page.tsx`
- **WS-J (J2.2):** card "Proyección de vacunación antirrábica" + callout de crossing. (Único editor activo — WS-I
  está diferido, así que ya **no** hay conflicto con el botón de informe.)

### 3.3 `app/admin/poblacion/page.tsx`
- **WS-J (J2.1):** card "Proyección de esterilizaciones".

### 3.4 `app/admin/layout.tsx` — dos inyecciones **opcionales/flag**
- **WS-K (K3, opcional):** badge de alertas abiertas (patrón breach de outbox).
- **WS-DEMO (D2):** `DemoModeBanner` detrás de `NEXT_PUBLIC_DEMO_MODE` (default off).
> Ambas opcionales/flag → punto neutral, commit aislado. K primero (si hace el badge), DEMO rebasa.

### 3.5 `db/schema.ts` + `db/migrations/` — numeración
- Última migración: **`0109`**. Próximas: **`0110`, `0111`**.
- **WS-PERF:** índice en `audit_log` (1 migración).
- **WS-K (K0):** tabla `alert_firings` (1 migración) + `db/schema.ts` + `pnpm db:generate` + regen de tipos.
> Independientes. **Quien mergee primero toma `0110`, el otro `0111`** — renumerar al rebasar (runner usa
> `public._dim_migrations`). Migración en commit aislado; regenerar tipos **antes** de seguir (sobre todo K).

---

## 4. Workstreams (resumen + plan detallado)

| WS | Objetivo (1 línea) | Schema | Plan detallado | Estado |
|----|---|---|---|---|
| **AC** | Cerrar huecos de acceso gob/admin (AC1 desactivado conserva /gob 🔴 · AC2 audit PII · AC3 páginas muertas→/gob · AC4 reglas localidad) | no | `plans/2026-06-22-access-control-hardening.md` | ⬜ **prioridad 1** |
| **PERF** | Índice `(performed_at DESC, id DESC)` en `audit_log` + `/admin/casos` default `status=open` | sí (índice) | *este doc §5* | ⬜ listo |
| **L** | `/admin/libro` — event-sourcing visible (stream · enmienda · replay "as of t") | no | `plans/2026-06-22-event-ledger-libro.md` | ⬜ listo |
| **J** | Banda de proyección de tendencia (flujo) + meta + crossing | no | `plans/2026-06-22-forecast-proyeccion.md` | ⬜ listo |
| **K** | `/admin/alertas` — bandeja + triage (reconocer→investigar→contactar→resolver) | **sí** (`alert_firings`) | `plans/2026-06-22-bandeja-alertas-triage.md` | ⬜ camino crítico |
| **DEMO** | Seed determinístico CABA + cuentas + banner; corte completo filmable | no | `plans/2026-06-22-demo-readiness.md` | ⬜ depende L/J/K |
| **AUTHZ** | Guard institucional único + lint anti-action-sin-guard | no | `plans/2026-06-22-authz-defense-in-depth.md` | ⛔ tras WS-AC |
| **RETIRE** | Retirar `/gob/analytics` (migrar lo único, 308 el resto) | no | `plans/2026-06-22-gob-analytics-retirement.md` | 🚧 bloqueado E/F |
| ~~I~~ | ~~Informe oficial exportable~~ | — | `plans/2026-06-22-reporte-oficial-pdf.md` | ⏸️ **DIFERIDO (§0.4)** |

---

## 5. WS-PERF — detalle (el único sin plan propio; sale del QA en vivo)

> Origen: `docs/admin-exec-review-qa-critique-2026-06-22.md`. `/admin/auditoría` no pinta en ~40s y `/admin/casos`
> >25s a scope universal sobre el seed.

**P1 — Índice de `audit_log` para el orden default.**
- `app/admin/auditoria/page.tsx` hace `ORDER BY performed_at DESC, id DESC LIMIT 201` **sin filtro** por defecto.
- `audit_log` tiene `(actor_user_id, performed_at)` y `(action, performed_at)` pero **ninguno con `performed_at`
  líder** → full sort en la vista default.
- **Fix:** migración aditiva (`0110`/`0111`, §3.5) `audit_log_performed_at_idx` sobre `(performed_at DESC, id DESC)`
  en `db/schema.ts` + SQL.
- **Test:** la página default renderiza rápido en el seed; el índice existe. (Las vistas filtradas ya usan los compuestos.)

**P2 — `/admin/casos` default acotado.**
- `ADMIN_CASOS_PAGE_LIMIT = 500` sin filtro trae 500 filas con joins.
- **Fix:** default a `status=open` usando los filtros que **PR-9 ya agregó**; opcional keyset como la cola.
- **Test:** `/admin/casos` sin params trae solo abiertas; filtro explícito sigue mostrando cerradas.

---

## 6. Detalle por workstream activo (qué abrir, qué cuidar)

- **WS-AC** — AC1 primero: en `requireAdminOrGovtOrRedirect` (`lib/auth-guards.ts:78-93`) rechazar
  `profile.deactivatedAt !== null` (1 línea; `getProfileCached` ya trae el campo) + corregir el comentario mentiroso
  de `app/gob/layout.tsx` + test (cuenta desactivada rechazada en `/gob` y en `admin-proposals`). Luego AC2 (audit PII
  en las 4 list pages: loggear el landing sin query + try/catch), AC3 (borrar `app/admin/{cola,usuarios,organizaciones}/`
  + repuntar nav, §0.2/§3.1; cuidar imports con `tsc`), AC4 (drill-down a reglas de localidad en
  `app/admin/jurisdicciones/page.tsx`, hoy hardcodea el segmento `"_"`).
- **WS-L** — todo nuevo salvo `nav-presets.ts` (L1.4). Reusa `petEventsScopeClause`, `lib/amendment.ts`,
  `AmendedBadge`, deep-link `?asOf=` del Panorama. Audit por vista vía `pii_queried` + `surface:"event_ledger"`.
- **WS-J** — J0/J1 nuevos; J2 edita poblacion (J2.1) y programa (J2.2) additive. Honestidad estadística = requisito
  (banda + n + método + rótulo "proyección"). Series de **flujo** (no pintar meta-% sobre eje de conteos — §J-D3).
- **WS-K** — K0 migración aislada **primero** (§3.5) → regen tipos → K1 (dominio puro `alert-firing.ts` + writer +
  cron diario) → K2 (`/admin/alertas` bandeja, **no** reusar `CaseQueue`) → K3 (nav + badge opcional). Solo zoonosis
  abre investigación (§0.5); resto = nota.
- **WS-DEMO** — D0 seed `DEMO-` sobre `seed:panorama`, focal **CABA**: ≥4 buckets en esteriliz./vacunación, ≥1
  `event_amended`, ≥1 jurisdicción bajo meta, suscripción de alerta que cruza umbral + correr eval (K presente).
  D1 `admin@dim.test` + `govt@dim.test`(CABA). D2 banner flag. D3 cierre MiArg ilustrativo. D4 `demo:verify`.
  **Sin beat de Informe** (I diferido).

---

## 7. Gate global y baseline de tests (entorno = el de CI, NO local-con-panorama)

> **⚠️ Corrección 2026-06-23 (sesión CC).** La versión previa decía que había "8 fallos baseline ajenos" y que el
> baseline limpio era `db:reset && seed:panorama`. **Las dos cosas estaban mal** y mandaron a perseguir fallos
> fantasma. Lo de abajo está **verificado empíricamente** (en DB tipo-CI, los 9 archivos involucrados pasan: 182 tests).

- **Gate por PR:** `pnpm verify` (tsc + Biome + `lint:tokens` + `lint:ui` + **`lint:authz`** + `next build`) +
  `pnpm test`, todo verde.
- **El entorno de test ES el de CI** (`.github/workflows/ci.yml`, job vitest): `supabase start` →
  **`pnpm db:bootstrap`** → `pnpm test`. **CI NO corre `seed:panorama`.** La DB de test tiene schema + datos de
  referencia (INDEC/CABA) + usuarios de prueba — **no** el universo nacional.
- **Reproducir CI localmente:** DB recién booteada **sin** panorama. Si tu DB local tiene panorama/demo, limpiá
  primero: `pnpm exec supabase stop --no-backup && pnpm db:start && pnpm db:bootstrap`.
  **No uses `db:reset`** — en este repo deja el schema **vacío** (no hay `supabase/migrations/`; el schema lo construye
  `db:bootstrap` o `db:migrate`).
- **Los "8 fallos baseline" de la versión vieja, ya resueltos/explicados:**
  - **2 eran bugs reales → arreglados** (commit `cb4e3dc6`): `operator-breadcrumbs` (un label estático `"servicios"`
    pisaba el del nav por portal — `/gob/servicios` es **"Catálogo"**); `rls/coverage` (`alert_subscriptions` de la
    migración 0108 sin clasificar; tiene RLS owner-scoped → va a `RLS_REQUIRED`).
  - **`server-actions-auth-coverage`** ya pasa (lo cerró WS-AC/AUTHZ).
  - **5 eran fantasmas de `seed:panorama`** (tests de integración que asumen DB aislada; el universo nacional les
    llena los scopes): `govt-dashboards`, `macro-invariants` (coverage = `round(vacunados/total×100)` → panorama
    diluye el único perro del fixture a 0%), `maltrato-sql-queue`, `mortality-disposition`, `outreach-pipelines`.
    **Pasan en CI; no hay nada que arreglar en ellos.**
  - `intake-dual-write`: flake por estado compartido (pasa aislado).
- **Demo ≠ test — son mutuamente excluyentes en una sola DB.** El demo necesita `seed:panorama` +
  `seed:demo:scenario`; CI no. Si tenés el demo seedeado, los 5 tests de arriba "fallan" localmente (esperado).
  Para **filmar** → seedeá el demo (§Cierre). Para **correr tests como CI** → booteá limpio sin panorama.
- **`lint:authz`** (WS-AUTHZ, mergeado): toda server action sin guard rompe CI; excepción explícita con
  `// @no-auth-required: <razón>` adyacente al export.

### Higiene de dev server (lección del QA en vivo)
Reescribir muchos archivos bajo un `next dev` corriendo deja rutas pesadas recompilando 30-40s. Tras un cambio grande,
**reiniciar `pnpm dev`**. Para QA visual: `next build && next start` (más rápido y representativo).

---

## 8. Demo — corte objetivo y fallback

| Corte | Beats | Estado |
|---|---|---|
| **Completo (objetivo)** | Dashboard · Panorama · Programa+**Forecast(J)** · **Libro(L)** · **Alertas(K)** (acciona→investiga→contacta) · cierre Mi Arg | objetivo — needs L+J+K+DEMO |
| **Temprano (fallback si K slip)** | Dashboard · Panorama · Programa+Forecast · Libro · cierre Mi Arg | needs L+J+DEMO (sin K) |

> El beat **"Informe que se lo lleva"** queda **fuera** de ambos cortes (Paquete I diferido, §0.4).

---

## 9. Backlog adyacente (fuera de alcance, para no perderlo)

- **WS-I Informe oficial** — diferido por decisión (§0.4). Plan listo: `plans/2026-06-22-reporte-oficial-pdf.md`.
- **vNext Paquetes E (censo) / F (adopción) / G / H** — `plans/2026-06-23-dashboards-vnext.md`. **E/F desbloquean
  WS-RETIRE.**
- **WS-AUTHZ Fase 2 (RLS operator-net)** — requiere spec propio; no improvisar.
- **physical-credential-hub** (Fase A, PR #672) · **bite-from-unowned** (Wave 5, needs `dni_hash`) ·
  **location-domain-p3** (migración gated por sign-off del owner) · **U3 exec live-readiness** (verificación manual) ·
  **design-system visual-regression** (bloqueado por servicio externo).

> Al cerrar cada WS: marcar acá y en `docs/superpowers/README.md`. Este doc es el índice de estado vivo del batch.

---

## 10. Cierre de sesión CC (2026-06-23) — para cowork

**Estado:** todos los workstreams están **mergeados** en la rama `fix/authz-defense-in-depth` (AC, PERF, L, J, K,
DEMO, AUTHZ). `pnpm verify` (con `next build`) **verde**. Test suite **verde en el entorno de CI** (ver §7).
**`demo:verify` verde** → el recorrido demo es filmable.

### Cambios de esta sesión — para revisar (rama `fix/authz-defense-in-depth`)

| Commit | Qué |
|--------|-----|
| `91a8cfe3` | `feat(authz)`: linter de cobertura de guards + regla route↔guard (`lint:authz`, encadenado en `verify`) + 23 tests |
| `7964f749` | `fix(test)`: `accountType="institutional"` en fixtures admin/govt (custody-disputes, bulk-actions) — la consolidación de guards `a185d0b6` lo exige |
| `488337bb` | `fix(scripts)`: `db-bootstrap` corre los seeds del step 4 con el stub de `server-only` |
| `cb4e3dc6` | `fix(test)`: breadcrumb `/gob/servicios` = "Catálogo" + clasificar `alert_subscriptions` en RLS |

> Detalle de por qué los "8 baseline" no eran 8 bugs: §7.

### Recorrido demo (filmar)

Runbook completo: [`docs/demo/README.md`](../demo/README.md). Resumen:

```bash
# La DB local DEBE tener el universo + el escenario (≠ entorno de CI, ver §7).
pnpm seed:panorama && pnpm seed:demo:scenario
pnpm demo:verify                         # gate: 10/10 invariantes en verde
NEXT_PUBLIC_DEMO_MODE=true pnpm dev       # banner "Datos de demostración" en /admin/*
```

- **Cuentas:** `admin@dim.test` (`/admin`) y `govt@dim.test` (`/gob`), ambas `Test1234!`. Localidad focal **CABA**.
- **Beats (corte completo):** Dashboard → Panorama → Programa+Forecast → `/admin/libro` → `/admin/alertas`
  (acciona→investiga→contacta, con `govt@dim.test` del otro lado en `/gob`) → cierre Mi Argentina
  (`/admin/acerca/integracion-miarg`, vista ilustrativa con disclaimer).

### ⚠️ Antes de correr tests como CI (NO mientras vas a filmar)

Correr `pnpm test` sobre la DB con demo hace "fallar" los 5 tests fantasma de §7 (esperado). Para validar como CI:
`pnpm exec supabase stop --no-backup && pnpm db:start && pnpm db:bootstrap` (DB limpia sin panorama) → `pnpm test`.
Después, para volver a filmar, re-seedeá el demo (`seed:panorama` + `seed:demo:scenario` + `demo:verify`).
