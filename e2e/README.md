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
- `chapas.spec.ts` — PHYSICAL TAGS end to end: admin issuance on
  `/admin/chapas` (the issuance CSV is captured from the real download —
  the only artifact that ever carries a plaintext activation code, so it
  is also this spec's fixture source), the public resolver `/t/[serial]`
  in all three non-redirect states, owner self-activation, the uniform
  evidence-gate refusal, and revocation. Cleans up its own lote through
  `deleteTagsByLotePrefix` (local DB only) — there is no "delete a chapa"
  flow in the product.
- `public-smoke.spec.ts`, `auth.spec.ts`, `auth-bypass.spec.ts`,
  `create-pet.spec.ts`, `cross-tenant-isolation.spec.ts`,
  `owner-shell.spec.ts`, `admin-topbar.spec.ts`, `executive-smoke.spec.ts`,
  `a11y-operator-auth.spec.ts` — pre-existing coverage (routes, auth,
  RLS/tenant isolation, a11y).
- `demo/` — long-running (15–18 min) narrated recording scripts, not
  regression tests. Do not run these as part of a normal e2e pass.

## Conventions

- **CI's fresh-seed DB is the judge, not your laptop.** `pnpm db:bootstrap`
  seeds reference data + `scripts/seed-test-users.ts` and STOPS — no cases, no
  lost pets, no share tokens, and none of the demo/storyline seeds. A dev DB
  accumulates state (a lost first pet, an emptied refugio, same-day duplicate
  events) that makes local runs of some specs fail or pass for reasons the code
  has nothing to do with. Iterate locally on ONE spec; trust the CI verdict for
  the suite.
- **A fixture-gated check branches on the ENVIRONMENT, never on the data.**
  `test.skip(rowsFound === 0, …)` self-retires: the day a seed stops publishing
  the fixture, the check stops running and the summary stays green. Three gates
  in `public-smoke.spec.ts` were in that state, two of them axe scans (one on
  the lost-mode credential — the Ley 26.653 "hero moment"). Use
  `e2e/_seed-profile.ts` instead: it resolves a **seed profile** and turns a
  missing fixture into a skip only where absence is documented.
  - `bootstrap` (the default): `pnpm db:bootstrap` and nothing else — what CI's
    e2e job runs. No lost pets, no adoption listings, no cases, no share
    tokens. A missing fixture SKIPS, with a reason that names the coverage hole.
  - `full`: the deployed staging origin the nightly pass drives (`STAGING_URL`
    set → inferred automatically). It carries the demo/storyline seeds — 317
    lost pets and 3 adoption listings when this was measured (2026-08-04). A
    missing fixture **FAILS**.
  - Driving a locally seeded QA DB through `playwright.local3000.config.ts`?
    Export `E2E_SEED_PROFILE=full` so a missing fixture is red there too.
  The resolver is a pure function pinned by `__tests__/e2e-seed-profile.test.ts`
  — the gate itself must not become an assertion that cannot fail.
- No hardcoded DB ids/tokens — discover them from a real page at runtime
  (`a[href^="/adoptar/DIM"]`, `a[href^="/mis-mascotas/DIM"]`, etc.) and
  `test.skip(...)` when the seed doesn't have the fixture you need. Note org
  tokens are `DIM-`-prefixed too: capture the `/mascotas/<pet>` segment, not
  the first `DIM-` match in an href.
- Deterministic only: web-first assertions (`expect(locator).toBeVisible()`),
  no arbitrary `sleep`, no reliance on `Date.now()`/random.
- Shared login/demo-account helpers live in `demo/_helpers.ts`
  (`loginAs`, `ACCOUNTS`).

### Hard-won rules (2026-08-03/04, retiring a standing CI red)

- **Rate limits are real and the suite trips them.** `auth_login_email` is
  5/min · 20/hour keyed on the EMAIL (a unique `x-real-ip` does nothing), and
  Playwright REPLACES the worker after every failure — emptying `loginAs`'s
  session cache, so real sign-ins scale with FAILURES, not with tests. A few
  genuine failures used to starve every later spec. `loginAs` now calls
  `resetAuthLoginRateLimits()` (`demo/_db-cleanup.ts`, local DB only) before a
  real sign-in. Any spec with its own private login MUST do the same. The
  anonymous denuncia is 1/min per IP — pass a unique `uniqueIp()` per walk.
- **Never assert a 404 by HTTP status.** Streaming routes flush the shell
  before the scoped lookup resolves, so `notFound()` fires after headers went
  out and a DENIED page answers **200** with the branded boundary rendered.
  Assert the surface (`branded-not-found` testid), never `response.status()`.
- **Never wait on a post-action URL.** The client half of the N3 contract
  (`useActionRedirect` → `window.location.assign`) drops often enough to
  matter — the documented Next 15.5.x behaviour in
  `lib/ui/full-page-action-nav.ts`. Assert the OUTCOME the mutation produces;
  if you need an id the redirect carried, read it from the index page instead.
- **Dates must be ART-local**, not `toISOString()`. The server rejects future
  dates in Argentina time, and from ~21:00 ART the UTC date is already
  tomorrow — that made a seam pass every morning and fail every night.
  Use `Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })`.
- **A filed denuncia does NOT land in a fixed stage.** `create-welfare-report`
  auto-flags an anonymous report into **Moderación** only when a heuristic fires
  (`lib/infra/welfare-moderation.ts`); otherwise it goes straight to **Triage**.
  `walkDenunciaWizard`'s text is long, mixed-case, "moderado" and carries a
  photo, so the only rule it can trip is `duplicate_within_24h` — i.e. whether
  an EARLIER SPEC in the same serial run already filed that same description.
  So the stage is an emergent property of spec ORDER, never a constant: probe
  and assert the SAME stages, or probe both. `8adeb437` (bootstrap now seeds two
  real `cases`) silently stopped `admin-case-detail-shell` from filing the first
  copy, which flipped the govt-side denuncia from Moderación to Triage and made
  synthetic-monitor (c) red — with nothing wrong in the product.
- **Walk multi-step wizards.** Mark-lost and denuncia submits live on the LAST
  step; clicking that button's name from step 1 waits for an element that step
  never renders. `playwright.config.ts` now sets `actionTimeout: 15s` so this
  fails legibly instead of silently eating the test budget (Playwright's
  default is 0 — no limit — and an unbounded action cannot be caught by
  `try/catch`, because it never throws).
