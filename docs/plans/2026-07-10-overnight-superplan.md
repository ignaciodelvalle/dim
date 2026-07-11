# Overnight super-plan — stages 1+2+3 of Road-to-10

**Window:** tonight (autonomous). **Scope:** quick-wins sweep · THE CUBE · map-UX
finishers. **Out:** national spikes (Batch 4), Sentry account creation, compute
sizing, isochrones, mobile (all PO-gated or explicitly out).

**Discipline per phase (non-negotiable):** work-unit commits → tsc+biome+targeted
vitest per commit → adversarial review on the risky phases → live validation
(Playwright vs local build) → phase gate before the next starts.

---

## Phase 0 — Close the map round (gate for everything)
1. ARCHETYPE-2 visual batch lands (in flight).
2. My live smoke of the situation-room layout (screenshots at 1440/1280).
3. **Final gate:** `pnpm verify` (incl. build) + FULL vitest suite.
4. **Checkpoint push** of the whole map round (~60 commits) → the branch is safe
   on the remote before any new surgery. (No redeploy yet — ONE redeploy at dawn.)

**Done =** branch pushed green. **If ARCHETYPE-2 slips:** push what's green,
defer the visual remainder to a flagged follow-up; overnight run proceeds.

## Phase 1 — Quick-wins sweep (parallel agents, disjoint files)
Agent A (security/ops): anon-surface rate-limit sweep (sighting/finder/signup/
any unlimited anon write) · secrets-hygiene: `vercel env pull`-based flow doc +
guard script so `.env.local` is never hand-edited · DNI_HASH_PEPPER rotation
runbook note.
Agent B (honesty/format): es-AR number-format audit (thousands/percent/dates,
one formatter) · metric-definition registry: every KPI/legend label carries
window+species+basis; add a `check-metric-labels` guard so two surfaces can't
share a name with different definitions · CVD margin fix (darken the divergent
teal a step; re-run the palette validator).
Agent C (perf tooling): formalize the load probe (`scripts/load-probe.ts` with
pass targets vs the measured baselines; wire as an npm script, NOT into verify).

**Done =** all three land + tests/guards green. Est. 2-3h wall-clock (parallel).

## Phase 2 — THE CUBE (sequential, design-first — the crown jewel)
The single highest-leverage item: precomputed aggregate cube with k-anon
(incl. complementary suppression) applied at BUILD time.

- **2a Design (agent, opus):** materialized views `unit × window × metric`
  (province + department tiers; the fixed preset windows 7/30/90/12m/3y + live
  watermark bucket); refresh function + pg_cron at the data watermark; k-anon +
  complementary suppression INSIDE the build; read-path: repository readers
  behind `CUBE_READS` env flag (default OFF); rollback = flag off + DROP.
  Fits the project philosophy: the cube IS a projection (invariant #3) — events
  stay the only source of truth.
- **2b My review** of the design against invariants + the PO-ratified privacy
  posture. (I gate this personally — no auto-proceed.)
- **2c Implement:** forward-only migrations (recount NNNN at write time) +
  refresh fn + cron; swap the 10 folded layer loaders + KPI fan-out to
  cube-readers behind the flag; **parity tests**: cube output == live-query
  output over the seed for every layer/level/window (the honesty proof).
- **2d Apply local → measure → apply STAGING (needs PO authorization tonight)**
  → parity spot-check on staging → flip `CUBE_READS=1` on staging ONLY if
  parity is green; otherwise leave OFF and report.
- **2e Adversarial review** (fresh agent): differencing, staleness windows,
  refresh-failure behavior (stale cube must degrade honestly, never silently).

**Done =** cube live locally with parity proven; staging applied + flag state
per authorization. Est. 4-6h. **This phase is allowed to consume the night** —
it's the one that moves Infra to 10.

## Phase 3 — Map-UX finishers (after cube lands or in its review gaps)
- **Popup↔drawer interplay** (S): bubble click → pinned popup first with
  "Ver detalle →"; fill the drawer's aggregate header (drop the empty
  MASCOTA/ESPECIE rows for aggregated units).
- **Scope-wide per-day counts endpoint** (S-M): lights the scrubber histogram
  at aggregate level (today only points-mode). Cube makes this nearly free —
  sequence AFTER 2c so it reads the cube.
- **Reunificación department fold** (S-M): num/den re-aggregation — also
  cube-adjacent.
- **Unit-history branches** for sintomas/esterilización/microchip/ppp (M).
- **Period comparison — synced dual map (STRETCH):** the big one. Attempt only
  if the night has room after the above; otherwise it's the first item of the
  next session. Screenshot-iterated like ARCHETYPE-2.
- **Keyboard nav minimal** (S): arrow-pan + focus ring on the map wrapper;
  the full role="img" retirement stays a flagged decision.

**Done =** everything except the stretch lands with tests.

## Phase 4 — Dawn gate
Full `pnpm verify` + full vitest + one Playwright sweep of the final build
(situation room, drill, bivariate, scrub, cube-backed layers) → push →
**morning report** with: what landed, what deferred, measured numbers
(cube latency before/after, parity results) → **PO: ONE redeploy** → his deep
re-test on staging.

## Risk honesty
- The cube is genuinely large; if 2c overruns, the flag stays OFF and staging
  keeps live queries — zero regression risk by construction.
- Period comparison is pre-declared STRETCH.
- Any adversarial CRITICAL found at 2e blocks the flag flip, never the push
  (code ships dark behind the flag).
