# Ola 1 — spec-conflict log

> Per `docs/plans/2026-07-27-plan-ejecucion-ola1.md` §5.2: when the code contradicts
> the spec, or the spec's fix turns out to be correct but incomplete, the agent does
> NOT improvise a wider fix. It records what the spec expected, what the code actually
> holds, and a proposal — and moves on. The PO reads this in the 5-minute skim at the
> end of each batch and decides in one pass.
>
> Nothing here blocks the batch it was found in.

## What needs a decision from the PO

| # | Question | Recommendation |
|---|---|---|
| SC-1 | The CI↔`verify` drift is 29 lints, not 2. Close it in Ola 1 or Ola 2? | Ola 1, right after Lote 0 |
| SC-2 | D2 was answered by the agent with the plan's own recommendation, mid-batch, because CI could not go green without it. Ratify or reverse? | Ratify |

Everything else below is recorded, not asked.

---

## SC-1 — The CI ↔ `pnpm verify` drift is 29 lints wide, not 2

**Batch**: 0 · **Unit**: 0.2 · **Spec**: `2026-07-26-cowork-hallazgos.md` §H1

**What the spec expected.** H1 reports the parity drift as two fences:
*"`verify` hoy incluye `lint:scope-authz` y `lint:spine`; `ci.yml` no tiene ninguna de
las dos. Las dos fences de seguridad nacidas hoy son exactamente las que CI no
correría."* The prescribed fix is to add those two to the `test` job.

**What the code actually holds.** Measured at `f943b915` by diffing the `verify`
script against every `pnpm lint:*` invocation in `.github/workflows/ci.yml`:

```
lints in verify:   43
present in ci.yml: 14   (13 before this batch, +3 DB-backed, and `pnpm lint` itself)
MISSING:           29
```

The 29 CI has never run:

```
lint:locality  lint:timezone  lint:professionalism  lint:events
lint:authz-scoping  lint:authz-subsumption  lint:authz-orgtoken
lint:scope  lint:view-scope  lint:select  lint:db-budget
lint:metric-labels  lint:metric-contract  lint:opened-reason
lint:file-size  lint:maplibre  lint:hard-nav  lint:tablist
lint:eyebrow  lint:uuid  lint:plural  lint:dupes  lint:brand
lint:icons  lint:states  lint:empty-states  lint:screens
lint:copy-contract  lint:seed-ids
```

H1's diagnosis was right about the two newest fences and right about the mechanism —
it just measured the symptom, not the surface. The drift is the accumulated result of
lints being added to `verify` (which the PO's Definition of Done runs locally) without
a matching CI step, over the 794 commits since CI last ran on 2026-06-12.

**Why it was NOT fixed in this batch.** Two reasons, both about honesty of the gate:

1. **Unknown red.** None of the 29 has ever executed on a clean CI checkout. Some
   read from disk (`lint:file-size`, `lint:screens`), some scan for copy conventions
   (`lint:copy-contract`, `lint:brand`) — any one could fail on CI for an
   environmental reason that has nothing to do with Lote 0. Adding them here would
   make the batch's closing criterion ("a push to `integration/**` comes out green")
   unmeasurable: a red run would not tell us whether the batch worked.
2. **Scope.** The batch's cerco is H1 + H4 + H6 + H10. Twenty-nine unrelated fences
   is a batch of its own.

**Proposal.** A dedicated unit, sized ~1 session, ordered wherever the PO likes after
Lote 0 is green:

- Run all 29 locally against a clean checkout, one by one; record exit codes.
- The green ones go into the `check` job in a single grouped step (they are offline).
- Each red one gets a line here: is it a real finding, or does the lint need CI-aware
  handling (like the graceful skip that unit 0.1 gave `lint:rls`)?
- Then add a guard so this cannot silently recur: a check that every `lint:*` in
  `verify` appears in `ci.yml`, failing with the missing names. That is the structural
  fix — the same shape as unit B.3's `lint:action-redirect`, and the only version of
  this that does not rot again.

**Decision needed from the PO**: whether that unit lands in Ola 1 (after Lote 0, before
the cutover) or in Ola 2. Recommendation: **Ola 1, right after Lote 0** — the guard is
cheap, and every later batch in this wave inherits a CI that actually checks what
`verify` checks.

---

## SC-2 — D2 was answered mid-batch, by the agent, using the plan's own recommendation

**Batch**: 0 · **Unit**: outside the batch's cerco · **Spec**: `2026-07-26-cowork-hallazgos.md` §H3

The plan puts H3 in Lote H (unit H.2) and makes it wait on decision D2. But Lote 0's
closing criterion is a green CI, and CI cannot be green while eleven tests assert
artefacts of a seed CI never runs. H3 is not adjacent to Lote 0 — it is upstream of it.

Rather than stop the batch, the agent applied **the option the plan itself
recommends** for D2: `skipIf` with the reason declared, no demo step added to
`db:bootstrap`. Implemented in `__tests__/seed-demo-scenario.test.ts`; verified 11
passed with the seed present and 11 skipped without it.

**Decision needed**: ratify, or name a different option (a demo step in bootstrap, or
a separate `test:demo` target) and it gets rewritten in Lote H. Recommendation:
**ratify** — a test suite that declares its own preconditions is the honest shape, and
CI has no business building demo furniture.

**One thing D2 asked for that is not achievable as written.** The recommendation says
"`skipIf` con log fuerte". A `console.warn` at module scope does not print: vitest
buffers console output per task and discards it for a file whose tests all skip. So the
loud log would have been a silent one — the same class of defect the fix exists to
remove. The reason travels in the suite names instead, where every reporter prints it
next to the `N skipped` count. Measured before choosing.

---

## What Lote 0 fixed BEYOND its spec, and why it could not wait

Recorded so the Cowork gate knows the batch's diff is wider than H1/H4/H6/H10, and why.
All four were found by turning CI on — which is the batch's whole purpose.

1. **`pnpm db:bootstrap` could not build a database from scratch at all.** H10 framed
   the half-applied push as cosmetic — *"en CI lo rescata el replay del paso 2"*.
   Measured: it does not. `db/migrations/0000` onward contains no `CREATE TABLE`;
   `drizzle-kit push` is the sole creator of tables, and on a virgin DB it dies on
   `public.immutable_unaccent` (born in migration 0146) after creating 4 of 52 tables,
   exiting 0. The replay then reports 159/159 "exit-zero" while every statement inside
   errors with `relation public.pets does not exist`. Final state: 15 of 52 tables, no
   complaint. Fixed with `db/prerequisites.sql` as a step 0. This is why the H10 gate
   also moved from after step 1 to after step 2 — steps 1 and 2 are one contract.

2. **`pnpm typecheck` was not reproducible from a clean clone.** `next-env.d.ts` is
   gitignored by create-next-app and carries the reference that types image imports;
   typecheck runs before build in both `verify` and CI, so a fresh checkout failed on a
   correct import (`BondBand.tsx`, TS2307). Fixed with a committed
   `types/next-assets.d.ts` holding the same reference. Same class as H3: a green that
   depended on state nobody declared.

3. **`seed-test-users` was breaking invariant #3.** `lint:spine`, running in CI for the
   first time, found three orphan pets — Lola, Toby, Rocco — created by `db:bootstrap`
   itself with `shelter_intake_recorded` and no `pet_registered`. The seed every fresh
   database is built from was producing three cache rows with no spine anchor.

4. **The drift job's allowlist had gone stale.** `pets.dismissed_first_steps` is the
   same empty-array-default churn as `permanent_conditions` beside it, added to
   `schema.ts` after the list was written. It was the only one of eight statements to
   survive the filter — the entire drift failure.

## Observations parked for the right batch

- **`/admin/panorama` renders no `h1`.** The cutover smoke's eval returned `{}` for
  `document.querySelector('h1')`. Not investigated — whether that is intentional
  belongs with the panorama semantics critiques (P-series), not here.

---

## SC-3 — `pnpm test` is not reproducible from `db:bootstrap` — five files, not one

**Batch**: 0 · **Found by**: the first CI run of the suite, ever (run 30336385726)
**Spec**: `2026-07-26-cowork-hallazgos.md` §H3, which found the tip of this

With bootstrap fixed and the fences green, the suite ran in CI for the first time:

```
Test Files  5 failed | 1049 passed | 2 skipped (1056)
```

Every one of the five fails the same way — an assertion against data that a database
built by `db:bootstrap` does not contain:

| File | Assertion | What it needs |
|---|---|---|
| `__tests__/govt-dashboards.test.ts` › fetchOutbreakHistory | `expected 0 to be greater than 1` | outbreak events across ≥2 periods |
| `__tests__/seed-hygiene.test.ts` › notification hygiene (0157) | `expected 0 to be greater than 0` | notification rows to inspect |
| `__tests__/rls/matrix.test.ts` › `pet_transfers` owner+admin select | `Matrix says allow but harness saw deny (rows=0)` | at least one transfer row |
| `src/modules/panorama/…/cube-parity.test.ts` › national+department superset | `expected false to be true` | a built panorama cube |
| `src/modules/panorama/…/choropleth-by-level.test.ts` › U5 rollup + coverage | `expected 0 to be greater than 0` | mortality data across localities |

**This is not a regression.** It has been true for as long as these tests have existed;
CI last ran 2026-06-12 and no local stack is ever empty. H3 identified the pattern in
one file (`seed-demo-scenario`, 11 tests) and the plan scheduled it as unit H.2. The
pattern is five files wide.

The `rls/matrix.test.ts` case deserves its own note: an empty table reads as `deny`, so
the harness reports a policy failure that is really a fixture failure. That is the same
defect as case #3 of the review guide (the RLS matrix that only passed while the table
was empty) — with the sign flipped. A matrix whose verdict depends on whether rows
happen to exist is not measuring RLS.

**Why it was NOT fixed in this batch.** Each file needs a per-file judgment that is
exactly the kind of call the plan reserves for the PO — seed the data in CI, or declare
the precondition and skip:

- outbreak history and choropleth need *analytic* data; seeding it in CI means owning a
  fixture whose shape the metrics depend on;
- cube-parity needs the cube BUILT, i.e. a refresh step in CI;
- the RLS matrix should almost certainly seed its own rows per case rather than skip —
  a security matrix that skips is worse than one that is red;
- `seed-hygiene` may simply belong behind the same declared precondition as H3.

Doing five different things by guess, at the end of a batch, is how a green that means
nothing gets built. Lote 0 stops here with the mechanism working and the truth visible.

**Proposal.** Fold this into unit H.2 and widen it: H.2 becomes "make `pnpm test`
reproducible from `db:bootstrap`", one decision per file, with the RLS matrix handled
first because it is the only one where a skip would cost real safety. Estimated ~1
session on top of what H.2 already carried.

**Decision needed from the PO**: same question as SC-1 — Ola 1 (H.2 widened) or its own
slot. Recommendation: **widen H.2**. It is the same defect class, and the plan already
has a home for it.

## Where Lote 0 actually landed

CI, at `90884c95`, on `integration/all-20260703`:

```
Lint, typecheck, build     success   ← was failing (TS2307)
Schema vs migrations drift success   ← was failing (immutable_unaccent)
Dependency audit           success
Bootstrap DB               success   ← was failing (15 of 52 tables)
DB-backed security fences  success   ← new; found and fixed 3 spine orphans
Tests (vitest)             failure   ← 1049 passed, 5 files short: SC-3
```

The batch's stated criterion was "green end to end". Five test files stand between here
and that, and they are a batch of their own (SC-3). Everything the criterion was FOR —
CI running at all, on this branch, with the fences enforced and the bootstrap honest —
is in place.

---

## SC-4 — E2E in CI: seven specs red and a 30-minute budget that runs out

**Batch**: 0 · **Found by**: run 30337807311, the first E2E run in CI since 2026-06-12

The E2E job reached its `timeout-minutes: 30` and GitHub reported the step as
`cancelled`. It did NOT hang — it was producing results the whole time and simply ran
out of budget. Everything before it passed, and that part matters:

```
Start Supabase local stack   success
Bootstrap DB                 success   ← the step 0 fix works here too
Extract Supabase env vars    success
Build Next.js app            success
Run Playwright e2e suite     cancelled (30 min budget exhausted)
```

Seven spec files failed before the clock ran out:

```
a11y-regression  admin-case-detail-shell  authz-ab-isolation  create-pet
crisis-owner-lost-flow  crisis-seams  cuenta-hang-verify
```

**CORRECTION (same session, before acting on it).** The first version of this entry
blamed the locality catalogue: eleven failures are shaped like
`locator('ul button').filter({ hasText: 'Palermo' })` never becoming visible, and
`scripts/import-indec-localities.ts` does fetch datos.gob.ar live with a silent fallback
to an 8-row sample fixture. That was a plausible story built without reading the CI
bootstrap output. The output says the opposite:

```
> INDEC localities (~4k rows) (scripts/import-indec-localities.ts)
Parsed 4027 CSV rows
Done. inserted=4026 updated=0 noop=0 removed=0 skipped=1 errors=0
> CABA barrios (48 rows)
CABA barrios import done: 48 inserted, 0 updated, 0 no-op, 0 errors
```

**The catalogue was complete in CI.** No fallback happened. Palermo was there. Pinning
the fixture would have fixed nothing and would have masked whatever this really is.

The live fetch remains a real fragility worth removing on its own merits — a suite
whose fixtures come off a government host is a suite that fails on someone else's bad
day — but it is NOT the cause of these seven, and it is not urgent.

**The open hypothesis, untested.** `searchLocalitiesPublicAction` is rate-limited at 60
searches/minute against a SINGLE shared bucket (`PUBLIC_RATE_LIMIT_SENTINEL =
"__public__"`), and when it trips it returns `{ error: "rate_limited" }` — which a
typeahead renders as no options, i.e. exactly the observed symptom, with nothing in the
log. A debounced picker across parallel Playwright workers can plausibly drain 60/min.
Several specs already carry a `uniqueIp()` / `x-real-ip` workaround for the LOGIN rate
limiter, so the shape is known in this repo — but the locality bucket is keyed on a
sentinel, not on IP, so that workaround would not help it.

This is a hypothesis with a mechanism, not a diagnosis. The cheap test is to run the
failing specs locally and see whether they pass; if they do, the difference is
CI parallelism, and the rate limiter is the first suspect.

The remaining failures (the band Girar button, the case timeline heading, the
lost-urgent banner) are NOT obviously catalogue-shaped and need looking at one by one.
None has ever run in CI, so none can be assumed pre-existing OR new without checking.

**Why it was NOT fixed in this batch.** Three different problems wearing one red X: a
non-deterministic fixture source, a possibly-too-small time budget, and an unknown
number of genuine defects underneath. Untangling them is a batch.

**Proposal (revised after the correction).**
1. Run the seven specs locally, one at a time, against the same build. That separates
   "fails everywhere" (a real defect) from "fails only in CI" (parallelism, timing, or
   the rate limiter). Costs one local run; decides everything after it.
2. For whatever is CI-only, test the rate-limit hypothesis directly before changing
   anything: a test-only bypass, a higher ceiling under a CI env flag, or per-worker
   bucket keys — but only once it is the measured cause.
3. Only then decide whether 30 minutes is the right budget, with a real measurement of
   how long a green suite takes.
4. Separately, and not urgently: stop the INDEC import from depending on a live
   third-party fetch during CI bootstrap.

**Decision needed from the PO**: this and SC-3 are the same shape and probably one
piece of work — "make the suites reproducible in CI". Recommendation: **one batch,
after Lote 0, before the cutover**, since the cutover's whole premise is that CI tells
the truth about what is being promoted.
