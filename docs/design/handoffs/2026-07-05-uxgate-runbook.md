# Pre-launch UX acceptance gate — runbook (Cowork ∥ Cursor)

A repeatable **information-sufficiency + flow-coherence** gate, run by local agents driving real Chrome (MCP). NOT a code gate (`pnpm test` checks the DOM; this checks whether the screens say **the right amount** and whether flows are self-contained and legible). Derived from `MiMAR-plan-test-UX-chrome.md` — this adds the sufficiency rubric, a pass threshold, and the parallel-run partition.

## Preconditions (the gate is only valid on a pristine, built server)
1. Pristine re-seed: `pnpm db:reset && pnpm db:bootstrap && pnpm seed:demo && pnpm seed:panorama && pnpm seed:demo-polish && pnpm seed:demo:scenario`.
2. Built, not dev: `pnpm build && pnpm start` → the gate runs on **:3000** (paint matters; dev HMR masks real render).
3. Seed is pinned → runs are comparable → this is a gate, not a one-off.

## The rubric — score EVERY key screen on 4 axes (this is the "información JUSTA y necesaria" test)
For each screen, the agent answers + captures a screenshot:
1. **¿Sobra?** Any datum/control here that is noise / could be removed without loss? (more than necessary)
2. **¿Falta?** A decision the user must make here but can't, because the needed info isn't on the screen (forces hunting / context-switch)? (less than necessary)
3. **¿Autocontenido?** Does the flow complete without leaving context? Is its storyline/why-am-I-here present when needed (empty states, first-run, mid-flow orientation)?
4. **¿De un vistazo?** Is the full state graspable at a glance, or does it require reconstruction?

## Severity + PASS threshold
- **Blocker** — breaks a task/promise OR a screen is unusable/misleading for its job.
- **Major** — confuses or forces guessing/hunting; sufficiency clearly off (sobra/falta materially).
- **Minor** — polish.
- **PASS = zero Blockers AND Majors ≤ 5 total.** Otherwise the gate fails → remediate → re-run.

## Parallel-run partition — by FLOW + disjoint cohort, NOT by role
Splitting by role breaks the cross-POV choreography (W5 spans owner→vet→owner→govt). Instead each agent runs COMPLETE end-to-end flows (playing every role the flow needs) on its **own disjoint account cohort**, so flows stay self-contained and side-effects never collide.

| Agent | Flows (end-to-end, all needed roles) | Single-POV coverage | Cohort |
|---|---|---|---|
| **Cowork** | W1 alta · W2 reclamar · W3 peso→curva · W4 perdido→encontrado · W16 auth · W17 privacidad · W18 datos-personales | Público (landing/perdidas/adoptar/código/QR/denuncia) + Dueño screens | **A** |
| **Cursor** | W5 vacuna-firmada · W6 mordedura→observación · W7 adopción · W8 tránsito · W9 transferencia-cross-org · W13 permisos · W14 turnos · W15 servicios · W10/W11 org+matrícula | Gob + Admin + Refugio/Vet screens | **B** |

## Credentials (all `Test1234!`)
- **Cohort A (Cowork):** `owner@dim.test` (+ its pets), and the public/anon paths (no login).
- **Cohort B (Cursor):** `alejo@dim.test` (vet + 4 orgs), `orgadmin@dim.test` (refugio), `govt@dim.test` (6 localidades), `admin@dim.test` (universal), plus the **B-cohort owner** for adoption/transfer targets (see the seed's cohort-B accounts once added).
> For TRUE isolation the two agents must not share a logged-in account. If cohort B's second-owner accounts aren't seeded yet, run the two agents SERIALLY on the cross-POV flows, or assign the shared operator accounts (govt/admin) to Cursor only.

## Two caveats that will bite
1. **Shared aggregates.** Govt KPIs / admin counts / panorama reflect BOTH agents. Scope any KPI assertion to the agent's own jurisdiction/cohort, or run KPI-verification steps serially (barrier). Don't assert a national number under concurrency.
2. **Consolidation is one judgment.** Parallelize for coverage breadth, but the "does the system say the right amount everywhere, is it consolidated" verdict is holistic — one synthesis pass (a single agent, or the PO) reads both addenda and renders the final PASS/FAIL. Don't split the coherence judgment.

## Execution order (per agent)
Público → its owner/citizen flows → its operator flows → close the cross-POV loops it owns → regression (§7 of the plan: re-verify prior findings on the clean server) → structured addendum.

## Output (structured, per agent)
- Matrix cell per (flow × POV): ☐→✅/❌ + the 4-axis rubric score.
- Findings list: severity-tagged, screenshot per key screen, `[POCO INTUITIVO]` markers, side-effect log (for revert).
- The single synthesis pass merges both → one PASS/FAIL verdict + a consolidated "sufficiency" call.
