# RESUME — panorama ViewState arc (as of 2026-07-12)

> The repo anchor for continuing the ViewState refactor if a session ends. The full,
> auto-loaded version lives in Engram (`resume/panorama-viewstate-arc`). Branch:
> `integration/all-20260703`.
>
> **UPDATE 2026-07-14 — P2 + P3 + P4a + the `?preset=` deep-link fix DONE + pushed (HEAD `fd523492`).**
> P4a = the CABA inset projects the resolved encoding (bivariate 3×3 cell + graduated bubble instead of
> "sin datos") — graduated live-verified via Playwright, bivariate PO-validated. **Task #69 FIXED at
> `fd523492`** — the `?preset=` URL seed never expanded to layers (pre-existing 3-layer bug, NOT a P2
> regression); the server now seeds the named preset's board. Residue: a national-framed preset opened
> via `?preset=` still lands unframed (frame set at mount is dropped before the map's async load) —
> absorbed into P4c (fix inside the load handler, mirroring `frameProvinceOnLoad`). **Next:** P4b
> (LOD/representationPerZoom → ghosting), P4c (decoupled nav scroll=camera/click=drill + preset framing
> on load), P5 (gifts — note `explainViewState` already BUILT in `ddf50473`, UI wiring pending; PO 2026-07-14:
> encoding-in-URL YES in P5, replay = live view, NO `?basis=`). **Before staging:** re-validate the
> bivariate palette for CVD on the LIGHT canvas (design §8 fork 2 said "blocks P3" but P3 shipped;
> `bivariate-fill.ts:29-33` still cites the retired dark-navy validation). The section
> below still describes the P2→P3 transition; the phase specs + disciplines remain the source of truth.

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
#14 onboarding · #44c attribute filters (REAL version gated behind ViewState `ViewScope`; dept-rate
coverage was #44a — DONE) · #31c shared `toChoroplethData` (#31a perdidas divergence CLOSED as the
documented D4 variant, `9bb90fca`) · #19 owner-process-clarity (`docs/plans/owner-process-clarity.md` —
UNBLOCKED: its gates #9/#10 shipped `fa6c0578`/`52ada95e`) · #15b/d (#15c never existed — numbering typo)
· #16a `/p` streaming. Minor: #56a error sink (seam DONE `da9f8047`, vendor choice PO-gated).
Done since the 07-12 triage: #55 `f0043191` · #15a `46d39636` · #52a+b `4714f919` · #53 draft `a67f6ba5`
(PO prioritization pending) · #42 file `85760e2b` (remote apply PO-gated) · #16b investigated, no safe move.

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
