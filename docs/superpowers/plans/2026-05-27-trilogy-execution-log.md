# Trilogy unification — execution log

> Companion to [`2026-05-27-trilogy-unification-handoff.md`](2026-05-27-trilogy-unification-handoff.md). One short entry per sprint with: PRs merged, PRs re-grouped, and any decisions taken outside the original plan.

---

## Sprint 1 — Bugs HIGH severity + deferred tracker

**Window:** 2026-05-27 → in progress · **Base branch:** `develop` (not `main` — the handoff said "mergea a main" but recent audit PRs #222–#228 landed on `develop`; confirmed with user before starting).

### Pre-execution audit

Before opening branches the codebase was scoped against the 8 handoff PRs. Findings:

| PR | Reality | Action |
|---|---|---|
| PR-001 libreta share validation | Inline guards existed but conflated `not_found` with `revoked`; no test surface | **Opened #234** — extract `validateShareToken()` helper + 7 unit tests + `notFound()` for missing tokens |
| PR-002 adoption excludes lost/deceased | Query `lib/adoption-listing-query.ts:35-36`, server action `app/actions/adoption-listing.ts:79-86`, and test `__tests__/adoption-listing.test.ts:107-117` all complete | **No-op** — verified |
| PR-003 cron expire-foster-proposals | Route + helper + vercel.json (`0 3 * * *`) all present, helper has full integration test in `__tests__/foster-proposal-expirer.test.ts`. Missing: route-level auth-gate test | **Opened #235** — add unit test for `x-cron-secret` header check + 200/500 envelopes |
| PR-004 chip publicToken null guard | `pets.publicToken` is `.notNull()` at `db/schema.ts:407` — the scenario "data corrupta pre-token-rotation" is unreachable | **No-op** — plan's premise didn't match the schema |
| PR-005 EventCatcher sanitization | Matcher uses **hardcoded** RegExp; user input is the target, never inserted into the pattern. The handoff's regex-injection vector is false | **Opened #236** (rescoped) — added `CAPTURE_INPUT_MAX_LENGTH = 500` truncation + adversarial tests (10kb, regex metacharacters, emoji) |
| PR-006 spec-later tracker | Doc absent; 4 markers found in `app/(app)/mis-mascotas/[publicToken]/page.tsx` | **This PR** — `docs/superpowers/plans/2026-05-27-spec-later-tracker.md` + relinked the markers |
| PR-007 archive superseded specs | `docs/superpowers/specs/2026-05-18-maltreatment-reporting-design.md` and `docs/design/05-pro-portal.md` still in original locations | **Next PR** — move both to `docs/archive/` + update `AGENTS.md` |
| PR-008 coverage thresholds | `vitest.config.ts:26-33` already has per-path branch thresholds (lib/business-rules 90%, lib/** 70%, app/actions 75%, app/api 60%) per `docs/testing/PLAN.md` D2 | **No-op** — verified |

### Decisions taken outside the plan

- **PR-005 rescope:** the handoff treated the matcher as accepting user-supplied regex. It does not. The defensive value the rescoped PR captures is a hard length cap so the existing patterns (notably the `note_added` catch-all `(.+)$`) can't be coaxed into pathological backtracking by a 10kb paste. Tests pin the cap behavior and confirm `|` in input is literal.
- **PR-003 schedule:** `vercel.json` registers the cron at `0 3 * * *` (daily 3am) instead of the handoff's `0 */6 * * *` (every 6h). Did not change — schedule is a deploy decision, not a bug.
- **Base branch:** `develop`, not `main`. `main` is 244 commits behind; recent merges target `develop`.

### PRs merged (open)

- [#234](https://github.com/ignaciodelvalle/dim/pull/234) — fix(public): respect share token revocation and expiry on libreta
- [#235](https://github.com/ignaciodelvalle/dim/pull/235) — test(infra): CRON_SECRET unit test for expire-foster-proposals route
- [#236](https://github.com/ignaciodelvalle/dim/pull/236) — fix(shared): cap event-capture-matcher input length

### PRs marked no-op (verified already shipped)

PR-002, PR-004, PR-008.

### Re-grouped / deferred

None — every handoff item resolved (executed, no-op, or rescoped).

### Carry-forward to Sprint 2

None. Sprint 2 starts clean with the `WizardShell` promotion.
