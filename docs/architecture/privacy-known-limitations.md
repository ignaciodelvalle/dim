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

## KA5 — per-offering campaign enrollment differencing vs geo-reach k-anon

**Accepted by PO decision, 2026-07-12 (as operational data, not PII).**

- **What:** the campaign **geo-reach** surface is now k-suppressed (F1 fix — `lib/analytics/campaign-metrics.ts`
  `suppressGeoReach`, folds sub-k localities into an "Otras localidades (privacidad)" rollup). But the sibling
  **per-offering** list + CSV still disclose `jurisdictionLocality` + `enrollment` + `completionRate` at full
  precision (`app/gob/campanas/page.tsx` offerings table + `app/gob/campanas/export/route.ts`).
- **Attack:** for a locality whose only campaign is small, `attended ≈ enrollment × completitud` reconstructs
  the attendance count that geo-reach suppresses — differencing across the two campaign surfaces.
- **Why accepted:** per-offering enrollment/completion is treated as **operational data the org owns about its
  own campaigns in its own jurisdiction**, not human PII — it counts bookings/attendance, identifies no
  individual, and a funcionario sees their own jurisdiction's campaign operations by design. Suppressing it
  would hide legitimate operational data an operator needs to run their (often small) campaigns. Judged
  operational-not-PII; the geo-reach suppression (which aggregates ACROSS campaigns) stays as the k-anon
  boundary.
- **Reopen if any of these happen:**
  1. The per-offering list/CSV becomes **public** or reachable by lower-trust roles (today: admin/govt,
     jurisdiction-scoped).
  2. Offering rows gain **attendee-identifying attributes** (names, DNIs, per-person joins) — then it stops
     being aggregate operational data.
  3. A **federal audit / Mi Argentina federation review** flags the cross-surface differencing.
  4. Campaigns shrink to routinely single-digit enrollments where the offering row itself becomes
     effectively individual-level.

**Where the fix is specified if reopened:** apply the same `suppressSmallCells` + rollup used by
`suppressGeoReach` to the per-offering list and its CSV (task #68; the geo-reach fix is the template).
