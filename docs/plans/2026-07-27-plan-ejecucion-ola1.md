# Plan de ejecución — Ola 1: de las críticas al demo-creíble

> **Objetivo que ordena todo** (PO, 2026-07-27): demo a funcionarios vía staging.
> **Restricción de diseño**: económico en TIEMPO DEL PO — sus interrupciones se
> compactan en una sesión de decisiones al inicio + skims de 5 min por lote; el agente
> de Claude Code corre autónomo entre compuertas.
> **Alcance**: lotes A-D del consolidado + H-series completa del QA review. Fuera de
> ola: lote E (islands/INP, SDD propio), el cutover en sí (runbook existente, PO), y
> la tanda 2 de críticas (org/admin/a11y).
> **Gate de aceptación**: COWORK re-corre la batería targeted al cierre de cada lote
> y dictamina por hallazgo: CERRADO / PERSISTE / REGRESIÓN.
>
> **Specs**: este plan NO re-explica los fixes. Cada unidad referencia su doc:
> `docs/reviews/results/2026-07-26-cowork-hallazgos.md` (H1-H10) y
> `docs/reviews/results/2026-07-27-critique-*.md` + consolidado (S1-S9, top-10).
> El agente trabaja DE la spec; si la spec choca con la realidad del código, NO
> improvisa: registra en el spec-conflict log (§5.2) y sigue con la siguiente unidad.

---

## 1. La sesión de decisiones del PO (~30 min, UNA vez, antes del Lote A)

Las únicas decisiones que el agente no puede tomar. Responderlas todas juntas es lo
que compra la autonomía del resto:

| # | Decisión | Contexto | Recomendación |
|---|---|---|---|
| D1 | Fase 0 RLS de staging: ¿se arregla antes del cutover? | readiness doc §B1; remediación escrita en `scripts/ops/staging-rls-remediation.sql`, sin ejecutar | Sí, antes — y el root-cause (quién deshabilitó) vía audit log de Supabase |
| D2 | Contrato de `seed-demo-scenario` (H3) | 3 salidas: paso demo en bootstrap / `skipIf` con log / target `test:demo` aparte | `skipIf` con log fuerte (no engorda bootstrap; CI honesto) |
| D3 | Encuadre del replay asOf del desierto (H5 / P1-F4) | denominador as-of-t (caro) vs línea de copy honesta | Copy: "población actual, actividad a la fecha del frame" |
| D4 | Convención de polaridad (P1-F1 / P3) | ¿oscuro = alarma SIEMPRE (invert en división también)? | Sí: una sola convención, `invert` propagado a la rama división |
| D5 | Canon de radio de botón (X2) | el canon pill está declarado y no ejecutado; codemod toca ~toda la app | Confirmar pill y correr el codemod en Lote D |
| D6 | `grain` faltante en ViewScope: ¿tira error? (H2) | la doctrina escrita dice "refusing beats defaulting"; el código defaultea | Que tire — es la doctrina propia |
| D7 | Fecha tentativa de cutover | ordena si los lotes C/D corren antes o después del deploy | después del Lote B como mínimo |

### Respuestas del PO (2026-07-28)

| # | Decisión | Consecuencia |
|---|---|---|
| D2 | `skipIf` con precondición declarada, sin paso demo en `db:bootstrap` | Aplicada durante el Lote 0 (`d6778d80`) — CI no podía verdear sin eso |
| D3 | **Denominador as-of-t** (NO la línea de copy) | A.6 deja de ser una línea: hay que acotar temporalmente `loadVetDesertByProvince` |
| D4 | Oscuro = alarma SIEMPRE, `invert` propagado a la rama división | A.4 |
| D5 | Confirmar pill y correr el codemod en toda la app | D.1 |
| D6 | `grain` faltante **tira error** | H.1 |

Sin responder: **D1** (RLS de staging antes del cutover — acción del PO con su runbook) y
**D7** (fecha tentativa de cutover). El orden entre SC-1/SC-3/SC-4 y los lotes queda
delegado en el agente.

**Además del PO, en cualquier momento antes del cutover** (~30-45 min, runbook
existente): ejecutar Fase 0-4 del `2026-07-26-cutover-staging-readiness.md`.

---

## 2. Los lotes, en orden de ejecución

Cada lote = 1 rama + 1 PR (delivery `single-pr` + `size:exception`, la norma del
proyecto), commits por unidad de trabajo, `pnpm verify` + `pnpm test` con evidencia
pegada por commit (DoD), Cursor fresh-review pre-push (norma), y al final el gate de
COWORK. Estimaciones en sesiones de Claude Code.

### Lote 0 — Resucitar la red (H1 + H4 + H6 + H10) · ~1 sesión

La primera, porque todo lo demás hereda esta red de contención.

| Unidad | Spec | Qué hace |
|---|---|---|
| 0.1 | H1 | `check-rls-coverage.ts`: skip elegante y ruidoso sin DB (como sus hermanas) — o mover `lint:rls` al job `test`; decidir en código, no preguntar |
| 0.2 | H1 | `ci.yml`: sumar `lint:scope-authz` + `lint:spine` al job `test`; trigger `push: [main, develop, "integration/**"]` |
| 0.3 | H4 | `qa-vis.ts`: step `"assert"` (expr + expected) y exit 1 al final si alguno falló (manteniendo catch-and-continue para reporte completo); `out` relativo al repo; flag de contexto fresco para pasos anónimos |
| 0.4 | H6 | `check-spine-integrity.ts`: guard de host remoto con `--allow-remote`, idéntico al de scope-authz |
| 0.5 | H10 | `db-bootstrap.ts` paso 1: contar tablas esperadas vs creadas tras push; FATAL si difieren |

**Criterio de cierre**: un push a `integration/**` dispara CI y sale verde de punta a
punta (la primera corrida verde de CI desde el 12-06).

### Lote A — Verdad en pantalla (S3 + rojos quirúrgicos) · ~1-2 sesiones

Regla del lote: donde la crítica mostró un test débil o inexistente, **el test de
regresión se escribe ANTES del fix** (cultura anti-"verde por el motivo equivocado").

| Unidad | Spec | Archivo ancla |
|---|---|---|
| A.1 | C8 (top-10 #2) | `presentation-guards.ts:114` — la tile breach-aware gana al zero-denominator |
| A.2 | C5 (top-10 #4) | `ComplianceObligationsPanel.tsx:58-67` — usar el variant "SIN DATO" existente |
| A.3 | P1-F3 (top-10 #7) | `panorama-labels.ts:177-201` — endpoints reales en leyendas provinciales |
| A.4 | P1-F1 + D4 (top-10 #8) | `SituationalMap.tsx` + `division-fill.ts:265` — invert en división; `countLabel` para acceso-veterinario; palabra de polaridad en el pill |
| A.5 | P1-F2 | `layers.ts:546` — label "% sin atención **registrada**" |
| A.6 | P1-F4 + D3 | `panorama-console-helpers.ts:492-517` — un solo reloj + "· al {fecha}" con asOf |
| A.7 | P4-F1 | `PanoramaDataTable.tsx:444`, `RankedRowPreview.tsx:47` — coma decimal (reusar `formatSignedGap`) |
| A.8 | P4-U1 | Reconciliar los tres contadores del panel Registros |
| A.9 | C8 | "N días" congelado al cierre del decomiso; "Urgencia" ordena el total, no la página |

**Gate targeted**: P1 + P4 + C8 + C5 (los hallazgos listados, uno por uno).

### Lote B — Los agujeros de la doctrina de navegación (S2 + S7) · ~2 sesiones

| Unidad | Spec | Qué hace |
|---|---|---|
| B.1 | X1-F3 (top-10 #1) | Login al contrato N3 (`redirectTo` + `useActionRedirect`) — `login.ts:100,103,124` + `LoginForm.tsx` |
| B.2 | X1-F3 | Auditar los 12 archivos de actions con `redirect(` — migrar los post-mutación (booking, editar mascota, match por chip, transfer org); documentar los legítimamente request-edge |
| B.3 | X1-F3 | **Nuevo `lint:action-redirect`**: caza `redirect()` post-mutación en server actions; entra a `verify` y a CI (hoy el agujero es invisible) |
| B.4 | X1-F1 | Pending que sobrevive hasta el unload (patrón en `use-action-redirect.ts` / `action-feedback`) — aplicado a los call sites de mayor tráfico (login, alta, transferencias, denuncia) |
| B.5 | X1-F2 / C3 (top-10 #5) | `/recuperar`: force-dynamic (o nonce-free); mismo tratamiento a la 404 |
| B.6 | C3 / S2 | Guard estructural CSP×prerender: check de build que cruza la lista de prerenders contra el middleware CSP — el tercer caso no debe existir |
| B.7 | X1-F4 | "Asentar" same-route vía `SheetTriggerLink` (`CitizenTabBar.tsx:116-134`) |

**Gate targeted**: X1 (los 4 rojos) + C3 §consola + smoke de login por UI (20/20
navegaciones, cero console errors en /recuperar).

### Lote C — Recuperar lo perdido (S8 + S4 + C6) · ~2 sesiones

| Unidad | Spec | Qué hace |
|---|---|---|
| C.1 | C5 (top-10 #3) | Libreta del dueño: recablear grupos consolidados, `LIBRETA_FILTER_CHIPS` y el dashboard "Estado médico actual" a la vista owner |
| C.2 | C6 (top-10 #9 menciones) | Transferencia saliente en la IA: entrada desde el hub, card que cuenta salientes, estado "pendiente" en la mascota |
| C.3 | P2 (top-10 #6) | Frame nacional de presets → `AR_BBOX` (la misma solución que v2C aplicó al path de back, `SituationalMap.tsx:1036-1044`); cámara se resetea al cambiar preset; URL determinística |
| C.4 | P2-H3 / S1 | Affordance de drill: el dropdown de scope como camino visible (y testeable) además del click en mapa |

**Gate targeted**: C5 + C6 + P2 completos (re-captura con drill vía dropdown incluida).

### Lote D — Canon visual (S5 + S6 + P3) · ~2 sesiones

Codemod-friendly (la casa tiene historia: token-codemods de julio).

| Unidad | Spec | Qué hace |
|---|---|---|
| D.1 | X2 + D5 | Codemod radios → canon pill; escala h1 serif → tokens (de ~10 artesanales a escala) |
| D.2 | X2 | Género de chips de estado: usar los helpers sex-correct existentes (`StatusFlag.tsx`) |
| D.3 | C6 | Una gramática de confirmación (orden de botones incluido) |
| D.4 | C8 | Anatomía única de chips de bandeja (aplicada a las 5 colas) |
| D.5 | P3 (top-10 #10) | Suelo perceptual del mapa: separar lienzo/tierra/clase-1/sin-dato |
| D.6 | C2 (top-10 menciones) | Header credencial 390px (`page.tsx:605`) + fallback de foto con `onError` + atribución OSM visible |
| D.7 | C1 (top-10 #9) | Login visible en nav mobile ≤560px + hit-areas (dots 12px) |
| D.8 | C4 | Un solo verbo para el alta; fix del loop "Asentar" con 0 mascotas; vacío que vende la credencial; éxito con descarga/impresión del QR |

**Gate targeted**: X2 + P3 + C1 + C2 + C4 (hallazgos listados).

### Lote H — Higiene QA restante (H2 + H3 + H5 + H8 + H9) · ~1-2 sesiones

| Unidad | Spec | Qué hace |
|---|---|---|
| H.1 | H2 + D6 | `view-scope-descriptor`: fixtures ≠ defaults (basis/verifiedOnly/encoding), aserciones parse-side en la tabla de mutaciones, throw-paths, `grain` faltante tira |
| H.2 | H3 + D2 | Contrato de seed-demo según D2 |
| H.3 | H8.1-8.4 | `presets.test.ts:332` (bbox vacuo), títulos con drift, `toBeFalsy` → exacto |
| H.4 | H8.2 | `aggregate-to-department`: fixture con departamento fuera-de-grant que NO debe aparecer |
| H.5 | H9 | `casesScopeClause` a la tabla HELPERS de `_scope.test.ts` |
| H.6 | H7 | `check-scope-discipline`: extender glob a `lib/analytics/*.ts` (o mudar el helper de govt-home-kpis a `_scope.ts`) |

**Gate targeted**: re-corro las suites afectadas + spot-check de los tests nuevos con
las 6 preguntas de la guía del 26-07.

---

## 3. Secuencia, calendario tentativo y presupuesto

```
PO: sesión de decisiones (30')  ──►  Lote 0 ─► A ─► B ─► C ─► D ─► H
                                        │      │     │     │    │    │
                              gate COWORK ◄────┴─────┴─────┴────┴────┘  (tras cada lote)
PO: Fase 0 staging (30-45')  — en paralelo, cualquier momento antes del cutover
PO: cutover (runbook)        — tras Lote B como mínimo (D7)
```

- **~9-12 sesiones de Claude Code** en total; los lotes son independientes entre sí
  salvo el orden declarado (0 antes que todos; B antes del cutover).
- **Tiempo total del PO**: la sesión de decisiones + Fase 0 + cutover + 5 skims de
  5 min = **~2-3 horas en toda la ola.**
- Paralelismo: permitido solo con worktrees (norma del repo). Sugerencia simple: serial
  — el gate entre lotes ya da el ritmo.

## 4. El gate de COWORK (cómo funciona)

Al cierre de cada lote, el PO (o el agente, como último paso del PR) le avisa a COWORK
"lote X listo en <sha>". COWORK: (1) actualiza su clone, (2) reconstruye si hace falta
el entorno de la batería (receta de esta sesión: PG nativo 54322 + stub Supabase +
shim GoTrue/Storage + seeds + steps de captura — ~15 min si el container fue reciclado),
(3) re-corre SOLO las críticas targeted del lote con los mismos steps/estados,
(4) devuelve un dictamen por hallazgo: **CERRADO / PERSISTE / REGRESIÓN**, con
capturas nuevas al lado de las viejas. PERSISTE y REGRESIÓN vuelven como primera
unidad del lote siguiente. El dictamen se commitea en
`docs/reviews/results/gates/2026-MM-DD-gate-lote-X.md`.

## 5. Reglas de operación del agente económico

1. **La spec es el doc de crítica.** Cada commit referencia doc§hallazgo. No se
   re-deriva el diagnóstico; no se "mejora de paso" nada fuera de la unidad (el cerco
   "qué NO tocar" del consolidado es vinculante).
2. **Spec-conflict log, no preguntas sueltas.** Si el código real contradice la spec
   (el churn sigue), la unidad se salta y se anota en
   `docs/plans/ola1-spec-conflicts.md` (qué esperaba la spec, qué hay, propuesta). El
   PO lo lee en el skim de fin de lote — 5 minutos, decisiones en tanda.
3. **Test-first en todo fix que la crítica marcó como test-débil.** Las 6 preguntas de
   la guía del 26-07 aplican a cada test nuevo.
4. **DoD sin excepción**: `pnpm verify` + `pnpm test` con salida pegada; conventional
   commits; migraciones forward-only si tocara (no debería en esta ola).
5. **Nada remoto.** Ningún comando contra staging/producción; eso es exclusivo del PO
   con su runbook. `DATABASE_URL` local siempre (la trampa B4 sigue viva hasta H6).
6. **Cursor pre-push** en cada PR (norma existente).
7. **Modelo**: el que corra Claude Code por defecto alcanza para los lotes 0/A/D/H
   (mecánicos con spec); B y C piden el modelo por defecto con atención (no bajar a
   mínimo ahí: tocan auth y navegación). El lote E queda explícitamente fuera — se
   planifica con SDD propio y modelo grande.

## 6. Qué queda para la Ola 2 (registrado, no olvidado)

Lote E (partir PanoramaConsole en islands; criterio: ninguna long task >200ms; medir
INP real con throttling 4x) · tanda 2 de críticas (org portal, admin ops,
`/design:accessibility-review`, mobile /gob si el PO lo decide) · re-captura de estados
forzados que faltaron (censored, stale-frame) · backups de staging (plan free) y lo que
el objetivo "piloto" agregue si D7 evoluciona.
