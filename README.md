# DIM

**Documento de Identificación para Mascotas** — Argentina's digital pet credential system.

A reborn 2021 university project (UTN), reimagined for 2026 as a modern PWA with public-health-grade architecture.

## What it is

Every pet gets a verifiable digital identity — a credential with a QR code that can be scanned to confirm the pet is registered, contact its owner if lost, and (with owner consent) share its vaccination and medical history. The same event log that powers each pet's record feeds high-level dashboards for sanitary authorities, public-health analysts, and animal-welfare officers.

## Status

Early scaffolding. See [`AGENTS.md`](./AGENTS.md) for the full design.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + Storage) · Drizzle ORM · Biome.

## Local development

Requires Node 20+, pnpm, and Docker Desktop running.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

## License

MIT — see [LICENSE](./LICENSE).
