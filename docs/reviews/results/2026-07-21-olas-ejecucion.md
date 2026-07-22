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

## Log
- (start) Plan committed 25e38ae7. Wave 1 kicked off.

## Defaults taken (PO to adjust at wave boundaries)
- E3 owner-nudges: DELETE the orphaned dead module (re-mounting the nudge feature is a
  product decision, not resurrected without intent) — flagged for PO.
