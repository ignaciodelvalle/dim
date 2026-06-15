# Remote Supabase Bootstrap Runbook (staging / prod)

Tested procedure for standing up a **fresh remote Supabase environment** (Supabase
Cloud). This supersedes the one-line command in
`production-deploy-plan-2026-06.md` §1.2, which omits three prerequisites that
make the bootstrap silently target the wrong database or fail mid-run.

> First executed: 2026-06-14, staging (project `DIM`, ref `mardurkdicugnzmpirjd`,
> region `sa-east-1`). Result: 95 migrations, 44 functions, 7 triggers,
> 64 RLS policies, 7 buckets, 4075 localities.

---

## Prerequisites (all three are mandatory)

### 1. A working `psql` client on the host

`scripts/db-bootstrap.ts` replays migrations (step 2) and the orthogonal SQL
(step 3, strict) **through `psql`**, not through the JS driver. Steps 1
(`db:push`) and 2.5 (`baseline`) use postgres-js and need no `psql`.

Windows (no admin):

```powershell
scoop install postgresql        # winget was unreliable mid-download
```

The scoop package creates **no shim** — `psql.exe` lives at
`~\scoop\apps\postgresql\current\bin\`. Prepend that to `PATH` in the same shell
that runs the bootstrap so the child `node` process can find it:

```powershell
$env:PATH = "$env:USERPROFILE\scoop\apps\postgresql\current\bin;$env:PATH"
```

### 2. NO local Supabase stack running  ← the silent killer

`findPostgresContainer()` matches **any** container named `supabase_db_*`. If a
local `supabase start` stack is up, the bootstrap runs `psql` via
`docker exec` **into that local container** (it passes only `-U`, no `-h`),
hitting the container's unix socket with peer auth:

```
psql: error: connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed:
FATAL: Peer authentication failed for user "postgres.<ref>"
```

The schema (`db:push`) lands on the remote correctly, but the replay and
orthogonal SQL hit the **local** DB — leaving the remote with tables but **no
functions/triggers/RLS**, while `baseline` falsely marks all migrations applied.

Stop the local stack first and confirm:

```powershell
docker ps --filter "name=supabase_" --format "{{.Names}}" | ForEach-Object { docker stop $_ }
docker ps --filter "name=supabase_db_" --format "{{.Names}}"   # must print nothing
```

(Restore local dev later with `supabase start`.)

### 3. `.env.local` `DATABASE_URL` = **Session pooler** URL (not Direct)

The Direct host `db.<ref>.supabase.co` is **IPv6-only** (AAAA record, no A). On an
IPv4 network `db:push` times out at "Pulling schema from database". Use the
**Session pooler** (IPv4, port 5432, supports DDL):

```ini
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
```

Tell it apart from the wrong ones:
- host = `...pooler.supabase.com` (NOT `db.<ref>.supabase.co`)
- user = `postgres.<ref>` (NOT bare `postgres`)
- port = `5432` (Session). **Not 6543** (Transaction pooler — breaks `db:push`).

---

## Procedure

### 0. (Re-provision only) reset the public schema

For a clean slate on a non-empty DB with **no data** to keep. Run in Studio SQL
editor or via `psql`:

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
```

> Gotcha: the Supabase MCP `execute_sql` wraps the batch in a transaction — a
> trailing `SELECT` that errors rolls back the whole reset. Keep reset batches
> free of failing statements.

### 1. Bootstrap (schema + migrations + triggers + RLS + storage)

```powershell
$env:PATH = "$env:USERPROFILE\scoop\apps\postgresql\current\bin;$env:PATH"
pnpm db:bootstrap --no-seeds --allow-remote
```

Expected: Step 1 push → Step 2 `Migrations replayed: 95/95 exit-zero` (individual
`already exists` errors are tolerated by `ON_ERROR_ROLLBACK`) → Step 2.5 baseline
→ Step 3 orthogonal STRICT → `--no-seeds: stopping after step 3`. This is the
same state the CI fresh-bootstrap produces.

### 2. Confirm migration state

```powershell
pnpm db:migrate:status     # Applied = N, Pending = 0
```

### 3. Reference data (skipped by `--no-seeds`)

Plain `pnpm tsx` fails with `DATABASE_URL is not set` — `scripts/import-*.ts`
import `db/index.ts`, which reads `process.env` but does **not** load
`.env.local`. Pass it explicitly:

```powershell
node --env-file=.env.local --import tsx scripts/import-indec-localities.ts
node --env-file=.env.local --import tsx scripts/import-caba-barrios.ts
```

Expected: ~4027 INDEC localities + 48 CABA barrios ≈ **4075** rows in
`ar_localities`.

### 4. Storage buckets

`db/storage.sql` + `db/welfare_storage.sql` create `pet-photos` (public),
`event-attachments`, `welfare-evidence`. Create the four remaining ones (Studio,
or SQL below). `seed-photos` must NOT exist in a real env.

```sql
insert into storage.buckets (id, name, public) values
  ('avatars','avatars',false),
  ('org-logos','org-logos',true),
  ('welfare-exports','welfare-exports',false),
  ('ppp-exports','ppp-exports',false)
on conflict (id) do nothing;
```

### 5. Auth config (Studio — manual, no MCP/API tool)

Authentication → URL Configuration / Providers: `site_url` = the env's domain,
`additional_redirect_urls` (Vercel preview wildcard for staging), email
confirmations **off** until SMTP lands (plan D6), anonymous sign-ins **off**.
**Blocked until the env has a domain** (Vercel + DNS) — defer accordingly.

---

## Acceptance verification (run via MCP `execute_sql` or `psql`)

```sql
select
  (select count(*) from public._dim_migrations)                 as migrations,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public')                                  as functions,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and not t.tgisinternal)           as triggers,
  (select count(*) from pg_policies where schemaname='public')  as rls_policies,
  (select count(*) from storage.buckets)                        as buckets,
  (select count(*) from public.ar_localities)                   as localities;
```

Then run the security + performance advisors (Supabase Studio → Advisors, or MCP
`get_advisors`) once after bootstrap. The findings are the project's inherent
posture (identical to CI); see the plan's risk register for the pre-prod
hardening items.

---

## Gotcha checklist (in failure-frequency order)

1. Local `supabase` stack running → `psql` hijacked via `docker exec`. **Stop it.**
2. Direct (IPv6) `DATABASE_URL` → `db:push` connection timeout. **Use Session pooler.**
3. `psql` not on PATH → step 2/3 fail. **Prepend scoop bin in the same shell.**
4. Reference-data scripts → `DATABASE_URL is not set`. **Use `node --env-file=.env.local --import tsx`.**
5. MCP `execute_sql` rolls back batches on a trailing error. **Keep DDL batches clean.**
