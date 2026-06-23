# MiMAR — Mi Mascota Argentina

**MiMAR** is Argentina's digital pet credential and health record system.

> **Note:** DIM is the internal codename used in schema, tokens (`DIM-XXXX-XXXX`), code identifiers, and audit logs. MiMAR is the user-facing brand.

[![CI](https://github.com/ignaciodelvalle/dim/actions/workflows/ci.yml/badge.svg)](https://github.com/ignaciodelvalle/dim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A reborn 2021 university project (UTN), reimagined for 2026 as a modern PWA with public-health-grade architecture.

## What it is

Every pet gets a verifiable digital identity — a credential with a QR code that can be scanned to confirm the pet is registered, contact its owner if lost, and (with owner consent) share its vaccination and medical history. The same event log that powers each pet's record feeds high-level dashboards for sanitary authorities, public-health analysts, and animal-welfare officers.

The project's North Star is **animal health and welfare at population scale** and, ultimately, **integration with Mi Argentina** — the platform that would make this credential official at national scale.

The full design — principles, data model, event catalog, privacy tiers, dashboard targets, legal framework — lives in [`AGENTS.md`](./AGENTS.md). That's the source of truth for *what we're building and why*. Any AI agent or human picking up this repo should start there.

## Portal surfaces

| Surface | Route | Who | Status |
| ------- | ----- | --- | ------ |
| Owner portal | `/(app)` (e.g. `/inicio`, `/mis-mascotas`) | Pet owners + vets (personal accounts) | Live |
| Org portal | `/org/[orgToken]` | Org members (shelter, clinic, rescue network, sanitary authority) — capability-scoped | Live |
| Govt portal | `/gob` | Govt institutional accounts (jurisdiction-scoped) + admin | Live |
| Mortality & disposal dashboard | `/gob/mortalidad` | Govt (jurisdiction-scoped) + admin — disposition mix, traceable-disposal rate, reportable-death share (Ley CABA 5470) | Live |
| Meta-admin portal | `/admin` | Admin institutional accounts (universal scope) | Live |
| Alert inbox & triage | `/admin/alertas` | Admin — alert firings from subscription thresholds: acknowledge → investigate → contact authority → resolve (WS-K) | Live |
| Independent vet portal | `/pro` | Vets with `professional.provider` capability | Planned (not scaffolded) |
| Public credential | `/p/[publicToken]` | Anyone (no auth) — Tier 0/1/2 | Live |
| Public shelter profile | `/refugios/[orgToken]` | Anyone (no auth) — only verified `shelter` / `rescue_network` orgs | Live |
| Public adoption listing | `/adoptar` | Anyone (no auth); applying requires login | Live |
| Public welfare report | `/denuncias/nueva` · `/buscar` · `/codigo/[code]` | Anyone (anonymous, reference-code tracking) | Live |
| Unified case detail | `/casos/[publicCode]` | Anyone (no auth) — role-aware, PII-redacted for anon | Live |
| Tier-2 shared libreta | `/libreta/compartir/[shareToken]` | Anyone with a valid share link | Live |
| Org invite accept | `/r/invite/[token]` | Invitee (logged-in or signing up) | Live |

## Four-role authority model

| Role | Account type | Portal | Notes |
| ---- | ------------ | ------ | ----- |
| `owner` | personal | `/mis-mascotas` | Default for self-serve signup. May upgrade to `vet`. |
| `vet` | personal | `/pro` or `/org/[orgToken]` | Independent vets use `/pro` after `professional.provider` approval; clinic-affiliated vets use the clinic's `/org/[orgToken]`. |
| `govt` | institutional | `/gob` | Locality-scoped approvals and regional dashboards. Multi-locality via `govt_assignments`. |
| `admin` | institutional | `/admin` | Universal scope. Creates institutional accounts, global audit, universal business rules. |

Account type is DB-enforced via CHECK constraint on `profiles.account_type`. Personal accounts (`owner`, `vet`) can own pets and have Mi Argentina identity. Institutional accounts (`govt`, `admin`) have neither — they are service accounts for governance work.

## Stack

| Layer            | Choice                                  |
| ---------------- | --------------------------------------- |
| Frontend         | Next.js 15 (App Router) + React 19      |
| Language         | TypeScript                              |
| Styling          | Tailwind CSS 4                          |
| Auth             | Supabase Auth (email/password)          |
| Database         | Postgres (via Supabase) + Row Level Security |
| ORM              | Drizzle                                 |
| File storage     | Supabase Storage                        |
| Lint / format    | Biome                                   |
| Tests            | Vitest (strict TDD; run against local Postgres) |
| Local dev        | Supabase CLI (Docker)                   |
| Deploy (when)    | Vercel + Supabase Cloud                 |
| Locale           | Spanish (es-AR)                         |

## Architecture

The backend follows **Hexagonal-lite + Screaming Architecture**: business logic is sliced **by domain** under `src/modules/<domain>/`, and within each module dependencies point **inward** — a pure, framework-free core wrapped by thin edges that touch Next.js and the database.

```
actions.ts        thin Next server action — parse input, AUTH (security boundary), redirect
   │  calls
application/      use-cases — orchestrate one operation, own the transaction
   │  depends on
domain/           pure rules, types, state machines — no @/db, no next (Biome-enforced)
   ▲  returns
infrastructure/   repository — the only layer that runs Drizzle queries
```

- **`domain/`** is pure and unit-tested without a database; **`infrastructure/`** is the only place that issues Drizzle queries.
- **`actions.ts`** is the security boundary — Drizzle bypasses Postgres RLS by design, so authorization is enforced at the action edge, not in the DB.
- Multi-step writes thread a single transaction through the repository; notifications are flushed post-transaction (best-effort).
- Shared kernels (`cases`, `organizations`/`capabilities`) are consumed through thin **re-export shims** in `lib/`, so the migration didn't have to repoint hundreds of callers at once (strangler pattern).
- This layers on top of — it does not replace — the event-sourcing principles in [`AGENTS.md`](./AGENTS.md): use-cases append immutable events, and projections stay pure functions.

Full guide with diagrams: **[`docs/architecture/hexagonal-lite.md`](./docs/architecture/hexagonal-lite.md)**.

## Status

Four portals are live end-to-end:

- **Owner** (`/(app)`) — signup/login, `/inicio` dashboard with per-pet estado-sanitario nudges (overdue vaccine, missing microchip, next reminder, credential-scan activity — derived from the owner's own events only, no surveillance data), pet profiles (photo, breed + PPP auto-detection per Ley CABA 4078 / Ley Prov 14.107, microchip, weight, foods, allergies, training, jurisdiction), the full event-catalog entry forms (vaccination, vet visit, weight, microchip, sterilization, bite, symptom, medication, death, …), lost-pet flow, transfers inbox, appointments + service search/booking, account/upgrade (vet matrícula, org creation, DNI verification, foster), notifications.
- **Org** (`/org/[orgToken]`) — intake, custody pets (+ bulk), adoption review, agenda/appointments, service offerings, cross-org transfers, foster pool + volunteers, post-adoption check-ins, cases, members/invites, coverage zones. Capability-scoped.
- **Govt** (`/gob`) — KPI dashboard, approval queue (matrículas / org verification / RUPGA), welfare reports + triage, lost-pet map, decomisos, custody disputes, epidemiological surveillance (signals, outbreaks, zoonosis, investigations), business-rule viewer, services, user/org search (with PII-query logging), audit history. Jurisdiction-scoped.
- **Admin** (`/admin`) — universal queue/cases, admin & govt account management, jurisdictions + business-rule CRUD, welfare moderation, rabies observations, event-outbox SLA monitor, services, system health.

Public surfaces (no auth) live: pet credential (`/p/[token]`, Tier 0/1/2 + scan logging), shelter profiles (`/refugios/[orgToken]`), adoption listing (`/adoptar`), anonymous welfare reports (`/denuncias`), unified case detail (`/casos/[publicCode]`), shared libreta links, and org invites.

Next on the roadmap: the **independent vet portal** (`/pro`, not yet scaffolded) and a few surfaces deferred-by-design (govt `/gob/analytics`, org-side `maltrato` intake — built but not yet wired into navigation).

## Local development

Requires **Node ≥ 22.13**, **pnpm**, and **Docker Desktop** running (the local Supabase stack runs in Docker).

```bash
pnpm install
pnpm db:start          # local Supabase (Postgres + Auth + Storage) in Docker
# copy .env.local.example → .env.local, then fill in the values from `pnpm db:status`
pnpm db:bootstrap      # schema + migrations + triggers + RLS + storage + seeds (one command)
pnpm dev               # http://localhost:3000
```

`db:bootstrap` is idempotent and refuses to run against a non-local database. It replaces the older manual flow (`db:push` plus pasting `db/triggers.sql` and `db/storage.sql` into Supabase Studio).

The env template lives at [`.env.local.example`](./.env.local.example) — copy it to `.env.local` and fill in the values printed by `pnpm db:status` (Studio is at <http://localhost:54323>).

New to the project? Read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the branching model, commit convention, and the pre-PR checklist.

## Project layout

```
src/
  modules/                  domain-sliced backend (Hexagonal-lite) — see docs/architecture
    <domain>/               adoption · pets · foster · transfers · cases ·
                            welfare · surveillance · organizations · events
      domain/               pure rules, types, state machines (no @/db, no next)
      application/          use-cases — orchestration + transactions
      infrastructure/       repository — the only place that runs Drizzle queries
      actions.ts            thin "use server" controllers (parse · auth · redirect)
app/
  (auth)/                   signup, login (route group, public)
  (app)/                    authenticated pages (route group, gated by layout)
    mis-mascotas/           pet list, new pet, [token] detail + editar, eventos/
    notificaciones/         notifications inbox
    cuenta/                 upgrade (vet / org creation)
  org/[orgToken]/           org portal — shelter, clinic, rescue network, sanitary authority
  refugios/[orgToken]/      public shelter profile (no auth) — verified shelters only
  gob/                      government portal (locality-scoped)
  admin/                    meta-admin portal (universal scope)
  p/[publicToken]/          public credential page (no auth required)
  auth/callback/            Supabase OAuth/email-link return URL
  api/cron/                 scheduled jobs (outbox drain, auto-expire, escalations)
  actions/                  legacy server actions — now thin re-export shims into src/modules
components/                 shared presentational UI
db/
  schema.ts                 Drizzle schema (single source of truth for the DB shape)
  index.ts                  postgres-js client wrapper
  migrations/               SQL migrations
  triggers.sql              non-Drizzle SQL (handle_new_user, welcome notification)
  storage.sql               Supabase Storage bucket + RLS policies
lib/
  projections/              pure event-replay (pet status, weight, microchip) — domain-grade
  case-helpers.ts, capabilities.ts, …   re-export shims delegating into src/modules
  breeds.ts, format.ts, location.ts     shared utilities & reference data
  publicToken.ts            DIM-XXXX-XXXX token generator (DIM is the codename, stays)
  supabase/                 server, browser, and middleware Supabase clients
__tests__/                  integration tests (Vitest, run against local Postgres)
middleware.ts               Next.js middleware (refreshes auth cookies on every request)
docs/
  architecture/             Hexagonal-lite architecture guide (+ Mermaid diagrams)
  superpowers/              specs and plans for upcoming features
  archive/                  2021 carpeta, CONAIISI paper, BMC (provenance, not spec)
docs/archive/mimar-go-to-market.md  GTM strategy: Mi Argentina integration path and decision-makers
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — full design doc: principles, data model, event catalog, privacy tiers, dashboards, legal framework, portal surfaces, role model. **Read first.**
- [`docs/architecture/hexagonal-lite.md`](./docs/architecture/hexagonal-lite.md) — backend architecture: the four layers, the dependency rule, module anatomy, a worked example, shims/strangler, and how to add a domain. Diagrams included.
- [`docs/superpowers/README.md`](./docs/superpowers/README.md) — index of specs and implementation plans, priority order, cross-cutting dependencies
- Inline code comments — every non-obvious file has a header explaining its job

## License

MIT — see [LICENSE](./LICENSE).
