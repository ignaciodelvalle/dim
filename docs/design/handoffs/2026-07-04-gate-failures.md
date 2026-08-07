# Convergence-gate failures — 2026-07-04 (deferred to post-reset)

**Context:** After the autonomous marathon, a clean `pnpm verify` + `pnpm test` was run from a quiet tree (all agents stopped by a session rate limit; resets 08:10 America/Buenos_Aires).

**Result:** `pnpm verify` GREEN (typecheck + biome + all lint gates + build). `pnpm test`: **7303 passed / 2 failed** (612 files, 561s serial run — not parallel contention, these are real).

Both failures trace to the notifications/cron work committed in this session (tasks #8): nudge dedupe `f5482717`, drift card `754e62d2`, KPI amendments `9f596832`, fixture narrowing `ffc7c20c`. They were NOT deep-fixed inline because the session rate limit made a rushed half-fix riskier than a clean handoff. Fix these first thing after reset with a fresh agent.

---

## Failure 1 — vaccine cadence re-emission

- **Test:** `__tests__/notifications.test.ts:172` → `runVaccineDueScan > emits AGAIN when the cadence window reopens (2nd scan, same source event)`.
- **Expected:** a scan one day later (`now: tomorrow`) inserts a SECOND `vaccine_due` notification for the same reminder+source event (`insertedCount === 1`, `rows.length === 2`). due_soon throttles DAILY for the first 3 days, so day-2 must re-emit.
- **Suspected cause:** the throttle/history decision in `lib/infra/notifications.ts` `runVaccineDueScan` (~lines 130–210, the `SELECT MIN/MAX(created_at), COUNT(*) ... WHERE related_reminder_id = ...` history query + the variant throttle window). One of this session's commits changed either the history filter (e.g. an `archived_at IS NULL` / dedupe predicate) or the throttle-window comparison so the daily re-emission is now suppressed. The C3 work was "suppress the vaccine_overdue NUDGE when an active inbox notification covers the same obligation" — verify that suppression did NOT bleed into the `vaccine_due` cron cadence (nudge ≠ vaccine_due; the cron re-emission must survive).
- **Fix direction:** confirm the day-2 scan still passes the throttle gate; the dedupe must target the redundant nudge, not the legitimate daily due_soon re-emission. Keep `relatedEventId` NULL on cron emissions (0088 natural-key exemption — the test also asserts this).

## Failure 2 — reportable-incidence jurisdiction scope

- **Test:** `__tests__/surveillance-compliance.test.ts:536` → `fetchReportableIncidence > scope: govt only sees reportable events in its jurisdiction`.
- **Expected:** govt scoped to `Corrientes/Goya` seeing petIn (Goya, lepto) + petOut (Mercedes, lepto) counts `totalReportable === 1` (only the in-jurisdiction report).
- **Suspected cause:** `lib/analytics/surveillance-metrics.ts` `fetchReportableIncidence` — the A2 "project event_amended corrections into SQL aggregates" change (`9f596832`) likely altered the aggregate's JOIN/WHERE such that the jurisdiction filter no longer scopes `totalReportable` (reads as 2, an out-of-jurisdiction leak) OR the amendment CTE dropped the locality predicate. **Treat as potentially a scope-leak regression — verify whether a govt now sees out-of-jurisdiction reportable counts.** Check the amendment projection join didn't widen the row set past the `province/locality` filter.
- **Fix direction:** re-apply the jurisdiction predicate to the amended aggregate; add the scope assertion back to green. Confirm the k-anonymity sibling test (line 524, `totalReportable === 2` unsuppressed) still holds.

---

## Everything else

The rest of the marathon is committed and green (verify + 7303 tests). Idempotency #10 was rescued/committed manually after its agent died (`2d9cb8f0`), gitignore hardened (`3ab5d7ce`, ignores `.vercel`/`.env*`). Remaining open work (nav #46, st-tokens #41, config-theater #7, admin-intel #14, sweep #18, lost-share #13, movilidad sdd-apply #17, panorama sdd #24, /leyes, capstone #20, repo-hygiene #21, bundle #22) is queued for after the 08:10 reset.
