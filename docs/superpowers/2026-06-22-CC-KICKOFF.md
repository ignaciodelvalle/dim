# Mensaje de arranque para Claude Code — ejecución autónoma del batch (2026-06-22)

> Pegá este mensaje a CC tal cual. Es autónomo: encadena todo, no tiene preguntas pendientes, corre hasta terminar.

---

Sos Claude Code trabajando en el repo **MiMAR/DIM** (Next.js 15 + Supabase + Drizzle). Vas a ejecutar **de forma
autónoma y de punta a punta** un batch de trabajo ya planificado. **No me hagas preguntas**: todas las decisiones ya
están tomadas y están en el plan maestro. Si encontrás una ambigüedad menor, tomá la opción reversible que el plan
indica (o la más conservadora) y seguí. Solo pará si algo es genuinamente destructivo/irreversible — no se espera nada
de eso en este batch.

## Antes de empezar (leer, en este orden)
1. `AGENTS.md` (slim index + invariantes) y `README.md`.
2. **`docs/superpowers/2026-06-22-MASTER-PLAN-cc.md`** ← el orquestador. Es tu fuente de verdad de secuencia,
   dependencias, conflictos de merge, git y **decisiones tomadas (§0)**.
3. El plan detallado de cada workstream **justo antes** de ejecutarlo (linkeados en el maestro §4).
4. `docs/admin-exec-review-qa-critique-2026-06-22.md` (de ahí sale WS-PERF).

## Decisiones ya tomadas — NO re-litigar (detalle en el maestro §0)
- Demo = **corte completo con Alertas (K)**. K está en el camino crítico.
- `/admin/{cola,usuarios,organizaciones}` se **borran**; nav admin repunta a `/gob/*` (admin mantiene scope universal
  vía el layout de `/gob`); se mantienen los 308. Garantizar que `/gob/cola|usuarios|organizaciones` le den al admin
  la vista **universal**.
- Localidad focal de la demo = **CABA**.
- **Paquete I (Informe/PDF) = DIFERIDO** — no se construye en este batch.
- Alertas: **solo `active_zoonosis` abre investigación**; el resto = nota/seguimiento.
- Defaults baked: cron de alertas **diario** (`api/cron/evaluate-alerts`); contacto **in-app/outbox**; forecast
  **linear**, horizonte **3**; ruta **`/admin/libro`**; el seed de demo materializa el `alert_firing` (K presente).

## Git (lo manejás vos; el owner no toca nada) — maestro §1
- **Paso 0:** landear la remediación admin en la base. Está integrada y verde en `qa/admin-exec-review-integrated`
  (= `review/all-session-prs` + 10 merges, conflicto C22→`is_system` de PR-7 resuelto). Mergeala a
  **`review/all-session-prs`** (`git checkout review/all-session-prs && git merge --no-ff qa/admin-exec-review-integrated`),
  corré `pnpm verify && pnpm test` (respetá el baseline de 8 fallos — abajo), y esa es tu **base**.
- Una rama por workstream desde la base; PR de vuelta a la base. **No** mergees a `develop`.
- Si hay un `.git/index.lock` colgado, borralo.

## Orden de ejecución (encadenado, con gating)
Ejecutá los workstreams en este orden. Cada uno: abrí su plan detallado → SDD **test-first** → implementá sus fases →
`pnpm verify && pnpm test` en verde → docs en el mismo PR → mergeá a la base → seguí con el próximo.

1. **WS-AC** (`plans/2026-06-22-access-control-hardening.md`) — **AC1 primero** (🔴 bypass: cuenta govt/admin
   desactivada conserva acceso a `/gob/*`; fix de 1 línea en `requireAdminOrGovtOrRedirect`), luego AC2, AC3
   (borrar páginas muertas + repuntar nav, cuidá imports con `tsc`), AC4.
2. **WS-PERF** (maestro §5) — índice `audit_log (performed_at DESC, id DESC)` + `/admin/casos` default `status=open`.
   (Puede ir en paralelo a AC: archivos disjuntos; coordiná la numeración de migración con K — maestro §3.5.)
3. **WS-L** (`plans/2026-06-22-event-ledger-libro.md`) — `/admin/libro`.
4. **WS-J** (`plans/2026-06-22-forecast-proyeccion.md`) — forecast + cards en poblacion/programa.
5. **WS-K** (`plans/2026-06-22-bandeja-alertas-triage.md`) — **K0 migración aislada primero**, regen tipos, luego
   K1/K2/K3.
6. **WS-DEMO** (`plans/2026-06-22-demo-readiness.md`) — seed CABA + cuentas + banner + `demo:verify`. Sin beat de
   Informe.
7. **WS-AUTHZ** (`plans/2026-06-22-authz-defense-in-depth.md`) — **solo después** de que WS-AC esté mergeado.
   Agrega `lint:authz` a `pnpm verify`.

**NO ejecutar:** WS-RETIRE (`gob-analytics-retirement`) — bloqueado en vNext E/F (sin destino de migración). Dejalo.

## Coordinación de archivos compartidos (maestro §3) — crítico
- **`components/layout/nav-presets.ts`** lo tocan AC3, L (L1.4) y K (K3). Hacé esa edición como el **último commit**
  de cada workstream, en orden **AC3 → L → K**, **rebasando** (no merge-3-way). Re-corré `nav-presets.test.ts`.
- **Migraciones:** última es `0109`. PERF y K0 se reparten `0110`/`0111`; quien mergea primero toma uno, el otro
  **renumera** al rebasar. Migración en commit aislado + `pnpm db:generate` + regen de tipos antes de seguir.
- `app/admin/programa/page.tsx` (J2.2) y `app/admin/poblacion/page.tsx` (J2.1): inserciones additive.
- `app/admin/layout.tsx`: badge de K (opcional) y banner de DEMO (flag) — commits aislados, K primero.

## Gate y baseline (maestro §7)
- Gate por PR: `pnpm verify` (tsc + Biome + lint:tokens + lint:ui + next build) + `pnpm test`, todo verde.
- **Baseline pre-existente ajeno (no es regresión tuya):** fallan ya en la base 8 archivos — `govt-dashboards`,
  `macro-invariants`, `maltrato-sql-queue`, `mortality-disposition`, `operator-breadcrumbs`, `outreach-pipelines`,
  `rls/coverage`, `server-actions-auth-coverage` — + ~3 flaky por estado de DB. "Verde" = ese set (± flaky) **y** los
  tests nuevos del WS pasan. Flaky aislado: `pnpm test <archivo>`. Baseline limpio: `pnpm db:reset && pnpm seed:panorama`.
- Tras un cambio grande de muchos archivos, **reiniciá `pnpm dev`** (el module-graph se invalida). Para QA visual usá
  `next build && next start`.

## Reglas permanentes
- SDD test-first · es-AR en UI / inglés en código · tokens `ln-op-*` · sin `Co-Authored-By` · docs en el mismo PR
  (fila en "Portal surfaces" del `README.md` para rutas nuevas: `/admin/libro`, `/admin/alertas`).
- **No toques** las secciones "Verificado CORRECTO" / "Verificado en vivo" de los planes.
- Al cerrar cada WS, marcá el estado en `docs/superpowers/2026-06-22-MASTER-PLAN-cc.md` (§4) y en
  `docs/superpowers/README.md`.

## Definición de "terminado"
Mergeados a `review/all-session-prs`, todos verdes contra el baseline: WS-AC, WS-PERF, WS-L, WS-J, WS-K, WS-DEMO,
WS-AUTHZ. `demo:verify` reporta verde para el corte completo (CABA). Al final, dejá un **resumen** en
`docs/superpowers/2026-06-22-MASTER-PLAN-cc.md`: qué se mergeó, números de migración usados, cualquier decisión
reversible que tomaste, y qué quedó en backlog (WS-I, WS-RETIRE, vNext E/F).

Arrancá por el **Paso 0 de git** y seguí sin parar. No esperes confirmación entre workstreams.
