# Deploy checklist — real-user demo (2026-07-07)

Steps only YOU can do (gated: prod Supabase, migrations against remote, Vercel env, deploy).
Ignacio runs these locally on Windows. Run top to bottom. Each `!`-prefixed line can be run in the Claude Code prompt so its output lands here.

> Prereqs already done by Claude overnight: branch `integration/all-20260703` is green (tsc + tests + build), demo path verified headless, migrations written through **0130** (forward-only, in the DIM ledger). Nothing below touches code — it's provisioning + deploy.

---

## 1. Fresh production Supabase project
1. supabase.com → New project (region closest to AR — `sa-east-1` São Paulo). Save the DB password.
2. From **Project Settings → Database**, copy two connection strings:
   - **Direct** (port 5432) — for migrations.
   - **Pooler / Transaction** (port 6543, `...pooler.supabase.com`) — for the app at runtime.
3. From **Project Settings → API**, copy: `Project URL`, `anon` key, `service_role` key.

## 2. Run migrations against the fresh DB (the DIM runner, NOT the Supabase MCP)
```
# From C:\dev\dim, using the DIRECT (5432) string:
DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" pnpm db:bootstrap
DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" pnpm db:migrate
```
Expect: the runner applies `0001…0130` in order and records each in `_dim_migrations` with a sha256. If it reports a checksum mismatch or a gap, STOP and tell Claude — do NOT force it.

> Do NOT use the Supabase dashboard SQL editor or the MCP `apply_migration` for these — they bypass the DIM ledger and desync the runner.

## 3. Supabase Auth hardening (dashboard → Authentication)
- **Rate limits** (Auth → Rate Limits): keep/lower the sign-in + sign-up + OTP limits to sane values (defaults are fine for a demo).
- **CAPTCHA** (Auth → Settings → Bot & Abuse Protection): enable hCaptcha or Cloudflare Turnstile; paste the secret. (Protects signup/login from the enumeration+flood surface.)
- **Leaked-password protection** (Auth → Settings → Password): turn ON "Prevent use of compromised passwords" (this is the one MED Claude could not close in code — it's a dashboard toggle).
- **Email confirmations** (Auth → Settings): enabling "Confirm email" closes the residual signup session-cookie oracle (the code-side enumeration is already fixed).

## 4. Vercel — project + env vars
Env vars (Vercel → Project → Settings → Environment Variables), Production scope:
| Var | Value |
|---|---|
| `DATABASE_URL` | the **POOLER** (6543) string — runtime uses the pooler |
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `CRON_ALERT_WEBHOOK` | a Slack/Discord webhook URL (the cron fleet 500s + alerts here — Wave F2) |
| _(any others the current build reads)_ | cross-check `.env.example` / `.env.local` for the full set before deploy |

> Cross-check the full var list against your local `.env.local` — anything the app reads at build/runtime must be set in Vercel or the build fails.

## 5. Deploy
- Connect the repo, set the production branch to `integration/all-20260703` (or merge it to `main` first if you prefer `main` as the deploy branch).
- Framework: Next.js (auto). Build command default. Node 24.
- Deploy. Watch the build log — if it fails on a missing env var, add it and redeploy.

## 6. Post-deploy smoke (do before handing the URL to the real user)
- `/` loads; `/login` → log in as a seeded account (or create a real one).
- Open a pet → the **credential mounts + flips + QR** (the flagship). Scan the QR with a phone → the public `/p/<code>` page resolves.
- `/perdidas`, `/adoptar` load. `/gob` panel loads for a govt account.
- Sign up a brand-new real account end-to-end (the user's own path).

## 7. Re-run the cloud review (the overnight one timed out)
```
/code-review ultra e50d38a7
```
Claude ran its own adversarial review overnight (findings in `docs/reviews/results/uxgate-synthesis.md`), but the billed cloud `/code-review ultra` hit a 30-min timeout and produced nothing — re-run it now for the independent pass.

---

## If anything is red
Tell Claude the exact error. The branch is green locally; a deploy failure is almost always a missing env var or the pooler-vs-direct URL swapped (migrations = direct 5432, runtime = pooler 6543).
