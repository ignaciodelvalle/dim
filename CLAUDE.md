# DIM / MiMAR — Claude Code project memory

> Thin session bootstrap. Deep context lives in `AGENTS.md` — its slim index maps every deep section to an anchor; load sections on demand, never the whole file.

## What this is

**DIM / MiMAR** — Argentina's digital pet credential system. Internal codename **DIM** (code, schema, `DIM-XXXX-XXXX` tokens); user-facing brand **MiMAR**. Owner: **Ignacio Del Valle** (non-technical PO) — Claude writes the code, Ignacio drives product decisions and runs commands locally on Windows.

Stack: Next.js 15 (App Router) + React 19 + TypeScript, Supabase (Postgres + RLS + Auth), Drizzle, Tailwind + shadcn/ui, Vitest, Biome, **pnpm**, Supabase CLI (Docker) for local dev.

## Invariants (never break)

1. **The pet is the credential** — globally-unique public token resolving to a QR-verifiable public page.
2. **Events are append-only** — never edit or delete; corrections are new events.
3. **Every view is a projection**: `(events, filters) → view`. No view is source of truth.
4. **Spanish (es-AR) UI, English code** — identifiers, comments, and docs in English.
5. **No DNI in plaintext** — `lib/dni-hash.ts` (`hashDni()` for equality, `dniLast4()` for display).
6. **Mi Argentina federation is the premise** — no decision may harm that path.

## Definition of Done

`pnpm verify` + `pnpm test` green (paste actual output as evidence) AND committed. Conventional commits, no AI attribution. Migrations are forward-only and immutable (`db/migrations/NNNN_*.sql`); recount the next free integer at write time — never hardcode one from a plan. Writing a migration file is agent work; applying it to a remote DB is Ignacio-gated.

## Delivery strategy (decided — do not re-ask)

`delivery_strategy: single-pr` with `size:exception` is the project default (PO decision, three consecutive changes: pet-document-redesign #593, admin-rules-console #604, jurisdiction-compliance 2026-07-03). When an SDD forecast recommends chained PRs, note it in the summary but do not stop to ask. Still structure work-unit commits so a later split remains possible.

## Working norms

- **spec → plan → PR** — code descends from documents (`docs/superpowers/README.md` is the index). If a change feels in tension with what's written, raise it before coding around it.
- **Engram is the SDD artifact store** — topic keys `sdd/{change}/*`; session summaries are mandatory.
- **Sub-agents that spawn background children must poll within their own turn** — do not end the turn "waiting for a notification"; that stalls the pipeline until manually resumed (recurring failure mode).
- **QA environment bootstrap**: `pwsh scripts/qa-up.ps1` — checks Supabase containers, build freshness vs HEAD, starts the production server on :3000, smoke-tests key routes, and verifies seed accounts.

## AGENTS.md deep sections (load on demand)

| Need | Anchor |
|---|---|
| Data model / schema / migrations | `#data-model` |
| Event catalog (47 types) | `#event-catalog--47-types` |
| Roles, account types, capabilities | `#user-roles--account-types` |
| RLS / authorization | `#authorization-architecture-wave-5-item-26` |
| Privacy checklist (any public route or PII field) | `#privacidad-y-manejo-de-datos` |
| UI conventions (forms, CTAs, AppShell, location capture) | `#design-rules-ui-conventions` |
| Feature inventory ("does X exist?") | `#feature-inventory` |
| Legal framework (AR laws, SENASA) | `#legal-framework` |
