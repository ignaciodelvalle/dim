<!--
  TEMPLATE — copy to  docs/audits/ai-audit-<YYYY-MM-DD>.md  and fill in.
  This docs/audits/ directory is the ONLY path the audit agent may write to.
  Rules: report only, secrets REDACTED (KEY=<redacted, len N>), no fixes applied.
  Finding schema per section 2 of docs/ai-audit-readonly-instructions.md.
-->

# DIM / MiMAR — AI Audit — <YYYY-MM-DD>

## Metadata
- Branch: `<branch>`
- HEAD SHA: `<short-sha>`
- Run mode: normal (permission gate `docs/audit-agent-permissions.json` applied) · bypass NOT used
- Commands run (command → exit code → 1-line result):
  - `pnpm typecheck` → …
  - `pnpm lint` → …
  - `pnpm lint:authz` → …
  - `pnpm lint:rls` → …
  - `pnpm lint:deps` → …
  - `pnpm lint:actions` → …
  - `pnpm test` → … (or "skipped — local Supabase not running")
- Areas NOT audited: <list, or "none">

## Executive summary
- Critical: N · High: N · Medium: N · Low: N · Info: N
- Top 5 criticals:
  1. …
  2. …
  3. …
  4. …
  5. …

---

## Findings

<!-- One block per finding, using the schema below. Group by phase. -->

### Phase 2 — Security & privacy

<!-- Carried from the Cowork vetting pass — CONFIRM against the live repo, do not assume: -->
### [SEC-001] Supabase service_role secret hardcoded in .claude/settings.local.json
- Severity: Critical
- Pass:     A (secrets)
- Location: `.claude/settings.local.json` (permissions.allow entries)
- Status:   Suspected (verify on canonical repo)
- Evidence: allow rule embeds `SUPABASE_SERVICE_ROLE_KEY=<redacted, len 44>` inline in a Bash pattern
- Impact:   service_role bypasses RLS → full DB read/write if this file leaks or is committed
- Fix (unapplied): remove the key from settings; rotate it in Supabase; pass via env at runtime only

### [SEV-###] <title>
- Severity:
- Pass:
- Location:
- Status:
- Evidence:
- Impact:
- Fix (unapplied):

### Phase 3 — Async logic & state
<!-- findings … -->

### Phase 4 — Architecture integrity
<!-- findings … -->

### Phase 5 — Logic & business rules
<!-- findings … -->

### Phase 6 — Dependencies
<!-- findings … -->

### Phase 7 — Maintainability
<!-- findings … -->

### Phase 8 — Iterative regression
<!-- findings … -->

---

## Not audited / limitations
- Sandbox git may report `improper chunk offset` corruption — verify with `git fsck` on the canonical repo.
- <other gaps, time-boxed cuts, offline-skipped checks>

## Appendix — Proposed patches (UNAPPLIED)
<!-- diffs for the human to review; NOTHING is applied. -->
```diff
```

---

## Self-verification (must all pass before this report is final)
- [ ] `git status --porcelain` shows only this report file (+ optional settings merge)
- [ ] `git diff --name-only` shows no source/config change
- [ ] `rg -n 'sb_secret_|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN' docs/audits/ai-audit-*.md` returns nothing
- [ ] every finding has Location + Evidence + Status
