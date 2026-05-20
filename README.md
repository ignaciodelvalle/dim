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
| Owner portal | `/mis-mascotas` | Pet owners (personal accounts) | Live |
| Public credential | `/p/[publicToken]` | Anyone (no auth) | Live |
| Org portal | `/org/[orgToken]` | Org members (shelter, clinic, rescue network, sanitary authority) | Live |
| Public shelter profile | `/refugios/[orgToken]` | Anyone (no auth) — only verified `shelter` or `rescue_network` orgs | Live |
| Independent vet portal | `/pro` | Vets with `professional.provider` capability | Planned |
| Govt portal | `/gob` | Govt institutional accounts (locality-scoped) | Planned |
| Meta-admin portal | `/admin` | Admin institutional accounts (universal scope) | Live (partial) |
| Tier-2 shared libreta | `/libreta/compartir/[shareToken]` | Anyone with a valid share link | Planned |

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
| Local dev        | Supabase CLI (Docker)                   |
| Deploy (when)    | Vercel + Supabase Cloud                 |
| Locale           | Spanish (es-AR)                         |

## Status

Owner-facing data-collection layer is complete:

- Email + password signup / login
- Pet profile with photo, breed (with PPP auto-detection per Ley CABA 4078 / Ley Prov 14.107), microchip block, weight, foods, allergies, training, insurance, jurisdiction
- Edit any field of any pet
- Pet list with avatars, pet detail with event timeline
- Public credential page at `/p/{token}` with Tier-0 view + scan-event logging
- Per-user notifications (welcome on signup, PPP reminder on dangerous breeds), with mark-read / archive
- Org portal (shelter, clinic, rescue network) — intake, foster, transfer, adoption flows

Vet portal (`/pro`), government portal (`/gob`), owner-facing forms for the rest of the event catalog (vaccination, vet visit, weight, etc.), and the scheduling system are next on the roadmap.

## Local development

Requires Node 20+, pnpm, and Docker Desktop running.

```bash
pnpm install
pnpm db:start          # start the local Supabase stack (Postgres + Auth + Storage in Docker)
pnpm db:push           # apply the Drizzle schema to local Postgres
pnpm dev               # Next.js on http://localhost:3000
```

You'll also need to apply `db/triggers.sql` and `db/storage.sql` once via Supabase Studio's SQL Editor (<http://localhost:54323>).

Environment template lives at [`.env.local.example`](./.env.local.example). Copy to `.env.local` and fill in the values printed by `pnpm db:status`.

## Project layout

```
app/
  (auth)/                   signup, login (route group, public)
  (app)/                    authenticated pages (route group, gated by layout)
    mis-mascotas/           pet list, new pet, [token] detail + editar, eventos/
    notificaciones/         notifications inbox
    cuenta/                 upgrade (vet / org creation)
  org/[orgToken]/           org portal — shelter, clinic, rescue network, sanitary authority
  refugios/[orgToken]/      public shelter profile (no auth) — verified shelters only
  admin/                    admin + govt shared portal — pending /gob split
  p/[publicToken]/          public credential page (no auth required)
  auth/callback/            Supabase OAuth/email-link return URL
  actions/                  server actions (auth, pets, scans, notifications)
components/                 shared UI (PetForm)
db/
  schema.ts                 Drizzle schema (single source of truth for the DB shape)
  index.ts                  postgres-js client wrapper
  triggers.sql              non-Drizzle SQL (handle_new_user, welcome notification)
  storage.sql               Supabase Storage bucket + RLS policies
lib/
  breeds.ts                 breed lookups + dangerous-breed detection
  lookups.ts                food / allergy / microchip / training options
  format.ts                 i18n date and label helpers
  publicToken.ts            DIM-XXXX-XXXX token generator (DIM is the codename, stays)
  storage.ts                public photo URL helper
  supabase/                 server, browser, and middleware Supabase clients
middleware.ts               Next.js middleware (refreshes auth cookies on every request)
docs/
  superpowers/              specs and plans for upcoming features
  archive/                  2021 carpeta, CONAIISI paper, BMC (provenance, not spec)
mimar-go-to-market.md       GTM strategy: Mi Argentina integration path and decision-makers
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — full design doc: principles, data model, event catalog, privacy tiers, dashboards, legal framework, portal surfaces, role model. **Read first.**
- [`docs/superpowers/README.md`](./docs/superpowers/README.md) — index of specs and implementation plans, priority order, cross-cutting dependencies
- Inline code comments — every non-obvious file has a header explaining its job

## License

MIT — see [LICENSE](./LICENSE).
