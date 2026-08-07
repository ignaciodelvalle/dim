# Cursor adversarial review — pushed batch 53df8c22..e216b375 (2026-07-11)

> Independent fresh-context review (cursor-agent, read-only) of the Cowork-fixes + vet
> batch. Verdict: fix-first. Findings 1-4 + method-label were routed to the #21 executor
> (owner of the panorama files) to fold into its increments; LOW-5 (vet shortcut broader
> than its test) queued for a post-#21 follow-up — likely resolution is documenting the
> intent with a volunteer-membership test case, not narrowing behavior.

## Verdict: **fix-first**

No CRITICAL privacy/fence regression in this batch. One real correctness hole in the MAP-2 fix path, plus incomplete NaN hardening and a weak MAP-2 test. Ship only after the Back/period issue is fixed (or deliberately accepted).

---

### HIGH

*(none)*

Privacy fence, k-anon display paths, and representative-point placement look sound. Scope-route empty-bundle collapse does not create an existence oracle.

---

### MED

**1. MAP-2 popstate re-derivation clobbers period (and wipes caches) via `applyPreset`**  
`components/panorama/PanoramaConsole.tsx:2277–2286` → `applyPreset` at `2211`, `2229`, `2158–2163`

**Failure:** Operator selects preset A → changes period (URL `replace` keeps `preset=A&period=12m`) → switches to preset B → browser Back. Popped URL still has `period=12m`, but `resyncBoardFromUrlRef` calls `applyPreset(A, "replace")`, which forces `period` / `committedPeriod` back to `preset.periodPreset` and clears layer caches. Layers/tab recover; the customized window does not. Same path also re-applies preset framing (camera jump).

**Why it matters:** MAP-2 was sold as “URL ⇄ view resync.” Period is part of the board URL; this path rewrites it.

---

**2. MAP-2 test overclaims what it pins**  
`components/panorama/PanoramaConsole.test.tsx:332–369`

**Failure:** Comment/name claim tab/legend/KPIs follow the URL; assertions only check `?preset=` and radio `aria-checked`. Period preservation, layer set, and KPI refetch are untested — so the period clobber above would stay green.

Not tautological, but dishonest relative to the claimed contract.

---

**3. NaN hardening is JS-only; MapLibre fill still treats `NaN` as a number**  
`colorForValue` hardened in `class-scale.ts:178–179`; callers in `province-choropleth-style.ts:75,93,168` still use `typeof value === "number"` (true for `NaN`)

**Failure:** If a feature ever carries `NaN`, the inset path returns no-data (`null`), but the main `step` fill still gets `NaN` and MapLibre falls through to the base (lowest) class — the original bug for on-map paint. Rates today tend to emit `0` not `NaN`, so this is latent, not live-proven.

---

### LOW

**4. Locked-break path always labels `method: "quantile"`**  
`class-scale.ts:107–110`

**Failure:** Live edge with `< CLASS_COUNT` units uses equal-interval; scrub lock reuses those breaks but reports `quantile`. Legend/method metadata lies; colors stay correct.

---

**5. Single-membership vet shortcut is role-agnostic**  
`lib/infra/role-landing.ts:125–137`

**Failure:** Any single active membership (e.g. `volunteer` / `foster`) lands on `/org/[token]`. Layout only requires membership (`requireOrgAccessByToken`), so they enter a thin portal instead of `/cuenta/memberships`. Test only covers `vet_individual` — intentional product choice for solo clinics, but the implementation is broader than the test story.

---

**6. CABA inset locality fill still ignores scrub-locked breaks**  
`CabaInset.tsx` still calls `divisionFillColorExpr(values)` without `lockedBreaks`; main map locks them (`SituationalMap.tsx:1552–1563`)

**Failure:** Mid-scrub, inset barrio colors can diverge from the main choropleth. Province sequential inset was fixed (M1); locality inset was not.

---

### Privacy / security (explicit pass)

| Area | Assessment |
|---|---|
| **Representative points** | Placement-only after count/suppress (`repository.ts` + `build-features.ts`). Does not invent units or restore suppressed counts. No leak vs prior AVG centroids. |
| **`/api/panorama/scope` + `narrowGovtScope`** | OOS and unknown both return `{localities:[], localityCentroids:{}}` with no DB hit (`scope/route.ts:62–74`). Same shape → no existence oracle. Admin bypass matches sibling routes. Tests pin OOS empty (`scope-endpoint.test.ts:102–118`). |
| **k-anon** | No change to `suppressSmallCells` / complementary suppress semantics in this work; markers still attach coords to already-decided cells. |
| **Histogram M2** | Uses `window.location.search` + `effectiveScope*` triggers (`PanoramaConsole.tsx:2015–2034`). Scope-total counts only — no per-unit differencing. Sound. |

---

### Correctness that looks good

- **MAP-1 / `lockedBreaks`:** Call sites migrated (`province-choropleth-style`, `division-fill`, `SituationalMap`). Meta layers skip lock; sequential freezes live-edge quantile breaks. No leftover `lockedDomain` API.
- **MAP-1 test:** Skewed fixture asserting non-uniform gaps + low first break (`class-scale.test.ts:72–88`) actually distinguishes quantile from equal-interval — honest.
- **Division scrub lock test:** Same frozen thresholds across frames (`division-fill.test.ts:295–313`) — honest.
- **TdF point-on-surface tests:** Pin AR-V / Ushuaia on-land — honest for the placement bug.
- **Vet landing / solo-clinic checklist / crear-consultorio gate / ContextSwitcher chip:** Coherent UX; no authz weakening found.

---

### Test honesty summary

| Test | Honest? |
|---|---|
| Quantile skew (MAP-1) | Yes |
| Locked breaks / division scrub | Yes |
| Scope OOS guard | Yes |
| TdF representative points | Yes |
| Vet single-membership | Yes for `vet_individual`; silent on other roles |
| MAP-2 popstate | **Weak / overclaimed** — pins radio only |

---

### Bottom line

Do not invent nits: the fence and k-anon story hold, and MAP-1/`lockedBreaks` look correctly wired. The blocker is MAP-2’s reuse of click-path `applyPreset` on popstate — it restores the preset tab but **rewrites period and clears caches**, and the new test would not catch that. Fix popstate to restore board fields from the popped URL (period, layers, framing/camera) without forcing preset defaults, then tighten the MAP-2 test; optional follow-ups are MapLibre `Number.isFinite` filtering and locality-inset scrub lock.
