# MiMAR — Cutover readiness (final, 2026-07-05)

Executive state at the end of the full-backlog batch. Branch `integration/all-20260703`.
Companion docs: `2026-07-05-prelaunch-checklist.md` (the gate), `2026-07-05-uxgate-runbook.md` + `2026-07-05-uxgate-genesis.md` (the acceptance test).

## Code gate — GREEN
- `pnpm test`: **7954 passed / 3 failed**. The 3: 2 are `__tests__/rls/matrix.test.ts` (KNOWN, deferred — the admin-reads-all RLS doctrine, not a runtime path); 1 (`SheetHost.interaction`) was a brittle-query regression, **fixed** this pass. Net: green except the 2 doctrine tests.
- `tsc --noEmit`: 0 errors. `lint:tokens`: clean (2431 grandfathered baseline). `lint:buttons`: clean at 46 (was 182).

## What shipped this session (waves A–E + QA + reviews)
- **Wave A (prod-risk, govt-grade):** cron reliability (500-on-fail so Vercel retries legal windows; keyset batching for nationwide scans; `CRON_ALERT_WEBHOOK` alerting), tenant/jurisdiction isolation (locality-pair scoping on gob/decomiso/intake + HMAC intake-match claim), full-lock jurisdiction+species (#40, only via events).
- **Wave B + QA (#42–50):** pet-situation state-skin (color+label+shape, no repeated badges), `/cuenta` hang fix + reliable logout, login field bugs, vaccine declared-vs-verified copy + tightened "próximos" window, notification↔state reconcile, gov case-detail keeps operator shell, admin cache-drift/user-count honesty, seed cleanup (fitness sweep GREEN).
- **#43 vet-role keystone:** clinical-event provenance BOUND to the signer's validated matrícula (3 tiers: verified_professional / org_registered / owner_declared) — closes the landing promise; org-type specialization (clinic ≠ refugio); vet home; + the bulk-vaccinate path closed too.
- **Waves D + E (pre-launch guide, reviews 25–28 → 18 HIGH, remediated + adversarially re-validated):** corrections supersede in the PUBLIC credential AND all govt KPIs (Invariant #3); right-to-erasure completed (deletedAt at the auth AND pet-mutation boundary, auth.users deletion, third-party PII redaction migration 0129); ownership concurrency (advisory locks + status-guarded UPDATEs on return/accept/expire); public rate-limits (shared libreta + scan log).
- **OpButton** operator skin burn-down (137 buttons; baseline 182→46).
- **Reviews:** 01–28 briefs + results + two synthesis docs + the Wave-D validation re-runs, all committed under `docs/reviews/`.

## Migrations — new this session (forward-only)
0127 (pet_events append-only triggers via the chain), 0128 (notifications.related_case_id FK), 0129 (erase_subject_data third-party-PII redaction). **All applied cleanly on LOCAL** (in `_dim_migrations` with sha256 checksums — proof they're sound).

### Applying to STAGING/PROD — the correct procedure (PO-gated)
Run the DIM runner against the target DB: **`DATABASE_URL=<staging-or-prod> pnpm db:migrate`** (`--strict` to fail on checksum drift). This maintains the `_dim_migrations` ledger + checksums. **Do NOT use Supabase's `apply_migration` / dashboard SQL** — it bypasses `_dim_migrations` and desyncs the runner. Staging first, verify, then prod.

## Deploy — human-gated steps (Ignacio)
1. Set Vercel env (BUILD-TIME) incl. optional `CRON_ALERT_WEBHOOK`; use the DB pooler URL.
2. Verify hosted Supabase Auth rate-limits + enable CAPTCHA + leaked-password (config.toml is dev-only — review 28).
3. `DATABASE_URL=<staging> pnpm db:migrate` → smoke → same on prod.
4. Deploy the branch; run the UX acceptance gate (Genesis first, then fixture mop-up) on the pristine build.
5. Optional: `/code-review ultra` pre-deploy (billed, PO-triggered).

## Fast-follows (real, not launch-blocking) — see checklist §8.
`requireLiveUser()` helper (E2 scoped ~15 files), erasure MEDs (attachments/Storage purge, vet_name anon, dispute-erasure asymmetry, cache-drift cron), public MEDs (2 throttles), OpOmnibox `/casos` shell-loss, LnField a11y, closeCase caller-downstream, OpButton ref-as-prop (46), 69-legacy notification burn-down, KPI province rollups.

## PO decisions open — see the final report.
transferCustody receiver-consent · prod Supabase (fresh vs reuse) · reminders channel · /code-review ultra · corridor /viaje values · disclosure defaults.
