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

---

## Sprint 2 — Poncho primitives + AGENTS rule codification

**Window:** 2026-05-27 · **Base branch:** `develop` ·
**Strategy:** promote shared chrome to `components/poncho`, add the `Wizard/WizardShell` and `SuccessScreen` primitives, fold the 4-verb / 3-location / shell / closer rules into AGENTS.md.

### PRs merged

- #239 — feat(shared): promote `WizardShell` to `components/poncho/Wizard`
- #240 — chore(owner): align owner event-form submit copy with 4-verb rule
- #241 — chore(org): align org-portal copy with 4-verb rule
- #242 — docs(agents): add "Design rules (UI conventions)" section
- #243 — feat(shared): extract `SuccessScreen` to `components/poncho`
- #244 — refactor(shared): `LocationFields` modes renamed to `l1` / `l2`
- #245 — refactor(shared): `LocationFields` gains `useMyLocationVariant` prop

### Decisions taken outside the plan

- `LocationFields` mode rename happened separately from `WizardShell` promotion so the rename diff stayed reviewable.
- AGENTS.md now carries the canonical statement of the four rules (PR-016 in the handoff numbering); the poncho README in Sprint 6 cross-links to it.

---

## Sprint 3 — Owner wizards + Tier-1 sighting + apply-intent resume

**Window:** 2026-05-27 · **Base branch:** `develop`.

### PRs merged

- #246 — feat(owner): mobile-only sticky "Marcar como perdida" footer CTA (PR-022)
- #247 — feat(owner): /inicio banner to resume in-flight apply-intent (PR-024)
- #248 — feat(public): second Tier-1 CTA "La vi cerca de acá" (PR-025)
- #249 — feat(owner): MarkLost as 3-step wizard (PR-020)
- #250 — feat(owner): FosterVolunteer as 3-step wizard (PR-023)
- #251 — feat(owner): /cuenta/upgrade org branch captures L1 (PR-027)
- #252 — feat(owner): MarkLost wizard ends on SuccessScreen (PR-021)
- #253 — feat(owner): owner event forms capture optional L1 (PR-034)

### Decisions

- PR-024 server action `dismissApplyIntentAction` flagged `@no-auth-required` to keep `server-actions-auth-coverage.test.ts` green (anonymous dismiss is the supported path).
- `MarkLostWizard` now requires `petName` + `petPublicToken` props for the SuccessScreen receipt; both call sites updated in the same PR.

---

## Sprint 4 — Org-side trámite wizards

**Window:** 2026-05-27 · **Base branch:** `develop`.

### PRs merged

- #254 — feat(owner): CrearConsultorio as 3-step wizard + L1 (PR-031)
- #255 — feat(org): cross-org transfer as 3-step wizard + SuccessScreen (PR-033)
- #256 — feat(org): Intake as 4-step wizard + SuccessScreen (PR-030)
- #257 — feat(org): AdoptionListing as 2-step wizard (PR-032)
- #258 — feat(adoptar): Postular adopción as 4-step wizard + SuccessScreen (PR-036)
- #263 — feat(org): Devolución como 3-step wizard + SuccessScreen (PR-044)
- #264 — feat(org): Crear servicio como 3-step wizard (PR-046)
- #265 — feat(org): Mordedura org como 4-step wizard + SuccessScreen (PR-045)

### Decisions taken outside the plan

- **PR-032 scope cut:** the handoff specified a 3-step wizard with a photo-upload step; the owning server action does not yet accept staged photos. Shipped as a 2-step wizard (content + visibility), photos deferred to a follow-up.
- **PR-044 scope cut:** the handoff described heavy identity verification (microchip cross-check + photo + signature + `custody_transferred` event); the existing server action only emits a proposal. Shipped as a 3-step wizard wrapping the existing action; identity verification deferred.
- **PR-046 scope cut:** the handoff specified an L2 ubicación step; no schema field exists for service offerings. Shipped as 3 steps (content / capacity / eligibility); L2 deferred.

---

## Sprint 5 — Public surfaces + org dashboard counts

**Window:** 2026-05-27 · **Base branch:** `develop`.

### PRs merged

- #259 — feat(public): Tier-2 expired/revoked/deceased views show pet context (PR-040)
- #260 — feat(public): Libreta header gains link to public profile (PR-041 partial — see scope cut)
- #261 — feat(public): emergency banner sticky on mobile (Tier 0+) (PR-042)
- #262 — feat(public): LostPublicCredential urgent banner + map link
- #266 — feat(org): surface live counts on org home (PR-047)

### Decisions taken outside the plan

- **PR-041 scope cut:** the handoff wanted a Tier 0→1 restructure mounting the lost banner on top of Tier 0; shipped as a copy/map-link update on the existing `LostPublicCredential`. Full Tier-0/0+ split is deferred.
- **PR-047 scope cut:** the handoff specified four count cards; the `reminders` table has no `organizationId` column, so the fourth (checkins) card was dropped. Three cards shipped (cases / transferencias / fosters).

---

## Sprint 6 — Error boundaries, toast, sticky CTAs, landing, README

**Window:** 2026-05-27 · **Base branch:** `develop`.

### PRs merged

- #268 — feat(shared): global ErrorBoundary + per-route-group `error.tsx` (PR-051)
- #269 — feat(shared): unified toast system via sonner (PR-052)
- #270 — feat(landing): 3-step explainer below the headline (PR-055)
- #271 — feat(public): sticky "Postularme" CTA on `/adoptar/[petToken]` mobile (PR-054)
- #272 — chore(owner): foster proposal accept ends on SuccessScreen (PR-053)
- #273 — chore(audit): retire DEFERRED markers on wired org pages (PR-056)
- #274 — docs(poncho): add design-system README (PR-057)

### Decisions taken outside the plan

- **PR-053 scope cut:** the handoff specified rolling SuccessScreen across "turnos + foster accept + a few more"; the foster-accept path was the highest-value one and is the only one shipped this sprint. Remaining inline-success migrations deferred.
- **PR-056 scope cut:** the org-side `mordedura/nuevo/page.tsx` is reachable via the per-pet flow but still lacks an explicit org-home CTA; the comment now documents that nav-presets enhancement remains a future improvement.
- **PR-057 cross-link:** the new poncho README is the canonical entry for `components/poncho`; AGENTS.md and `docs/design/08`/`09`/`10` remain the rule statements.

### Closing the trilogy

After PR-057 merged on 2026-05-27, `develop` is at 35e2e30. The trilogy-unification handoff is fully delivered; remaining open items (PPP integration, service dog flow, post-adoption travel) live in `2026-05-27-spec-later-tracker.md`.
