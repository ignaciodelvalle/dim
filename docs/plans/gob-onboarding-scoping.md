# Gob/admin first-run onboarding checklist (#14) — SDD scoping

> Scoping-first deliverable (triage 2026-07-12: "not a port — needs its own step taxonomy…
> Scope as an SDD change"). This doc fixes the step taxonomy + placement for PO review; the SDD
> change (spec → design → tasks) starts once approved. The ORG-side precedent
> (`components/OrgSetupChecklist.tsx` + `lib/infra/org-setup-checklist.ts`) proves the
> state-derived checklist idiom: steps derive from REAL data, never from a stored "done" flag.

## The problem
A new govt operator (or a fresh admin) lands on a dashboard tuned for a running operation:
empty queues, zero campaigns, a panorama with only seed data. Nothing says "esto es lo que un
operador hace primero". The org side solved this with a checklist that derives each step's
completion from actual state (an org with a logo uploaded shows that step done — no bookkeeping).

## Proposed step taxonomy

### Govt operator (`/gob` home, dismissible card, state-derived)
| Step | Derived from | CTA |
|---|---|---|
| G1 Conocé tu alcance | always shown first (informational; completes on visit) | "Ver mi jurisdicción" → scope pill |
| G2 Recorré el panorama | first visit to /gob/panorama recorded (per-user watermark — SHARED infra with the #33 novedades feed) | "Abrir panorama" |
| G3 Configurá tu primera campaña | campaigns count > 0 in scope | "Nueva campaña" |
| G4 Revisá la cola de casos | any case viewed / cola visited | "Ver casos" |
| G5 Emití tu primer informe | informe generated (panorama #55) OR export run | "Informe de situación" |

### Admin (`/admin` home)
| Step | Derived from | CTA |
|---|---|---|
| A1 Creá el primer gobierno | govt accounts > 0 | "Gobiernos" |
| A2 Asigná jurisdicciones | any govt with jurisdictions > 0 | "Usuarios" |
| A3 Aprobá la primera organización | orgs approved > 0 | "Organizaciones" |
| A4 Revisá las reglas activas | rules console visited | "Reglas" |

## Shared infra note (design-time decision)
G2/G4 need "visited" facts → the **per-user watermark** the #33 novedades feed ALSO needs
(viz-suite plan: "per-user watermark does NOT exist → new small column/table"). Design them as
ONE table (`user_surface_visits`: user_id, surface, first_visited_at, last_seen_at) so #14 and
#33 wave 2 share it instead of inventing two.

## Non-goals
- No tour/tooltips product (a checklist, not a walkthrough).
- No stored per-step "done" flags where state can derive it (org-checklist invariant).
- Owner onboarding is NOT this task (owner UX has its own arc, #19).

## Open PO decisions
1. Approve/edit the step lists (G1-G5, A1-A4).
2. Dismissible forever vs collapsible (org checklist precedent: collapsible until complete).
3. Does G3 (campaña) apply to ALL govt roles or only province-level operators?
