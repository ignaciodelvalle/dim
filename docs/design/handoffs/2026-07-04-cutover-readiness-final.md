# Cutover readiness — final state (2026-07-04 marathon close)

Consolidates the autonomous marathon's final state. Companion to `docs/ops/cutover-playbook.md` + `docs/ops/production-deploy-plan.md` (the operational how-to) — this is the **what's-done + what's-yours** summary.

## Verdict
**GO for a controlled single-jurisdiction PILOT** (per the capstone `docs/design/handoffs/2026-07-04-capstone-go-no-go.md`). The code is deploy-ready; the remaining gates are human/PO decisions and the ops layer (monitoring/alerting/restore-drill) that a self-operated province rollout needs.

## Environment state
- **Local + Staging Supabase: fully migrated to 0125** (0108→0125 applied via the app runner locally + Supabase MCP on staging). Staging security advisors: 0 ERRORs; anon oracles + pet-photos LIST closed; `notification_dead_letter` RLS deny-all.
- **:3000** serves the full converged build (panorama IA v2, dashboard fixes, notifications, Isis, exports).
- **Gate:** green in substance — the only local test failure is the Tuni pet-cache drift (a manual demo-data species edit; CI-clean on a fresh seed).

## What shipped this marathon (highlights)
Panorama IA v2 (SDD, archived) · notifications reinforce (createNotification single write-path + dedupe + dead-letter, 0124) · KPI catalog + 42%-vs-54% disambiguation · 2 gob PII leaks closed (raw-payload dump, fetch-then-filter-in-JS) · 6 org lists paginated · Isis lost-mode special-conditions · CaseQueue adoption + moderacion keyset + shared Outbox · :3000 500 fix (env fail-closed keyed on real remote-DB deploy) · notification_dead_letter RLS · /gob/historial jurisdiction scope + CSV exports · movilidad-jurisdiccional SDD · capstone (8-dimension GO/NO-GO) · **landing polish** (10 PO items — cycling hero through 6 pet states with real components, last-seen mini-map + pin, count-up metrics, one-word roles, "miMAR" over "libreta") · **PPP onboarding** (breed+weight surfaced as a strong-but-optional compliance obligation for dogs, closing the silent-PPP-escape gap; jurisdiction-resolved ppp_breed_list) · **bundle** (maplibre-gl lazy-loaded + recharts code-split).

**Operational note:** an agent running `pnpm build` clobbers the `.next` a live `next start` :3000 serves → JS chunks 400 → the app looks broken (all client interactivity dies at once) though the code is fine. Always rebuild+restart :3000 after any build; diagnose "broken page" reports headlessly first (Playwright, look for 400 + MIME-text/html on chunks).

**Later marathon additions (queue-to-close, PO-driven):**
- **Pet-profile "Una sola libreta" redesign** — the owner's core screen rebuilt as ONE cohesive 3-D credential/document with a Credencial/Libreta flip (not disconnected boxes): blue band, certificate frame, photo overlapping the band, real QR, borderless hairline-divided compliance rows, and a Libreta ledger whose asientos show the full field-set per event type with verified-vs-declared provenance stamps. Adversarial Cursor review + fixes (lost-owner capture, tab a11y, PPP dedup, sparkline). **Critical paint-bug caught + fixed**: the flip originally mounted both faces in `preserve-3d` + `backface-visibility:hidden` → Chromium didn't composite the visible face (empty frame); reworked to the mockup's single-painted-face edge-on swap. **Lesson: UI changes must be screenshot-verified — DOM tests passed while paint failed.**
- **Crisis-path Playwright e2e** (`e2e/crisis-*.spec.ts`, 6 specs) — public lost-credential + code-lookup + the authenticated owner→lost→public flow.
- **Bundle** — maplibre-gl lazy-loaded + recharts code-split (lighter first-load on Vercel).
- **st-token ratchet** — value-preserving px→token codemod, design-token baseline 4719→2493 (−47%); raw-button/skin-purity left tracked (no value-preserving swap exists — a design decision, not a codemod).

---

## HUMAN-GATED — the exact steps that are YOURS (in order)

1. **Prod Supabase decision** — reuse the staging project as prod, or spin a fresh prod project. (`docs/ops/remote-supabase-bootstrap-runbook.md`.)
2. **Apply prod migrations 0108→0125** — forward-only, via `pnpm db:migrate` against the prod session-pooler URL (or the MCP path used for staging). 0121 (case_events trigger), 0124 (notifications dedupe+dead-letter), 0125 (dead-letter RLS) are the newest.
3. **Vercel env vars (REQUIRED on a real deploy — the env fix makes the app fail-closed without them):** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, **`DNI_HASH_PEPPER`** (a real non-default secret — the app refuses to hash DNIs with the dev pepper on a remote-DB deploy), **`CRON_SECRET`**, **`NEXT_PUBLIC_SITE_URL`**. Boot-time validation (`lib/infra/env.ts` via `instrumentation.ts`) lists any missing one at startup.
4. **Domain / DNS** on Vercel.
5. **Enable leaked-password protection** — Supabase Auth dashboard toggle (the one residual advisor WARN that isn't SQL).
6. **`/code-review ultra`** — the billed, human-gated pre-deploy review. Run it on the branch before the first real deploy (recommended).

## PO DECISIONS still open (don't block the code; needed before the features they gate go live)
- **Corridor legal values** — validate the cited research draft (`2026-07-04-corridor-requirements-draft.md`) before `/viaje` shows real content.
- **Lost-mode disclosure defaults** — keep recovery-opt-out (name/phone/location shown by default, email off) or flip to privacy-opt-in.
- **#40 field-mutability policy** — jurisdiction + species lock in the pet edit: full-lock (all change via events) vs allow registration-mistake correction. (Recommended: full-lock.)
- **Tuni** — the demo pet is a cat with a dog's event history (my raw species edit); revert to dog or accept.

## DEFERRED fast-follows (tracked, not lost — post-pilot / next cycle)
- **Ops layer (the capstone's NOT-READY dimension):** monitoring/alerting (cron/drift → a webhook/email), a rehearsed Supabase restore drill, structured logging/APM. The `notification_dead_letter` retry cron (drain unresolved rows).
- **Regression armor:** a11y CI (axe + keyboard e2e), an authz-**scoping** lint (guard-called ≠ scoped), RLS write-path matrix, the crisis-path e2e (#35, designed).
- **Scale (province):** KPI/panorama rollup tables, remaining OFFSET→keyset, lazy-load maplibre/recharts (#22).
- **Product:** offline credential (PWA Fase B), reminder delivery channel (email/SMS/push), `/adoptar` public listing, panorama Fase-2 (locality choropleth, Δ-map).
- **Code health / cosmetics:** the st-token styling migration (zeroes the ratchet baselines bumped this session), OpButton burn-down, dead-code prune (Shell.tsx + primitives/), component-inventory folds (deriveHeroPetStatus, CaseBadge delegation, GovtHomeKpiStrip), welfare-detail shared case-header primitive, repo-hygiene (#21 branch prune).

## Deferred by PO decision (do NOT build)
No derived/composite scores · no prescriptive next-action recommendations · Endsley-L3 projection/simulation. ("Solo data útil.")
