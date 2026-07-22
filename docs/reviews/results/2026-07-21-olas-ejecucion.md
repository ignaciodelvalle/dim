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

## Log
- (start) Plan committed 25e38ae7. Wave 1 kicked off.

## Defaults taken (PO to adjust at wave boundaries)
- E3 owner-nudges: DELETE the orphaned dead module (re-mounting the nudge feature is a
  product decision, not resurrected without intent) — flagged for PO.
