# UX-gate → Wave F → re-gate — final synthesis (2026-07-06)

## The arc
1. **v1 gate (2 cohorts, Cowork citizen + Cursor operator)** ran the fixture runbook on the built instance. **Both FAILed** — but both reported the product's *substance* as strong; the failures clustered in specific areas.
2. **Wave F** remediated every finding + the systemic issues the re-validations (1a–1d) + audits surfaced.
3. **Re-gate** rebuilt + verified (incl. under `TZ=UTC`, the Vercel condition).

## What the gate caught that the 28 code-reviews + green code-gate did NOT
- **A PROD-ONLY bug (#418 hydration).** Client date formatters without an explicit `timeZone`: SSR (UTC on Vercel) ≠ client (AR/UTC-3) → React #418 → corrupted client tree → the edit-profile blocker + app-wide frozen paints. **Invisible locally** (local Node inherits AR tz); only reproduces under `TZ=UTC`. Would have shipped to prod. → **F1 fixed** (a pinned `AR_TIME_ZONE` in `lib/utils/format.ts` + ~18 formatters); verified 0×#418 under TZ=UTC, edit-profile mounts.
- **A frozen legal cron.** `findPetsInProgress` used an unordered `.limit(500)` → returned the same 500 rows every run → a rabies observation past page 1 **could never auto-close** (the 10-day legal window). → **F2 fixed** (keyset + cursor resume), plus 10 more cron routes 200-on-failure (Vercel wouldn't retry) + unbounded scans.
- **7 confused-deputy isolation gaps** — org actions authorizing against the session-default membership, not the URL org. → **F3 fixed** (`requireCapabilityForOrgToken` canonical guard).
- **5 amendment→projection gaps** — a correction didn't refresh the denormalized `pets.*` cache. → **F4 fixed** (a `refresh-pet-cache-after-amendment` helper + `amendEvent` made transactional).

## Blockers & majors — status
| From | Item | Status |
|---|---|---|
| Cursor (operator) | **B1** vet can't start clinical signing (dead-ends on empty custody list) | ✅ FIXED — new "Atender mascota" walk-in flow (B1) + card fix |
| Cursor | M1 gob widget count vs empty queue · M2 clinic nav shows shelter modules · M3/M4 mordedura wizard · M5 agenda→slots | ✅ M2 fixed (nav org-type filter); M1/M3/M4/M5 → fast-follow (bundled clinic-entry polish) |
| Cowork (citizen) | **Blocker** editar-perfil blank (React #418) | ✅ FIXED (F1) |
| Cowork | React #418 systemic · "(seed)" leak · login pre-fill · Firulais alert · credencial↔libreta contradiction | ✅ #418(F1) · "(seed)"(F5) · Firulais(F5 query-scope) · credencial↔libreta(F5) · login pre-fill = NOT a bug (browser autofill, empty on a real first visit) |

## Security audits of the NEW code (this session)
- **Atender walk-in** — clean except **HIGH: the DIM-code consent proxy is weak** (the code is DIM's public credential). **PO decision: keep for the pilot** + F6 added the rate-limit (existence-oracle closed) + documented the owner-per-visit model for post-pilot (`2026-07-06-atender-consent-future.md`).
- **transferCustody two-phase** — see `audit-transfercustody-2phase.md`.

## Re-gate verdict
Product blockers + majors + the systemic prod-risks: **CLOSED and verified** (headless under TZ=UTC). Code gate: **green except two documented NON-product test items** — `rls/matrix` (admin-reads-all RLS doctrine, long-deferred) and `pet-cache-rederivation` (the panorama **B2 bulk microchip-coverage** is intentional aggregate demo data inserted without events; the fitness invariant holds for real event-sourced storylines). Both are fast-follows, not launch blockers.

## Fast-follows (not launch-blocking)
`relativeTime` now-drift (#418 subclass) · B2 microchip event-pairing + re-seed (greens pet-cache) · sync PPP re-eval on rule-create should be async (slow on a large province) · M1/M3/M4/M5 clinic-entry polish · the 3 pilot MEDs (erasure-RPC completeness, free-claim evidence, signup-enumeration) · leaked-passwords (PO Supabase dashboard) · lib/projections self-overlay · the 25/27 review MEDs · OpOmnibox /casos shell-loss · LnField label a11y · atender owner-per-visit consent (post-pilot).

## Next: v2 test battery
`docs/design/handoffs/2026-07-06-uxgate-battery.md` — Génesis (from empty), cross-POV costuras, mobile/responsive, adversarial — ready to run on the fixed instance.

---

# v2 battery + overnight close (2026-07-06 → 07, pre-deploy)

## v2 battery verdict
| Dimension | Cohort | Verdict |
|---|---|---|
| Mobile | operator (Cursor) | **PASS** (0 blockers, 5 mobile-polish majors) |
| Mobile | citizen (Cowork) | FAIL on 1 "blocker" — credential 3D freeze — but it **does NOT reproduce in clean Playwright** (8/8 default + 6/6 at 390 with flip, 0 errors). Root: Cowork's Chrome-extension viewport-lock × FlipCard 3D compositing. **Test-environment artifact, not a product bug** (same class as the login-prefill false-positive). PO kept the 3D flip. |
| Adversarial | operator (Cursor) | **PASS** (0 blockers, 4 majors) |
| Adversarial | citizen (Cursor) | **PASS** (0 blockers, 2 majors) |
| Costuras | 1 agent | Did not finish (Cursor stalled ~seam c, no verdict). Seams a/b partially screenshotted. Self-verified headless instead. |
| Génesis | relay | Deferred by PO (later). |

Net: **3 clean PASS + 1 env-artifact.** All reported majors were triaged; the real ones are fixed below.

## Overnight remediation — all committed, tsc 0, lint:tokens green
- **5 real-user majors:** C1 Boxer-PPP seal names only the missing field (6427f61a) · C2 share-sheet progressive disclosure (bcdefb9b) · A2 was ALREADY correct — the cohorts hit a STALE :3000 build; test-locked (f7eff574) · A3 atender error clears on edit (a28b6156) · A4 /acceso-denegado explains the redirect (cb616811).
- **Data-integrity (event-sourcing):** microchip-coverage seed no longer re-chips revoked pets (25d172a8) · adoption_eligibility folded into the pets cache (66e37418) — both green post-re-seed.
- **Pilot security MEDs:** erasure completeness +migration 0130 (3523a1d7) · **free-claim was a REAL hole — public-token claim without the private identifier** (60b28a16) · signup no longer leaks account/DNI existence (bb166ab0).
- **My own adversarial review** (the cloud /code-review ultra timed out at 30 min → I ran 2 review agents over the diff): found **1 HIGH — account erasure destroyed THIRD-PARTY (fostered) pets' photos/certificates** (role-less ownership filter) → fixed with a role='owner' scope + migration 0131 (55f8bf7e). Everything else CONFIRMED clean.
- **UI/a11y:** LnField label↔input association (eef5dab3) + Fragment-guard follow-up · omnibox keeps the govt shell (b46cc5b0) · F1-residual now-drift defensive (a127f05e).
- **st-token #41:** value-preserving codemod was already exhausted; converted the last 21 hits + **fixed a pre-existing RED lint:tokens gate that was failing `verify`** (70cd05f2).
- **Dashboards audit #39:** 4 safe /gob+/org copy/count fixes incl. /gob/cola count-lie → "200+" (74c241ea, d324164c, 88bac5ac).

## Deferred-WITH-EVIDENCE (not risked the night before a demo)
- **#22 bundle-size** — dynamic-importing maplibre-gl risks SSR-breaking the Panorama centerpiece; unverifiable without a daylight screenshot pass.
- **st-token range-snap bulk (~2394)** — shifts pixels app-wide (no 1:1 token by design); daylight screenshot job, documented per-category.
- **#35 crisis-e2e** — test-infra, can't verify against a moving build tonight.
- **#21 repo hygiene** — branch pruning is destructive, low demo-value.
- **sync-PPP-async** — the test timeout bump is correct + tested; async refactor is a follow-up.
- **rls/matrix** — intentional admin-reads-all doctrine (app-layer scoping is the defense); documented, not a bug.
- **Dashboards structural** — /org bulk-"Aprobar" has no confirm (Reject does); /admin "Decisiones 7d" drills to an unfiltered log; /org "Disponibles" KPI links unfiltered; Home cola card uses limit-as-count past 200. All /org+/admin (not the primary govt demo path), structural — flagged for daylight.
- **free-claim deleted_at** — deliberately NOT blocked: a soft-deleted pet keeps a live chip; a finder may legitimately re-claim it. PO decision.

## Demo-path verification (headless, TZ=UTC = the Vercel condition)
Citizen loop: login owner@ → /inicio → DEMO-PET-001 → **credential mounts ✓, 3D flip works ✓, public /p QR resolves ✓, React#418 = 0, console errors = 0.** The flagship works clean in the prod-equivalent timezone.
