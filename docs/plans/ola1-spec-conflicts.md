# Ola 1 — spec-conflict log

> Per `docs/plans/2026-07-27-plan-ejecucion-ola1.md` §5.2: when the code contradicts
> the spec, or the spec's fix turns out to be correct but incomplete, the agent does
> NOT improvise a wider fix. It records what the spec expected, what the code actually
> holds, and a proposal — and moves on. The PO reads this in the 5-minute skim at the
> end of each batch and decides in one pass.
>
> Nothing here blocks the batch it was found in.

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
