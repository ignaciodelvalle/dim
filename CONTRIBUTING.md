# Contributing to DIM

Thanks for jumping in. DIM is a Next.js + Drizzle + Postgres / Supabase app, event-sourced where it matters. Read this file before opening your first PR — it covers everything you need to make a change that lands.

## Quickstart

```bash
pnpm install
pnpm db:start          # spins up local Supabase via Docker (Docker Desktop must be running)
pnpm db:push           # apply schema to the local DB
pnpm seed:test         # seed deterministic test users + a couple of pets
pnpm dev               # http://localhost:3000
```

If any of these fail, fix that first — they're the floor everything else builds on.

## Reading order for new contributors

There is a lot of context in this repo. Read in this order:

1. **[AGENTS.md](./AGENTS.md)** — the single source of truth for domain language, event-sourcing rules, RLS conventions, and "things every change must respect."
2. **[docs/superpowers/README.md](./docs/superpowers/README.md)** — index of feature specs and plans. Browse the existing ones before designing anything new — the patterns you need have probably been argued through already.
3. **The spec for the area you're working in** — anything under `docs/superpowers/specs/`. Each spec maps to a code area.

Code is descended from these documents, not the other way around. If a change feels in tension with what's written, raise that in the PR before coding around it.

## Branching model

- **`main`** — released. Only merges from `develop` (via release PR).
- **`develop`** — integration. Feature branches merge here.
- **Feature / fix branches** — branched from `develop`, named by intent:
  - `feat/<short-slug>` for new functionality
  - `fix/<short-slug>` for bug or security fixes (use `fix/sec-*` for items from a security review)
  - `chore/<short-slug>` for hygiene (refactors, scaffolding, dependency bumps)
  - `docs/<short-slug>` for docs-only changes

Don't push directly to `main` or `develop`.

## Commit convention

Conventional Commits, scoped to the area touched. The existing repo history is the source of truth; common scopes already in use:

`auth`, `cases`, `events`, `org`, `admin`, `welfare`, `foster`, `adoption`, `bite`, `db`, `schema`, `triggers`, `tokens`, `notifications`, `forms`, `libreta`, `docs`, `agents`, `superpowers`, `infra`.

If you need a new scope, use one — but check `git log --pretty=%s | grep -oE '^\w+\([^)]+\):' | sort -u` first so we don't accumulate near-duplicates.

Examples:

```
feat(cases): cross-org transfer handshake (#10, parte 1)
fix(auth): gate stub-profile claim until Mi Argentina lands
chore(db): FK ON DELETE hardening + FK indexes + CHECK mirroring
docs(superpowers): event-design checklist
```

Don't add `Co-Authored-By` trailers. Don't include AI attribution.

## Pre-PR checklist

Run all four locally before pushing. Don't outsource this to CI:

```bash
pnpm lint              # Biome — formatting + lint
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest (needs db:start running)
pnpm build             # next build (catches what tsc misses — module-level evaluation)
```

If a step fails on your branch but passes on `develop`, your branch is the source. Fix it before opening the PR.

## Writing a new event type

Event-sourced state changes (anything that mutates `pet_events`, opens a `case`, or emits a `notification`) are the hot path. Pattern checklist before you write any code:

- Which cross-cutting pattern? (started/ended pair, signal, proposed/executed, umbrella with outcome discriminator)
- Which entity carries the status column it changes?
- Auto-close cron + idempotency strategy?
- Payload Zod schema, with `schemaVersion`?
- Libreta or non-libreta?
- Which projections / dashboards consume it?
- Tests for: write happy path, rejection paths, projection drift detection

A formal event-design checklist lands in `docs/event-design-checklist.md` (tracked separately as Phase 4.3 of `docs/action-plan-2026-05-20.md`). Until then, copy the questions above into the spec.

## Spec-first culture

**Any change that adds a new event type or modifies the schema requires a spec in `docs/superpowers/specs/` first.** Pattern:

1. Open `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` and write the spec.
2. Iterate on it (with maintainers, with Claude Code, with yourself overnight — whatever it takes).
3. Only then open the code PR. The spec link goes in the PR description.

This is not bureaucracy; the patterns in this codebase are dense enough that fresh code without a spec usually misses the cross-cutting concern. Spend the hour writing it down first.

## Getting help

- Open a draft PR early and `@`-mention a maintainer with a question.
- For domain-language questions, search `AGENTS.md` before asking.
- For event-sourcing questions, look at how the closest existing event handles it (see `app/actions/events.ts` for the canonical patterns).
