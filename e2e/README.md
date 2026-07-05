# e2e — Playwright

Browser-level regression tests running against the **built** Next.js app
(`next build && next start`), not the dev server — see `playwright.config.ts`.

## Prerequisites

- Local Supabase stack up (`supabase start` or your usual local setup).
- DB bootstrapped: `pnpm db:bootstrap` (schema + RLS + `owner@dim.test` and
  friends via `scripts/seed-test-users.ts`). Idempotent — safe to re-run.

## Running

```bash
# First run (or after a code change) — builds, then starts on :3333.
pnpm playwright test

# Fast re-run — skip the build if you already have a fresh one.
pnpm build
NEXT_BUILT=1 pnpm playwright test

# A single spec file (or a glob):
NEXT_BUILT=1 pnpm playwright test e2e/crisis-public.spec.ts
NEXT_BUILT=1 pnpm playwright test e2e/crisis-*.spec.ts
```

`pnpm e2e` is a shorthand for `playwright test` (see `package.json`).

## Layout

- `crisis-public.spec.ts` — PUBLIC crisis-path surfaces, no auth: the
  landing CrisisBand code lookup, and the lost-vs-non-lost contrast on
  `/p/[publicToken]`. Real tokens are discovered at runtime from `/adoptar`
  and `/perdidas` (never hardcoded); tests skip cleanly when the seed has no
  matching pet.
- `crisis-owner-lost-flow.spec.ts` — AUTHENTICATED owner flow: logs in as
  `owner@dim.test`, drives the real "Marcar como perdida" wizard on the
  seeded pet Michi, then opens a **fresh browser context** (no session) to
  verify the public credential as a stranger would see it — lost banner,
  disclosed phone CTA, and that undisclosed fields (owner name, last-seen
  location) stay hidden. Reverts Michi to "found" in a `finally` block so
  the local DB is left as it started.
- `public-smoke.spec.ts`, `auth.spec.ts`, `auth-bypass.spec.ts`,
  `create-pet.spec.ts`, `cross-tenant-isolation.spec.ts`,
  `owner-shell.spec.ts`, `admin-topbar.spec.ts`, `executive-smoke.spec.ts`,
  `a11y-operator-auth.spec.ts` — pre-existing coverage (routes, auth,
  RLS/tenant isolation, a11y).
- `demo/` — long-running (15–18 min) narrated recording scripts, not
  regression tests. Do not run these as part of a normal e2e pass.

## Conventions

- No hardcoded DB ids/tokens — discover them from a real page at runtime
  (`a[href^="/adoptar/DIM"]`, `a[href^="/mis-mascotas/DIM"]`, etc.) and
  `test.skip(...)` when the seed doesn't have the fixture you need.
- Deterministic only: web-first assertions (`expect(locator).toBeVisible()`),
  no arbitrary `sleep`, no reliance on `Date.now()`/random.
- Shared login/demo-account helpers live in `demo/_helpers.ts`
  (`loginAs`, `ACCOUNTS`).
