# Production Migration Contract

## Rule: prod uses `db:migrate`, never `db:push`

| Command | What it does | When to use |
|---|---|---|
| `pnpm db:generate` | Generates a new versioned `.sql` file from schema diff | After editing `db/schema.ts` |
| `pnpm db:migrate` | Applies versioned migration files in order (safe) | Deploy time — prod and staging |
| `pnpm db:push` | Diffs schema and applies directly — **can DROP columns** | CI ephemeral DB only |

`db:push` is for throwaway databases only. It will infer destructive changes
(column drops, type changes) without asking. It must never run against a
database that holds real data.

## Versioned migration files

Migrations live in `db/migrations/` and are numbered sequentially
(`0000_`, `0001_`, …). Drizzle applies them in order and tracks applied
migrations in the `drizzle.__drizzle_migrations` table.

Generating a migration:

```bash
pnpm db:generate
# Review the generated .sql file before committing.
# Destructive statements (DROP COLUMN, DROP TABLE) require manual sign-off.
```

The CI `migration-presence` job will fail if `db/schema.ts` is modified in a
PR without a corresponding new migration file. See the escape hatch in that
job if the change is comment-only.

## Deploy contract (current: Vercel + Supabase)

Vercel has no built-in pre-deploy hook that can run arbitrary shell commands
with production credentials. Until a dedicated deploy pipeline exists, the
process is:

### Gated manual migration (current approved process)

1. PR is merged to `main`.
2. Before the Vercel deploy finishes (or immediately after, for additive-only
   migrations), a team member with production `DATABASE_URL` access runs:

   ```bash
   DATABASE_URL=<prod-url> pnpm db:migrate
   ```

   The prod `DATABASE_URL` is available as a Vercel environment variable and
   in the shared secrets store — never commit it.

3. Verify the new migration row landed by inspecting the tracking table
   directly (note: `pnpm db:status` shows the local Supabase stack, NOT
   migration history):

   ```bash
   psql "$DATABASE_URL" -c \
     'select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5;'
   ```

4. Mark the deploy as complete in the release checklist.

### Recommended next step: GitHub Actions deploy job

Add a `deploy` job to a separate `deploy.yml` workflow triggered on push to
`main` after CI passes. The job should:

```yaml
- name: Apply migrations
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
```

This makes migrations atomic with the deploy, auditable via GitHub Actions
logs, and requires `PROD_DATABASE_URL` to be set as a repository secret —
which doubles as an access-control gate (only repo admins can trigger it).

Add `PROD_DATABASE_URL` to GitHub → Settings → Secrets → Actions before
wiring the job.

## Advisory allowlist pattern (dep-audit job)

`pnpm audit` has no native per-advisory ignore. If a HIGH advisory cannot be
patched immediately:

1. Run `pnpm audit --json` and capture the advisory ID and title.
2. Document it in this file under the table below with a patch deadline.
3. Add the `ci:skip-audit` label to the PR **or** include `[skip-audit]` in
   the HEAD commit message to unblock CI temporarily.
4. Create a follow-up issue and link it here.

| Advisory ID | Package | Severity | Patched in | Deadline | Issue |
|---|---|---|---|---|---|
| *(none)* | | | | | |

Triage one-liner (shows all HIGH/CRITICAL advisory details as JSON):

```bash
pnpm audit --json | jq '.advisories | to_entries[] | select(.value.severity == "high" or .value.severity == "critical") | .value | {id: .id, title: .title, module_name: .module_name, patched_versions: .patched_versions}'
```
