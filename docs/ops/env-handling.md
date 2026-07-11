# Environment handling — `.env.local`, Vercel, and the DNI pepper

How local and deployed environment variables are sourced, why `.env.local` is
**generated, not hand-authored**, and what happens if `DNI_HASH_PEPPER` ever
changes. Read this before editing any env file.

Quick check after any env change:

```bash
pnpm env:doctor
```

It reads the **raw** `.env.local`, reports missing/empty required keys and
duplicate definitions, and **never prints a value** (safe to paste anywhere).
It is intentionally NOT part of `pnpm verify` — it inspects a machine-local,
gitignored file, so it would be meaningless in CI.

---

## The two env files

| File | Points at | Who writes it | Committed? |
|---|---|---|---|
| `.env.local` | the **local** Supabase Docker stack (`127.0.0.1:54322`) | you, from `.env.local.example` | no (gitignored) |
| `.env.vercel` | the **remote** Vercel project (staging/prod values) | `vercel env pull` only | no (gitignored via `.env*`) |

Keep them **separate**. `.env.local` is what `pnpm dev`, the migrate runner,
the seeds, and the test suite read. `.env.vercel` is a read-only *snapshot* of
the platform config you pull when you need to see or compare what production
actually has set — it is never the file the app reads locally.

### Required keys (mirrors `lib/infra/env.ts`)

Always required (the app fails closed at boot without them — `parseEnv()` in
`lib/infra/env.ts`, wired via `instrumentation.ts`):

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Prod-only (documented dev fallbacks exist, so **absent is fine locally** — but
an explicit empty string is a footgun, see below):

- `NEXT_PUBLIC_SITE_URL` · `CRON_SECRET` · `DNI_HASH_PEPPER`

---

## The rule: never hand-edit `.env.local` into a broken state

`.env.local` is a small file, so it feels safe to poke at by hand. It is not.
Two silent failure modes bite:

1. **Duplicate keys.** `dotenv` keeps the **last** occurrence of a key and
   silently ignores the earlier ones. If `DATABASE_URL` appears twice, editing
   the first line changes nothing and you chase a ghost for an hour. `env:doctor`
   flags this; `dotenv` (and therefore the app) never will.
2. **Empty values.** An empty required key throws at boot with a clear message.
   An empty *prod-only* key does **not** throw — it is treated as set-to-empty,
   which is **not** the same as unset. The classic case: an empty
   `NEXT_PUBLIC_SITE_URL` makes the hero QR encode a **relative** URL that no
   phone camera can resolve.

**Preferred workflows instead of hand-editing:**

- Fresh local setup → copy the template and fill it in once:
  ```bash
  cp .env.local.example .env.local
  # then set the four required keys from `supabase status` output
  ```
- Need the platform's current values (to compare, or to run against remote) →
  pull them into the **separate** file, never over `.env.local`:
  ```bash
  vercel env pull .env.vercel
  ```
- After **any** change to `.env.local`:
  ```bash
  pnpm env:doctor
  ```

---

## `DNI_HASH_PEPPER` — recovery and rotation

### What the pepper is

Per the *No DNI in plaintext* invariant (Ley 25.326 / Mi Argentina premise),
DNIs are never stored in cleartext. Migration `0106` replaced the column with:

- `dni_hash` = `HMAC-SHA256(dni, DNI_HASH_PEPPER)` — equality matching only
- `dni_last4` = last 4 digits — human disambiguation in operator UI only

The pepper is a server-side secret (`lib/utils/dni-hash.ts`). The Argentine DNI
space is small (7–8 digits), so a **known** pepper makes every stored hash
reversible by rainbow table — which is why:

- The public **dev/test** pepper is `dim-test-pepper-v1` (fine for local, where
  the DB is disposable).
- On a **real production deploy** (production mode against a *remote* DB),
  `hashDni()` **throws** if the pepper is unset *or* is still the dev default.
  This is fail-closed on purpose — better a boot refusal than silently poisoning
  every hash. `next start` against the **local** Supabase keeps using the dev
  pepper (local QA must not require the prod secret).

### The hard truth: the pepper is a permanent commitment

`dni_hash` is a one-way HMAC — there is **no way to re-derive it from stored
data** once the raw DNI is gone. So:

> A hash is only ever comparable against another hash computed with the **same**
> pepper. Change the pepper and **every existing `dni_hash` becomes
> unmatchable** — DNI verification silently stops finding anyone.

**Locally** this is harmless and recoverable: the seeded hashes were written by
`scripts/seed-*.ts` using whatever pepper was in scope at seed time. If you
change your local pepper, just re-hash by re-seeding:

```bash
pnpm db:reset && pnpm seed:test   # or the relevant seed for your workflow
```

**In production** it is *not* casually recoverable, because the raw DNIs that
produced the hashes were never stored. Treat the prod pepper as **set once,
permanent**:

- Generate a strong random value, set it **once** in Vercel, and store it in a
  password manager. See `docs/ops/cutover-playbook.md` (D2).
- Do **not** rotate it on a DB that already holds real `dni_hash` rows.

### If the prod pepper is ever leaked (forced rotation)

Rotation is a **data migration**, not an env change, because old hashes cannot
be recomputed from stored data:

1. Set the new pepper as a *second* secret; keep the old one available.
2. Re-collect or re-verify each subject's DNI through the normal identity flow
   (Mi Argentina OIDC claim, or re-entry) and write a fresh `dni_hash` with the
   new pepper. There is no bulk re-hash — the inputs are gone by design.
3. Once every active row is re-hashed, retire the old pepper.

This is the same cadence `SECURITY.md` prescribes for pepper exposure — plan for
it to be slow and subject-driven, which is exactly why the value must never be
changed casually.

---

## Cautionary tale — the `.env.local` breakage this doc exists to prevent

Local dev went down after a hand-edit to `.env.local` left it with **two**
`DATABASE_URL` lines (dotenv kept the last, so edits to the first did nothing)
and a blank required key. Boot-time validation (`lib/infra/env.ts`) reports a
*missing* var, but it runs against the **merged** `process.env` — it cannot see
a duplicate line or point at the offending file. Hours were lost.

`pnpm env:doctor` (`scripts/check-env-local.ts`) is the direct answer: it reads
the raw file, so it sees both duplicate lines and the blank value at once, names
them (with line numbers, never values), and exits non-zero. Run it whenever the
app boots with an env complaint or after any `.env.local` edit.
