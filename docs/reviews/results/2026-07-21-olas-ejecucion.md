# Ejecución de las 4 olas — tracking (autónomo, PO approved)

> Plan: `2026-07-21-nivel-siguiente-plan.md`. Método: primitivo → fence → barrido.
> PO approved autonomous execution of all 4 waves. Defaults on embedded micro-design
> decisions (listed per wave for PO adjustment). Stays PO-gated: DB migrations
> (apply to remote), cutover #760, final visual sign-off. Questions batched per wave.
> Invariants: two skins (Ln/Op) never merged; k-anon; event-sourcing; es-AR UI /
> English code; no AI attribution. Discipline: verify (tsc/biome/lint/tests) per
> commit; no `pnpm build` under running :3000 without rebuild+restart.

## Status

| Ola | Track | Item | Status |
|---|---|---|---|
| 1 | A4 | Icon registry sweep + fence | ⏳ |
| 1 | E2 | /gob/analytics/export nav links | ⏳ |
| 1 | E3 | owner-nudges orphan: delete dead code (re-mount = separate PO decision) | ⏳ |
| 1 | E7 | AGENTS.md doc-correction (6 stale) | ⏳ |
| 1 | A1 | Spacing tokens (--space-*) + fix Card.tsx + fence | ⬜ |
| 1 | A2 | Type-scale tokens (text-[13px]/[11px]…) + fence | ⬜ |
| 1 | A3 | Radius snap + tighten fence | ⬜ |
| 1 | A5 | Number primitive (tabular-nums/decimals) + fence | ⬜ |
| 1 | A6 | Copy: Ingresar→Iniciar sesión + terminology lint | ⬜ |
| 2 | B | State system (StateView, 9 states, offline/maintenance, partial, permisos, loading) + fence + sweep | ⬜ |
| 3 | C | Feedback+confirmation convention (Toaster, ConfirmDialog rule, consequences, OpButton pressed, citizen who/when) | ⬜ |
| 4 | D | Decision density (KPI hierarchy primitive, demote/disclose, decision lens) | ⬜ |
| 4 | E1/E4/E5/E6 | Facade harvest needing real UI (cases-per-capita, transfer-cancel, reglas microchip, org check-ins) | ⬜ |

## Progreso real
- **Ola 1 COMPLETA**: A4 iconos+fence + E2/E3/E7 (`30ac5c42`); A1-A3 tokens (`d9201a34`);
  A5 números + A6 copy (`2e1a9e6d`). :3000 rebuildeado.
- **Ola 2 fundación LISTA** (`4c9167a3`): offline (useOnline+banner), maintenance
  (screen+mode switch), partial (OpBulkResultPanel, 3 dedup), permisos (dedup outlier).
- **Ola 2 PENDIENTE**: loading skeletons (13/115→sistemático), adopción app-wide de los
  primitivos donde el estado es ad-hoc, y el fence de cobertura de estados.
- **Ola 3 PENDIENTE**: feedback+confirmación (Toaster, ConfirmDialog rule, consequences,
  OpButton pressed, citizen who/when).
- **Ola 4 PENDIENTE**: densidad (KPI hierarchy primitive, demote/disclose, lens) +
  cosecha grande (E1 cases-per-capita, E4 transfer-cancel, E5 reglas microchip, E6 check-ins).

## LAS 4 OLAS COMPLETAS (2026-07-21)
- Ola 1 (tokens/números/copy/iconos + cosecha): `30ac5c42`,`d9201a34`,`2e1a9e6d`.
- Ola 2 (sistema de estados: offline/maintenance/partial/permisos + skeletons + fence):
  `4c9167a3`,`63994dd3`.
- Ola 3 (feedback+confirmación: pressed, toasts, ConfirmDialog rule, asimetrías): `82e3bcf7`.
- Ola 4 (facades E1/E4/E5/C5 + densidad OpKpiGroup): `31d5d7f0`,`c72d5c9b`.
Todo verificado (tsc/biome/lint/tests), :3000 rebuildeado, nada pusheado.

## Preguntas/decisiones para el PO (juntadas del run)
1. **adoption_reversed** (E4): NO existe use-case real (solo tests/seed insertan el evento).
   Construirlo es dominio nuevo. ¿Qué debe hacer: la custodia vuelve a la org que finalizó?
   ¿reabre el listado en silencio o pide re-publicar? — PARADO, espera tu definición.
2. **owner-nudges** (E3): defaulteé a BORRAR el módulo huérfano. Re-montar la feature de
   nudges es decisión tuya (no se resucita sin intención).
3. **Validación visual** (diseño de Ola 4): headline de vigilancia ("Brotes activos") y
   programa ("Provincias en alerta"), tamaños primario/secundario, overflow "Más" de org.
4. **maintenance-mode**: se activa por env flag (docs/ops/env-handling.md).

## Remainder que ratchetea (post, no bloquea)
- ~75 segmentos con skeleton genérico (no específico); 17 empty-state baselineados.
- Adopción app-wide de `notifySaved` (convención probada en 3 superficies).
- Los 2052 valores arbitrarios de tokens ratcheteando.

## RUN NOCTURNO EXPANDIDO (PO 2026-07-22) — cola
Aprobados + candidatos (Blind spot, empty-state, Panorama split, Fase B) + Fase C.
- ✅ adoption_reversed (`406c049f`,`c8c690ef`); density revert + provincias-alerta fix (`ad52c27e`).
- ✅ Toast sweep app-wide (`5c545b4a`).
- ⏳ Skeleton sweep (~75 segmentos → específicos).
- ⬜ Stale comments adoption-listing/case-attachment ('reopens listing' — mentira).
- ⬜ Blind spot: endurecer lint:authz-subsumption (no cazó el bug de subsunción).
- ⬜ Empty-state: los 17 gaps baselineados → LnEmptyState o N/A documentado.
- ⬜ Panorama split (Console 5473 / repository 4278 / SituationalMap 4034) — CUIDADO.
- ⬜ Fase B: filtros baratos (especie/estado) en más pantallas (columna+eq ya existen).
- ⬜ Fase C nacional: saved views + export que honra filtros.
PO decisions: adoption_reversed = custody→org + re-publish explícito (HECHO); owner-nudges
= borrado (HECHO); primario/secundario = revertido (HECHO).

## NOCTURNO EXPANDIDO — COMPLETO (2026-07-22)
- ✅ Toast sweep `5c545b4a` · Skeleton sweep (117) `470e5d95` · smalls (comments+blind-spot+empty)
  `4ab3585e` (¡el blind spot destapó 11 bugs de scope más!) · Fase B `0839bf2f` · Fase C `c0c1b654`
  · Panorama split `758eddf3`.

## Preguntas/decisiones para el PO (del nocturno)
1. **Saved views server-side (cross-device)**: la versión localStorage está hecha; una persistente
   entre dispositivos necesita TABLA (migración) → decisión tuya.
2. **Jerarquía de densidad**: revertida a plano (no te gustó primario/secundario). Si querés,
   probamos otro enfoque (agrupar por secciones sin cambiar tamaños).
3. **2 shapes reverse-direction de subsunción** (approval-routing, surveillance-repo) flageados —
   pasada separada.
4. **Cuerpos mega-closure de PanoramaConsole/SituationalMap** (~4500 líneas): candidatos a refactor
   test-first, NO se tocaron mecánicamente (riesgo stale-closure).
5. **Pre-push**: la rama creció MUCHO — antes de pushear conviene un review adversarial fresco nuevo
   + verify completo sobre todo el rango. Cutover #760 sigue siendo tuyo.

## Log
- (start) Plan committed 25e38ae7. Wave 1 kicked off.

## Defaults taken (PO to adjust at wave boundaries)
- E3 owner-nudges: DELETE the orphaned dead module (re-mounting the nudge feature is a
  product decision, not resurrected without intent) — flagged for PO.

## PLAN MAESTRO DE INTEGRIDAD — ejecución (PO approved 2026-07-22, doc e7480bfe)
Ola I: C2 lenguaje + C5 seed + C1 arranque. Secuencial (norma un-writer-por-árbol).
- ⏳ C2: SlaBadge tipado + CTAs + bivariado + RUPGA + glosario + ENO labels + fence copy-contract
- ⬜ C5: seed hygiene (display_name/welfare desc, lucas@ CABA-entera, edad↔status, multi-org) + lint:no-seed-ids
- ⬜ C1: descriptor ejecutable + renderer con guardas + primeros 8 consumidores

### OLA I COMPLETA (2026-07-22)
- C2 lenguaje `7eb41f60`+`2bce8eaf`: SlaBadge tipado (fix confianza #1) · maltrato default
  unassigned · capability-classes en feed links · glosario+RUPGA · bivariado "Intensidad de
  reporte" · ENO honesto · lint:copy-contract (baseline 0).
- C5 seed `c96ca01b`: nombres reales · edad↔status (90% cerrado >180d) · lucas@=CABA-entera ·
  6 orgs esterilización · feed variado · migración 0155 (seed_tag, LOCAL — remoto PO-gated) ·
  check-seed-hygiene (0/3023) + lint:seed-ids (0).
- C1 arranque `b2fa5944`: contrato ejecutable en kpi-catalog · presentation-guards ·
  OpKpi.descriptorId · 8 consumidores (mortalidad 0/0, reunificación smallN, antirrábica única,
  PPP sin veredicto, MoM suprimido, microchip, escalation-gap, censo co-igual) ·
  lint:metric-contract (ratchet 80/19) · hostile-reader suite.
NEXT — Ola II: barrido C1 (~80 tiles al descriptor) + C3 ViewScope + C4 epistémico.
PO-gated: migración 0155 a remoto · validación visual (SLA badges, maltrato default, renombres,
KPIs guardeados) · upgrade Vercel Pro (frescura).

### OLA II COMPLETA (2026-07-22)
- C3 ViewScope `701c106d`: describeMandate chrome honesto · ViewScopeCaption "Vista: X" ·
  censusEligibleProvince (vista resuelta, no asignaciones) · **period-drift #27 REPRO'D+FIXED**
  (committedPeriod ignoraba ?period= explícito) · lint:view-scope · scope-fence re-keyed por
  conteos (line-shift-immune tras romperse 3×).
- C4 epistémico `29dd8e07`: nature measured-zero|no-signal en EmptyState/OpCallout ·
  vigilancia/observaciones/mortalidad/analytics "ciego, no tranquilo" · lint:states Rule 5.
- C1 sweep `67bca443`: **80 → 0 tiles sin descriptor** (~50 entradas nuevas de catálogo leídas
  de los fetchers) · hostile-reader +5 narrativas · pantalla nueva con KPI sin contrato = CI falla.
NEXT — Ola III: C6 (IA 5 capas + workqueues, PO-dirigida, sobre los contratos).
PO-gated sin cambios: 0155 remoto · Vercel Pro · validación visual · push/#760.

### OLA III (C6) COMPLETA (2026-07-22)
- C6a `d6cf662c`: rail reagrupado en 5 capas + Bandeja (sin mover rutas) · hub /gob/denuncias
  (Moderación→Triage→Caso, aditivo) · screen-manifest (51 rutas con decisión dueña) + lint:screens.
- C6b `c718265d`: el Briefing — home = alertas priorizadas (motor puro, guards: nunca alerta desde
  dato inmedible; solo 3 KPIs alertables sin queries nuevas, 4 documentados como pendientes) →
  brechas vs meta → cola condensada (dedup CTAs) → mi trabajo (condicional) → novedades colapsada.
- C6c `2999ea3f`: gramática workqueue en maltrato (pill de asignación, Tomar 1-click, Actuar =
  verbo primario del state machine, motivo preservado) + bug real de paridad Mías fixed.
NEXT — Ola IV: read models (PF1), MPF cascade, forecast-a-meta, fase-2 del nav (absorciones).
PO: validación visual GRANDE pendiente (Briefing + rail + hub + workqueue + todo Olas I-II).

### OLA IV — parcial (2026-07-22)
- Privacy-text alineado a la captura REAL `8dc982d3` (la política decía "no GPS" — falso;
  FLAG legal pendiente: retención indefinida de puntos GPS sin plazo declarado — decisión PO/legal).
- MPF cascade `bfdca443`: export para TODAS las jurisdicciones, formato como regla cascadeada
  (local→prov→nacional) con provenance visible; migración 0156 LOCAL (remoto PO-gated).
- FUSIONES aprobadas (27→19): F1 Denuncias absorbe Moderación+Maltrato `b5f3607e` ·
  F2 Operativos + F3/F7 Directorio(+RUPGA) `deb32f6e` (+2 tests seed-sensibles FORTALECIDOS).
  PO: F4/F5 NO (Suscripciones y Mi actividad quedan en rail) · F9 mapas → fase 3.
- PENDIENTE Ola IV: F6 (Disputas tab en Casos) + F8 (Población+Censo→Padrón) · PF1
  consolidación de queries (con harness de paridad) · forecast-a-meta.

### OLA IV COMPLETA (2026-07-22) — EL PLAN MAESTRO ESTÁ EJECUTADO (Olas I-IV)
- Privacy `8dc982d3` (FLAG legal: retención GPS indefinida sin declarar — PO/legal).
- MPF cascade `bfdca443` (migración 0156 LOCAL).
- Fusiones F1-F3+F6-F8: rail 27→19 (`b5f3607e`,`deb32f6e`,`a5f81c89`) + tab Triage `polish`.
- Forecast-a-meta `b32409d6` (motor puro + guards; 1 KPI honesto calificado, 8 documentados).
- PF1 `9bb9a566` (5 merges parity-proven, 3 rechazados por semántica, timing honesto).
FASE 3 (futuro): F9 mapas · absorciones restantes si PO quiere <19 · trend fetchers para
los 8 forecasts pendientes · fetchKpiTrend/microchip merges · read models materializados
(necesita Vercel Pro).
PO-gated acumulado: migraciones 0155+0156 remoto · flag legal GPS · Pro · validación
visual GRANDE (rail 19 + hubs + Briefing + forecast + todo I-IV) · push/cutover #760.

### RONDA DE VALIDACIÓN PO + SWEEP ADVERSARIAL TOTAL (2026-07-23) — COMPLETA
- Batch A `0e2a560d` (omnibox/bivariado-pair-blind/buscadores/subtítulos/foster→tránsito/
  zoom casos/ScreenHeader underHub) · Batch B `98f35777` (Briefing de-a-1 según PO) ·
  Batch C `fa256e6d` (Reglas: lista solo-customizadas + wizard Crear Regla).
- Sweep adversarial (2 revisores, TODAS las pantallas admin+gob): docs 2026-07-23-adversarial-*.md.
  Batch 1 `9983141c`: headers dobles en tabs DEFAULT (Denuncias/Padrón) · ScreenHeader 11→45
  (root cause cerrada) · "Mi actividad"→"Historial" honesto · admin/moderacion stale→redirect ·
  paridad savedViews · OpKpiSm en maltrato/[id].
- Batch 2 `1efc8556`: badge de notificaciones (bug real: getUnreadCountCached sin filtros de
  reconciliación — MI diagnóstico de categoría-NULL era mitad-erróneo, refutado por el writer;
  trigger de bienvenida dispara en PRODUCCIÓN → migración 0157 LOCAL) + "Enviar recordatorio"
  outreach (privacy-by-design, throttle 14d, audit, authz server-derived).
- Build fix `715f6d63`: RulesWizard importaba const runtime vía @/db (server-only) — roto
  desde batch C, invisible a tsc, cazado en el primer build. LECCIÓN: build antes de commitear
  batches con imports nuevos en client components.
PO-GATED ahora: migraciones 0155+0156+**0157** a remoto · flag legal GPS · Vercel Pro ·
validación visual de ESTA ronda · pre-push (review fresco + verify + suite) · push/#760.

## ENTREVISTA PO 2026-07-23 — 13 DECISIONES LOCKEADAS (tintero vacío)
1. Banner de entorno inescapable (env-driven "DEMOSTRACIÓN — datos sintéticos"; branding queda).
2. Paquete impacto COMPLETO: ranking gap×población + forecast con cupos/dosis faltantes +
   smalls (AMR="sin datos de uso", embudo→"flujo (no cohorte)", cortar site-map admin).
3. Operativos: GEO-PRIMERO (agregados rankeados por zona) + PII solo tras confirmar operativo.
4. Pérdidas: ubicación legible en fila + scope operativo del detalle (nacional=agregados sin dueño).
5. Nav: Cola → "Aprobaciones".
6. Casos: leyenda de badges + orden por urgencia (edad×tipo) + sujeto "Animal sin registrar"
   (verificado: disputas SIN mascota no existen — petId NOT NULL; el "—" eran casos de
   animales sin registrar, categoría real del dominio).
7. Vigilancia: acción primaria EN los KPIs de alerta (patrón OpKpi href).
8. Sesión: TTL de jornada laboral para operadores (config env, documentar).
9. Migraciones 0155+0156+0157 → APLICAR a staging remoto (aprobado).
10. Vercel Pro: NO todavía (pre-demo con Hobby; frescura ya fail-closed).
11. Pre-push: DESPUÉS de aterrizar este lote (un solo gate sobre el rango final).
12. Fase 3 rumbo: trend fetchers → forecasts completos.
13. Retención GPS: declarar la realidad en la política ("se conservan mientras la mascota
    permanezca registrada, como parte de su historial" + supresión existente); evaluación
    formal de plazos → asesor legal cuando haya convenio.
Extra: sembrar UNA disputa de demo (V9 nunca pudo probarse — 0 disputas en seed).
EJECUCIÓN: batch mecánico (5/6/2-smalls/13/banner/TTL/disputa) → migraciones remoto (yo,
con cuidado) → batch impacto (2) → Operativos+Pérdidas (3/4) → KPIs acción (7) → PRE-PUSH.

### ENTREVISTA — EJECUCIÓN COMPLETA (2026-07-23)
- Batch mecánico `2d279d57` · Migraciones 0155/0156/0157 APLICADAS+VERIFICADAS en
  DIM-staging (agnwyifsdxxoznodutgq) vía MCP con bookkeeping _dim_migrations correcto ·
  Impacto `47345189` (gap×población + faltan-~N-dosis) · Batch final UX (Operativos
  geo-primero con PII tras "Armar operativo" + audit por zona; Pérdidas legible + detalle
  de dueño solo en jurisdicción operativa; escalation-gap KPI → cola real de mordeduras).
- REGLA OPERATIVA nueva: la data de demo comparte la DB local con la suite — una corrida
  completa puede borrar entidades sembradas dejando tríos inconsistentes (pasó 2×: disputa
  de Bruno borrada dejando caso+flag huérfanos → el re-seed choca con el índice de caso
  único; healing: borrar caso huérfano + flag, re-seed). ANTES DE UN DEMO: re-correr
  seed-demo-spine tras cualquier full-suite. Wiper exacto sin identificar (candidato a
  investigación fase 3).
- "Preexistente/no-relacionado" desmentido 15 veces esta semana. La disciplina queda.
NEXT: **EL PRE-PUSH GATE** (review adversarial fresco sobre ~140 commits + verify + suite)
→ push/#760 (PO) → más reviews adversariales (plan PO).

## PRE-PUSH GATE — VEREDICTO (2026-07-23)
1. pnpm verify (typecheck + ~35 fences + build): ✅ VERDE.
2. Review adversarial fresco #3 (rango 7aa17275..HEAD, 41 commits): ✅ 0 Critical.
   2 hallazgos, ambos arreglados en `d78bab13`: guard muerto del tile de adopción
   (0/0 pintaba rojo) + LA BANDEJA DE ESCALADAS DEL ADMIN restaurada (invisible para
   todos desde el redirect F1 — includeEscalated ahora derivado del rol).
3. Suite completa: 12.025/12.026 ✅ — la única falla es el artefacto conocido
   demo-data-vs-suite (disputa de Bruno), ahora AUTO-CURABLE (spine self-heal) y
   verificado verde post-heal.
LA RAMA ESTÁ PUSH-READY. Push + cutover #760 = PO. :3000 fresco en HEAD.

## COLA PENDIENTE (actualizada 2026-07-23, post-review visual)

### Lotes de la review visual (aprobados para cola, sin arrancar)
- **Lote V1 — copy/locale/chips (mecánico)**: resolveBusinessRule fuera de la alerta del
  home; "173d"→"173 días"; "0.1%"→coma decimal; tildes (PERDIDAS/acá); "1 pendientes";
  plurales "(es)"; contradicción Directorio (texto vs botón Revocar); "dashboard"→"Panel";
  disclaimer natalidad repetido 3× (y en ALTAS NETAS donde no aplica); ranking liderado
  por "(sin registrar)"; inversiones de semáforo (disposición desconocida en verde,
  paleta de causas con hues de semáforo, ENO 100% ámbar).
- **Lote V2 — estados vacíos de mapas y charts**: estado in-map bajo k-anon total
  ("todo el detalle protegido — N en el agregado"); leyenda Panorama duplicada; buckets
  degenerados ("5–5"); charts vacíos con mensaje (no ejes+leyenda en blanco); leyenda
  oculta con 0 series; fallback de punto único; dock "1095 días"→"3 años"; ocultar
  "(en desarrollo)".
- **Lote V3 — mobile**: top bar desbordada @390 (todas); FILTROS colapsable a fila
  resumen; KPIs 3-across → stack @<sm; tabs del dock truncados.
- **Sueltos**: select Provincia no hidrata desde URL (chip dice CABA, select "Todas");
  unificación de formato de eje de fechas; qa-up compara BUILD_ID memoria vs disco;
  seed con localidad ≥5 eventos (hoy la leyenda graduada es inverificable — todo k<5).

### Backlog dataviz verificado (de la review adversarial, sin arrancar)
- **ALTA — zero-fill de buckets**: los fetchers omiten buckets sin eventos (períodos
  silenciosos invisibles; regresión del forecast ajusta por índice → "meta en ~N
  períodos" mal en series ralas). Fix en finalizeSingleSeries/pivotStackedSeries.
- **MEDIA — suprimido ≠ cero en líneas de tiempo** (y disclosure en sparklines);
  conecta con el sospechado visual "línea suave sobre 4 períodos ocultos".
- **MEDIA — coropletas /gob**: conteos crudos + rampa continua (Panorama ya resolvió
  ambos: per-cápita + escala clasificada — portar o caption "conteos absolutos").
- **BAJA**: unificar primitivo de sparkline; deprecar delta v1 (flecha/color conflados);
  leyenda divergente latente (neutral al 50% vs mapa anclado a meta); decisión de token
  de subtítulo (deuda text-[13px] vs --text-md).

### Fase 3 (estable)
Trend fetchers → forecasts completos (frente elegido) · F9 dedup de mapas ·
notifications.category NOT NULL (7 paths) · split de kpi-catalog (en techo de tamaño) ·
refactor PanoramaConsole/SituationalMap · investigación del wiper de datos demo ·
stub admin moderación · slot censusCoveragePct en guardInput de OpKpi.

### Reviews aún no corridas
Accesibilidad (contraste/foco/aria) · microcopy profundo · responsive interactivo.

### PO-gated
Push + cutover #760 · migraciones a PROD · Vercel Pro · revisión legal GPS (con convenio).
