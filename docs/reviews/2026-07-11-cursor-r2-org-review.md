# Cursor adversarial review — round-2 + org tanda dc097b36..c7f43a83 (2026-07-11)

> Verdict FIX-FIRST. HIGH 1-4 + MED 6/7/8/10/11 routed to the #38 executor (owner of the
> files) mid-flight; HIGH 5 (platform-wide count scans) → task queue rewrite lane; MED 9
> (Malvinas claim-ring frame visual QA) → folded into #39 hardening. Pure state machines
> (inset, resolveScrollNav, org gating) verified solid.

## Verdict: **fix-first** (not “holds clean”)

The pure state machines (inset, `resolveScrollNav`, org gating) are solid and well-tested. The wheel takeover and two org-dashboard paths have real failure modes the comments oversell. Region-as-camera-only holds for URL/scope. Ship only if you accept the HIGH items as known debt; I would not.

---

### CRITICAL
None found for auth bypass / data-fence breach. Region never writes into `?province`/`?locality`.

---

### HIGH

**1. “Admin-only” wheel takeover is a lie for multi-province govt**  
`PanoramaConsole.tsx:2928` + `:3413–3414` + `app/gob/panorama/page.tsx:149–152`

Gate is `canDrillProvince = initialDivisionProvince == null`. Single-province govt is pinned; **multi-province govt** gets `undefined` → `scrollNavEnabled=true` → `scrollZoom.disable()` + hierarchy handler.

**Failure:** Govt covering 2+ provinces loses cooperative Ctrl+wheel zoom, gets nación/región snaps, and `commitScopeDrill` can clear province / drill via center into provinces outside their mental model (data loaders still fence; UX/camera lie). Comments claim “pinned gob keeps cooperative wheel-zoom.”

**2. At province scope, wheel cannot free-zoom — comment contradicts code**  
`panorama-regions.ts:212–214` says free zoom handles divisions below; `SituationalMap.tsx:918` disables `scrollZoom` for the whole session.

**Failure:** Admin drills to a province (frame ~Z6–7). Labels need `Z_LABELS_MIN=8`. Wheel IN is a no-op (`resolveScrollNav` → null); wheel cannot raise zoom. Only `NavigationControl` ± (or touch pinch) works — which desyncs hierarchy (finding 3). Progressive labels + “semantic scroll” fight each other.

**3. ± buttons / touch pinch fight the snap machine**  
Only `scrollZoom` is disabled; MapLibre touch pinch + NavigationControl stay on. `regionFocusRef` / scope update only via `performNavStep` / commits.

**Failure:** At región camera focus, mash `+` → deep free zoom while `regionFocusRef` still says `cuyo`. Next wheel OUT jumps to nación from hierarchy state, not visual zoom. Trackpad pinch (`wheel`+`ctrl`) is hierarchy; finger pinch is free zoom. Inconsistent by device.

**4. Org panel: one failing count 500s the page**  
`app/org/[orgToken]/page.tsx:299–306` — `fetchOrgQueueCounts` in `Promise.all` with **no** `.catch`.  
`fetchOrgQueueCounts` (`org-dashboard.ts:723`) uses bare `Promise.all` — one reject kills the batch.

**Failure:** Bad `countOverdueCheckins` / foster SQL → layout badges gracefully empty (`layout.tsx:83–86`), **panel crashes**. Asymmetric resilience.

**5. “Bounded” counts that scan globally first**  
`countOverdueCheckins` (`:651–665`): all overdue `post_adoption_checkin` rows, then EXISTS on `payload->>'previous_owner_organization_id'`.  
`countActiveFosters` (`:628–642`): all active foster ownerships, then EXISTS for org custody.

Indexes help the EXISTS side; the outer scan still grows with **platform** size, not org size. Comment “each cheap + indexed” is optimistic at national scale.

---

### MED

**6. Cooldown burns on no-op steps**  
`SituationalMap.tsx:1256–1257` sets `lastNavAt` before `performNavStep`; null `resolveScrollNav` returns without animating.

**Failure:** Province + wheel IN, or nación + center over ocean → gesture eaten for 420ms, nothing moves.

**7. Locality level inferred from centroid presence**  
`:1273` — `locality: selectedLocalityCenterRef.current != null ? "committed" : null`.

**Failure:** `?locality=` committed but centroid not in `scopeData` yet → machine thinks provincia; wheel OUT skips to región and drops locality scope incorrectly.

**8. `regionAtPoint` docs lie; Patagonia center can be ocean**  
Comment promises nearest-member fallback (`panorama-regions.ts:134–136`); code returns `null` (`:147–151`). Wide Patagonia∪Malvinas frame → center in water → IN stuck until pan.

**9. Malvinas / claim rings vs frame quality**  
Union includes AR-V (`:70–78`); tests use a toy east edge `-57` (Malvinas-ish). Real TdF claim geometries (Georgias etc.) can push east of `AR_BBOX` (`-53.6`) while still inside `AR_MAX_BOUNDS` (+31°). Fit still runs; frame can look near-national. Not clipped to continental AR. Visual QA debt, not a hard clamp bug.

**10. Badge failure = all badges die**  
Layout `.catch` → `null` → no badges. Correct “don’t take down shell”; wrong “partial degrade.” One queue error blanks every badge.

**11. Double fetch every org home paint**  
Layout + panel both call `fetchOrgQueueCounts` for overlapping keys. Extra DB load, not a logic bug.

**12. `OrgDailyLoopOrientation` localStorage**  
Keyed only by `orgToken` (`OrgDailyLoopOrientation.tsx:76`). Private mode / blocked storage → always shown (caught). Cross-browser re-show is fine. Admin-only + post-checklist gate is correct. Low risk; no capability filter on loop links (nav/pages still guard).

---

### LOW

**13. Listener cleanup** — add/remove same `handleNavWheel` in one `[]` effect (`:919`, `:1206`); refs keep it fresh. No leak found. Strict Mode remount OK.

**14. `navAnimatingRef` cleared on every `moveend`** (`:974`) — including ± zoom. Intentional; amplifies desync with free zoom.

**15. Region ↔ URL** — `commitScopeDrill` only touches province/locality (`PanoramaConsole.tsx:1159–1165`). `regionFocusRef` is memory-only. Shared `?z/lat/lng` restores camera without region focus; next wheel re-derives. Holds.

**16. Legend truncation** — `LegendPill.tsx:34–37` `min-w-0 flex-shrink truncate` looks correct; no adversarial hole.

**17. CABA inset** — predicate + 9 pure cases look honest (national in/out view, CABA/PBA keep, other province hide).

**18. Maltrato role gate** — `WELFARE_QUEUE_ROLES` matches nav; foster excluded in tests. No org-type gate on welfare (same as nav). Holds vs fence.

---

### Test honesty

| Suite | Pins real behavior? | Gaps |
|---|---|---|
| `resolveScrollNav` (~8 IN/OUT + no-ops) | Yes for pure machine | No integration with disabled scrollZoom, cooldown-on-null, locality-centroid race, multi-province govt gate |
| `cabaInsetVisible` (9) | Yes — includes the pan-away regression | Wiring `moveend → state` untested (OK for pure helper) |
| `applicableOrgQueues` | Good org-type + foster maltrato | No `volunteer`; no failure-mode test for `Promise.all` reject; empty-org counts only |
| `regionBboxUnion` Malvinas | Toy bbox, not real geo | Claim-ring east extent untested |
| `regionAtPoint` “nearest fallback” | **Not tested (and not implemented)** | Doc/test honesty miss |

Pure units are not “happy path only”; they also don’t lock the dangerous integration contracts (gating, wheel vs ±, batch failure).

---

### Bottom line

| Area | Holds? |
|---|---|
| Region camera-only / no scope URL leak | Yes |
| Single-province govt cooperative zoom | Yes |
| Multi-province govt / “admin-only” claim | **No** |
| Wheel takeover vs ± / pinch / province deep-zoom | **No** — fights itself |
| Org queue gating (incl. maltrato roles) | Yes |
| Org count resilience + “bounded” claims | **No** — panel crash + global scans |
| Tests | Strong on pure logic; weak on the failure modes that matter |

**Recommendation:** Fix HIGH 1–4 before calling this shippable (gate scroll-nav on true universal/admin, not `initialDivisionProvince == null`; either keep wheel free-zoom at province level or teach ± to clear/update nav state; `allSettled` / per-key catch on counts + panel `.catch`). HIGH 5 can follow as a query rewrite. After that, the rest is MED polish.
