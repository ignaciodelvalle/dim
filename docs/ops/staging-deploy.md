# Staging deploy — one command, never drift

A Vercel deploy ships **code only**. Database migrations are a **separate** step.
When code ships ahead of the database, the deployed app queries columns/tables
that do not exist yet and 500s at runtime (`errorMissingColumn`). This is exactly
what broke the public-credential page on staging (migration `0097` was committed
and deployed in code, but never applied to the staging DB).

The fix is structural: **migrate first, deploy second, in a single command.** If
the migration step fails — or `DATABASE_URL` is unset — the deploy never runs.

---

## Deploy staging

```powershell
# 1. Point DATABASE_URL at the staging Session pooler (port 5432, supports DDL).
#    Tell it apart: host = ...pooler.supabase.com, user = postgres.<ref>, port 5432.
$env:DATABASE_URL = "postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"

# 2. One command: applies pending migrations, then deploys. Aborts if migrate fails.
pnpm deploy:staging
```

`deploy:staging` = `pnpm verify && pnpm test:verified && tsx scripts/migrate.ts && npx vercel --prod --archive=tgz`.
Each `&&` is a gate: the migration only runs after the whole Definition of Done
(`verify` AND `test:verified`) is green, and `vercel` only runs if `migrate`
exits 0. `migrate` is a forward-only no-op when the DB is already up to date,
so it is safe to run on every deploy, including code-only changes.

> **`--archive=tgz` uploads the working tree, not a git ref** (finding C06-1,
> 2026-09-02). Treat this command as the hotfix / migration shape: the normal
> path for code is a push to `main`, which Vercel deploys from the pushed commit.
> Until 2026-09-18 the chain ran `verify` only, so the web vitest suite never
> gated a manual deploy; `test:verified` was added that day (pilot contract T0-5).

> Run it from the staging working tree (`chore/hobby-preview` — `develop` + the
> Hobby cron config). The Vercel project (`dim-staging`) **is git-connected** —
> verified 2026-09-02 via the Vercel API — so every push to `main` also
> auto-deploys code on its own. That auto-deploy ships code only, never
> migrations, so `pnpm deploy:staging` still matters: it is the only path that
> applies migrations, and it pairs that with its own manual, archived deploy
> (`--archive=tgz`, because the tree has too many files for the default upload)
> rather than relying on the git-triggered deploy to carry the schema forward.

---

## The gate, standalone

`pnpm db:migrate:check` reports applied-vs-pending and **exits 6 if anything is
pending** (unlike `db:migrate:status`, which always exits 0). Use it wherever you
want to fail a pipeline before code ships ahead of its database — e.g. the
production runbook applies migrations deliberately, then runs `db:migrate:check`
as a hard gate before the prod deploy command.

| Command                 | Prints status | Exit on pending | Applies migrations |
| ----------------------- | ------------- | --------------- | ------------------ |
| `db:migrate:status`     | yes           | 0 (no)          | no                 |
| `db:migrate:check`      | yes           | 6 (yes)         | no                 |
| `db:migrate`            | —             | —               | yes (forward-only) |
| `deploy:staging`        | —             | aborts deploy   | yes, then deploys  |

---

## Production

Production deploy stays deliberate (see `production-deploy-plan.md`):
apply migrations as a reviewed step, run `pnpm db:migrate:check` to confirm zero
pending, then deploy. Do **not** wire prod to auto-apply on deploy.
