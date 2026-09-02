# 2026-07 topical briefs — index, and where each one went

> Snapshot: `b975f3e9d` (`main`; `11c0ffc57` pushed 2026-09-02 plus `lenses/A01.md`) · Audited SHA: `d7dbf25f7` (lenses ran before WU-0 merged) · Facts: `docs/architecture/facts.json`
> Status: draft — finalized 2026-09-02 by the synthesis writer; fresh review fixes applied 2026-09-02

The 28 numbered briefs in this directory are the dispatch of the **2026-07-05 topical audit**: one adversarial review per subject, each written as a self-contained SCOPE + LENS prompt. Their results are `docs/reviews/results/<same-number>-<same-slug>.md`, and three of them were re-run (`results/25-*-rerun.md`, `26-*-rerun.md`, `27-*-rerun.md`).

Nothing in this directory has moved. The **2026-09 fresh audit** re-cut the same ground into **36 lenses** with a different method (finder + refuters + a completeness critic, rather than one pass per subject), and this page is the mapping between the two generations. Use it when you need to know whether a 2026-07 finding was re-examined, and by whom.

- The 2026-09 briefs live at `docs/reviews/2026-09-fresh/briefs/<id>.md`, the executed lens files at `docs/reviews/2026-09-fresh/lenses/<id>.md`, and the index at `docs/reviews/2026-09-fresh/README.md`.
- **15 of the 36 lenses ran** ("EXECUTED lote 1"); **21 are deferred** to lote 2 with complete self-contained briefs.
- The mapping below was verified against each new brief's own Priors section and its cited prior paths — not against a plan. Where a 2026-09 brief names a prior, it names it as `docs/reviews/results/NN-*.md` and/or `docs/reviews/briefs/NN-*.md`.

## Old → new (all 28 accounted for)

| old brief | subject (from the brief's own SCOPE/LENS line) | 2026-09 lens | lens subject | status |
|---|---|---|---|---|
| `01-event-sourcing.md` | EVENT-SOURCING INTEGRITY | **A08** | Event-ledger integrity | EXECUTED lote 1 (+1 gap round) |
| `02-projections.md` | PROJECTION CORRECTNESS (event-sourced views) | **B06** | Projections & cache pairing | DEFERRED lote 2 |
| `03-authz.md` | APP-LAYER AUTHORIZATION | **A01** | Authz boundary invariant | EXECUTED lote 1 |
| `04-rls.md` | RLS DEFENSE-IN-DEPTH (anon/authenticated PostgREST surface) | **A02** | RLS and DB privilege | EXECUTED lote 1 |
| `05-privacy-pii.md` | PRIVACY TIERS & PII | **A06** | Privacy and PII flows | EXECUTED lote 1 (+1 gap round) |
| `06-nextjs-app-router.md` | NEXT.JS 15 APP ROUTER correctness | **B03** | Next.js edge (App Router + server actions) | DEFERRED lote 2 |
| `07-server-actions.md` | SERVER ACTIONS safety | **B03** | *(merged with 06)* | DEFERRED lote 2 |
| `08-drizzle-patterns.md` | DRIZZLE / POSTGRES-JS QUERY PATTERNS | **B04** | Data access & indexing | DEFERRED lote 2 |
| `09-postgres-indexing.md` | POSTGRES SCHEMA & INDEXING | **B04** | *(merged with 08)* | DEFERRED lote 2 |
| `10-migrations.md` | MIGRATION DISCIPLINE | **B05** | Migrations & DB objects | DEFERRED lote 2 |
| `11-event-catalog.md` | EVENT CATALOG & PAYLOAD SCHEMAS | **B07** | `packages/contract` boundary & event catalog | DEFERRED lote 2 (widened: a new contract-boundary audit around the re-run) |
| `12-compliance.md` | COMPLIANCE PROJECTION (legally sensitive) | **C02** | Compliance rules & canonical metrics | DEFERRED lote 2 |
| `13-case-welfare.md` | CASE & WELFARE domain model + state machine | **C01** | Cases, welfare, denuncias, decomiso, return-to-owner | DEFERRED lote 2 |
| `14-jurisdiction.md` | JURISDICTION / LOCALITY canonicalization | **A10** | Scoping: jurisdiction, org tenant, dashboards | EXECUTED lote 1 (+1 gap round) |
| `15-notifications.md` | NOTIFICATION SYSTEM | **C03** | Notifications & push | DEFERRED lote 2 |
| `16-metrics.md` | METRICS / KPI / ANALYTICS | **C02** | *(merged with 12)* | DEFERRED lote 2 |
| `17-concurrency.md` | CONCURRENCY & IDEMPOTENCY | **B09** | Concurrency & idempotency | DEFERRED lote 2 |
| `18-error-handling.md` | ERROR HANDLING & RESILIENCE | **C05** | Observability & error handling | DEFERRED lote 2 (widened with observability) |
| `19-i18n.md` | i18n & CONTENT (es-AR) | **C07** | UI conventions, design system, es-AR copy | DEFERRED lote 2 (widened with the design system) |
| `20-testing.md` | TESTING STRATEGY & COVERAGE | **C08** | Test honesty | DEFERRED lote 2 |
| `21-authz-scoping-audit.md` | AUTHZ SCOPING / TENANT ISOLATION | **A10** | *(merged with 14 + 24)* | EXECUTED lote 1 |
| `22-cache-event-pairing.md` | DENORMALIZED CACHE vs EVENT LOG pairing | **B06** | *(merged with 02)* | DEFERRED lote 2 |
| `23-cron-scale-failure.md` | CRON FLEET scale + failure semantics | **C04** | Crons: `vercel.json` vs the route dirs, dispatcher, registry parity | EXECUTED lote R |
| `24-tenant-isolation-dashboards.md` | MULTI-TENANT ISOLATION in operator dashboards | **A10** | *(merged with 14 + 21)* | EXECUTED lote 1 |
| `25-public-surface-abuse.md` | PUBLIC / UNAUTHENTICATED SURFACE abuse-resistance | **A03** | Public and unauthenticated surface abuse | EXECUTED lote 1 (+2 gap rounds) |
| `26-ownership-trust-chain.md` | OWNERSHIP / TRANSFER / DISPUTE trust chain | **A09** | Ownership and custody trust chain | EXECUTED lote 1 |
| `27-erasure-vs-immutability.md` | RIGHT-TO-ERASURE vs APPEND-ONLY LEDGER, corrections superseding, schema versioning | **A05** | Erasure vs immutability (Ley 25.326 art. 14/16) | EXECUTED lote 1 |
| `28-auth-recovery-session-hardening.md` | AUTH RECOVERY & SESSION HARDENING | **A04** | Auth, session, recovery, federation | EXECUTED lote 1 |

**All 28 are mapped; none was dropped.** Eleven of the 28 were re-examined in lote 1 — `01, 03, 04, 05, 14, 21, 24, 25, 26, 27, 28` — collapsing into nine lenses, because A10 absorbs three of them (14 + 21 + 24). A twelfth, `23`, was also re-examined, but in lote R (→ C04), not lote 1. The other sixteen wait on lote 2.

Two further briefs in this directory are **not** part of the numbered 28 and have no 2026-09 successor lens of their own — they were feature-specific adversarial audits written for a change in flight, and their subject matter now falls inside `A09` (custody/transfer trust chain) and `A01`/`A10` (org-scoped signing surfaces):

- `audit-atender-walkin.md` — the "Atender mascota" walk-in clinical-signing flow.
- `audit-transfercustody-2phase.md` — the two-phase receiver-consent custody handoff.

## New → old (all 36 lenses)

Read this direction when you are running a 2026-09 brief and want to know which prior findings you must triage.

| lens | prior brief(s) | first run? |
|---|---|---|
| A01 | `03-authz.md` | no |
| A02 | `04-rls.md` | no |
| A03 | `25-public-surface-abuse.md` (+ its rerun) | no |
| A04 | `28-auth-recovery-session-hardening.md` | no |
| A05 | `27-erasure-vs-immutability.md` (+ its rerun) | no |
| A06 | `05-privacy-pii.md` | no |
| A07 | — | **NEW** — uploads and storage had never been a lens |
| A08 | `01-event-sourcing.md` | no |
| A09 | `26-ownership-trust-chain.md` (+ its rerun) | no |
| A10 | `14-jurisdiction.md` + `21-authz-scoping-audit.md` + `24-tenant-isolation-dashboards.md` | no — 54 priors, the heaviest triage load in the audit |
| A11 | — | **NEW** — the whole `/api/v1` surface was built for the 2026-08 Android pilot |
| B01 | — | **NEW** — module shape vs `hexagonal-lite.md` |
| B02 | — | **NEW** — the `app/` → `db` boundary; ran as a decision memo, not a findings lens |
| B03 | `06-nextjs-app-router.md` + `07-server-actions.md` | no |
| B04 | `08-drizzle-patterns.md` + `09-postgres-indexing.md` | no |
| B05 | `10-migrations.md` | no |
| B06 | `02-projections.md` + `22-cache-event-pairing.md` | no |
| B07 | `11-event-catalog.md` | no — plus a new contract-boundary half |
| B08 | — | **NEW** — mobile app architecture & release config |
| B09 | `17-concurrency.md` | no |
| B10 | — | **NEW** — performance & size budgets |
| B11 | — | **NEW** — fence honesty: the fences themselves, not the code they check |
| C01 | `13-case-welfare.md` | no |
| C02 | `12-compliance.md` + `16-metrics.md` | no |
| C03 | `15-notifications.md` | no |
| C04 | `23-cron-scale-failure.md` | no — 28 priors, 27 closed |
| C05 | `18-error-handling.md` | no — plus a new observability half |
| C06 | — | **NEW** — build, deploy and environment matrix; its brief says so explicitly |
| C07 | `19-i18n.md` | no — plus a new design-system half |
| C08 | `20-testing.md` | no |
| C09 | — | **NEW** — e2e practice against `e2e/README.md`'s own rules |
| D01 | — | **NEW** — `AGENTS.md` data/event/roles/authz/privacy/legal sections vs code |
| D02 | — | **NEW** — `AGENTS.md` process sections + `CLAUDE.md` vs code |
| D03 | — | **NEW** — `docs/agents/*`, `docs/superpowers/`, `docs/architecture/`, run-books |
| D04 | — | **NEW** — process & governance |
| D05 | — | **NEW** — pitch-claims verification against `docs/design/handoffs/2026-07-07-govt-personas-pitch.md` and `README.md` |

Fourteen of the 36 lenses are new ground the 2026-07 dispatch never covered. Two of them — `A07` (uploads) and `A11` (the mobile API) — ran in lote 1 and produced 13 confirmed findings between them (A07: 5 MED + 1 LOW; A11: 3 MED + 4 LOW), which is the cheapest available argument that the 28-brief cut had real gaps rather than merely stale answers.

## What to carry over when you run one

- **A prior marked "closed" answers "does the old reproduction still work?", not "is the invariant enforced?".** The 2026-09 audit's only CRITICAL sits directly on top of a prior correctly marked closed: `03-authz`'s self-minted-admin finding was fixed in the application layer and re-verified, and the same class was then found alive over PostgREST, on a path no prior pass had considered. Triage the prior honestly, then go looking for the class somewhere else.
- **Several 2026-09 briefs merge two old briefs verbatim.** The merged text is preserved so a prior finding can still be triaged against its original wording. Do not paraphrase it away.
- **Prior findings that were re-filed rather than re-numbered are noted in the lens file**, not here. `docs/reviews/2026-09-fresh/FINDINGS.json` carries `priorId` and `priorStatus` on every entry that has one.
