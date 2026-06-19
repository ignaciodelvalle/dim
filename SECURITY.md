# Security Policy

MiMAR / DIM is a digital pet-credential system handling personal data (Ley 25.326)
on a path toward Mi Argentina federation. Security is a launch gate, not an
afterthought. This document is **Wave 5 Item 30**.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

- Preferred: GitHub **private vulnerability reporting** (repo → Security → "Report a vulnerability").
- Or email the maintainer: **ignaciodelvalle2014@gmail.com**.

Please include reproduction steps, affected routes/tables, and impact. Expect an
acknowledgement within **72 hours** and a remediation plan or fix for confirmed
high/critical issues within **7 days**.

## Supported versions

Active development happens on `develop`; `main` is the released line. Only the
latest commit on each is supported — there are no back-ported patch releases.

| Branch | Supported |
|---|---|
| `main` | ✅ |
| `develop` | ✅ |
| feature branches | ❌ |

## Automated scanning

This repo runs, in CI (`.github/workflows/`):

- **CodeQL** (`codeql.yml`) — SAST over JS/TS on every push/PR to `main`/`develop` plus a weekly scan (`security-extended` query set).
- **Dependency audit** (`ci.yml` → `dep-audit`) — fails on HIGH/CRITICAL advisories. Triage/allowlist process is documented inline in `ci.yml` and `docs/ops/advisory-allowlist.md`.
- **Dependabot** (`.github/dependabot.yml`) — weekly npm + github-actions updates.

### Owner-gated repo settings (one-time)

The config files above do not enable protection by themselves. The repo owner must
turn these on in **Settings → Code security and analysis**:

- [ ] **Code scanning** (CodeQL) — on a private repo this requires GitHub Advanced Security.
- [ ] **Secret scanning** + **Push protection** — blocks committing keys/tokens.
- [ ] **Dependabot alerts** + **Dependabot security updates**.
- [ ] **Private vulnerability reporting**.

## Service-role key rotation

The Supabase **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses Row Level
Security and is the most sensitive secret in the system.

**Storage:** the key lives **only** in Vercel project environment variables
(and locally in `.env.local`, which is git-ignored). It is never committed, never
logged, and never shipped to the client (the module that reads it is marked
`server-only`).

**Rotation cadence:**

- Routine: **every 90 days**.
- Immediate, on any of: suspected exposure, a contributor with prod access
  off-boarding, or a leaked-secret alert from secret scanning.

**Rotation steps:**

1. Supabase dashboard → Project Settings → API → roll the `service_role` key.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production + Preview).
3. Redeploy so running instances pick up the new value.
4. Confirm the old key is revoked (Supabase shows only the active key).

Apply the same cadence/steps to `DNI_HASH_PEPPER` exposure (rotating the pepper
invalidates existing DNI hashes — see the data-protection note below).

## Privileged surface: the admin client

The service-role client has a **single entry point**: `lib/supabase/admin.ts`
(`createAdminClient()`). Properties of this surface:

- It bypasses RLS — RLS is a defense-in-depth backstop, not the primary gate. The
  primary authorization gate is the server-action / route boundary (see
  `AGENTS.md` → Authorization architecture).
- The service-role key must **never** appear in logs, error messages, or bundles.
  The module is `server-only`; do not re-export the client or the key.
- Privileged operations performed through it (admin/institutional actions,
  decomiso, etc.) are recorded in `audit_log` (action catalog in `db/schema.ts`).
  Any new privileged path must write an `audit_log` entry.

When adding a new caller of `createAdminClient()`, confirm the action is genuinely
operator/system scope and that it leaves an `audit_log` trail.

## Deploy gate

`pnpm deploy:staging` runs a pre-verification gate (`typecheck` + `lint` + token
lint) **before** migrating and deploying, so broken or non-conforming code cannot
ship. The full test suite runs in CI on every PR to `main`/`develop`.

## Data protection (Ley 25.326)

Privacy is enforced per-task. Before touching a public route, a token, or a PII
field, follow the **Privacidad y manejo de datos** checklist in `AGENTS.md`
(no DNI in plaintext; RLS backstop on new tables; never return raw event
payloads; privacy predicates in the query; scan-event retention; k-anonymity on
public aggregates; subject access/erasure RPCs).

**Production note:** set `DNI_HASH_PEPPER` in the production environment **before**
any real DNI data is written. The local/test default pepper produces hashes that
will not match a production-peppered table, breaking DNI de-duplication if set
later.
