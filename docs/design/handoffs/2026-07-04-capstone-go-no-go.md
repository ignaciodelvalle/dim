# Capstone — Production-Readiness & Go-to-Market Assessment

**Question:** what's missing to hand the keys to a municipality/province and have them use it?
**Date:** 2026-07-04 · **Branch:** `integration/all-20260703` · **Method:** 8 independent read-only dimension audits (engram `capstone/*`) cross-checked against HEAD, not handoff docs.

---

## Verdict

> **GO for a controlled single-jurisdiction PILOT (one comuna / one municipality), with our team monitoring by hand.**
> **NO-GO for an unmonitored, self-operated, province-scale production deployment — until the operations layer and the automated regression coverage land.**

Nothing found is a redesign. Every gap is integration, hardening, or a runbook. The engineering foundations are genuinely above median for this stage (append-only events with DB triggers + accountable override, forward-only checksummed migrations, k=5 anonymity as a compile-time branded type, a closed-and-CI-enforced impersonation-authz class, systematized empty/error states, es-AR consistency with zero English leaks).

## Dimension scorecard

| Dimension | Verdict | The one thing that gates it |
|---|---|---|
| Security | READY-FOR-PILOT | app-layer authz is the sole gate on the BYPASSRLS path — strong now (impersonation class closed + CI-enforced), no RLS backstop for prod hardening |
| Privacy | READY-FOR-PILOT | lost-mode disclosure defaults are recovery-opt-out (PO decision, not a bug); pet-photos bucket LIST open |
| Multi-tenancy | READY-FOR-PILOT | isolation is per-query discipline, not structural; no cross-org/jurisdiction e2e tests |
| **Reliability / ops** | **NOT-READY** | **zero active alerting; restore drill never run; a drift-cron cursor bug already at data threshold** |
| Perf / scale | READY-FOR-PILOT (NOT for province) | KPI/panorama still per-request GROUP BY (no rollups); 2 crons unbounded/nation-wide |
| Adoptability / UX | READY-FOR-PILOT | crisis UX is the standout; no automated a11y regression coverage |
| Product completeness | READY-FOR-PILOT (1 jurisdiction) | no offline credential; `/viaje` inert; reminders in-app only |
| Code health | READY-FOR-PILOT | authz lint proves guard-called, not scoped-correctly; RLS tests SELECT-only |

**7 of 8 READY-FOR-PILOT. Reliability/ops is the honest outlier and the real gate.**

---

## Critical path to a safe PILOT (small, mostly cheap)

1. **Ops minimum** — one alerting path (a webhook/email when a cron fails or drift spikes; the data already exists in `cron_runs`), boot-time env validation (`lib/env.ts` zod schema so a missing var fails fast, not a runtime 500), and a written "who to call / how to check" runbook. *~1 day.*
2. **Apply migrations to prod at cutover** — 0113/0114/0115/0121 (staging is already at 0122; prod is Ignacio-gated). The pre-0113 anon-read surface is the concrete pilot risk.
3. **Fix the drift-cron cursor** — `reconcile-pet-status` resets its cursor every run (caps at ~2000 pets; staging already has 2069). Confirmed by two dimensions.
4. **Cross-tenant e2e** — extend the owner-vs-owner isolation spec to org-vs-org and jurisdiction-vs-jurisdiction (#35's design covers the pattern).

For the pilot itself (one small jurisdiction, low volume) the scale gaps don't bite and *we* watch the dashboards — so the pilot bar is genuinely met today with items 1–3.

## Critical path to PRODUCTION (province-scale, self-operated)

- **Ops layer**: structured logging/APM, real alerting, a rehearsed Supabase restore drill.
- **Scale**: KPI/panorama rollup tables or caching, batch+per-province the two heavy crons, keyset the remaining OFFSET lists, lazy-load recharts/maplibre.
- **Regression armor**: a11y CI (axe + keyboard e2e), an authz **scoping** lint (guard-called ≠ scoped-correctly — the class code-health flagged), RLS write-path matrix, crisis-path e2e.
- **Product**: offline credential (PWA Fase B), reminder delivery channel (email/SMS/push), `/viaje` legal content, `/adoptar` public listing.
- **Security residuals**: REVOKE anon EXECUTE on `can_read_case`/`is_hidden_from_subject_case`, lock `pet-photos` LIST, make the DNI pepper fail-closed on *any* prod (drop the `&& VERCEL` condition), leaked-password Auth toggle.

---

## Decisions that are yours (PO), not engineering

- **Corridor legal values** — validate the cited research draft before `/viaje` ships real content.
- **Lost-mode disclosure defaults** — keep recovery-opt-out (name/phone/location shown by default, email off, owner reviews in the wizard) or flip to privacy-opt-in.
- **Business model** — convenio/procurement confirmed in-repo; no billing surface needed (correct for the model).
- **Pre-deploy `/code-review ultra`** — billed, human-gated; recommend running it on the branch before the first real deploy.

---

## What can be closed autonomously right now (cheap, concrete)

DNI-pepper `VERCEL` condition · anon REVOKE + pet-photos LIST (migration 0123) · `reconcile-pet-status` cursor persistence · boot-time env validation · `business-rules-reeval` per-province batching · the `"minimo"`/`"PANO —"` copy leaks · panorama reading absolute number. These close several PROD-blockers without a PO decision.
