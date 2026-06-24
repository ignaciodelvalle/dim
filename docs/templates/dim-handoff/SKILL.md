---
name: dim-handoff
description: >-
  Generate a Claude Code handoff document for the DIM/MiMAR repo in the
  established COWORK-HANDOFF format. Use when wrapping up a batch of work and
  writing the doc the next Claude (Cowork or Claude Code) will read to test,
  verify, and merge it. Triggers: "write a handoff", "handoff for claude code",
  "COWORK-HANDOFF", "hand this off", "doc for the next Claude", or after
  finishing a remediation / wave / set of PRs that needs a testing + merge guide.
---

# DIM handoff generator

Produces a handoff doc matching the house format
(`docs/superpowers/*-COWORK-HANDOFF.md`). The reader is usually **non-technical
Ignacio** running commands locally on Windows, or **the next Claude** continuing
the work. Write for both: every command gets a one-line plain-language reason.

## Before writing — gather the facts (do not invent)

Read the real state. Never fabricate PR numbers, branches, or test counts.

1. **Source of work** — the critique / spec / plan that drove it. Link it:
   `docs/<critique>.md`, `docs/superpowers/plans/<plan>.md`,
   `docs/superpowers/specs/<spec>.md`.
2. **PRs / branches** — get the actual list. Ask the user or run (the user runs
   these on Windows; you can ask them to paste output):
   - `gh pr list --state open --base <base> --json number,title,headRefName`
   - `git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) | %(committerdate:short)'`
3. **Findings mapping** — which finding IDs (C1, WS-K, etc.) each PR closes.
   Pull from the plan; do not guess coverage.
4. **Verify status** — run/confirm `pnpm verify` (tsc + Biome + lint:tokens +
   lint:ui + next build) and `pnpm test` per branch. Record pass/fail honestly.
5. **Test baseline** — the suite has **pre-existing failing files** unrelated to
   the new work. List them explicitly so the reader doesn't panic. Distinguish
   pre-existing failures, flaky tests, and real regressions. "Green" = the
   failing set equals the known baseline (± flaky) and the PR's new tests pass.
6. **Migrations** — any `db/migrations/*.sql`. Note if additive/idempotent and
   whether already applied to local DB. Runner: `scripts/migrate.ts`, table
   `public._dim_migrations`.
7. **Merge order & supersessions** — if branches aren't stacked, state the merge
   order and any PR that supersedes another's stopgap (which version wins, in
   which files).
8. **Privacy gate** — per AGENTS.md §Privacidad, confirm no PR exposes raw
   `payload`, `magic_link`, DNI plaintext, or untiered PII. Flag surfaces that
   must re-pass the gate on any future change.

## Output

Write to `docs/superpowers/<YYYY-MM-DD>-<slug>-COWORK-HANDOFF.md`. Spanish prose
(es-AR), English code identifiers — same as the repo. Use this skeleton:

```markdown
# Handoff — <título> (para Claude cowork)

> **Para la próxima Claude (o quien revise/testee).** <1–2 líneas de estado.>
> Plan: [`plans/<plan>.md`](./plans/<plan>.md) · Critique: [`../<critique>.md`](../<critique>.md).

---

## TL;DR
- <N PRs abiertos> (#NNN–#NNN) contra `<base>`, uno por slice. Cierran <IDs>.
- Cada PR pasa **`pnpm verify`** y **`pnpm test`** con **0 regresiones** sobre baseline.
- <Independientes desde la base / stackeados>. **Mergear en orden PR-1 → PR-N.** <supersesión clave>.
- DB local: Docker + Supabase (`127.0.0.1:54322`), sembrada con `pnpm seed:panorama`.

## Los N PRs
| PR | # | Rama | Hallazgos |
|----|---|------|-----------|
| 1 | [#NNN](url) | `branch` | C1 C2 … |

## Cómo testear
### 1. Levantar el entorno (una vez)
\`\`\`bash
pnpm db:status        # confirma que la DB local está healthy
pnpm seed:panorama    # datos sintéticos con volumen
pnpm dev              # http://localhost:3000
\`\`\`
### 2. Testear UN PR  → git checkout <branch>; pnpm dev
### 3. Testear TODO junto → branch de integración qa/<slug>-integrated (si existe)
### 4. Correr la suite → pnpm test ; pnpm verify

## ⚠️ Baseline de tests (LEER antes de asustarse con fallos)
<Lista de archivos que YA fallan en base, ajenos a este trabajo.>
<Tests flaky conocidos y cómo correrlos aislados: pnpm test <archivo>.>
**Criterio de "verde":** el set que falla == baseline (± flaky) y los tests nuevos del PR pasan.

## Orden de merge y supersesiones (IMPORTANTE)
<Orden + qué versión gana en qué archivos.>

## Migración
<archivo .sql — aditiva/idempotente, aplicada local sí/no, corre en CI vía pnpm db:migrate.>

## Checklist de QA manual (qué clickear, qué esperar)
| PR | Pantalla | Qué probar | Esperado |
|----|----------|------------|----------|

## Si la cowork Claude tiene que continuar/verificar
- Convención: SDD test-first, es-AR UI / inglés código, tokens `ln-op-*`, sin `Co-Authored-By`.
- Helpers nuevos reutilizables (puros, testeados): <lista>.
- Notas de honestidad: <cualquier afirmación del critique que NO se sostuvo y por qué.>
- Privacy gate: <qué PRs lo tocaron y qué debe re-pasarlo.>
```

## House rules (carry into every handoff)

- **Honesty over polish.** If a critique claim didn't hold, say so and explain
  the real cause (e.g. "<100% es por pets sin provincia, no por supresión
  k-anon"). The next Claude will act on what you write.
- **No `Co-Authored-By`** trailers. **No** invented green checkmarks — only
  claim "verde" you actually observed.
- **Events are append-only** — if the work "fixes" historical data, it must be a
  correction event, not a mutation; call that out.
- Keep commands copy-pasteable and each prefaced by one plain-language line of
  what it does and why.
- Cross-link the plan and critique so the doc is a hub, not an island.

---

## How to activate this as a Claude Code skill

This file lives in `docs/templates/` so it's version-controlled and reviewable.
To make Claude Code auto-trigger it, copy this folder into the project skills dir
once (it's git-ignored tooling, not app code):

```bash
mkdir -p .claude/skills/dim-handoff
cp docs/templates/dim-handoff/SKILL.md .claude/skills/dim-handoff/SKILL.md
```

After that, in any Claude Code session, "write a handoff for <X>" will load these
instructions automatically.
