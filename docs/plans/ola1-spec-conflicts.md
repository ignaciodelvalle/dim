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
