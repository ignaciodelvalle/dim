# Privacy — known, accepted limitations

> Register of privacy findings the PO reviewed and **deliberately accepted** instead of fixing,
> with the reasoning and the triggers that would reopen them. Companion to the k-anonymity
> architecture (`lib/metrics/anonymity.ts`, the panorama cube) and the privacy checklist in
> `AGENTS.md#privacidad-y-manejo-de-datos`. Every entry needs: what, attack, why accepted,
> revisit triggers.

## KA1 + KA2 — differencing via the raw provincial density marginal

**Accepted by PO decision, 2026-07-11.**

- **What:** `complementarySuppress` promotes exactly one sibling cell and does not widen to a
  feasible interval ≥k (`lib/metrics/anonymity.ts:107-138`), while per-province density is
  published RAW — without k-anonymization (`src/modules/panorama/infrastructure/repository.ts:940-962`).
- **Attack:** an adversary combining the raw province total with the visible (non-suppressed)
  sibling cells can recover a suppressed cell's value by subtraction — e.g. `{A:1, B:5}`: A is
  suppressed, but `total(6) − B(5) = 1` reveals it. Related: KA4 — a narrow scrubber window on
  the `mortalidad` layer can expose an individual death's date + `disposition_method` under an
  otherwise ≥k cell.
- **Why accepted:** exploiting it requires a motivated attacker deliberately cross-referencing
  two separate surfaces (the density marginal + the suppressed choropleth) on operator-gated,
  jurisdiction-scoped screens — not public pages. The affected data is aggregate pet-event
  counts, not direct human PII. The fix (interval-widening complementary suppression +
  k-anonymizing the density marginal) hides additional legitimate cells and was judged not
  worth the utility loss at this stage.
- **Reopen if any of these happen:**
  1. Any of these surfaces (density marginal, choropleth, trend buckets) becomes **public** or
     reachable by lower-trust roles.
  2. A **federal audit / Mi Argentina federation review** asks for the differencing analysis —
     this entry is the disclosure; the fix should then be implemented rather than argued.
  3. Cell semantics change from pet-event counts to anything closer to human PII (e.g. joins
     with owner attributes).
  4. The `mortalidad` scrubber gains finer-than-daily granularity (sharpens KA4).

**Where the fix is specified if reopened:** `docs/plans/panorama-v2-polish.md` Part B item 4 +
`docs/reviews/2026-07-11-cowork-panorama-adversarial-qa.md` §5 (KA1/KA2/KA4 with file anchors).
