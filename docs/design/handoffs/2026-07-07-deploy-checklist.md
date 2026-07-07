# Deploy checklist — real-user demo (2026-07-07)

Steps only YOU can do (gated: prod Supabase, migrations against remote, Vercel env, deploy).
Ignacio runs these locally on Windows. Run top to bottom. Each `!`-prefixed line can be run in the Claude Code prompt so its output lands here.

> Prereqs already done by Claude: branch `integration/all-20260703` is green (tsc + full test suite + build), demo path verified headless, migrations written through **0134** (forward-only, in the DIM ledger). Includes the total-audit security fixes — **0132** welfare-moderation-escalation, **0133/0134** `handle_new_user` role-hardening (closes a CRITICAL self-mint-admin hole; see `docs/reviews/results/total-audit-synthesis.md`). Nothing below touches code — it's provisioning + deploy.

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
Expect: the runner applies `0001…0134` in order and records each in `_dim_migrations` with a sha256. If it reports a checksum mismatch or a gap, STOP and tell Claude — do NOT force it.

> Do NOT use the Supabase dashboard SQL editor or the MCP `apply_migration` for these — they bypass the DIM ledger and desync the runner.

## 2b. Provision Storage buckets (dashboard → Storage)
The app writes files to these buckets — create each with the right visibility, or those flows 500 on the real deploy:
- **`pet-photos`**, **`org-logos`** — PUBLIC (read). Pet photos are re-encoded through sharp on upload (audit hardening), so only validated raster images land here.
- **`event-attachments`**, **`welfare-evidence`** — PRIVATE (served via 1h signed URLs). Legal/PII evidence — must NOT be public.
- The **MPF / PDF export** path needs its bucket present too — if `/gob/maltrato` "Exportar MPF" 500s post-deploy, a missing bucket is the cause (it fails silently on local, where Storage isn't provisioned).

## 3. Supabase Auth hardening (dashboard → Authentication)
- **Rate limits** (Auth → Rate Limits): keep/lower the sign-in + sign-up + OTP limits to sane values (defaults are fine for a demo).
- **CAPTCHA** (Auth → Settings → Bot & Abuse Protection): enable hCaptcha or Cloudflare Turnstile; paste the secret. (Protects signup/login from the enumeration+flood surface.)
- **Leaked-password protection** (Auth → Settings → Password): turn ON "Prevent use of compromised passwords" (this is the one MED Claude could not close in code — it's a dashboard toggle).
- **Email confirmations** (Auth → Settings): ⚠️ **DO NOT enable "Confirm email" yet.** It would close the residual signup session-cookie oracle, BUT the current two-step onboarding assumes a live session after step 1 — with confirmations ON, step 2 dead-ends and the user loses their typed name/DNI (audit finding, task #65). Leave OFF until the onboarding flow is reworked. The code-side enumeration (string-branch) is already fixed; app-layer rate limiting on signup is already shipped.

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
- **Security spot-check (the CRITICAL fix):** the new signup above must land as an **owner**, never admin/govt. If you want to be thorough, confirm a raw `supabase.auth.signUp({ options:{ data:{ user_role:'admin' }}})` still yields role `owner` on the deployed DB — the trigger ignores all request metadata (migrations 0133/0134). No account can self-mint a privileged role; elevation is service-role-only.

## 7. Re-run the cloud review (optional independent pass)
```
/code-review ultra
```
Run the no-arg form (it bundles the local branch — no base needed). The backlog-clearing marathon + total audit added ~30 commits since the last base `e50d38a7`, so a base-pinned diff would be huge. Claude ran its OWN multi-agent adversarial audit this session (findings + fixes in `docs/reviews/results/total-audit-synthesis.md` — it found and closed a CRITICAL self-mint-admin hole and its whole sibling class), so the billed cloud review is a confirmation pass, not the primary gate. Run it if you want the independent set of eyes before the real user.

---

## If anything is red
Tell Claude the exact error. The branch is green locally; a deploy failure is almost always a missing env var or the pooler-vs-direct URL swapped (migrations = direct 5432, runtime = pooler 6543).
