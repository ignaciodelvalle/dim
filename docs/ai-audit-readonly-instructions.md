# DIM / MiMAR — Executable Read-Only Audit Checklist (for Claude Code / Fable)

> Hand this file to the autonomous agent **instead of** the raw "NextToken AI Auditor Rubric."
> It is the same audit, hardened for this repo and rewritten as a **runnable checklist**: exact commands,
> a fixed finding schema, and a final self-verification. Produced by a Cowork vetting pass on branch
> `chore/tech-debt-finish`. Cowork output is a **proposal** — verify against the live repo before trusting.

---

## 0. How to run (enforcement — do this before anything else)

1. **Apply the permission gate.** Merge `docs/audit-agent-permissions.json` into `.claude/settings.local.json`
   (or load it as the audit profile). Deny rules win; the agent's only writable path is `docs/audits/**`.
2. **Run in normal permission mode.** Do **not** pass `--dangerously-skip-permissions` / `bypassPermissions`
   — that voids every guard below. Anything not on the allow-list pauses for the human (intended).
3. **Deliverable = one report file.** `docs/audits/ai-audit-<YYYY-MM-DD>.md`. The repository must end
   **byte-identical** except for that file. You audit; you never remediate.

### Hard rules (enforced by the permission gate, restated for the agent)
- No edits to `app/ src/ lib/ components/ db/ scripts/ middleware.ts` or any config. Report only.
- No git mutation, no "repairing" git. This sandbox may show pack corruption (`improper chunk offset`) —
  that is a *sandbox* artifact; record it as a claim to verify, don't touch git. Reads only.
- No installs / lockfile writes. No `db:* / seed:* / migrate / rebuild / backfill / deploy`.
- No deleting "dead" code — this is event-sourced; cron/dynamic-dispatch modules look uncalled but aren't.
- Never copy a secret **value** into the report. Redact: `KEY=<redacted, len N>`.
- Severity is a **recommendation to the human**, never a license to act.

---

## 1. Repo context (condensed)

Next.js 15 (App Router / RSC) · React 19 · TypeScript strict · Drizzle ORM + Postgres/Supabase with **RLS**
· Zod v4 · Biome · Vitest + Playwright + axe · pnpm · Node ≥ 22.13. PII-heavy, government-adjacent (Mi
Argentina). Invariants: append-only events; projections `(events,filters)→view`; Spanish UI / English code;
**no plaintext DNI** (`lib/dni-hash.ts`). Layout: `app/(routes+actions)`, `src/modules/*` (~20 domains),
`lib/*`, `db/*.sql` (RLS), `scripts/*` (guardrail linters + cron closers).
**Skip the "few commits ⇒ AI degradation" heuristic** — this repo has a mature human git workflow.

---

## 2. Finding schema (use verbatim for every finding)

```
### [SEV-###] <short title>
- Severity: Critical | High | Medium | Low | Info
- Pass:     A–G
- Location: `path/file.ts:123`  (or command + verbatim output, or commit SHA)
- Status:   Confirmed | Suspected
- Evidence: <snippet or command output — secrets REDACTED>
- Impact:   <one line: why it matters>
- Fix (unapplied): <1–2 lines; non-trivial → diff in appendix, nothing applied>
```

### Worked example (real finding from the vetting pass — copy this shape)
```
### [SEC-001] Supabase service_role secret hardcoded in .claude/settings.local.json
- Severity: Critical
- Pass:     A (secrets)
- Location: `.claude/settings.local.json` (permissions.allow entries)
- Status:   Confirmed
- Evidence: allow rule embeds `SUPABASE_SERVICE_ROLE_KEY=<redacted, len 44>` inline in a Bash pattern
- Impact:   service_role bypasses RLS → full DB read/write if this file leaks or is committed
- Fix (unapplied): remove the key from settings; rotate it in Supabase; pass via env at runtime only
```

---

## 3. The checklist

Do phases in order. Capture every command's **exit code + output**. If the usage window closes, write the
partial report and list untouched areas under "Not audited." Each step says what to flag and when it's done.

### Phase 0 — Setup  ☐
- `git rev-parse --abbrev-ref HEAD` and `git rev-parse --short HEAD` → record branch + SHA in the report header.
- `git status --porcelain` → record baseline (should be clean-ish). **Done when** header metadata captured.

### Phase 1 — Run the existing gate (highest signal, read-only)  ☐
This repo encodes much of the rubric as executable checks. Run and fold results in:
- `pnpm typecheck` — return-type/contract breaks (Pass D/G)
- `pnpm lint` — dead code, unused imports, unreachable branches (Pass C/G)
- `pnpm lint:authz` — authorization-guard coverage (Pass A)
- `pnpm lint:rls` — RLS policy coverage per table (Pass A)
- `pnpm lint:deps` — layering/dependency-direction violations (Pass C)
- `pnpm lint:actions` — server-action complexity/size budget (Pass F)
- `pnpm test` — behavioral coverage **only if the local Supabase stack is already up**; otherwise skip and
  note it (do not start/seed a DB).
**Never run** `pnpm verify` (ends in `build`) or `deploy:staging` (migrations + vercel).
**Done when** each command's exit code + summary is recorded and non-zero results are turned into findings.

### Phase 2 — Security & privacy (TOP priority — PII/government app)  ☐
Run each grep; triage hits into findings.
- Secrets (literal values):
  `rg -n --hidden -g '!node_modules' -g '!*.webm' -e 'sb_secret_|sk_live_|SUPABASE_SERVICE_ROLE_KEY\s*=|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' .`
  Also confirm `.env.local.example` holds only placeholders: `cat .env.local.example`. **Redact values.**
- Secrets (referenced correctly): `rg -n 'process\.env\.' app src lib | head` — spot inline fallbacks like `?? "somekey"`.
- SQL injection (Drizzle raw): `rg -n 'sql\`' app src lib db` → flag any user input interpolated into `sql\`\``.
- XSS / eval: `rg -n 'dangerouslySetInnerHTML|\beval\(|new Function\(' app src components`
- Shell/path injection: `rg -n 'child_process|execSync|\bexec\(|spawn\(' app src lib scripts`
- AuthZ / IDOR: cross-read `lint:authz` + `lint:rls` output, then spot-check every `app/actions/*` for a
  server-side auth check **and** resource-ownership check: `rg -n 'export async function' app/actions | wc -l`
  then open the largest handlers. Guessable IDs without ownership check = Critical.
- RLS gaps: compare tables in `db/schema.ts` against policies in `db/*_rls.sql`:
  `rg -n 'pgTable\(' db/schema.ts` vs `rg -l '.' db/*_rls.sql`. Note any PII table without a policy.
- DNI / PII: `rg -n 'dni_number|dniNumber' app src lib` (should be none in plaintext); confirm `hashDni()`/`dniLast4()` at boundaries.
- PII in logs: `rg -n 'console\.(log|info|warn|error)\(' app src lib app/actions` → flag any emitting bodies, tokens, DNI.
- Weak crypto / RNG: `rg -n "createHash\(['\"]md5|createHash\(['\"]sha1|\bMath\.random\(" app src lib`
- CORS / headers: `cat middleware.ts next.config.ts` → flag wildcard `*` CORS on authed routes; missing CSP / X-Content-Type-Options / X-Frame-Options / HSTS.
**Done when** every command run and each hit either dismissed (with reason) or logged as a finding.

### Phase 3 — Async logic & state  ☐
- Swallowed errors: `rg -n -U 'catch\s*\([^)]*\)\s*\{[^}]*console\.[^{}]*\}' app src lib` → catch that logs then returns undefined = High on prod paths.
- Unhandled promises: `rg -n '\.then\(' app src lib | rg -v '\.catch'` and review `await` in `app/actions/*` without try/catch.
- Race/concurrency: `rg -n 'setInterval|setTimeout|new WebSocket|globalThis\.|module-scope cache' lib src` → concurrent writes to shared state without serialization; polling without cancellation.
- Lifecycle: `rg -n 'addEventListener|subscribe\(|setInterval' components src` → each needs a matching teardown (`removeEventListener`/`unsubscribe`/`clearInterval`).
- Boundaries: for async funcs over collections, check empty/null/single-item handling.
**Done when** async hot paths in `app/actions/*` and `src/modules/*` reviewed and flagged.

### Phase 4 — Architecture integrity  ☐
- Orphan modules: use `lint:deps` output + `rg` for zero-import files — **report only** (remember cron/dynamic dispatch).
- Pattern consistency: flag modules abandoning the event/projection pattern or the enforced layering.
- Cosmetic abstractions (interface w/ one impl, no isolation) → Info.
**Done when** deviations listed with `file:line`.

### Phase 5 — Logic & business rules  ☐
- `rg -n 'if\s*\([^=!<>]*=[^=]' app src lib` → assignment-in-condition (`=` vs `===`).
- Return-type consistency: lean on `pnpm typecheck` output.
- Atomicity: multi-step DB/external mutations → verify rollback/compensation; confirm **no path edits/deletes an existing event** (append-only invariant).
**Done when** each suspect traced and flagged/dismissed.

### Phase 6 — Dependencies (read-only, offline)  ☐
- Hallucinated/missing packages (no network):
  `node -e "const p=require('./package.json');const fs=require('fs');for(const d of Object.keys({...p.dependencies,...p.devDependencies})){if(!fs.existsSync('node_modules/'+d))console.log('MISSING:',d)}"`
  Any `MISSING:` that isn't a workspace alias = Critical supply-chain finding.
- CVEs: `pnpm audit --audit-level=high` **only if network is available** (it does not modify anything without `--fix`; never run `--fix`). If offline, skip and note.
**Done when** dep list reconciled; no installs performed.

### Phase 7 — Maintainability  ☐
- Complexity/size: defer to `pnpm lint:actions` budget output.
- Duplication: `rg` spot-checks; if no duplication tool is installed, note it and list suspected clones for the human (do not refactor).
- Env validation: confirm a startup routine validates required env vars before serving.
**Done when** recorded.

### Phase 8 — Iterative regression (read-only git)  ☐
- `git log --oneline -30 -- app/actions lib db/*_rls.sql middleware.ts` then `git show <sha>` on security-touching commits → flag any that removed/weakened a prior control, with SHA + `file:line`. **No git writes.**
**Done when** suspected regressions listed as Suspected findings.

---

## 4. Severity (recommendation only — you do not act)

| Severity | Criteria | Recommended action (human) |
|---|---|---|
| Critical | Hardcoded secret; auth bypass; SQLi; IDOR; RCE; plaintext DNI | Review immediately |
| High | Swallowed async error on prod path; wildcard CORS on authed route; weak crypto; missing RLS on PII table | Fix before next release |
| Medium | Orphan state w/o null guard; missing input validation (non-critical); suspected dead module | Triage this sprint |
| Low | Excessive comments; naming drift; duplicate block | Maintenance cycle |
| Info | Cosmetic abstraction; phantom guard; over-specified edge case | Document |

---

## 5. Final self-verification (run before finishing — do NOT skip)  ☐
1. `git status --porcelain` → output MUST contain only `docs/audits/ai-audit-<date>.md` (and possibly the
   settings merge). If any protected file appears, you violated read-only — stop and report it at the top.
2. `git diff --name-only` → confirm no source/config file changed.
3. Redaction check on your own report:
   `rg -n 'sb_secret_|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN' docs/audits/ai-audit-*.md`
   → MUST return nothing. If it matches, you leaked a secret value — redact and re-run.
4. Confirm every finding has Location + Evidence + Status (no unsupported claims).
**Done when** all four pass.

---

## 6. Report skeleton (`docs/audits/ai-audit-<YYYY-MM-DD>.md`)
```
# DIM/MiMAR AI Audit — <date>
## Metadata
Branch / HEAD SHA · commands run (with exit codes) · run mode · areas NOT audited
## Executive summary
Counts by severity · top 5 criticals
## Findings
Phase 2 (security) → 8 (regression), each using the §2 schema
## Not audited / limitations
(incl. sandbox git-corruption claim to verify on canonical repo)
## Appendix — Proposed patches (UNAPPLIED)
diffs for the human to review; nothing applied
```
End state: repo unchanged except this report. All fixes are the human's call.
