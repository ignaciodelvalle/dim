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

Machine-enforced rules (no memory required): `pnpm verify` lints,
`__tests__/cron-registry-parity.test.ts`, `__tests__/pet-cache-rederivation.test.ts`
(cache↔events drift), `__tests__/encoding-fitness.test.ts` (mojibake),
`.cursorignore` (stale-state reads). Prefer adding a check over adding a rule.
