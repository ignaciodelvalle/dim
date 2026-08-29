# Production deploy plan — DIM / MiMAR

The production cutover procedure. Referenced by `docs/ops/staging-deploy.md`
("Production deploy stays deliberate"). Based on the 2026-07-04 deploy-readiness
audit (`docs/design/handoffs/2026-07-04-vercel-deploy-readiness.md`) — read that
document for full evidence and rationale; this file is the ordered runbook.

**Every step below is human-gated.** No agent applies migrations, sets Vercel
env vars, or runs anything against the production Supabase project or the
production Vercel deployment. This document is written for the operator
(Ignacio) to execute manually.

---

## 0. Before you start

- [ ] B1 (DNI pepper fail-closed) and B2 (cron `maxDuration`) are already fixed
      in code (`lib/utils/dni-hash.ts`, `vercel.json` — commit `d5105ee6`). No
      action needed here beyond setting the real `DNI_HASH_PEPPER` value below.
- [ ] Decide the Vercel **deploy mode** first (§2 step 1) — it changes the shape
      of every step after it.
- [ ] Confirm the production domain is known (DNS + Vercel project ready). Several
      steps below are blocked until it exists.

---

## 1. Supabase production setup (ordered)

This project already has a tested bootstrap runbook —
`docs/ops/remote-supabase-bootstrap-runbook.md` (last executed 2026-06-14
against staging). Follow it in full for the mechanical steps; this section adds
the production-specific ones (org-logos bucket, first admin account) and the
overall order.

1. **Prerequisites**: working `psql` on the bootstrap host; **stop any local
   Supabase Docker stack** (`docker ps --filter "name=supabase_"` must print
   nothing — otherwise the bootstrap silently targets the local container);
   `.env.local` `DATABASE_URL` pointed at the production project's **Session
   pooler** (port 5432, not Direct/IPv6-only, not the Transaction pooler port
   6543 — see §4 below for why this distinction matters).
2. Run `pnpm db:bootstrap --no-seeds --allow-remote` (schema push → migration
   replay → baseline → `triggers.sql`/`storage.sql`/`welfare_storage.sql`,
   strict). Do **not** run the standalone `db/*_rls.sql` files (`rls.sql`,
   `cases_rls.sql`, `foster_rls.sql`, `organizations_rls.sql`,
   `scheduling_rls.sql`, `welfare_rls.sql`) — RLS is sourced from the migration
   tree (`db/migrations/0086_track_rls_in_migrations.sql` onward); those loose
   files are reference-only and applying them risks duplicate/conflicting
   policies.
3. Confirm zero pending migrations: `pnpm db:migrate:status` (expect
   Pending = 0 — latest migration on this branch is
   `0117_govt_assignments_locality_canonical.sql`; recount at execution time,
   more may have landed since).
4. Seed reference data:
   ```powershell
   node --env-file=.env.local --import tsx scripts/import-indec-localities.ts
   node --env-file=.env.local --import tsx scripts/import-caba-barrios.ts
   ```
   Plain `pnpm tsx` fails — these scripts don't auto-load `.env.local`.
5. **Storage buckets (W2)** — `db/storage.sql` and `db/welfare_storage.sql`
   (applied in step 2) create `pet-photos` (public), `event-attachments`, and
   `welfare-evidence`. Four buckets have **no SQL/migration coverage**
   (`lib/infra/storage.ts:20-25` reads `org-logos` directly; the bootstrap
   script does not create any of these four) and must be created manually in
   the Supabase Studio SQL editor:
   ```sql
   insert into storage.buckets (id, name, public) values
     ('avatars','avatars',false),
     ('org-logos','org-logos',true),
     ('welfare-exports','welfare-exports',false),
     ('ppp-exports','ppp-exports',false)
   on conflict (id) do nothing;
   ```
   `org-logos` is **public** (read) — it backs `orgLogoUrl()` in
   `lib/infra/storage.ts`, used by the public refugio profile page. Confirm
   `seed-photos` does **not** exist as a bucket in production (it's a
   local/demo-only artifact; its presence signals a seed script ran against
   this project by mistake).
6. **Auth config** (Studio → Authentication → URL Configuration/Providers,
   manual, no MCP/API tool): set `site_url` to the production domain, add
   `additional_redirect_urls` for any Vercel preview wildcard, keep email
   confirmations off until SMTP lands, anonymous sign-ins off. Blocked until
   the production domain (Vercel + DNS) exists.
7. Set `DNI_HASH_PEPPER` to a freshly generated secret (never the
   `dim-test-pepper-v1` dev value) in whatever secret store feeds the Vercel
   production environment. Required — production now **fails to boot the
   identity path** without it (B1 fix, `lib/utils/dni-hash.ts`).
8. Run the acceptance query from the bootstrap runbook (`migrations`/
   `functions`/`triggers`/`rls_policies`/`buckets`/`localities` counts), then
   Supabase Studio → Advisors (or MCP `get_advisors`) once, to capture the
   project's baseline security/perf posture before go-live.
9. **First admin account (W6)** — there is no scripted path for this and there
   should not be one: creating the first production administrator by running
   a script against a fresh project is a bigger blast-radius mistake than a
   five-minute manual step. Procedure, derived from how
   `scripts/seed-test-users.ts`'s `bootstrapAdmin()` does it in the test/seed
   path (do **not** run that script against production — it hard-blocks on
   `NODE_ENV=production` and is guarded local-only by design):
   1. Have the operator sign up through the **normal** `/signup` flow on the
      live production domain, with their real email. This fires the same
      `handle_new_user` trigger as every other signup and creates a
      `profiles` row with `role='owner'`, `account_type='personal'`.
   2. In the Supabase Studio SQL editor (service-role context), promote that
      one profile:
      ```sql
      update profiles
      set role = 'admin', account_type = 'institutional', updated_at = now()
      where id = '<the new user''s auth.users.id>';
      ```
      Find the id via Studio → Authentication → Users, or
      `select id from auth.users where email = '<email>';`.
   3. From here on, do **not** repeat this manual SQL step for additional
      `admin`/`govt` accounts. Once one admin exists, use the in-app
      institutional-account flow (`createInstitutionalAccountForAuthority`,
      wired through `app/actions/admin-institutional.ts`, gated by
      `requireAdminOrRedirect`) to create every subsequent `admin`/`govt`
      account through the UI. The manual SQL flip is a **one-time bootstrap**,
      not a recurring ops task.
10. This entire section is **human-gated** per project convention — do not let
    an agent apply migrations or run this runbook against the production
    project unsupervised.

---

## 2. Vercel production setup (ordered)

1. **Confirm the deploy mode first** — this changes the shape of every step
   after it. `docs/ops/staging-deploy.md` documents that the **staging**
   Vercel project is explicitly **not git-connected** and is deployed via
   `npx vercel --prod --archive=tgz` from a specific local working tree.
   Decide, and record the decision here once made:
   - **Option A — manual CLI archive** (same model as staging): deploys are
     an explicit `pnpm deploy:staging`-style command run from a known working
     tree. Nothing auto-deploys on push.
   - **Option B — standard GitHub integration**: Vercel auto-deploys on
     merge to a designated branch. If chosen, migrations must still not
     auto-apply (see step 5) — the git-integration deploy hook must not run
     `db:migrate`.
   Either is workable; what breaks things is leaving it undecided and
   discovering the answer during an incident.
2. **Environment Variables → Production** — set explicitly, do not rely on
   defaults or on values copied from `.env.local`:

   | Variable | Value | Why |
   |---|---|---|
   | `DATABASE_URL` | **Transaction pooler** string (`...pooler.supabase.com:6543`) | App runtime — see §4 pooler distinction below. **Not** the Session pooler URL used for migrations. |
   | `NEXT_PUBLIC_SUPABASE_URL` | production project URL | required |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key | required |
   | `SUPABASE_SERVICE_ROLE_KEY` | production service-role key | required |
   | `CRON_SECRET` | a real secret | **required** — every cron 401s in production without it (`lib/domain/cron-auth.ts:28-37` fails closed) |
   | `DNI_HASH_PEPPER` | a real secret, never `dim-test-pepper-v1` | **required** — production throws on boot of the identity path without it (B1) |
   | `NEXT_PUBLIC_SITE_URL` | the real production domain, e.g. `https://www.mimar.gob.ar` | **required** — see "Site URL consistency" below (W5) |
   | `NEXT_PUBLIC_DEMO_MODE` | **absent, or explicitly `false`** | closes B3 — verify in the dashboard **before** the next production build, not after; `NEXT_PUBLIC_*` vars bake into the JS bundle at build time, a post-deploy env change will not un-ship an already-built banner |
   | `APPLY_INTENT_SECRET`, `TATTOO_ACK_SECRET`, `MICROCHIP_FORCE_SECRET` | optional | all three fall back safely to `SUPABASE_SERVICE_ROLE_KEY`; set for isolation if desired. `APPLY_INTENT_SECRET`'s fallback now also fails closed in production if `SUPABASE_SERVICE_ROLE_KEY` is unset too (W1 fix) |
   | `RESEND_API_KEY` | if email is enabled | optional |
   | `MIARG_OIDC_*` | leave unset | the callback route 404s safely until Mi Argentina OIDC ships (Item 25b) |

3. **`maxDuration` (B2)** — already closed in code: `vercel.json` has a
   `functions` block scoping `app/api/cron/*/route.ts` to `maxDuration: 60`
   (commit `d5105ee6`). Confirm the actual Vercel plan tier (Hobby caps at 60s
   regardless of config on some tiers; Pro allows up to 300s) supports this
   before the first production cron run, and re-check
   `reconcile-pet-status/route.ts`'s internal `MAX_DURATION_MS` (currently 45s)
   still leaves adequate margin under whatever ceiling the plan actually grants.
4. Confirm Node.js version in Project Settings matches `.node-version`
   (22.23.2) and stays inside `engines.node` (`>=22.23.0 <23`). Both ends bite:
   below the floor the `seed:*` loader, the mobile config read and the PDF
   decoder break at three different versions, and 23+ breaks the suite's jsdom
   storage. `pnpm lint:node-version` checks it, and CONTRIBUTING.md has the
   per-version table.
5. Trigger the deploy per whatever model step 1 confirmed. For production,
   apply migrations as a **separate, reviewed** step, then run
   `pnpm db:migrate:check` (exits 6 if anything is pending) as a hard gate
   before the deploy command — do not wire production to auto-apply
   migrations on deploy, unlike `deploy:staging`'s combined migrate-then-deploy
   convenience.
6. Confirm the `vercel.json` cron schedules are picked up (Vercel dashboard →
   Cron Jobs tab should list all 21 entries after the first successful
   deploy).
7. Confirm Supabase Auth → URL Configuration `site_url`/redirect URLs
   (§1 step 6) point at the live Vercel production domain, not a preview URL.

---

## 3. Site URL consistency (W5)

`NEXT_PUBLIC_SITE_URL` is the single source of truth for the app's public
origin. In production, always set the env var explicitly so the fallback is
never exercised.

**Reconciled 2026-07-15**: the previously-divergent per-file fallbacks
(`www.mimar.gob.ar` vs `mimar.gob.ar` vs `mimar.ar`) are unified. Every
public-origin call site now routes through the single resolver
`lib/infra/site-url.ts` (`resolveSiteUrl()`): it trims the env var, strips
trailing slashes, and falls back to ONE canonical default `https://mimar.ar`
when unset OR set-but-empty (the empty-string case is what caused the earlier
unscannable-QR bug — the resolver's unit test pins it). Interim canonical is
`mimar.ar`; the real prod origin (`www.mimar.gob.ar`, pending `.gob.ar`
delegation) is set explicitly via `NEXT_PUBLIC_SITE_URL` in Vercel, so the
fallback only ever fires in local/preview.

Three readers are intentionally NOT routed through the resolver and keep their
own fallbacks by design:
- `app/sitemap.ts` — fails loud in production if unset (`NODE_ENV=production`
  **and** `VERCEL` both set) rather than guessing a domain for search engines;
  falls back to `http://localhost:3000` outside production.
- `app/layout.tsx` metadataBase and `components/pet-profile/LostCaseBlock.tsx`
  — fall back to `http://localhost:3000` (never advertise a guessed prod
  origin from a metadata/share surface).
- `src/modules/auth/application/password-reset/request-password-reset.ts` —
  falls back to `http://localhost:<PORT>` (correct for local).

Treat "`NEXT_PUBLIC_SITE_URL` set in Vercel Production" as a hard pre-build
gate (§2 step 2) regardless: the canonical fallback keeps unset behavior
consistent (no wrong-domain divergence), but the real prod domain must still
be set explicitly.

---

## 4. Pooler distinction — migrations vs. app runtime (W4)

Two different Supabase connection strings are needed, pointed at two different
pgbouncer pooler modes, and conflating them causes different failures for
each:

| Use | Pooler mode | Port | Who runs it |
|---|---|---|---|
| `pnpm db:push`, `pnpm db:migrate` (DDL) | **Session pooler** | 5432 | a human operator, ad hoc, from their own machine |
| Vercel app runtime (`DATABASE_URL` in Production env vars) | **Transaction pooler** | 6543 | the deployed app, every request |

`db/index.ts:52` sets `prepare: false` on the postgres-js client — required
for Transaction-mode pgbouncer compatibility (statement caching doesn't
survive across pooled connections in transaction mode), and correct for a
high-concurrency serverless app runtime. It is **wrong** for DDL: using the
Session pooler URL for the app's production runtime risks exhausting the
pooler's smaller session-slot budget under concurrent lambda invocations, and
using the Transaction pooler for `db:push`/migrations breaks DDL (session
pooling is what DDL needs).

**Action**: confirm the Vercel Production `DATABASE_URL` env var is explicitly
the Transaction pooler string (`:6543`), kept separate from whatever Session
pooler URL (`:5432`) is used ad hoc for `pnpm db:migrate`. Do not reuse one
`.env.local` value for both purposes.

---

## 5. Post-deploy smoke checklist

Run against the production domain immediately after cutover:

1. `GET /` — landing page renders, no demo banner visible anywhere in the HTML
   (grep the response for "Entorno de demostración" — must be absent; confirms
   B3 closed). PO interview 2026-07-23, item 1: the banner is now mounted on
   EVERY shell (public/citizen/operator), not just /admin — re-check this on
   at least one page per shell, not only the landing page.
2. `GET /p/{a-known-active-publicToken}` — public credential page renders
   Tier 0 view, no owner PII/microchip/medical fields present in the response
   HTML.
3. `GET /adoptar` and `GET /perdidas` — public listings render.
4. `GET /sitemap.xml` — confirm URLs use the real production domain, not a
   fallback (checks W5; the route now throws instead of silently emitting a
   wrong domain, so a broken sitemap here means `NEXT_PUBLIC_SITE_URL` truly
   isn't set — check env vars, not the code).
5. Sign up a throwaway account through `/signup` → confirm `/auth/callback`
   redirects correctly to the role-based landing (exercises
   `app/auth/callback/route.ts`'s origin-derivation logic against the real
   domain).
6. `GET /admin` (as an authenticated admin/government test account) — confirm
   no demo banner, confirm `/admin/panorama` loads (both read
   `NEXT_PUBLIC_DEMO_MODE`).
7. Manually trigger one lightweight cron with the real `CRON_SECRET`:
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/cron-health
   ```
   Expect `{ ok: true, ... }` — confirms cron auth + DB connectivity
   end-to-end.
8. Manually trigger `reconcile-pet-status` the same way and check the response
   `durationMs` plus the Vercel function's actual wall-clock time in the
   dashboard — confirms whether the `maxDuration: 60` fix (B2) is sufficient
   at real data volume.
9. Upload a pet photo through the normal owner flow → confirm the resulting
   image loads from the `*.supabase.co` public storage URL (exercises
   `next.config.ts` `images.remotePatterns` against the real project, not
   local Supabase).
10. Check Vercel function logs for any `[cron-auth]` warning lines — their
    presence in production would mean `CRON_SECRET` is unset (should never
    appear post-cutover).

---

## 6. Related docs

- `docs/ops/staging-deploy.md` — staging deploy (migrate-then-deploy gate).
- `docs/ops/remote-supabase-bootstrap-runbook.md` — the tested, detailed
  bootstrap procedure this plan's §1 summarizes; follow it for the mechanical
  steps and their gotchas (local Docker stack collision, IPv4-only pooler,
  `psql` on PATH, etc).
- `docs/design/handoffs/2026-07-04-vercel-deploy-readiness.md` — the audit
  this plan is derived from; full evidence, file:line citations, and the B1–B3
  blocker / W1–W6 warning writeups.
