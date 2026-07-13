# RESUME — panorama ViewState arc (as of 2026-07-12)

> The repo anchor for continuing the ViewState refactor if a session ends. The full,
> auto-loaded version lives in Engram (`resume/panorama-viewstate-arc`). Branch:
> `integration/all-20260703`.

## Where we are
- **WS-4 ViewState P2 DONE** — `capabilitiesFor` gate (`src/modules/panorama/domain/capabilities.ts`)
  + derived-preset + migrated isMeta×4 / temporal / bivariate predicates + deleted dead scales.
  A **fresh adversarial review caught a CRITICAL** (bivariate toggle reachable in 2 clicks via a
  hand-edited `{esterilizacion,zoonosis}` combo the hardcoded cobertura×zoonosis join can't render)
  → fixed: `bivariateEligibleFor` constrained to exactly `{cobertura,zoonosis}`, `signalPresent`
  removed, characterization test pins it. `pnpm verify` EXIT 0.
- **Commits:** `4c828ce4` (P2) · `1f1156ba` (bivariate fix) · import-sort. **Push pending on suite-green.**
- **FIRST ACTION ON RESUME:** confirm `TEST EXIT=0` in the full-suite log, then
  `git push origin integration/all-20260703`, then restart :3000 (`pnpm -C /c/dev/dim start` bg).

## The remaining WS-4 phases (source: `panorama-viewstate-design.md` + `-master-plan.md`)
1. **P3 — first-class Encoding + inset** → structurally fixes CABA "sin datos" (aggregate exists,
   detail suppressed). Consolidate the color systems into a declarative Encoding per layer; the inset
   projects the SAME encoding.
2. **P4 — LOD + decoupled navigation** (scroll=camera / click=drill, PO-decided) → structurally fixes
   the ghosting + the nav model. representationPerZoom read against live zoom; kill the imperative
   `POINTS_LAYER_IDS` switch (keep the server-side `get-layer-features` gate).
3. **P5 — gifts:** embed (#51), presentation mode (#32), explain-view.

**Per-phase protocol (non-negotiable):** plan-first from the design doc → implement with ZERO UX
change until P4 harvests → characterization net + FULL panorama suite green → **fresh adversarial
review each phase** (caught real CRITICALs in P1b + P2) → gate (`pnpm verify` + full suite, confirming
the REAL `TEST EXIT`, not the wrapper notification) → commit → push.

## Then, in cascade
#24 switcher (on the gate) → #33 viz-suite → #51 embed.

## Other implementable arcs
#14 onboarding · #44c dept-rate coverage · #31 (perdidas filter-divergence + shared `toChoroplethData`)
· #19 owner-process-clarity · #15b/c/d · #16a `/p` streaming. Minor: #56a error sink, #16b font tokens.

## Not mine to unblock
Blocked external: #28 Mi Argentina (convenio), #29 PPP BA (format). PO action = staging: **#3 deploy +
apply migration `0141`**.

## Gotchas that bit us (repeat the fix)
1. **Gate the REAL test result** — grep the log for `TEST EXIT=`, NOT the background wrapper's
   "completed exit 0" (that's the echo wrapper, not vitest). Pushed 2× with failing tests by trusting it.
2. **After agent edits, `pnpm verify` catches:** biome format (`biome check --write .`), design-token
   ratchet (`text-[Npx]` → `text-[var(--text-*)]`; globals.css exempt), import-sort
   (`biome check --write --unsafe <files>`). Loop edit→verify→fix until EXIT 0.
3. **Never build under live :3000** — stop the port → verify (builds) → restart. Killed servers'
   wrapper jobs report exit 127 (expected).
