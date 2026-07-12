# Cursor adversarial review — coherence round bff2fd3e..2ff4fd02 (2026-07-12)

> Verdict: NOT ship-ready for the invariant. Plumbing real but zoonosis KPI still ≠ map,
> rateProvinceOnlyEmpty overshoots, scrub lags with no pending, Registros=rows not events.
> Routed back to the #41 executor. Honesty wins (H9/denuncias-split/fence/H4/H10/H12/H14) kept.

## Verdict

**Not ship-ready for the coherence invariant.** The hybrid plumbing (thread `asOf` into KPI fetch, label stock KPIs, split denuncias primary/backlog) is real and partly correct — denuncias and mordeduras move in the right *direction* — but **zoonosis still contradicts the map**, and several honesty patches create new label↔map lies. Live QA screenshots in the tree (`panorama-coherence-qa-*.png`) still show the invariant failing.

Review range reconstructed from reflog (shell was blocked): `bff2fd3e` → `2ff4fd02` (9 commits: H1/H6 hybrid, H4/H9/H10/H12/H14, honesty batch, round-2 fence blanks).

---

## Findings (highest first)

### 1. CRITICAL — Zoonosis KPI ≠ map population (H1 still open)

| Surface | Population |
|---|---|
| Map / Registros | `outbreak_signal` events in `[since, asOf]` (`loadZoonosisByUnit`) |
| KPI “Zoonosis activas” | Live `rabies_observation_status='in_progress'` + open bite cases + `disease_reported` lepto/hidat trailing 30d from `period.until` (`fetchActiveZoonosis`) |

Clamping `until` to `asOf` only shifts the disease arms’ 30d window. The stock arms stay **today’s DB state**. Map and KPI can never agree.

Evidence: scrub QA shot shows scrub at **01 jul 2024**, map **“Sin datos para esta capa”** / Registros **0**, KPI still **1.550 Zoonosis activas**. Triage promised “estado actual (30d)” labeling; code marks zoonosis as temporal (`currentState` falsy) with no honesty tag.

```1938:1956:src/modules/panorama/infrastructure/repository.ts
export async function loadZoonosisByUnit(...) {
  const conditions: SQL[] = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(tcol, since),
    ...
  ];
  if (asOf) conditions.push(lte(tcol, asOf));
```

```752:764:lib/analytics/govt-home-kpis.ts
  // 1. Pets with active rabies observation (status column on pets table).
  const rabiesConditions = [sql`${pets.rabiesObservationStatus} = ${"in_progress"}`];
  // 2. Deduplicated rabies+bite count: distinct pets that have EITHER an active
  //    rabies observation OR an open bite_incident case.
```

**Fix direction:** Either (a) make the KPI count `outbreak_signal` in the same window as the layer, or (b) mark zoonosis `currentState: true` and stop claiming it tracks the scrub — and stop painting a scrubbed signal layer next to an unscrubbed stock number without a hard disclosure.

---

### 2. HIGH — `rateProvinceOnlyEmpty` fires on province *scope*, not below-province drill (H2 overshoot)

```2861:2867:components/panorama/PanoramaConsole.tsx
  // When the base is a RATE layer AND we are drilled into a province, the map shows
  // an honest "la cobertura se calcula solo a nivel provincia" empty state instead.
  const rateProvinceOnlyEmpty = rankingKind === "rate" && effectiveScopeProvince != null;
```

Selecting a province in the scope pill (still province aggregation) triggers “Volvé al nivel provincia” even when the operator **is** at province grain. Lucas-fence QA shot: Tierra del Fuego selected, KPIs `—`, map tells you to go back to province level.

Predicate should be something like `level !== "province"` (or locality/department framing), not `effectiveScopeProvince != null`. Also must not mask a real fence-empty (`jurisdictions.length === 0`) with the wrong copy.

---

### 3. HIGH — Scrubbed KPIs lag the map with no pending affordance

As-of KPI refetch is debounced 250ms and **does not set `kpisPending`**. Map layers update on every scrub tick; the strip keeps the previous frame’s numbers until the debounce + fetch land. That is an intentional “ALWAYS” violation during drag.

```882:912:components/panorama/PanoramaConsole.tsx
    // DEBOUNCE the as-of refetch...
    const timer = setTimeout(() => {
      ...
      fetch(`/api/panorama/kpis${qs ? `?${qs}` : ""}`, ...
```

Same class of bug: **Actualizar** refetches KPIs **without** `asOf` while a scrub can still be active (`onRefresh` ~3058) — live strip over a historical map until the next asOf effect.

---

### 4. HIGH — “Registros N” is unit-row count, not the KPI denominator (H6 half-fixed)

Denuncias primary now uses `inPeriod` (good — same filter family as `loadDenunciasByUnit`). But the dock badge is `mapTableRows.length` (provinces/divisions with a row), not Σ(cell counts).

Bienestar QA shot: KPI **3.026** “Denuncias en el período” vs dock **Registros 24**. An operator reading the invariant will still say they don’t match. k-anon suppressed cells also make Σ(visible) ≤ KPI without disclosure on the strip.

---

### 5. MEDIUM — Deep-linked `?asOf=` SSR seeds live KPIs

`loadCachedPanoramaKpis` on admin/gob panorama pages never receives URL `asOf`. Client effect reconciles after mount → flash of live temporal KPIs over a scrubbed map on shared “Copiar vista” links.

---

### 6. MEDIUM — `reunificacion` marked `currentState` but is period-windowed + temporal on the map

Formula and map layer are period/as-of sensitive; the chip says “estado actual”. Opposite honesty error from zoonosis.

---

### 7. LOW / honesty wins (keep)

| Item | Status |
|---|---|
| H9 pts deltas + near-zero prior test | Good |
| Denuncias primary/backlog split + labels | Good direction |
| Stock cobertura/esterilización/microchip/pérdidas `estado actual` | Good |
| Fence blanks to `—` for empty govt scope | Good |
| H4 pointer scrub, H10 bivariate pill, H7 “Último evento en el alcance”, H8 non-base chips, H12 skeleton, H14 camera | Out of core invariant but look sound |

---

## What the invariant still requires

For **temporal** KPIs that share a layer:  
`KPI primary == Σ(map cells for that layer) == Σ(Registros value column)` at the same `(scope, period, asOf, basis)`, or the UI must refuse to show a number until that equality holds (pending / “—”).

Today that holds (approximately) for **denuncias counts**, fails hard for **zoonosis**, and is **unreadable** for Registros because the badge counts rows not events.

---

## Ship gate

Do not treat this round as closing H1/H6 until:

1. Zoonosis KPI and map share one population (or zoonosis is honestly non-scrubbing).  
2. `rateProvinceOnlyEmpty` only fires below province grain.  
3. Scrub/refresh never shows a live temporal KPI over an as-of map (pending or include `asOf` everywhere).  
4. Registros badge (or a dock total) exposes the same count the KPI claims.

I can turn these into a fix plan or patch H2/`rateProvinceOnlyEmpty` first if you want that next.
