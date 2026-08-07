# Stack · Architecture · Solutions · Data-model reviews (2026-07-05)

20 targeted reviews, broad → specific, each derived to Cursor with a scoped brief. Cursor output goes to `docs/reviews/results/NN-*.md` as a numbered, actionable finding list (file:line · issue · severity · concrete fix). Synthesis + remediation ("y solucioná") follows once results land.

Stack: Next.js 15 (App Router) + React 19 + TS · Supabase (Postgres + RLS + Auth) · Drizzle (postgres-js, BYPASSRLS) · Tailwind + LN design system · Vitest + Playwright · pnpm. Event-sourced (pet_events/case_events append-only) · projections · app-layer authz · privacy tiers (Tier-0/1/2, k-anon k=5) · 46 tables · 126 migrations.

## Tier 1 — Architecture & invariants (broad)
1. **Event-sourcing integrity** — `db/triggers.sql`, `lib/events/**`, the accountable-override GUCs (`app.allow_event_mutation*`). Append-only truly enforced? Any edit/delete path that bypasses the trigger? Corrections-as-new-events honored everywhere? Override GUC scoped + audited?
2. **Projection correctness** — `lib/projections/**`, `rederivePetCache`. Is every view a pure `(events, filters) → view`? Any view treated as source of truth? Cache-vs-derive drift risks (the Tuni class)? Deterministic re-derivation?
3. **Authz model** — `lib/**/*.ts` server actions, `scripts/check-authz-guards.ts` + `check-authz-scoping.ts`. RLS is NOT a backstop for server actions — are all mutations app-guarded? The `*ForUser/*ForAuthority` impersonation pattern fully closed? The 48 guard-called-but-not-scoped offenders — real gaps?
4. **RLS defense-in-depth** — `db/rls.sql`, `db/migrations/*rls*`, `__tests__/rls/**`. Deny-all coverage complete? Write surface closed (not just reads)? Any anon/authenticated PostgREST hole?
5. **Privacy tiers & PII** — `/p/[publicToken]`, `lib/dni-hash.ts`, `lib/metrics/anonymity.ts`. Tier-0/1/2 boundaries leak-proof? DNI never plaintext? k-anon k=5 enforced on every aggregate? Free-text PII guards? Jurisdiction-drift PII (scope on pets.jurisdiction not payload)?

## Tier 2 — Stack-specific
6. **Next.js 15 App Router** — server/client boundaries, `"use client"` discipline, Suspense/streaming, non-serializable props across the RSC boundary, RSC data-fetching (no waterfalls), the hydration-determinism class (the credential paint bug).
7. **Server Actions** — `app/actions/**`, `lib/**` actions. Zod validation at every boundary? The validated-insert boundary consistent? revalidatePath/redirect correctness? Error shape uniform? No unguarded mutations?
8. **Drizzle query patterns** — `lib/**` queries. N+1s, fetch-then-filter-in-JS (PII-drift class), transaction boundaries, the BYPASSRLS connection discipline (db/index.ts), select-star over-fetch, cursor/keyset correctness.
9. **Postgres schema & indexing** — `db/schema.ts` (46 tables). Index coverage for hot filter+sort queries, composite-index correctness, FK on-delete/cascade semantics, enum-vs-text, nullable discipline, unique constraints.
10. **Migration discipline** — `db/migrations/**` (126), `scripts/migrate.ts`. Forward-only immutability, checksum tracking, the tx-vs-`CREATE INDEX CONCURRENTLY` marker, idempotency, any destructive/irreversible step.

## Tier 3 — Solution / subsystem-specific
11. **Event catalog & payload schemas** — `lib/events/event-schemas.ts`, the 48 types + movement_recorded. Payload validation completeness, upcast/versioning, the DOM-whitelist that stops PII/hash/internal-id leaks (asiento-fields).
12. **Compliance projection** — `lib/projections/pet-compliance.ts`. The provenance gate (al-día only when VERIFIED), `computeConfidence`, PPP/rabies/chip/sterilization rules, jurisdiction-rule resolution, the PPP-indeterminado logic.
13. **Case & welfare model** — `cases`/`case_events`/`welfare_reports`/`custody_disputes`. The status-enum mismatch (CaseStatus vs welfareReports), append-only case_events trigger, state-machine legality, moderation flow.
14. **Jurisdiction/locality canonicalization** — `lib/infra/ar-localidades.ts`, `resolveCanonicalJurisdiction`, `db/migrations/0117*`, the fitness sweep. Every write canonicalized? Stale-spelling handling? The locality-lock governance gap (#40)?
15. **Notification system** — `lib/infra/notification-service.ts`, the cron/broadcast paths. The single write-path honored (no direct db.insert)? Dedupe + dead-letter correctness? Delivery-channel gap (in-app only)? ARCH-P silent-swallow fully closed?
16. **Metrics / KPI / analytics** — `lib/metrics/**`, `lib/analytics/**`, `kpi-catalog.ts`. k-anon suppression on every aggregate, KPI numerator/denominator correctness, live-vs-rollup scaling, the panorama aggregation scoping.
17. **Concurrency & idempotency** — plain-insert hot paths, idempotency guards, the movement/scan-location capture, race conditions on ownership transfer / lost-mode toggling / event insert.

## Tier 4 — Cross-cutting quality
18. **Error handling & resilience** — `lib/infra/env.ts` (boot fail-closed), error boundaries, loading/error coverage, the ARCH-P silent-swallow class across services, cron failure/retry handling, the notification_dead_letter drain.
19. **i18n & content (es-AR)** — the display-layer i18n (case-kind labels), UUID/enum/blank leaks to the UI, es-AR consistency, the English-code/Spanish-UI invariant, date/number formatting.
20. **Testing strategy & coverage** — the `pnpm verify` ≠ `pnpm test` gap, source-DOM guards, fitness sweeps, test hermeticity (the concurrent-worker residue class), e2e coverage of crisis paths, the RLS read+write matrix, UI screenshot-verification gap.

## Dispatch
Waves of ~4 to Cursor (machine can't take 20 concurrent — vitest worker-crash lesson). Each brief: ROLE (adversarial reviewer) + SCOPE (the paths above) + LENS (the questions) + OUTPUT (numbered file:line · issue · severity · concrete fix; real issues only, no generic advice). Results → `docs/reviews/results/NN-slug.md`.
