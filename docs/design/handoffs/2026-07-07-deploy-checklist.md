# Deploy checklist — real-user demo (2026-07-07)

Steps only YOU can do (gated: prod Supabase, migrations against remote, Vercel env, deploy).
Ignacio runs these locally on Windows. Run top to bottom. Each `!`-prefixed line can be run in the Claude Code prompt so its output lands here.

> Prereqs already done by Claude: branch `integration/all-20260703` is green (tsc + full test suite + build), demo path verified headless, migrations written through **0134** (forward-only, in the DIM ledger). Includes the total-audit security fixes — **0132** welfare-moderation-escalation, **0133/0134** `handle_new_user` role-hardening (closes a CRITICAL self-mint-admin hole; see `docs/reviews/results/total-audit-synthesis.md`). Nothing below touches code — it's provisioning + deploy.

---

## 1. Fresh production Supabase project
1. supabase.com → New project (region closest to AR — `sa-east-1` São Paulo). Save the DB password.
2. From **Project Settings → Database**, copy two connection strings:
   - **Direct** (port 5432) — for migrations.
   - **Pooler / Transaction** (port 6543, `...pooler.supabase.com`) — for the app at runtime.
3. From **Project Settings → API**, copy: `Project URL`, `anon` key, `service_role` key.

## 2. Remote provision (the working sequence) — psql-free, the DIM runner NOT the Supabase MCP

> ⚠️ **Do NOT use `pnpm db:bootstrap` against a remote DB.** It shells out to `psql`, which connects to the LOCAL socket / 127.0.0.1 and ignores `DATABASE_URL` (and isn't installed on Windows). The numbered migrations are also NOT self-contained (0000 references `public.ownership_role` before it exists) — they assume `db:push` ran first. Use the remote-safe provisioner below.

`pnpm deploy:provision` (`scripts/deploy-provision.ts`) is the psql-free, idempotent equivalent of `db:bootstrap`. It uses **postgres.js only** (`client.unsafe(...)`), so `DATABASE_URL` is always honored. It refuses to run without the `--target remote` confirmation (destructive at every step) and is safe to re-run.

```
# From C:\dev\dim, using the SESSION pooler (5432) string — see the pooler note below.
# Export all three vars first (PowerShell: $env:DATABASE_URL="..." etc.):
#   DATABASE_URL              → SESSION pooler, port 5432
#   SUPABASE_URL              → the Project URL (aliased to NEXT_PUBLIC_SUPABASE_URL for the seeds)
#   SUPABASE_SERVICE_ROLE_KEY → the service_role key

DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
  pnpm deploy:provision --target remote

# Then reconcile the migration ledger (a correct no-op after provision baselines it):
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres" pnpm db:migrate
```

**Preview first:** add `--dry-run` to print the full plan without touching the DB. Flags: `--reference-only` (skip the `@dim.test` accounts — use for a real prod DB), `--no-seeds` / `--schema-only` (schema + SQL only).

### What the provisioner does (mirrors `db:bootstrap`, psql-free)
1. **`pnpm db:push`** — drizzle-kit builds enums + the ~46 tables from `schema.ts` (respects `DATABASE_URL`).
2. **Best-effort replay of `db/migrations/*.sql`** via postgres.js — lands the bits `schema.ts` can't express: SQL functions (e.g. `can_read_case()`, which the loose RLS files call), CHECK constraints, triggers. "already exists" errors are expected (step 1 built the columns) and tolerated per file.
3. **Apply the loose `db/*.sql`** via `client.unsafe`, best-effort per file, in order: `triggers.sql → storage.sql → welfare_storage.sql → exports_storage.sql → cases_rls.sql → foster_rls.sql → organizations_rls.sql → scheduling_rls.sql → welfare_rls.sql`. `db/rls.sql` is **deliberately excluded** (it needs `can_read_case()` and is superseded by the migration-tree RLS + per-domain files).
4. **Baseline `public._dim_migrations`** (`db:migrate:baseline`) so a later `pnpm db:migrate` is a correct no-op instead of re-applying 0000 onward against a populated schema.
5. **Seed reference data + accounts** — invokes `import-indec-localities`, `import-caba-barrios` and (unless `--reference-only`) `seed-test-users`, each launched through the server-only stub with `--allow-remote`:
   `node --import ./scripts/register-server-only-stub.mjs --import tsx <script> --allow-remote`

The reference imports now do **chunked multi-row inserts** (INDEC's ~4027 localities were previously ~4k SELECTs + ~4k INSERTs row-by-row — minutes over the pooler, and one run got killed mid-way). Seeding a fresh remote DB is now fast.

### Session vs transaction pooler (get this right or provisioning hangs/fails)
- **Provisioning + migrations use the SESSION pooler (port `5432`).** `db:push` and DDL (functions, triggers, `ALTER TYPE ... ADD VALUE`) need a real, sticky session — the transaction pooler recycles the connection per statement and breaks them.
- **The app at runtime uses the TRANSACTION pooler (port `6543`, `...pooler.supabase.com`)** — set as `DATABASE_URL` in Vercel (see §4). postgres.js runs with `prepare:false` precisely so it's compatible with the transaction pooler.
- **IPv4 / IPv6 caveat:** the *direct* connection (`db.<ref>.supabase.co:5432`) is **IPv6-only** unless you buy the IPv4 add-on. Most Windows/home networks are IPv4 — so prefer the **pooler** host (`aws-0-<region>.pooler.supabase.com`, which is IPv4-reachable) for both the SESSION (5432) provisioning string and the TRANSACTION (6543) runtime string. If a direct `db.<ref>...` URL times out with `ENETUNREACH`/no route, that's the IPv6 issue — switch to the pooler host.

Expect: `db:migrate` reports every migration already applied (baselined) and exits 0. If it reports a checksum mismatch or a gap, STOP and tell Claude — do NOT force it.

> Do NOT use the Supabase dashboard SQL editor or the MCP `apply_migration` for these — they bypass the DIM ledger and desync the runner.

## 2b. Provision Storage buckets (dashboard → Storage)
The app writes files to these buckets — create each with the right visibility, or those flows 500 on the real deploy:
- **`pet-photos`**, **`org-logos`** — PUBLIC (read). Pet photos are re-encoded through sharp on upload (audit hardening), so only validated raster images land here.
- **`event-attachments`**, **`welfare-evidence`** — PRIVATE (served via 1h signed URLs). Legal/PII evidence — must NOT be public.
- The **MPF / PDF export** path needs its bucket present too — if `/gob/maltrato` "Exportar MPF" 500s post-deploy, a missing bucket is the cause (it fails silently on local, where Storage isn't provisioned).

## 3. Supabase Auth hardening (dashboard → Authentication)
- **Rate limits** (Auth → Rate Limits): keep/lower the sign-in + sign-up + OTP limits to sane values (defaults are fine for a demo).
- **CAPTCHA** (Auth → Settings → Bot & Abuse Protection): enable hCaptcha or Cloudflare Turnstile; paste the secret. (Protects signup/login from the enumeration+flood surface.)
- **Leaked-password protection** (Auth → Settings → Password): turn ON "Prevent use of compromised passwords" (this is the one MED Claude could not close in code — it's a dashboard toggle).
- **Email confirmations** (Auth → Settings): ⚠️ **DO NOT enable "Confirm email" yet.** It would close the residual signup session-cookie oracle, BUT the current two-step onboarding assumes a live session after step 1 — with confirmations ON, step 2 dead-ends and the user loses their typed name/DNI (audit finding, task #65). Leave OFF until the onboarding flow is reworked. The code-side enumeration (string-branch) is already fixed; app-layer rate limiting on signup is already shipped.

## 4. Vercel — project + env vars
Env vars (Vercel → Project → Settings → Environment Variables), Production scope:
| Var | Value |
|---|---|
| `DATABASE_URL` | the **TRANSACTION pooler** (6543) string — all OLTP traffic |
| `ANALYTICS_DATABASE_URL` | the **SESSION pooler** (5432, `...pooler.supabase.com` — same host as the §2 provisioning string) — heavy analytics reads only (panorama + dashboard fetchers). Unset → falls back to `DATABASE_URL` (app works, but admin panorama KPIs will always exceed their budget and render degraded — see the pooler note) |
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `CRON_ALERT_WEBHOOK` | a Slack/Discord webhook URL (the cron fleet 500s + alerts here — Wave F2) |
| _(any others the current build reads)_ | cross-check `.env.example` / `.env.local` for the full set before deploy |

> Cross-check the full var list against your local `.env.local` — anything the app reads at build/runtime must be set in Vercel or the build fails.

> ⚠️ **DUAL-POOL SPLIT (task #74 + follow-up, measured on staging). `DATABASE_URL` = TRANSACTION pooler (6543); `ANALYTICS_DATABASE_URL` = SESSION pooler (5432). Both are load-bearing — here's why each mode is right for its traffic and wrong for the other:**
> - **OLTP on the transaction pooler (6543).** Serverless is many short-lived lambdas; transaction mode hands a backend to a query only for the duration of that statement/transaction, then returns it — N concurrent lambdas share a small pool of backends. That is the ONLY mode a Supabase micro instance survives under wide concurrency. Putting ALL traffic on the session pooler was confirmed WORSE live: each lambda pins a backend for the connection lifetime, warm concurrency exhausts the backend limit, and the death spiral returns.
> - **Analytics on the session pooler (5432).** MEASURED: the panorama KPI fan-out (universal scope, 3y — ~11 aggregate statements) takes **~1.7s through the session pooler but >180s through the transaction pooler on the same freshly-restarted DB** — a >100x supavisor transaction-mode pathology for many-statement analytics reads. `db/index.ts` exports a separate `analyticsDb` pool for exactly these paths (panorama repository + the dashboard fetchers), with a tiny `max` (3) and a 10s `idle_timeout` so it releases session backends fast. Only read-only analytics ride it — never writes.
> - **statement_timeout, measured reality:** supavisor **transaction mode (6543) does NOT apply libpq startup `options`** — `show statement_timeout` through 6543 returns the server default (the 15s never lands). **Session mode (5432) DOES honor startup GUCs**, and direct/local connections do too (verified: over-budget query cancelled with SQLSTATE `57014`). So the runaway-query backstop is real on the analytics pool and on local dev; on the OLTP pool the protection is the app-level `withDbBudget` + small pool + short idle/lifetime timeouts.
> - If `ANALYTICS_DATABASE_URL` is unset the app still runs (falls back to `DATABASE_URL`), but admin panorama hits the >100x pathology and permanently renders the degraded KPI state — set it.

## 5. Deploy
- Connect the repo, set the production branch to `integration/all-20260703` (or merge it to `main` first if you prefer `main` as the deploy branch).
- Framework: Next.js (auto). Build command default. Node 24.
- Deploy. Watch the build log — if it fails on a missing env var, add it and redeploy.

> **Crons need Vercel Pro.** The Hobby (free) plan caps `vercel.json` cron jobs at **once per day** and will reject a sub-daily schedule at deploy time. The DIM cron fleet (reminder fanout, ENO processing, rabies-observation close, slot materialization, etc.) runs more frequently than daily, so the project needs **Vercel Pro** for the crons to schedule. On Hobby the app still deploys and serves — only the scheduled jobs won't fire at their intended cadence.

## 6. Post-deploy smoke (do before handing the URL to the real user)
- `/` loads; `/login` → log in as a seeded account (or create a real one).
- Open a pet → the **credential mounts + flips + QR** (the flagship). Scan the QR with a phone → the public `/p/<code>` page resolves.
- `/perdidas`, `/adoptar` load. `/gob` panel loads for a govt account.
- Sign up a brand-new real account end-to-end (the user's own path).
- **Security spot-check (the CRITICAL fix):** the new signup above must land as an **owner**, never admin/govt. If you want to be thorough, confirm a raw `supabase.auth.signUp({ options:{ data:{ user_role:'admin' }}})` still yields role `owner` on the deployed DB — the trigger ignores all request metadata (migrations 0133/0134). No account can self-mint a privileged role; elevation is service-role-only.

## 7. Re-run the cloud review (optional independent pass)
```
/code-review ultra
```
Run the no-arg form (it bundles the local branch — no base needed). The backlog-clearing marathon + total audit added ~30 commits since the last base `e50d38a7`, so a base-pinned diff would be huge. Claude ran its OWN multi-agent adversarial audit this session (findings + fixes in `docs/reviews/results/total-audit-synthesis.md` — it found and closed a CRITICAL self-mint-admin hole and its whole sibling class), so the billed cloud review is a confirmation pass, not the primary gate. Run it if you want the independent set of eyes before the real user.

---

## If anything is red
Tell Claude the exact error. The branch is green locally; a deploy failure is almost always a missing env var or the pooler-vs-direct URL swapped (migrations = direct 5432, runtime = pooler 6543).
