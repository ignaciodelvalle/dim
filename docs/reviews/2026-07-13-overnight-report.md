# Overnight report — 2026-07-12 → 07-13

> Autonomous overnight run. Everything below shipped green, each round through a fresh-context
> adversarial review, merges serial, pushed at the dawn gate. Read the **Decisions for you** and
> **Two fence catches** sections first.

## Headline: two real jurisdictional-fence leaks caught & fixed (neither reached a push)

The govt inspector (#12) — the most security-sensitive feature (govt reading citizen welfare data
across jurisdictions) — had **two** fence leaks that unit tests + code passed cleanly. Both were
caught by fresh-context adversarial review + the live Playwright sweep, fixed, and verified before
any push:

1. **MED-1 (fence review):** the pet sub-view returned a pet's open cases with NO jurisdiction
   filter → a CABA operator saw the code+kind+date of cases in provinces he doesn't govern. Fixed
   with an in-scope SQL filter (#59, `0b738a74`), real-DB test proving the leak closed.
2. **HIGH (dawn sweep, the bigger one):** `jurisdictionPairClause` (`lib/metrics/scope.ts`)
   returned its OR-joined pairs **unwrapped** → `and(condA, …, pairClause)` became
   `condA AND … AND pair1 OR pair2 …`; SQL AND binds tighter than OR, so rows matching any pair
   leaked regardless of the other predicates. This clause feeds **~10 govt/admin query modules**.
   INVISIBLE to unit tests (they exercise the clause as the sole/first predicate). Only the live
   pet-drill surfaced it — Argo showing "Casos abiertos (6)" listing *other pets'* cases. Fixed by
   grouping the OR-chain (`f933838a`), verified live (Argo now 0) + `toSQL()` + full suite green.
   → **the Playwright-sweep instruction paid off exactly as intended.**

**Follow-up queued (not a blocker):** a dedicated audit of all ~10 `jurisdictionPairClause`
callers to confirm none relied on the (buggy) wider result and the tightened fence is correct
everywhere (new task).

## What shipped (pushed)

| Area | Result |
|---|---|
| **#49 Panorama visuals + a11y** | opaque floating chrome, double-CABA hidden when scoped to CABA, control cluster on top, globe reset icon, methodology in rail; a11y: 0 axe violations, scope-change announced to screen readers (Ley 26.653), APG dock, AA contrast + audit doc |
| **#12 Govt inspector wave-1** | master-detail on /gob/maltrato: 2 fence-scoped API routes, audit-on-open parity, RailPanel reuse, MPF export gate, pet sub-view — **fence holds** (both leaks fixed) |
| **#50 ViewState FOUNDATION** | P0 (characterization net) + P1a (canonical `PanoramaViewState` value + lossless URL boundary) + P5-gift (`explainViewState`) — **purely additive, 0 UX change, 890 tests**. P1b+ awaits your shape review. |
| **Seed/DB integrity** | Argo chip (unblocks the demo spine), cache-drift, in-scope subject report (unblocks inspector pet-drill), govt-assignments zombie — the 3 recurring failing DB tests now green |
| **Org parity + D3 seed** (earlier) | merged |

**Dawn gate:** full `pnpm verify` EXIT 0, `pnpm test` **9324 passed / 0 failed**, clean production
server on :3000, 17 `dawn-*.png` screenshots of the polished state.

## Decisions for you (none block ongoing work; batch when you wake)

1. **Validate the ViewState shape** — `docs/plans/panorama-viewstate-design.md`. Your OK unblocks
   P1b (the rewiring of the console) → then P2-P5. 3 small forks noted in the doc (basis-in-URL,
   bivariate palette re-validation on light canvas, `representation` naming).
2. **#48** — should a sanitary_authority receive welfare derivations? (widen the target filter)
3. **#32** — the sanitary_authority panorama-read = a new authz policy on the fence (my one flagged fence decision).
4. **#49 design calls** — bivariate 3×3 collapsed-vs-expanded prominence; the CABA-white-barrios repro (couldn't reproduce — point me at the state).
5. **Inspector LOW-2** — should a CLOSED/terminal in-jurisdiction linking case still grant pet-read, or should the welfare nexus expire?

## What's next in the panorama arc (all queued, sequenced)

P1b→P5 of #50 (after your shape OK) → #24 switcher (mode-compat matrix) → #53 design critique
(+ Cowork frontend-design) → #33 viz-suite + #51 embed. Plus #44 features, #55 Informe de
situación (a P5 ViewState gift), #56 prod-readiness, #52 gob-screens polish, #51 analytics-map
unification.

## Process learning

The "agent ends its turn waiting for a notification/monitor" failure mode recurred **~5×** tonight
despite an explicit warning in every brief — it's systemic, not individual. The fix (per the
methodology refresh) is to move it from a prompt warning to a top-of-brief positive recipe. Also:
cursor hit its usage limit mid-night; fresh-context Claude agents substituted as reviewers with no
loss of rigor (they found both fence leaks). The worktree/`-C` discipline held after the earlier
incident — no cwd misfires tonight.
