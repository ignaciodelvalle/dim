# Cursor adversarial review — hardening + smalls 20b703cc..aa9de59c (2026-07-12)

> Verdict: product code SHIPS (cache-honesty invariant HOLDS, counts correct). Fix-first on
> the chaos harness itself: H1/H2 vacuous assertions. M1 (response-level degraded signal)
> = follow-up candidate; M3 double-epoch race = low-prob, noted; M5 stale comment.

## Verdict

**The cache-honesty invariant holds.** A budget-timeout / degraded envelope cannot be written into `unstable_cache` on the paths this batch owns. No CRITICAL cache-poison or process-kill hole found in the traced code. Ship-quality on the hardening invariant; fix-first on chaos-harness honesty gaps (they can green-pass while skipping the thing they claim to prove).

*(Git CLI was blocked in this session — review is against the live tree on `integration/all-20260703` for the files/behaviors you named.)*

---

## CRITICAL

None.

---

## HIGH

### H1 — Chaos camera invariant is vacuous when the URL has no camera params
**Where:** `scripts/qa-panorama-chaos.ts:286-299`  
**Failure:** `cameraFromUrl` returns `null` if `z`/`lat`/`lng` are absent → the bounds/NaN checks never run. After `stormBackForward` (or a clean `/panorama` reload without a prior `moveend` mirror), the URL often has no camera params. A broken clamp that leaves the camera in the South Atlantic would not fail the round.  
**Mentally break it:** force `jumpTo` outside `MAX_BOUNDS` without writing URL params → harness still PASS.  
**Verdict:** fix-first (assert via MapLibre `getCenter()` / a test seam, not only the URL).

### H2 — WebGL recovery “overlay” is logged but not required to pass
**Where:** `scripts/qa-panorama-chaos.ts:494-506`  
**Failure:** `ok` is only `alive.ok`. `sawOverlay` is decorative. A restore that skips the recovering UI (or a canvas that never lost context) still passes `webgl-loss`.  
**Mentally break it:** no-op `loseContext`, leave canvas alive → recovery reported OK with `overlay-seen=false`.  
**Verdict:** fix-first (`ok = sawOverlay && alive.ok`, or fail closed if extension unavailable instead of soft-failing only the unavailable path).

---

## MED

### M1 — Outer 8s / 9s budget vs inner 30s: request can look like “sin datos,” not “degraded”
**Where:** `app/api/panorama/[layer]/route.ts:36,171-196` (`LAYER_BUDGET_MS = 8000`); pages use `PAGE_BUDGET_MS = 9000`; inner `LAYER_CACHE_COMPUTE_BUDGET_MS = 30_000` in `load-layer-features-cached.ts:62,220-224`.  
**Failure:** On a cold miss, outer `withDbBudget` can resolve `emptyLayerFeatures()` at 8s while compute continues. That empty envelope is **not** cached (good). The client still gets an empty map indistinguishable from a true empty layer (no degraded flag / 503). Cache later may warm with real data — correct for honesty of the **cache**, weak for honesty of **that response**.  
**Interplay:** If compute finishes at 12s → cache stores real data (not the empty fallback). If it hits 30s → `DbBudgetExceededError`, stale kept / miss stays miss. Concurrent revalidations: throw keeps stale; success fills. Sound.  
**Verdict:** ship for the stated invariant; follow-up if you want response-level degraded signaling.

### M2 — Background revalidation throw can still be an `unhandledRejection`; guard is the backstop, not a consumer
**Where:** `db-budget.ts:114-148`; `process-crash-guard.ts:32-48`; `instrumentation.ts:17-24`.  
**Failure:** Who consumes the revalidation promise? Next’s cache layer — if it doesn’t `.catch`, `DbBudgetExceededError` surfaces as `unhandledRejection`. That is **expected** and why the guard exists. Late DB rejects after timeout are swallowed (`db-budget.ts:136-141`) and cannot crash the process.  
**Registration order:** Guard runs first **inside** `register()` before the env import — good. It does **not** literally precede every module side-effect in the Node process (other imports can evaluate before/around instrumentation). Post-boot in-process SWR revalidation **is** covered. Parent `pnpm`/`next start` wrapper is correctly documented as uncovered.  
**Verdict:** ship; do not treat the guard as proof that revalidation never rejects unhandled.

### M3 — Manual GL “Recargar” + automatic `webglcontextrestored` can double-bump `mapEpoch`
**Where:** `SituationalMap.tsx:1004-1012`, `3631-3634`, cleanup `1306-1338`; camera consume `1242-1264`.  
**Failure:** User clicks Recargar while lost → epoch++. Browser then fires `webglcontextrestored` on the dying canvas → second epoch++. Cancel-before-consume at `1242` usually preserves `cameraBeforeReinitRef` for the second build; if the first load passes `1242` and clears the ref before cancel wins, the second rebuild snaps to national/`initialCamera`. Handlers/sources/wheel: cleanup removes listeners; new effect re-binds scroll-nav wheel, GL handlers, and `syncLayers` on load — remount path is coherent. Mid-animation loss: `getCenter`/`getZoom` are CPU-side — restore position is the animated frame, not the animation target (acceptable).  
**Verdict:** ship; low-probability camera snap under manual+auto race.

### M4 — Chaos `canvas-dead` skipped whenever any matching `role="alert"` is up; `canvasAlive` ≠ “map useful”
**Where:** `qa-panorama-chaos.ts:276-284`, `237-249`.  
**Failure:** Basemap/GL overlays suppress the canvas check. `canvasAlive` only proves a non-lost GL context + non-zero size — not that provinces painted. Broad `BENIGN_CONSOLE` (`Failed to fetch|…|ar-provinces`) stays on for the whole run and can hide real fetch errors after `geojson-kill`.  
**Verdict:** ship for storm smoke; tighten if this is a merge gate.

### M5 — DenunciaWizard comment still claims “read hidden inputs at submit”; lift path is what actually wins
**Where:** `DenunciaWizard.tsx:269-294`, `444-445`; `LocationFields.tsx:276-287`.  
**Failure:** Submit builds `FormData` from the form, then **overwrites** location from `wizState.location`. Lifted vs hidden cannot disagree on the wire for DenunciaWizard — lifted wins. Residual risk: `onChange` is a post-render `useEffect`; a pathological submit in the same turn as the first paint after a remount could write empties over filled hidden fields. Step 3 stays mounted and Continuar gates on point presence, so normal flow is safe. Other 17 consumers without `onChange` unchanged (hidden-input path only).  
**Verdict:** ship; comment is stale (docs drift only).

---

## LOW

### L1 — `countOverdueCheckins` DISTINCT does not undercount
**Where:** `lib/analytics/org-dashboard.ts:673-687`.  
**Failure (checked):** `DISTINCT` is on `pet_id` in the adoption subquery. Reminders still `COUNT(*)`. Re-adopted pets no longer fan out reminders (old EXISTS ≡ one pet match; without DISTINCT the JOIN overcounted). Multi-reminder pets still count each overdue row.  
**Verdict:** ship — fix is correct.

### L2 — `countActiveFosters` org-scoped JOIN matches old EXISTS cardinality
**Where:** `org-dashboard.ts:640-652`.  
**Failure (checked):** Drive from active `shelter_custody` for the org; join active `foster` by `pet_id`. Unique index ⇒ no custody fan-out. Multi-foster / co-foster ⇒ same multi-count as foster-outer EXISTS. Multi-custody across orgs out of scope.  
**Verdict:** ship.

### L3 — `compliance-metrics` → `analyticsDb`
**Where:** `lib/analytics/compliance-metrics.ts:41-48`.  
**Failure:** Aligns with dual-pool / cube builder handle; no semantic change to SQL.  
**Verdict:** ship.

### L4 — Malvinas frame clamp
**Where:** `panorama-regions.ts:149-170`.  
**Failure:** Frame east clamped; `regionBboxUnion` untouched for hit-testing. Covered by unit tests.  
**Verdict:** ship.

### L5 — MapErrorBoundary blast radius
**Where:** `MapErrorBoundary.tsx`; `PanoramaConsole.tsx` `key={mapReloadKey}`.  
**Failure:** Contains map-island throws; retry remounts via key. Separate from `mapEpoch` WebGL rebuild — fine.  
**Verdict:** ship.

### L6 — `caba-barrios.test.ts` fixture cleanup
**Where:** `__tests__/caba-barrios.test.ts:19-33`.  
**Failure:** Stops resurrecting the CABA catch-all zombie; correct vs locality-integrity.  
**Verdict:** ship.

---

## Lens-by-lens (plain)

| Lens | Holds? |
|---|---|
| (1) Cache honesty — degraded never cached | **Yes.** Timeout → throw inside cache body; outer fallback stays outside; late rejects swallowed. |
| (2) Crash guard precedes everything / revalidation throw | **Partially.** First in `register()`, covers in-process SWR after boot; not every import side-effect; throw may still be unhandled → guard keeps process up. |
| (3) WebGL `mapEpoch` rebuild | **Mostly yes.** Re-bind/cleanup/sync correct; rare double-epoch camera snap. |
| (4) Org count rewrites | **Yes.** DISTINCT anti-overcount; foster JOIN parity. |
| (5) LocationFields dual path | **Yes for DenunciaWizard** (lift overrides). Untouched consumers unchanged. |
| (6) Chaos assertions | **Not fully.** H1/H2 can pass while broken; other checks are real. |

**Ship / fix-first:** Ship the HARDENING + SMALLS product code for the cache invariant. Fix-first the chaos harness holes (H1/H2) before treating those reports as evidence the console is “super resistente.”
