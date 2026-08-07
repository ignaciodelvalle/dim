# MiMAR — Pre-launch cutover checklist (2026-07-05)

Supersedes/extends `2026-07-04-vercel-deploy-readiness.md` with this session's changes.
Branch: **`integration/all-20260703`**. Apply-to-remote steps are **PO-gated** (Ignacio runs them).

## 1. Code gate (must be green before deploy)
- [ ] `pnpm test` — full suite green **except** `__tests__/rls/matrix.test.ts` (known, deferred — RLS doctrine, not a runtime path).
- [x] `pnpm tsc --noEmit` — 0 errors.
- [x] `pnpm lint:tokens` — clean (0 new; 2431 grandfathered in `scripts/design-tokens-baseline.json`).
- [x] `pnpm lint:buttons` — clean at baseline 46 (was 182; OpButton burn-down migrated 137).
- [ ] `pnpm verify` — green after the above (ends in `pnpm build`).

## 2. Migrations (forward-only, immutable) — APPLY TO REMOTE = PO-GATED
New this session, in order:
- **0127** `pet_events_append_only.sql` — ships the append-only triggers via the migration chain (previously only in db-bootstrap → migrate-only prod would have shipped WITHOUT append-only). CRITICAL.
- **0128** `notifications_related_case_fk.sql` — FK on `notifications.related_case_id` (orphans healed first).
- **0129** `erase_subject_data_event_pii_redaction.sql` — Ley 25.326: audited redaction of third-party PII (`victim_contact_name/phone`) in `pet_events`/`case_events` payloads via the `app.allow_event_mutation` override.
Apply to STAGING first (Supabase MCP / `pnpm db:migrate` against staging), verify `_dim_migrations` sha256 rows, smoke, THEN prod. Recount the next free integer at write time for any future migration (next = 0130).

## 3. Environment (BUILD-TIME on Vercel — set before build, not runtime)
- [ ] All existing env from the 07-04 readiness doc (Supabase URL/keys, DB pooler URL, etc.).
- [ ] **`CRON_ALERT_WEBHOOK`** (NEW, optional) — Slack/Discord/generic webhook; the cron fleet POSTs here on failure (`lib/infra/cron-alert.ts`). No-op if unset; set it for real alerting before launch.
- [ ] DB connection uses the **pooler** URL (not the direct connection) for serverless.

## 4. Supabase Auth hardening (Cursor review 28 — VERIFY on the hosted project)
- [ ] **Auth rate limits**: `supabase/config.toml` `[auth.rate_limit]` is LOCAL DEV ONLY — there is no `supabase config push` in the repo. VERIFY the hosted project's Auth → Rate Limits match or exceed it (sign-in/sign-up, token verifications). The app-layer login limiter is IP/email-keyed (bypassable by a botnet) — the hosted limits are the real backstop.
- [ ] **CAPTCHA**: `[auth.captcha]` is commented out. Enable (e.g. Turnstile) on login/signup as a backstop against IP-rotation brute force.
- [ ] **Leaked-password protection**: enable on the hosted project.

## 5. Pristine demo (PO runs locally for a clean click-through / demo)
```
pnpm db:reset && pnpm db:bootstrap && pnpm seed:demo && pnpm seed:panorama && pnpm seed:demo-polish && pnpm seed:demo:scenario
```
The local dev DB accumulates test residue (dead-agent runs) — the "cron failures"/test-accounts a prior QA saw were residue, not seed bugs. A clean re-seed is the source of truth.

## 6. Pre-launch UX acceptance gate (click-through) — see `2026-07-05-uxgate-runbook.md`
Run AFTER a pristine re-seed + `pnpm build && pnpm start` (the built :3000, not dev — paint matters). Not a code gate; an information-sufficiency + flow-coherence gate. Pass = zero blockers.

## 7. PO decisions still open (do not block the code, block the launch shape)
- **transferCustody receiver-consent** — currently a unilateral cross-org custody flip; a proper fix is a two-phase handshake that reshapes the live refuge workflow. DECISION needed.
- Corridor `/viaje` legal values (content validation). · Lost-mode disclosure defaults (current: recovery-opt-out). · Reminders push/email channel (current: in-app). · Prod Supabase (reuse staging vs fresh project). · `/code-review ultra` pre-deploy (billed, PO-triggered).

## 8. Fast-follows (real, not launch-blocking)
- `requireLiveUser()` helper for the ~15 remaining bare-`auth.getUser` mutation paths (E2 scoped follow-up; lint WS-AUTHZ 1.4 now catches NEW ones).
- Erasure MEDs (27): dispute-erasure asymmetry, attachments/Storage purge on erase, vet_name anonymization, projections self-overlay, rederivePetCache, cache-drift detect-only cron.
- Public MEDs (25): logLibretaShareView throttle, `/denuncias/codigo` lookup throttle.
- OpOmnibox global search links `/casos/` (shell-loss for operators). · LnField label htmlFor/id a11y. · closeCase caller-side "downstream once". · OpButton ref-as-prop for the 46 remaining (React 19). · 69-legacy notification burn-down. · KPI province-scale rollups.
