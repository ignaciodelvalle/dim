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
