# Critique map — DIM/MiMAR

The delicate, complex, and important parts of the codebase, with the essential
aspects each design/architecture critique must scrutinize. Two lenses:

- **Correctness & security** — "does it break / leak?" (Tiers 1–5 below)
- **Design & architecture** — "is it coherent, does it scale, does it read
  honestly, is it on-brand?" (Design tiers below)

## How the critique loop runs (fix-gate discipline)

Per topic: adversarial critique (fresh context, never wrote the code) →
adversarially VERIFY each finding (try to refute; drop the unconfirmed) → then:

- **Auto-fix** findings that are CONFIRMED **and** category ∈
  {correctness bug, missing guard, test gap, dead code, mechanical
  inconsistency}. Each fix ships with green DoD (tsc + biome + targeted vitest
  + the relevant `check-*` guard) and a re-critique of that topic. Loop until the
  topic's auto-fixable set is dry.
- **Surface, never auto-apply** findings that: change a privacy/security posture
  (k-anon, RLS, DNI, auth scope), alter an authorization boundary, are a
  subjective design/architecture judgment, or are a non-trivial refactor. These
  go to a ranked decisions report for the PO — "fixing" them is a decision, not
  a mechanical edit.

Convergence = no confirmed auto-fixable defects remain. The surfaced-judgment
list is a deliverable, not a failure.

---

## 🔴 Tier 1 — Privacy & data honesty (a leak here is irreversible / legal)

| Part | Where | Essential aspects |
|---|---|---|
| **k-anon + complementary suppression** | `lib/reference/locality-integrity.ts`, `src/modules/panorama/application/build-features.ts`, `class-scale.ts` | No sub-k value ever leaves a loader (suppressed→null BEFORE return). Complementary suppression: no province with exactly 1 suppressed cell + visible sibling. Differencing attacks across drills / windows / verifiedOnly. Department-tier fold preserves k. Suppressed renders as a distinct category, never as a value. |
| **DNI hashing** | `lib/utils/dni-hash.ts` | HMAC-SHA256 equality-only. Pepper permanent + prod fail-closed (throw on dev pepper). Never plaintext. `dniLast4` display-only. Rotation = data migration, not env change. |
| **THE CUBE** | `src/modules/panorama/infrastructure/cube-builder.ts`, `load-layer-features-cube.ts`, mig 0139 | Byte-parity with live. Build-time k-anon (no sub-k stored). Fail-safe degrade to live. Staleness gate (6h). Deny-all RLS. Eligibility (admin / complete geographic slice only — never partial-scope govt). Differencing across cube reads. |
| **Public credential page** | `app/p/[publicToken]`, `components/pet-profile/CredentialFace.tsx`, `src/modules/pets` | token→pet resolution. ZERO owner PII on the public page. Lost-pet contact activation only when lost. QR integrity. Rate-limited. No token enumeration. |

## 🟠 Tier 2 — AuthZ & tenancy (a hole = cross-tenant breach)

| Part | Where | Essential aspects |
|---|---|---|
| **RLS coverage & posture** | `db/rls.sql`, `db/*_rls.sql`, `__tests__/rls/coverage.test.ts` | Every PII/tenant table RLS-enabled. Deny-all default. App path is service-role (BYPASSRLS); anon/PostgREST surface closed (**the staging drift finding**). New table = classified. |
| **Authorization architecture** | pet-access, capability grants, `AGENTS.md#authorization-architecture` | No impersonation-class server actions (bare-userId writers). Capability pinned to the URL token (confused-deputy). IDOR fences (tenant pet_id on every event/attachment query). Operator routes institutionally gated. |
| **Govt jurisdiction scope** | `lib/metrics/scope.ts` (narrowGovtScope, jurisdictionPairClause), `govt_assignments` | Govt sees ONLY assigned jurisdictions. Whole-province subsumption (barrio-tagged pet matches province grant). No widening via crafted params (the `/api/panorama/scope` review). Partial scope never reads complete-slice aggregates. |
| **Auth / account types / roles** | `src/modules/auth`, `AGENTS.md#user-roles` | role↔account_type invariants. Institutional gate (active + non-erased + non-deactivated). Signup honest no-session failure. Mi Argentina federation premise intact. |

## 🟡 Tier 3 — Event-sourcing integrity

| Part | Where | Essential aspects |
|---|---|---|
| **Append-only event log** | `pet_events`, `src/modules/events`, 48 types | Never edit/delete. Corrections = new events. Every view is a projection (events are the only source of truth). Payload parity (written keys ⊇ read keys). |
| **Projections** | `lib/projections/pet-compliance`, `vaccine-reminder-state` | Status derives purely from events, deterministic. Compliance metrics match legal mandates. No hidden mutable state. |
| **Rabies observation / bites** | `bite_inflicted` / `rabies_observation_*` events | 10-day legal deadline correct (Decreto 4669/1973). State machine (in_progress→closed). Deadline timezone. Who can open/close. |

## 🟢 Tier 4 — Complex features (high surface area)

| Part | Where | Essential aspects |
|---|---|---|
| **Panorama map** | `SituationalMap.tsx` (3096 lines), `PanoramaConsole.tsx`, the drill | Honest rendering. Embedded drill: auth boundary + camera + state-sync (the live-QA findings). Classed-scale correctness. k-anon suppression display. Budget-bounded fan-out. |
| **Transfers / claim / custody disputes** | `src/modules/transfers`, `custody-disputes`, `return-to-owner`, `PetTransfer` | Current-holder confirmation handshake. Custody-chain integrity (`Ownership` history). No unauthorized transfer. Dispute-resolution authority. Claim-by-code validation. |
| **Scheduling** | `src/modules/service-offerings`, slot-materialization, appointments | No double-booking (concurrency). Timezone (`AR_TIME_ZONE`) on every slot/turno. Schedule-rule → materialized-slot correctness. Cancellation. |
| **Denuncias / welfare** | `src/modules/welfare`, `surveillance` | Exact location required → locality inferred. Evidence/attachment handling. PII in reports. Jurisdiction routing. Alert firing. |
| **Adoption / foster** | `src/modules/adoption`, `foster` | shelter-custody vs ownership. Foster-proposal authority. Adoption-resume flow. "En tránsito" semantics. |

## 🔵 Tier 5 — Resilience & cross-cutting

| Part | Where | Essential aspects |
|---|---|---|
| **DB budget / death-spiral guard** | `src/modules/panorama/application/db-budget.ts` | Bounded fan-out (time + crash-safety). Degraded-honest fallback. No unhandled rejection from abandoned siblings. Every heavy call-site wrapped (the guard). |
| **Rate limiting** | `lib/infra/rate-limit.ts` | Every anon write bounded. Per-(key, IP) caps. Telemetry/DoS surfaces. fail-open vs fail-closed choice. |
| **Cron fleet** | `lib/infra/cron-dispatcher.ts`, registry, `vercel.json` | Single daily-dispatcher parity. Every job monitored + telemetry. Cube-refresh timing (Pro). Idempotency. Auth gate on cron routes. |
| **Migrations** | `db/migrations/NNNN_*.sql` | Forward-only & immutable. RLS tracked. No hardcoded next integer. Remote apply is PO-gated. Reversibility posture. |

---

## 🏛️ Design tier A — Architecture

| Part | Where | Essential aspects |
|---|---|---|
| **Hexagonal-lite / strangler** | `app/actions` → `src/modules/*/application`, `docs/architecture/hexagonal-lite.md`, `check-dependency-direction`, `check-action-line-budget` | Thin actions (controllers), logic in modules. Dependency direction (modules don't import `app`). The 20 bounded contexts: cohesion vs coupling; what lives in the shared kernel (`lib/`). Migration debt honestly tracked. |
| **Event sourcing as design** | 48 event types, payload shapes | Event granularity (any "god-events"?). Payload-design consistency. Is the catalog coherent or accreted? Projection-as-view applied consistently. |
| **Module boundaries** | `src/modules/*` (20 contexts) | Cross-module edges within the allowed set. No cyclic deps. Clear ownership per aggregate. Shared-kernel discipline. |

## 📊 Design tier B — Dashboards & reporting

| Part | Where | Essential aspects |
|---|---|---|
| **Operator consoles** | Panorama, admin/gob dashboards, org portal | Information hierarchy (does the primary metric lead?). Cognitive load. "Map-as-dashboard" concept. Empty / loading / **degraded-honest** states (the `db-budget`). Scannability. The `OpKpi` system. |
| **Reporting** | `lib/metrics`, KPI registry, metric-labels guard, PPP-CABA export, "informe de situación" | Same metric = same number on every surface. Window/species/basis always stated. Export fidelity. Legal-artifact metrics (microchip mandate) traceable. Definitions/provenance (info tooltips). |

## 🎨 Design tier C — UI / design system

| Part | Where | Essential aspects |
|---|---|---|
| **Design system Ln\*** | `components/ui/*`, two tiers (citizen `ln-*` vs operator dark), token ratchet | Token discipline. Atomic coherence. Status encoding: **shape + icon + label, never color-only** (a11y/CVD). Touch targets. es-AR copy + accents. `AppShell` variants. The credential as brand centerpiece. |
| **Accessibility** | WCAG, `LnField` a11y work, reduced-motion, focus rings | label-input association, aria-required, heading hierarchy, contrast, reduced motion, keyboard nav. |
| **Owner screens** | the redesign in progress (`docs/design_handoff_owner_screens`) | "Pet is the credential" through-line. Mobile-first. Urgency ordering. Carousel/rail. Fidelity to the handoff. |
