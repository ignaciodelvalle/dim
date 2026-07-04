# MiMAR — Cutover Playbook (authoritative)

> **This is the governing document for going to production.** It is state-aware (reflects the real Vercel + Supabase inventory as of 2026-07-04) and decision-ordered. The mechanical step-by-step lives in [`production-deploy-plan.md`](./production-deploy-plan.md); **this file owns the phases, the gates, and who may do what.** When the two disagree, this file wins — update it as state changes.
>
> **Golden rule:** every remote-DB or production action is rehearsed on **staging first**, and the irreversible steps (prod migrations, prod secrets, DNS, billing) are **Ignacio-gated** — an agent proposes and prepares; Ignacio presses the button.

---

## 0. Where we actually are (2026-07-04)

Both platforms are already provisioned from the May–June preview deploys. We are **not** starting from zero — we are hardening a working preview into real production.

| Platform | What exists | State |
|---|---|---|
| **Vercel** | Project `ignacio-dim/dim`, git-integration auto-deploys Preview per push, prod URL `dim-ten-tau.vercel.app`, **no custom domain** | CLI authenticated (`ignaciodelvalle2014-4372`), repo linked |
| **Supabase** | One project `DIM` (`mardurkdicugnzmpirjd`, region `sa-east-1`, Postgres 17, healthy) | **STAGING** — 15 users, 2069 seed pets. NOT production data |
| **Migrations** | Remote applied 106, latest `0107`; local repo at `0117` | **Remote is 10 behind** (`0108`–`0117`), incl. the security-advisor fixes `0113`/`0114` |
| **DS** | Light-only (dark mode disabled in `globals.css`) | — |

**Consequence:** today's Vercel "production" deploy points `DATABASE_URL`/`SUPABASE_URL` at the **staging** Supabase. So what's live now is a working preview, not production.

### Env vars — real diff against the required matrix

Set on Vercel (Production + Preview), 19d ago:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `APPLY_INTENT_SECRET`, `MICROCHIP_FORCE_SECRET`, `TATTOO_ACK_SECRET`.

**Missing — must add before real production:**
| Var | Why it's blocking | Notes |
|---|---|---|
| `DNI_HASH_PEPPER` | Fail-closed guard (`d5105ee6`) makes `hashDni()` **throw in prod** without it → DNI registration/verification 500s | **Set ONCE, permanent.** Changing it invalidates every existing DNI hash. Generate strong random, store in a password manager, set in Vercel. |
| `NEXT_PUBLIC_SITE_URL` | `sitemap.ts` now **fails loud in prod** without it (`b7340c53`); landing OG/share needs one canonical domain | Value = the final production origin (see Domain decision). Single source of truth — the app has 3 divergent hardcoded fallbacks today (`mimar.ar`, `www.mimar.gob.ar`, sitemap) that all must obey this var. |

Confirmed **not** set (correct): `NEXT_PUBLIC_DEMO_MODE` — good, it won't bake `true` into the bundle.

### One architectural fact that governs the security posture

**RLS is NOT a backstop for server actions.** `db/index.ts` uses a direct `postgres-js` connection with no Supabase JWT, so `auth.uid()` is NULL and there is no `FORCE ROW LEVEL SECURITY` — RLS never fires for server-action writes. **App-layer guards are the only defense there.** RLS *does* matter for the PostgREST/anon REST surface (`/rest/v1/`), which is why the advisor findings (anon-executable `erase_subject_data`/`export_subject_data` RPCs, RLS-off tables) are real and why migrations `0113`/`0114` must reach production.

---

## 1. The decisions only Ignacio can make (resolve before Phase 2)

These gate the cutover. Each has a recommendation; none should be resolved by an agent.

| # | Decision | Recommendation | Cost / consequence |
|---|---|---|---|
| D1 | **Production Supabase**: reuse the `DIM` staging project (wipe the 2069 seed pets) **or** create a fresh prod project | **Fresh prod project.** Clean data separation, keep `DIM` as the QA/staging rehearsal env forever. | A second Supabase project (billing). Worth it — you never want to explain seed pets to a municipal auditor. |
| D2 | **`DNI_HASH_PEPPER` value** | Agent generates a 32-byte random; Ignacio stores it in a password manager and it goes into Vercel prod once. | Permanent. Never rotate on a DB with real DNI hashes. |
| D3 | **Production domain** → sets `NEXT_PUBLIC_SITE_URL` | Decide with the government partner. Until `mimar.gob.ar` is delegated, use a domain you control (`mimar.ar`) or the `vercel.app` URL — but set `NEXT_PUBLIC_SITE_URL` to it explicitly, never rely on fallbacks. | DNS delegation for a `.gob.ar` needs the partner org; plan lead time. |
| D4 | **First admin account** bootstrap | Follow the manual runbook step in `production-deploy-plan.md` §first-admin — created directly against prod, not seeded. | The only account that exists on a fresh prod DB; treat its credentials like root. |
| D5 | **Billing plan** on both platforms | Supabase Pro for prod (backups, no auto-pause); Vercel plan sized to the cron + function needs. | Recurring cost — a pilot municipality expects an SLA, which needs paid tiers. |

---

## 2. Phases and gates

Each phase has an **entry gate** (what must be true to start) and an **exit gate** (what must be true to advance). Do not skip a gate.

### Phase 0 — Code convergence (the marathon) — IN PROGRESS
The whole backlog lands and the branch goes green.

**Exit gate (all required):**
- [ ] `pnpm verify` green on `integration/all-20260703` — a **clean run from the orchestrator**, not an agent's mid-flight view (concurrent work produces false failures + `lint:tokens` ratchet noise; attribute every failure to a real cause).
- [ ] `pnpm test` green (paste output as evidence).
- [ ] The 🔴 GO-blockers verified fixed **by driving the flow**, not just tests: lost-pet photo no longer blocks finder CTAs (elementFromPoint on a photographed pet), adoptions detail no longer crashes, login click fires without console tricks, admin logout works.
- [ ] Authz `*ForUser` unexport landed (the confirmed-exploitable class) + `lint:authz`/`lint:rls` green.
- [ ] All marathon migrations present and numbered forward-only (recount the next free integer at write time — never hardcode from a plan).

### Phase 1 — Staging rehearsal (safe, mostly autonomous)
Everything irreversible gets tried on the `DIM` staging project FIRST. This is where migrations and the advisor-clearing are proven.

- [ ] Apply the **full** migration set (`0108`→final) to the **staging** `DIM` project via the app's migration runner (writes to `public._dim_migrations`). This is the rehearsal — do it here freely.
- [ ] Re-run `get_advisors(security)` on staging → confirm the ERROR-level findings clear (anon-executable erase/export RPCs, RLS-off `govt_business_rules`/`rate_limit_buckets`/`jurisdictions_census`). Any that remain → new corrective migration, forward-only.
- [ ] Deploy the converged branch to a **Vercel Preview** (git-integration does this on push) and run the §7 smoke checklist from `production-deploy-plan.md` against the Preview URL.
- [ ] Confirm the transaction pooler (6543) is used for app runtime and the session pooler (5432) only for DDL/migrations (`db/index.ts` `prepare:false`).

**Exit gate:** staging is on the final schema, advisors clear, Preview smoke passes.

### Phase 2 — Production provisioning (Ignacio-gated)
Resolve D1–D5, then:

- [ ] Create/choose the prod Supabase project (D1). If fresh: run the Supabase runbook (`production-deploy-plan.md` §5) — buckets (`org-logos`, `avatars`, `welfare-exports`, `ppp-exports`), extensions, then the **full** migration set `0001`→final.
- [ ] Load minimal reference data only (jurisdictions/census, SENASA vocab) — **no seed pets, no demo accounts.**
- [ ] Bootstrap the first admin account (D4).
- [ ] In Vercel prod env: add `DNI_HASH_PEPPER` (D2) + `NEXT_PUBLIC_SITE_URL` (D3); point `DATABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/keys at the prod project; confirm `NEXT_PUBLIC_DEMO_MODE` is unset. Set secrets via `vercel env add` reading from a file (`--sensitive`), never pasted in chat.
- [ ] Re-run `get_advisors(security)` on **prod** → clean.

**Exit gate:** prod DB on final schema with clean advisors, prod env complete, first admin exists.

### Phase 3 — Cutover
- [ ] Promote the converged deployment to **Production** (`vercel --prod` or promote the passing Preview).
- [ ] Run the §7 post-deploy smoke checklist against the production URL (auth, public credential, a lost-pet page, a cron ping, the DNI path that would have 500'd without the pepper).
- [ ] Connect the domain (D3) + verify `NEXT_PUBLIC_SITE_URL` matches; confirm sitemap + OG resolve on the real domain.

**Exit gate:** production serves real traffic, smoke green, domain live.

### Phase 4 — Post-cutover hardening
Feeds the capstone readiness assessment (task #20).
- [ ] Verify Supabase automated backups + do one restore drill.
- [ ] Confirm the 21 crons run in prod and record `cron_runs` telemetry (cron-health card green).
- [ ] Stand up **some** monitoring/alerting (there is none today — a real gap for a government tenant).
- [ ] Run the production-readiness capstone (task #20) against the live prod deploy.

---

## 3. Standing directives (how we work the cutover from now on)

1. **Staging-first, always.** No remote-DB action (migration, advisor check, data fix) touches prod before it's rehearsed on the `DIM` staging project. Staging is the dress rehearsal; prod is opening night.
2. **Migrations are forward-only and immutable.** Never a down-migration on a prod DB with real data. A mistake is corrected by a NEW migration. Writing a migration file is agent work; **applying it to a remote DB is Ignacio-gated.**
3. **Secrets never enter the chat.** Set them via `vercel env add ... --sensitive` reading from a file, or `--token "$(cat ~/.vercel-token)"`. `DNI_HASH_PEPPER` is set once, permanent.
4. **Agents prepare, Ignacio presses the irreversible button.** Autonomous: code, local verify, staging rehearsal, writing runbooks, Vercel Preview deploys, reading prod state. **Ignacio-gated:** prod migrations, prod secrets, prod promotion, DNS, billing, wiping any data.
5. **Rollback posture.** App: Vercel instant rollback to the previous production deployment. DB: forward-only correction (no down-migration on prod). Keep the last-known-good deployment id noted before each promotion.
6. **One canonical origin.** `NEXT_PUBLIC_SITE_URL` is the single source of truth; the hardcoded fallbacks (`mimar.ar`, `www.mimar.gob.ar`, sitemap default) are bugs to converge, not alternatives.
7. **Update this file when state changes.** It is state-aware by design; a stale playbook is worse than none. When a phase gate is met, check it here.

---

## 4. Quick status (update as we go)

- **Phase 0** — in progress (marathon converging).
- **Phases 1–4** — not started; blocked on Phase 0 exit gate + decisions D1–D5.
- **Immediate low-risk prep available now:** add `DNI_HASH_PEPPER` (generate) + `NEXT_PUBLIC_SITE_URL` to Vercel, and apply `0108`→final to **staging** as the migration rehearsal — both on Ignacio's go.
