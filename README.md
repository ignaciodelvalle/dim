# DIM

**Documento de Identificación para Mascotas** — Argentina's digital pet credential.

[![CI](https://github.com/ignaciodelvalle/dim/actions/workflows/ci.yml/badge.svg)](https://github.com/ignaciodelvalle/dim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A reborn 2021 university project (UTN), reimagined for 2026 as a modern PWA with public-health-grade architecture.

## What it is

Every pet gets a verifiable digital identity — a credential with a QR code that can be scanned to confirm the pet is registered, contact its owner if lost, and (with owner consent) share its vaccination and medical history. The same event log that powers each pet's record feeds high-level dashboards for sanitary authorities, public-health analysts, and animal-welfare officers.

The project's North Star is **animal health and welfare at population scale**: vaccinations reach pets who need them, treatments reach pets who need them, lost pets find their owners, and welfare problems become legible to authorities and NGOs who can act on them.

The full design — principles, data model, event catalog, privacy tiers, dashboard targets, legal framework — lives in [`AGENTS.md`](./AGENTS.md). That's the source of truth for *what we're building and why*. Any AI agent or human picking up this repo should start there.

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

Vet portal, government dashboards, owner-facing forms for the rest of the event catalog (vaccination, vet visit, weight, etc.) are next on the roadmap.

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
  publicToken.ts            DIM-XXXX-XXXX token generator
  storage.ts                public photo URL helper
  supabase/                 server, browser, and middleware Supabase clients
middleware.ts               Next.js middleware (refreshes auth cookies on every request)
docs/
  archive/                  2021 carpeta, CONAIISI paper, BMC (provenance, not spec)
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — full design doc: principles, data model, event catalog, privacy tiers, dashboards, legal framework, open questions. **Read first.**
- [`docs/README.md`](./docs/README.md) — what's in `docs/` and what isn't current spec
- Inline code comments — every non-obvious file has a header explaining its job

## License

MIT — see [LICENSE](./LICENSE).
