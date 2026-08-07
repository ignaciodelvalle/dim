# Handoffs — external-agent contract

This directory is the inbox for proposals and audits produced by agents that
are NOT Claude Code (Cursor/Cowork, one-off reviewers, QA agents). Claude Code
executes; everyone else recommends. This file is the orientation protocol —
read it before auditing or proposing anything.

## Lanes

- **External agents (Cowork, auditors, QA)**: recommendations only. Never
  write code into this repo. Deliver findings as a handoff document in this
  directory (or as chat text for the PO to relay). Naming:
  `YYYY-MM-DD-<topic>-{proposal|audit|handoff}.md`.
- **Claude Code**: executes with the quality gate (`pnpm verify` + `pnpm test`
  green, pasted output, conventional commits). Verifies every handoff claim
  against the code before acting on it — a handoff is input, not truth.

## Orient BEFORE you audit (mandatory)

Stale-state audits are the #1 failure mode. On 2026-07-03 an audit read
`.claude/worktrees/admin-rules-console/` (an old worktree) instead of the
canonical checkout and reported 5x-inflated file sizes, routes that no longer
exist, and a README problem that was already fixed. To not repeat that:

1. **State your ground truth.** Start every audit with the output of:
   ```
   git -C C:/dev/dim branch --show-current && git -C C:/dev/dim rev-parse --short HEAD
   ```
   If you cannot run git, say "UNVERIFIED SNAPSHOT" at the top and expect
   every number to be re-checked.
2. **The canonical checkout is `C:/dev/dim` — nothing below `.claude/`.**
   `.claude/worktrees/**` are frozen copies of the repo at older commits.
   If a path you are reading contains `.claude/worktrees`, stop: you are
   reading the past. (`.gitignore` and `.cursorignore` both exclude it;
   honor them even if your indexer does not.)
3. **Quote evidence with a command, not from memory.** Any quantitative claim
   (line counts, file counts, "X mentions Y") must carry the command that
   produced it (`wc -l <file>`, `rg -c <pattern>`), run on the canonical
   checkout at the SHA you stated.
4. **Check the current docs first.** `CLAUDE.md` (bootstrap) and `AGENTS.md`
   (deep context, slim index at the top) describe the CURRENT state.
   `docs/archive/**` and anything superseded in `docs/superpowers/README.md`
   describe the past — do not cite them as current.

## What happens to your handoff

Claude Code triages each claim into: **verified → task**, **verified-good →
no action**, **stale/wrong → discarded with evidence**, or **product decision
→ escalated to the PO**. Claims that arrive with commands and SHAs survive
triage; claims that arrive as prose usually don't.
