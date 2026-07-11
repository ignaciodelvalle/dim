# Agent contracts — who are you, and which page governs you

One page per role, ≤10 rules each, every rule verifiable. Long prose does not
get followed (audited 2026-07-04: every contract violation that week traced to
either a missing role contract or a rule buried in a long document; the two
short role docs in this repo were followed on first use).

| You are… | Your contract |
|---|---|
| The main coding agent (Claude Code session) | `/CLAUDE.md` (repo root) |
| A read-only auditor / critique agent | `docs/design/handoffs/README.md` |
| A QA or data agent that MUTATES the local DB | `docs/agents/qa-mutation-contract.md` |
| A subagent spawned by the main agent | `docs/agents/subagent-card.md` |
| A human newcomer | `/README.md` → `AGENTS.md` slim index |

`AGENTS.md` is the knowledge base (data model, event catalog, legal framework)
— load its anchored sections on demand. It is context, not a contract.

## The recipe every agent brief starts with

**Poll every background child within your own turn.** After launching any
background child, poll its output within the same turn: loop on `Read` of its
output file, or re-run it synchronously. A turn may not end with a live child
unpolled. This is a STRUCTURAL rule, not a reminder — it recurred 3× in one day
despite prompt warnings, so it leads every brief as a positive recipe rather
than a buried "don't".

## Working-norm methodology (validated 2026-07-11)

- **Cursor as fresh reviewer is a standard pre-push step.** Before pushing a
  commit range, run a read-only adversarial pass with a fresh-context reviewer
  (cursor) over the range. Independent judgment on the diff, not token saving —
  it catches what the writer's context normalized away.
- **Parallel-writer model.** N read-only agents in parallel is free and
  encouraged. A SECOND writer runs ONLY in its own git worktree with disjoint
  file territory + its own targeted tests (local Supabase is shared, so schema/
  data writes must not collide), and lands through a serial integration merge
  gate: full `pnpm verify` + parity checks where applicable. No parallel writers
  in the same tree.
- **Spec-conflict rule: validated code beats design-handoff tables.** When a
  tested constant disagrees with a design handoff's token table, the code wins.
  Case study: the v2C README's divergent teal `#0d9488` was already replaced in
  `lib/analytics/viz-scales.ts` by `#0c866b` (`COLOR_DIVERGENT_ABOVE`) over a
  ΔE deuteranopia-margin violation — building from the table would have silently
  reintroduced a fixed CVD accessibility bug. Treat `viz-scales.ts` (and other
  test-pinned constants) as the source of truth; flag the handoff, don't follow it.

Machine-enforced rules (no memory required): `pnpm verify` lints,
`__tests__/cron-registry-parity.test.ts`, `__tests__/pet-cache-rederivation.test.ts`
(cache↔events drift), `__tests__/encoding-fitness.test.ts` (mojibake),
`.cursorignore` (stale-state reads). Prefer adding a check over adding a rule.
