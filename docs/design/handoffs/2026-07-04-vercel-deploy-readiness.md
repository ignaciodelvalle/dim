# Vercel Deploy Readiness — DIM / MiMAR (2026-07-04)

Scope: Next.js 15 App Router + React 19, pnpm, Node >=22.13, target Vercel + Supabase Cloud.
Read-only audit. No config, migrations, or deployments were changed.

---

## 1. Executive summary

**Verdict: PREVIEW-ONLY — not production-ready as-is.**

The codebase is disciplined (fail-closed auth pattern used consistently for cron/token
secrets, CI-enforced cron parity, env-driven image config, local-only seed guards,
privacy-tiered public credential page). But three gaps will cause real production
incidents if deployed unchanged: a PII-hashing secret that silently falls back to a
public dev value instead of failing closed, zero explicit `maxDuration` configuration
for cron functions whose own code comments assume a 60s budget the project's actual
Vercel plan does not grant by default, and a client-visible demo banner env var that
bakes into the production bundle at build time if copied from local `.env.local`.
None of these require a code redesign — they are config/guard fixes plus one missing
runtime constant — but all three must be closed before a production cutover.

The Supabase side is in better shape than the code: `docs/ops/remote-supabase-bootstrap-runbook.md`
already documents a tested bootstrap procedure (buckets, pooler gotchas, storage). The
gap there is process, not code: the production runbook it points to
(`production-deploy-plan-2026-06.md`) does not exist in the repository.

---

## 2. Blockers

### B1 — `DNI_HASH_PEPPER` has no production fail-closed guard; silently uses the dev pepper
- **File**: `lib/utils/dni-hash.ts:20-25`
- Unlike every other secret-resolution helper in this codebase (`cron-auth.ts`,
  `microchip-force-token.ts`, `tattoo-ack-token.ts`), `getPepper()` has **no**
  `NODE_ENV === "production"` check:
  ```ts
  const DEV_TEST_PEPPER = "dim-test-pepper-v1";
  function getPepper(): string {
    return process.env.DNI_HASH_PEPPER ?? DEV_TEST_PEPPER;
  }
  ```
- If `DNI_HASH_PEPPER` is unset in the Vercel production project (easy to miss — it's
  not a Supabase-provided var), every `dni_hash` written or matched in production is
  computed with a hardcoded, publicly-visible-in-source pepper. Per the file's own
  header comment, a leaked pepper makes the DNI hash table reversible by rainbow table
  over the finite 7–8 digit Argentine DNI space — this is the exact scenario the pepper
  exists to prevent, and it fails silently (no error, no log) instead of loudly.
- **Fix before prod**: add the same fail-closed branch used in `microchip-force-token.ts:34-38`
  (`throw` when `NODE_ENV === "production"` and the var is absent), and confirm the
  Vercel prod env var is set to a real secret, not `dim-test-pepper-v1`.

### B2 — No `maxDuration` configured anywhere; cron code assumes a 60s budget it isn't guaranteed
- **Files**: `vercel.json` (no `functions` block), all 21 routes under `app/api/cron/*/route.ts`
  (verified via repo-wide grep for `export const maxDuration` — zero matches).
- `app/api/cron/reconcile-pet-status/route.ts:32-33,58-59` explicitly says:
  > "Vercel Hobby cron functions time out at 60 s; we use 45 s to leave margin."

  and scans up to 2000 pets per run (`MAX_PETS_PER_RUN`, line 54) with a 45s internal
  wall-clock guard (`MAX_DURATION_MS`, line 59). This 60s assumption is only true if
  `maxDuration` is explicitly raised — Vercel's **default** function timeout (absent any
  `export const maxDuration` or `vercel.json` `functions` entry) is well below 60s on
  Hobby and Pro plans. With no override anywhere in the fleet, the platform can kill the
  function **before** the code's own 45s internal guard ever fires, which means:
  - `reconcile-pet-status` may be killed mid-batch, before it writes the final
    `cronRuns` telemetry row (the `UPDATE` at line 193 never runs) — the run looks
    "never finished" rather than "ok" or "failed", which will falsely trip
    `cron-health`'s staleness check.
  - Any other cron doing real per-row work at volume (e.g. `business-rules-reeval`,
    `data-lifecycle`, `evaluate-alerts`) is exposed to the same risk with no code-level
    mitigation, since none declare `maxDuration`.
- **Fix before prod**: add `export const maxDuration = 60;` (or higher, per Vercel plan
  tier — Pro allows up to 300s) to every cron route, or add a `"functions"` block to
  `vercel.json` scoped to `app/api/cron/*/route.ts`. Re-verify `MAX_DURATION_MS` in
  `reconcile-pet-status/route.ts:59` still leaves adequate margin under whatever value
  is actually configured. Confirm which Vercel plan (Hobby/Pro) the project runs on
  before picking a number — this determines the achievable ceiling.

### B3 — `NEXT_PUBLIC_DEMO_MODE` will ship to production if the build inherits the local value
- **Files**: `components/ui/DemoModeBanner.tsx:1-4,18`, `lib/domain/demo-mode.ts:16-18`,
  `app/admin/layout.tsx:91`, `app/admin/panorama/page.tsx:148`.
- The flag gate itself is correctly strict (`envValue === "true"`, `lib/domain/demo-mode.ts:17`
  — anything else, including unset, is off). The risk is **not** the code, it's the
  deploy pipeline: `NEXT_PUBLIC_*` variables are inlined into the JS bundle at **build
  time**, including when read from a server component (`app/admin/layout.tsx:91` reads
  `process.env.NEXT_PUBLIC_DEMO_MODE` directly). Per the task brief, this was set to
  `true` locally on 2026-07-04 for demo recording. If that value is present in the
  Vercel **Production** environment variable set at build time (e.g. copy-pasted from
  `.env.local`), the "Datos de demostración" banner ships baked into the production
  bundle — a runtime env change afterward will **not** fix it; it requires unsetting
  the var and rebuilding.
- **Fix before prod**: treat "confirm `NEXT_PUBLIC_DEMO_MODE` is absent or `false` in
  Vercel → Project → Settings → Environment Variables → Production" as a hard
  pre-build gate, not a post-deploy check (see Vercel runbook §5 below).

---

## 3. Warnings

### W1 — `APPLY_INTENT_SECRET` lacks the fail-closed pattern its sibling helpers use
- **File**: `lib/domain/apply-intent.ts:38-42`.
- `microchip-force-token.ts:29-40` and `tattoo-ack-token.ts:23-30` both throw in
  production when neither their dedicated secret nor `SUPABASE_SERVICE_ROLE_KEY` is
  set. `apply-intent.ts`'s `getSigningKey()` has the same two-tier fallback but drops
  straight to the hardcoded `"dim-dev-fallback-key-not-for-production"` string with no
  production guard. Practical risk is low (service role key is required elsewhere and
  will be set), but it's an inconsistency in an otherwise-consistent security pattern
  and should be hardened to match.

### W2 — `org-logos` storage bucket has no SQL/migration coverage
- **Files**: `lib/infra/storage.ts:20-25` (reads `org-logos`), `db/storage.sql`,
  `db/welfare_storage.sql` (neither creates it).
- This is already known and documented as a **manual** step in
  `docs/ops/remote-supabase-bootstrap-runbook.md:142-155` (along with `avatars`,
  `welfare-exports`, `ppp-exports`). Flagging here only because it's easy to skip on a
  fresh environment if that runbook section is missed — the bootstrap script
  (`scripts/db-bootstrap.ts`) does **not** create these four buckets automatically.

### W3 — Referenced production runbook does not exist in the repo
- `docs/ops/staging-deploy.md:56` says: "Production deploy stays deliberate (see
  `production-deploy-plan-2026-06.md`)". No file by that name (or similar) exists
  anywhere in the tracked tree (confirmed via `git ls-files`). There is currently no
  committed, authoritative production cutover procedure — only the staging one and the
  remote-bootstrap runbook, which is bootstrap-specific, not deploy-specific.

### W4 — Pooler URL ambiguity between migration tooling and app runtime
- `docs/ops/staging-deploy.md:17-19` and `docs/ops/remote-supabase-bootstrap-runbook.md:61-74`
  both specify the **Session pooler** (port 5432) for `db:push`/`migrate.ts` (DDL needs
  a session-scoped connection). But `db/index.ts:52` sets `prepare: false` on the
  postgres-js client — the setting required for **Transaction-mode** pgbouncer pooling
  (port 6543), which is the right choice for a high-concurrency serverless app runtime,
  not for DDL. Neither doc calls out that the Vercel **app's** `DATABASE_URL` (runtime)
  and the **migration** `DATABASE_URL` (used by a human running `pnpm db:migrate`) are
  different connection strings pointing at different pooler modes. Using the Session
  pooler URL for the app's production runtime risks exhausting the pooler's smaller
  session slot budget under concurrent lambda invocations.
- **Action**: confirm the Vercel Production `DATABASE_URL` env var is explicitly the
  Transaction pooler string (`...pooler.supabase.com:6543`), separate from whatever
  Session pooler URL (`:5432`) is used ad hoc for `pnpm db:migrate`.

### W5 — Hardcoded sitemap domain fallback
- **File**: `app/sitemap.ts:14` — `process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mimar.gob.ar"`.
- If `NEXT_PUBLIC_SITE_URL` is unset in Vercel prod, the sitemap silently falls back to
  this hardcoded domain. Confirm it matches the actual production domain, or (safer)
  always set `NEXT_PUBLIC_SITE_URL` explicitly so the fallback is never exercised.

### W6 — No documented step for the first production admin/government account
- Searched `docs/ops/*`, `scripts/db-bootstrap.ts`, and `scripts/seed-test-users.ts`:
  found no procedure for creating the first real `admin`/`government` profile in a
  fresh production Supabase project. `seed-test-users.ts` is explicitly local/test-only
  (guarded, see §Seed safety below). This should be a documented manual step (sign up
  normally, then flip `profiles.role` via a service-role SQL statement) rather than
  left implicit.

---

## 4. Confirmed-clean / already CI-enforced (evidence, not re-derived)

- **Cron ⇄ vercel.json ⇄ registry parity**: CI-enforced by
  `__tests__/cron-registry-parity.test.ts`, backed by `lib/infra/cron-registry.ts`. The
  test asserts (a) `vercel.json` cron paths ⇄ `app/api/cron/*` route directories match
  1:1, (b) `CRON_REGISTRY` names are exactly `snake_case` of route directories, (c)
  every route declares `const CRON_NAME` matching that rule, (d) every route writes
  `cron_runs` telemetry. All 21 crons in `vercel.json` have a matching route directory.
- **Cron auth coverage**: all 21 `app/api/cron/*/route.ts` files call
  `authorizeCronRequest` — either directly or via the shared `runCaseCron`/`withCronRun`
  wrapper (`lib/infra/case-cron.ts:14`, confirmed by source inspection), which itself
  delegates to `authorizeCronRequest`. `lib/domain/cron-auth.ts:28-37` fails **closed**
  (401) when `CRON_SECRET` is unset in production, and fails open with a
  `console.warn` only outside production (intended dev-fallback, documented in the
  file header).
- **Cron idempotency**: `__tests__/notifications.test.ts:151-162` ("does NOT duplicate
  when the cron runs again") and `:164-174` ("emits AGAIN when the cadence window
  reopens") together document and pin the C1 dedupe fix (migration 0088's unique index
  on `(user_id, related_event_id, notification_type)` exempts NULL `related_event_id`
  rows so cron-emitted notifications can re-fire on cadence without violating the
  index).
- **Seed safety**: every independently-runnable `scripts/seed-*.ts` and
  `scripts/seed-demo-polish.ts` (12 files: `seed-demo.ts`, `seed-demo-polish.ts`,
  `seed-demo-scenario.ts`, `seed-demo-compliance-coverage.ts`, `seed-demo-spine.ts`,
  `seed-real-photos.ts`, `seed-panorama.ts`, `seed-test-users.ts`, `seed-pet-photos.ts`,
  `seed-coverage.ts`, `seed-perf.ts`, `seed-owner-demo.ts`) has a local-only guard: hard
  `NODE_ENV === "production"` block plus a `127.0.0.1`/`localhost` host check on both
  `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL`, with an explicit `--allow-remote` opt-out
  (pattern shown in `scripts/seed-demo.ts:47-68`). The five `scripts/seed-storylines-*.ts`
  files are pure data modules (exported `Storyline` objects) imported only by
  `seed-demo.ts` — not standalone runnable, so they need no separate guard; confirmed via
  repo-wide import search. `scripts/db-bootstrap.ts:41-56` has the same local-only guard
  pattern with the same `--allow-remote` override.
- **Images config is env-driven, not hardcoded**: `next.config.ts:5-6,27-43` derives the
  local Supabase hostname/port from `NEXT_PUBLIC_SUPABASE_URL` and additionally
  whitelists `*.supabase.co` over HTTPS for any production Supabase project — no
  hardcoded `127.0.0.1:54321` assumption.
- **Middleware/edge runtime**: `middleware.ts:96-102` matcher correctly excludes
  `_next/static`, `_next/image`, `favicon.ico`, and common static extensions. Its only
  imports are `next/server` and `lib/supabase/middleware.ts`, which itself only imports
  `@supabase/ssr` and `next/server` — no Node-only APIs observed that would break Edge
  runtime. `lib/supabase/middleware.ts:45-50` also hardens against an auth-error crash
  (an uncaught `AuthApiError` for a stale refresh token previously killed the whole
  server process, per its own comment referencing a 2026-07-02 incident).
- **Auth callback absolute URLs**: `app/auth/callback/route.ts:18,31,38` derives
  `origin` from the incoming `request.url`, not from an env var or hardcoded string —
  correct for both preview and production domains without configuration.
- **Mi Argentina OIDC callback is safe to ship as-is**: `app/auth/miarg/callback/route.ts:28-33`
  gates on `isMiArgOidcEnabled()` and returns 404 when the `MIARG_OIDC_*` vars are
  unset — invisible to scanners, zero effect on the existing auth flow.
- **Public credential page privacy posture**: `app/(public)/p/[publicToken]/page.tsx:1-14`
  documents and the surrounding module enforces Tier 0/1/2 disclosure gating plus a
  per-IP rate limit (30–60/min, 200–400/hr) enforced **before** any data fetch. No
  IP/geo fields found referenced in `ScanLogger.tsx` (grepped, zero matches).
- **No Docker assumptions in prod code paths**: grepped `lib/` and `app/` for
  `docker`/`localhost:54321`/`127.0.0.1:5432` — zero matches outside of doc comments
  and the local-only bootstrap guards (which are supposed to reference them).
- **Node version pinning**: `.node-version` and `.nvmrc` both pin `22.13.0`, consistent
  with `package.json` `engines.node: ">=22.13.0"`. `pnpm-lock.yaml` is committed —
  Vercel will auto-detect pnpm from the lockfile. (Minor info: no `packageManager`
  field in `package.json` for Corepack pinning — not required since the lockfile alone
  is sufficient for Vercel's package-manager detection, but would add reproducibility
  parity with the two Node-version files.)
- **`db/index.ts` pool config is serverless-sane**: `prepare: false` (line 52, required
  for pgbouncer transaction-mode compatibility) and `globalThis` caching gated to
  `NODE_ENV === "development"` only (line 61) — correct, because in Vercel's Node.js
  runtime a warm container reuses the module singleton across invocations without
  needing the explicit cache; the dev-only cache exists purely to survive Next.js HMR
  reloads, per the file's own comment (lines 37-44).

---

## 5. Supabase manual runbook (ordered)

This project already has a tested, detailed bootstrap runbook —
`docs/ops/remote-supabase-bootstrap-runbook.md` (last executed 2026-06-14 against
staging). Follow it in full; summarized order below. Do not run the standalone
`db/*_rls.sql` files (`rls.sql`, `cases_rls.sql`, `foster_rls.sql`,
`organizations_rls.sql`, `scheduling_rls.sql`, `welfare_rls.sql`) — RLS is now
sourced from the migration tree (`db/migrations/0086_track_rls_in_migrations.sql`
onward) per `scripts/db-bootstrap.ts:25-31`; those loose files are reference-only and
applying them risks duplicate/conflicting policies.

1. Prerequisites: working `psql` on the bootstrap host; **stop any local Supabase
   Docker stack** (`docker ps --filter "name=supabase_" ...` must print nothing —
   otherwise the bootstrap silently targets the local container); `.env.local`
   `DATABASE_URL` pointed at the **Session pooler** (port 5432, not Direct/IPv6-only,
   not the Transaction pooler port 6543 which breaks `db:push`).
2. Run `pnpm db:bootstrap --no-seeds --allow-remote` (schema push → migration replay →
   baseline → triggers.sql/storage.sql/welfare_storage.sql, strict).
3. Confirm zero pending migrations: `pnpm db:migrate:status` (expect Applied = 117,
   Pending = 0 — latest migration on this branch is `0117_govt_assignments_locality_canonical.sql`).
4. Seed reference data: `import-indec-localities.ts` + `import-caba-barrios.ts` via
   `node --env-file=.env.local --import tsx scripts/import-*.ts` (plain `pnpm tsx`
   fails — these scripts don't auto-load `.env.local`).
5. Create the four buckets not covered by SQL files (Studio SQL editor):
   ```sql
   insert into storage.buckets (id, name, public) values
     ('avatars','avatars',false),
     ('org-logos','org-logos',true),
     ('welfare-exports','welfare-exports',false),
     ('ppp-exports','ppp-exports',false)
   on conflict (id) do nothing;
   ```
   `pet-photos`, `event-attachments`, `welfare-evidence` are already created by
   `storage.sql`/`welfare_storage.sql` in step 2. **`seed-photos` must NOT exist** in a
   real environment (per the runbook's own warning).
6. Auth config (Studio → Authentication → URL Configuration/Providers, manual, no
   MCP/API tool): set `site_url` to the production domain, add
   `additional_redirect_urls` for any Vercel preview wildcard, keep email
   confirmations off until SMTP lands, anonymous sign-ins off. Blocked until the
   production domain (Vercel + DNS) exists.
7. Set `DNI_HASH_PEPPER` to a freshly generated secret (never the `dim-test-pepper-v1`
   dev value) in whatever secret store feeds the Vercel production environment —
   **required to close B1** above.
8. Run the acceptance query from the runbook (`migrations`/`functions`/`triggers`/
   `rls_policies`/`buckets`/`localities` counts) and then Supabase Studio → Advisors
   (or MCP `get_advisors`) once, to capture the project's baseline security/perf
   posture before go-live.
9. Bootstrap the first admin/government account manually (no scripted path exists —
   see W6): have the operator sign up through the normal auth flow, then update that
   user's `profiles.role` via a service-role SQL statement.
10. **This step is human-gated per project convention** — do not let an agent apply
    migrations or run this runbook against the production project unsupervised.

---

## 6. Vercel dashboard runbook (ordered)

1. Confirm the Vercel project's deploy mode: `docs/ops/staging-deploy.md:30-33` states
   the **staging** Vercel project is explicitly **not git-connected** and is deployed
   via `npx vercel --prod --archive=tgz` from a specific local working tree. Confirm
   whether the **production** project uses the same manual-CLI model or standard
   GitHub integration — this changes the entire rest of this runbook (manual archive
   push vs. auto-deploy-on-merge). No committed doc currently answers this for
   production (see W3).

   > Correction 2026-09-02: the Vercel project (`dim-staging`) is git-connected —
   > verified against the Vercel API on 2026-09-02. Every push to `main` now
   > deploys the code; migrations still travel only through `pnpm deploy:staging`.
   > This is a dated handoff and the paragraph above is left as written for the
   > record. Current state lives in `docs/ops/staging-deploy.md`.
2. Environment Variables → Production — set explicitly (do not rely on defaults):
   - `DATABASE_URL` — **Transaction pooler** string (`...pooler.supabase.com:6543`),
     distinct from any Session pooler URL used for migrations (see W4).
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   - `CRON_SECRET` — required; without it every cron 401s in production
     (`lib/domain/cron-auth.ts:31-33`).
   - `DNI_HASH_PEPPER` — a real secret, not the dev default (closes B1).
   - `NEXT_PUBLIC_SITE_URL` — the real production domain (avoids the sitemap fallback, W5).
   - `NEXT_PUBLIC_DEMO_MODE` — **absent, or explicitly `false`**. Verify this in the
     dashboard before the next production build, not after (closes B3).
   - Optional/feature secrets as needed: `APPLY_INTENT_SECRET`, `TATTOO_ACK_SECRET`,
     `MICROCHIP_FORCE_SECRET` (all have safe fallbacks to `SUPABASE_SERVICE_ROLE_KEY`),
     `RESEND_API_KEY` (email), `MIARG_OIDC_*` (leave unset — the callback route
     404s safely until Item 25b ships).
3. Add `export const maxDuration = <N>;` to every `app/api/cron/*/route.ts` (or a
   `functions` block in `vercel.json`) sized to the actual Vercel plan tier before the
   next deploy (closes B2). Re-check `reconcile-pet-status`'s internal
   `MAX_DURATION_MS` constant against whatever ceiling is configured.
4. Confirm Node.js version in Project Settings matches `.node-version` (22.13.0) or
   at least satisfies `>=22.13.0`.
5. Trigger the deploy per whatever model step 1 confirmed (`pnpm deploy:staging`-style
   migrate-then-deploy gate, or standard git-push auto-deploy). For production,
   `docs/ops/staging-deploy.md:56-58` recommends migrations applied as a **separate,
   reviewed** step (`pnpm db:migrate:check` as a hard gate, exit code 6 on pending)
   rather than auto-applying on deploy — follow that pattern; do not wire prod to
   auto-migrate.
6. Confirm the `vercel.json` cron schedules are picked up (Vercel dashboard →
   Cron Jobs tab should list all 21 entries after the first successful deploy).
7. Confirm Supabase Auth → URL Configuration `site_url`/redirect URLs (Supabase step
   6 above) point at the live Vercel production domain, not a preview URL.

---

## 7. Suggested post-deploy smoke script (ordered)

Run against the production domain immediately after cutover:

1. `GET /` — landing page renders, no demo banner visible anywhere in the HTML
   (grep the response for "Datos de demostración" — must be absent; confirms B3 closed).
2. `GET /p/{a-known-active-publicToken}` — public credential page renders Tier 0 view,
   no owner PII/microchip/medical fields present in the response HTML.
3. `GET /adoptar` and `GET /perdidas` — public listings render.
4. `GET /sitemap.xml` — confirm URLs use the real production domain, not
   `https://www.mimar.gob.ar` unless that IS the real domain (checks W5).
5. Sign up a throwaway account through `/signup` → confirm `/auth/callback` redirects
   correctly to the role-based landing (exercises `app/auth/callback/route.ts`'s
   origin-derivation logic against the real domain).
6. `GET /admin` (as an authenticated admin/government test account) — confirm no demo
   banner, confirm `/admin/panorama` loads (both read `NEXT_PUBLIC_DEMO_MODE`).
7. Manually trigger one lightweight cron with the real `CRON_SECRET` via
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/cron-health`
   — expect `{ ok: true, ... }`; confirms cron auth + DB connectivity end-to-end.
8. Manually trigger `reconcile-pet-status` the same way and check the response
   `durationMs` plus the Vercel function's actual wall-clock time in the dashboard —
   confirms whether B2's `maxDuration` fix is sufficient at real data volume.
9. Upload a pet photo through the normal owner flow → confirm the resulting image
   loads from the `*.supabase.co` public storage URL (exercises `next.config.ts`
   `images.remotePatterns` against the real project, not local Supabase).
10. Check Vercel function logs for any `[cron-auth]` warning lines — their presence
    in production would mean `CRON_SECRET` is unset (should never appear post-cutover).

---

## 8. Evidence appendix (file:line index)

| Finding | File:line |
|---|---|
| B1 — DNI pepper no prod guard | `lib/utils/dni-hash.ts:20-25` |
| B1 contrast — correct fail-closed pattern | `lib/infra/microchip-force-token.ts:29-40`, `lib/infra/tattoo-ack-token.ts:23-30` |
| B2 — no maxDuration anywhere | repo-wide grep, zero matches; `vercel.json` (no `functions` key) |
| B2 — 60s assumption in code comment | `app/api/cron/reconcile-pet-status/route.ts:32-33,54,58-59` |
| B3 — demo banner gate | `lib/domain/demo-mode.ts:16-18`, `components/ui/DemoModeBanner.tsx:1-4,18-23` |
| B3 — server read of NEXT_PUBLIC var | `app/admin/layout.tsx:91`, `app/admin/panorama/page.tsx:148` |
| W1 — apply-intent secret fallback | `lib/domain/apply-intent.ts:38-42` |
| W2 — org-logos bucket usage / doc | `lib/infra/storage.ts:20-25`; documented in `docs/ops/remote-supabase-bootstrap-runbook.md:142-155` |
| W3 — missing production runbook doc | `docs/ops/staging-deploy.md:56` references `production-deploy-plan-2026-06.md` (not found in repo) |
| W4 — pooler mode ambiguity | `docs/ops/staging-deploy.md:17-19`, `docs/ops/remote-supabase-bootstrap-runbook.md:61-74`, `db/index.ts:49-52` |
| W5 — sitemap fallback domain | `app/sitemap.ts:14` |
| W6 — no admin bootstrap doc | absence confirmed across `docs/ops/*`, `scripts/db-bootstrap.ts`, `scripts/seed-test-users.ts` |
| Cron parity CI test | `__tests__/cron-registry-parity.test.ts:39-75`, `lib/infra/cron-registry.ts:26-80` |
| Cron auth fail-closed | `lib/domain/cron-auth.ts:28-37` |
| Cron auth coverage (21/21) | `lib/infra/case-cron.ts:14,127-141`; grep of `app/api/cron/*/route.ts` |
| Notification dedupe/idempotency | `__tests__/notifications.test.ts:130-174` |
| Seed guard pattern | `scripts/seed-demo.ts:47-68`; `scripts/db-bootstrap.ts:41-56` |
| Images config env-driven | `next.config.ts:5-6,27-43` |
| Middleware matcher / edge safety | `middleware.ts:96-102`; `lib/supabase/middleware.ts:45-50` |
| Auth callback absolute URL | `app/auth/callback/route.ts:18,31,38` |
| Mi Argentina OIDC stub safety | `app/auth/miarg/callback/route.ts:28-33` |
| Public credential privacy tiers + rate limit | `app/(public)/p/[publicToken]/page.tsx:1-14,55-63` |
| DB pool serverless config | `db/index.ts:35-63` |
| Node version pinning | `.node-version`, `.nvmrc`, `package.json` engines field |
| Latest migration | `db/migrations/0117_govt_assignments_locality_canonical.sql` |
| Non-Drizzle SQL set present | `db/triggers.sql`, `db/rls.sql`, `db/welfare_rls.sql`, `db/organizations_rls.sql`, `db/storage.sql`, `db/welfare_storage.sql`, `db/cases_rls.sql`, `db/foster_rls.sql`, `db/scheduling_rls.sql` |
| RLS SSOT is migrations, not loose SQL | `scripts/db-bootstrap.ts:25-31` |
