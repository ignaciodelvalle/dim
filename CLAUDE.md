# DIM / MiMAR — Claude Code project memory

> Thin session bootstrap. Deep context lives in `AGENTS.md` — its slim index maps every deep section to an anchor; load sections on demand, never the whole file.

## What this is

**DIM / MiMAR** — Argentina's digital pet credential system. Internal codename **DIM** (code, schema, `DIM-XXXX-XXXX` tokens); user-facing brand **MiMAR**. Owner: **Ignacio Del Valle** (non-technical PO) — Claude writes the code, Ignacio drives product decisions and runs commands locally on Windows.

Stack: Next.js 15 (App Router) + React 19 + TypeScript, Supabase (Postgres + RLS + Auth), Drizzle, Tailwind + shadcn/ui, Vitest, Biome, **pnpm**, Supabase CLI (Docker) for local dev.

## Invariants (never break)

1. **The pet is the credential** — globally-unique public token resolving to a QR-verifiable public page.
2. **Events are append-only** — never edit or delete; corrections are new events.
3. **Facts are event-sourced; caches declare themselves** — medical/custody lifecycle facts live only in the append-only event spine; operational caches (`pets.*` columns, ownerships) and curated metadata are dual-written **by design**, with explicit boundaries and drift detection (`rederivePetCache`). No cache ever outranks the spine; no dashboard reads pretend a cache is the log. (Honest-hybrid rewording, PO 2026-07-24 — the old "every view is a projection" slogan overclaimed.)
4. **Spanish (es-AR) UI, English code** — identifiers, comments, and docs in English.
5. **No DNI in plaintext** — `lib/utils/dni-hash.ts` (`hashDni()` for equality, `dniLast4()` for display).
6. **Mi Argentina federation is the premise** — no decision may harm that path.

## Definition of Done

`pnpm verify` + `pnpm test` green (paste actual output as evidence) AND committed. Conventional commits, no AI attribution. Migrations are forward-only and immutable (`db/migrations/NNNN_*.sql`); recount the next free integer at write time — never hardcode one from a plan. Writing a migration file is agent work; applying it to a remote DB is Ignacio-gated.

**e2e is a separate gate** — Playwright is NOT in `pnpm verify`; it runs as CI's own job (and nightly vs staging). Touching a browser-facing flow means checking that job, not just the local suite. Conventions and the hard-won traps live in `e2e/README.md` — read it before writing or fixing a spec.

## Delivery strategy (decided — do not re-ask)

`delivery_strategy: single-pr` with `size:exception` is the project default (PO decision, three consecutive changes: pet-document-redesign #593, admin-rules-console #604, jurisdiction-compliance 2026-07-03). When an SDD forecast recommends chained PRs, note it in the summary but do not stop to ask. Still structure work-unit commits so a later split remains possible.

## Working norms

- **Every agent gets a one-page contract** — `docs/agents/README.md` is the hub (read-only auditors, mutating QA agents, subagents). Briefing ANY agent? Point it at its page. Delegating via the Agent tool? The call carries an explicit `model` (mechanical → sonnet).
- **spec → plan → PR** — code descends from documents (`docs/superpowers/README.md` is the index). If a change feels in tension with what's written, raise it before coding around it.
- **Engram is the SDD artifact store** — topic keys `sdd/{change}/*`; session summaries are mandatory.
- **Poll every background child within your own turn** (STRUCTURAL — the first line of every agent brief) — after launching any background child, poll its output within your turn: loop on `Read` of its output file, or re-run it synchronously. A turn may not end with a live child unpolled; that stalls the pipeline until manually resumed (recurred 3× in one day despite prompt warnings).
- **Cursor as fresh reviewer is a standard pre-push step** — before pushing a commit range, run a read-only adversarial pass with a fresh-context reviewer over the range.
- **Parallel writers only in worktrees** — N read-only agents in parallel is free; a 2nd writer runs ONLY in its own git worktree with disjoint file territory + targeted tests (local Supabase is shared), landing through a serial integration merge gate (full `pnpm verify` + parity where applicable).
- **Spec-conflict rule: validated code beats design-handoff tables** — when a tested constant disagrees with a handoff's token table, the code wins (case study: the CVD teal near-regression, `viz-scales.ts` `COLOR_DIVERGENT_ABOVE` vs the v2C README's pre-fix `#0d9488`).
- **QA environment bootstrap**: `pwsh scripts/qa-up.ps1` — checks Supabase containers, build freshness vs HEAD, starts the production server on :3000, smoke-tests key routes, and verifies seed accounts.

## AGENTS.md deep sections (load on demand)

| Need | Anchor |
|---|---|
| Data model / schema / migrations | `#data-model` |
| Event catalog (48 types) | `#event-catalog--48-types` |
| Roles, account types, capabilities | `#user-roles--account-types` |
| RLS / authorization | `#authorization-architecture-wave-5-item-26` |
| Privacy checklist (any public route or PII field) | `#privacidad-y-manejo-de-datos` |
| UI conventions (forms, CTAs, AppShell, location capture) | `#design-rules-ui-conventions` |
| Feature inventory ("does X exist?") | `#feature-inventory` |
| Legal framework (AR laws, SENASA) | `#legal-framework` |
