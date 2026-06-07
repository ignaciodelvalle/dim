# DIM Architecture — Hexagonal-lite + Screaming Architecture

> Status: **adopted** · Applies to: all backend logic (server actions, business rules, persistence)
> Companion docs: [`AGENTS.md`](../../AGENTS.md) (domain model & event-sourcing principles), [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

---

## TL;DR

Business logic used to live inside **fat server actions** — single functions (some over 2,900 lines) that mixed auth, validation, business rules, raw Drizzle queries, and side-effects. That made rules hard to test, hard to find, and hard to change without fear.

We refactored every domain into **`src/modules/<domain>/`** with four layers and one hard rule: **dependencies point inward.** The domain core is pure and framework-free; the database and Next.js live at the edges.

This is **Hexagonal-lite**: the *spirit* of Ports & Adapters (domain at the center, infrastructure at the rim) **without** the full ceremony (no entity-mapper per table, no port interface for everything, no Unit of Work). It respects the project's event-sourced grain instead of fighting it.

It is also **Screaming Architecture**: the folder tree screams *what the app does* (`adoption`, `foster`, `surveillance`…), not *what framework it uses*.

---

## Why (the problem we were solving)

| Before | After |
|---|---|
| `app/actions/events.ts` = 2,919 lines, 20 functions | Each event is a use-case; `events.ts` is now a 142-line shim |
| Business rules tangled with `db.select(...)` calls | Rules are pure functions in `domain/`, unit-tested without a DB |
| Auth, validation, side-effects all inline | Auth at the action edge; orchestration in use-cases; persistence in repositories |
| No clear place for a rule to live | One obvious home per concern, per domain |
| To test a rule you needed Postgres + Next | Domain tests are pure and fast; only repositories need Postgres |

The goal was **maintainability and testability of business rules on a live product** — without freezing feature delivery and without rewriting the event-sourcing foundation that already works.

---

## The four layers and the dependency rule

```mermaid
flowchart TD
    subgraph edge["Edges (framework / IO)"]
        A["actions.ts<br/><i>thin Next server actions</i><br/>parse input · AUTH · redirect"]
        I["infrastructure/<br/><i>Repository</i><br/>Drizzle queries · tx · outbox"]
    end
    subgraph core["Core (pure, framework-free)"]
        APP["application/<br/><i>use-cases</i><br/>orchestration · transactions"]
        DOM["domain/<br/><i>pure rules + types</i><br/>no @/db · no next"]
    end

    A -->|calls| APP
    APP -->|depends on| DOM
    APP -->|calls| I
    I -->|returns| DOM

    classDef coreCls fill:#1f6feb22,stroke:#1f6feb;
    classDef edgeCls fill:#8957e522,stroke:#8957e5;
    class APP,DOM coreCls;
    class A,I edgeCls;
```

**The one rule: dependencies point inward.** `domain/` knows about *nothing* outside itself. `application/` knows `domain/` and depends on repository *behavior*. `actions.ts` and `infrastructure/` are the only layers that touch the framework (Next.js) and the database (Drizzle).

| Layer | Responsibility | May import | May NOT import |
|---|---|---|---|
| **`domain/`** | Pure business rules, value types, state machines, validation, classification. Deterministic, no IO. | other `domain/` files, `@/db/schema` **types only** | `@/db` (runtime), `drizzle-orm`, `next`, any repository |
| **`application/`** | Use-cases: orchestrate a single operation. Open a transaction, call the repository, collect post-tx notifications, return a `Result`. | `domain/`, repository (by shape) | `next`, raw `@/db` queries |
| **`infrastructure/`** | Repository: the *only* place that issues Drizzle queries. Thin over the ORM, transaction-threaded, returns domain-shaped data. | `@/db`, `drizzle-orm`, `domain/` | `next`, `application/` |
| **`actions.ts`** | Thin Next.js `"use server"` controllers: parse `FormData`, run the **auth guard (security boundary)**, build the input DTO, invoke the use-case, flush best-effort notifications, `redirect`. No business rules. | everything below it | — |

> The inward rule for `domain/` is **enforced by Biome** (`noRestrictedImports` on `src/modules/*/domain/**` blocks `@/db`, `drizzle-orm`, `next`). It's a guardrail, not just a convention.

---

## Anatomy of a module

```
src/modules/adoption/
├── domain/                      # pure — no framework, no DB
│   ├── types.ts                 # DTOs / value shapes
│   ├── eligibility-rules.ts     # validateEligibilityInput(...)
│   ├── listing-rules.ts         # isListable(...), validatePublish(...)
│   ├── finalize-rules.ts        # validateFinalizationInput(...)
│   └── __tests__/               # fast pure unit tests
├── application/                 # use-cases — orchestration
│   ├── finalize-adoption.ts     # FinalizeAdoption(input, deps)
│   ├── submit-adoption-application.ts
│   ├── set-adoption-eligibility.ts
│   └── __tests__/               # unit tests with a fake repository
├── infrastructure/              # the only place with Drizzle
│   ├── adoption-repository.ts   # tx-threaded queries, returns domain types
│   └── __tests__/               # integration tests (real Postgres)
└── actions.ts                   # thin "use server" controllers
```

Every domain follows the same shape, so once you learn one you can read them all.

---

## A concrete walkthrough — *finalize an adoption*

```mermaid
sequenceDiagram
    participant UI as Adoption form (page)
    participant Act as actions.ts<br/>finalizeAdoptionAction
    participant UC as application/<br/>finalize-adoption
    participant Dom as domain/<br/>finalize-rules
    participant Repo as infrastructure/<br/>AdoptionRepository
    participant DB as Postgres (Drizzle)

    UI->>Act: FormData submit
    Act->>Act: requireCapability(...)  ← SECURITY BOUNDARY
    Act->>Act: upload contract file (pre-tx IO)
    Act->>UC: finalizeAdoption(input, {repo, tx})
    UC->>Dom: validateFinalizationInput(input)
    Dom-->>UC: ok / error (pure)
    UC->>Repo: insertAdoptionFinalized(args, tx)
    Repo->>DB: INSERT event · close custody · insert owner · attachment row (atomic)
    DB-->>Repo: rows
    Repo-->>UC: domain result
    UC-->>Act: { ok, notifications[] }
    Act->>Act: flush notifications (post-tx, best-effort)
    Act-->>UI: redirect()
```

Notice the separation:
- **Auth stays in the action.** Drizzle bypasses Postgres RLS by design, so the action is the security boundary. The use-case receives an already-authorized context.
- **Rules are pure.** `validateFinalizationInput` has no DB — it's tested in milliseconds.
- **Atomicity is explicit.** The repository takes the transaction (`tx`); multi-step writes commit together. No hidden Unit of Work.
- **Notifications are best-effort, post-transaction.** A failed notification never rolls back the adoption.

---

## Shared kernels & the strangler strategy

Two concerns are used by *almost every* module and could not be moved with a big-bang repoint on a live product:

- **`cases`** — the case state-machine (`openCase`/`closeCase`/lifecycles/auto-closers).
- **`organizations`** — the authorization core, `requireCapability`, imported by ~30–48 files.

For these we kept the old paths (`lib/case-helpers.ts`, `lib/capabilities.ts`, …) as **thin re-export shims** that delegate into the new module. Every existing caller keeps working **unchanged**; the logic moved, the import path didn't.

```mermaid
flowchart LR
    Caller["48 callers<br/>import { requireCapability }<br/>from '@/lib/capabilities'"]
    Shim["lib/capabilities.ts<br/><i>thin re-export shim</i>"]
    Mod["src/modules/organizations/<br/>infrastructure/authz-resolver.ts<br/>domain/capabilities.ts"]
    Caller --> Shim --> Mod
```

This is the **strangler pattern**: the new implementation grows around the old seam; the old file is reduced to a pass-through and deleted only once every importer is repointed (a low-risk follow-up). The same technique let `app/actions/events.ts` shrink from **2,920 lines to a 142-line shim** while every event form kept working.

---

## Relationship to event-sourcing

This architecture **layers on top of** the principles in [`AGENTS.md`](../../AGENTS.md) — it does not replace them:

- **Events are still the spine.** Use-cases append immutable events; repositories persist them.
- **Projections are still first-class.** The pure projection functions (`lib/projections/*`) are exactly the kind of code that belongs in `domain/` — and the modules reuse them rather than reimplementing.
- Hexagonal-lite simply gives those events, rules, and projections **a consistent home and a testable boundary**.

---

## Rules & conventions (do / don't)

✅ **Do**
- Put a rule with no IO in `domain/`. If you're tempted to query the DB there, you're in the wrong layer.
- Keep `actions.ts` thin: parse → auth → call use-case → redirect.
- Thread the transaction through the repository for multi-step writes.
- Collect notifications and flush them **after** the transaction (best-effort).
- Use the transaction idiom that survives strict TypeScript:
  ```ts
  const r = await transaction(async (tx) =>
    repo.method(args, tx as Parameters<typeof repo.method>[1]),
  );
  ```

🚫 **Don't**
- Don't import `@/db`, `drizzle-orm`, or `next` inside `domain/` (Biome will reject it).
- Don't run auth checks inside use-cases — the action is the security boundary.
- Don't widen an action's authorization scope. Scope to the *correct* org/owner (a cross-org capability check that ignores the resource's org is a security bug).
- Don't drop side-effects on migration: `audit_log` rows, idempotency keys, and cascade closes are **behavior** — preserve them byte-for-byte.

---

## Testing strategy (strict TDD)

| Layer | Test kind | Needs Postgres? | Speed |
|---|---|---|---|
| `domain/` | pure unit | no | fast |
| `application/` | unit with a **fake repository** | no | fast |
| `infrastructure/` | integration vs **real Postgres** | yes | slower (serial) |
| `actions.ts` | parity tests (auth path, redirect, post-tx flush) | mocked | fast |

Coverage thresholds: **90% branches** on domain rules, **70–75%** on the module/action layer. `vitest.config.ts` includes `src/**` so the new modules are actually measured (not vacuously passing).

Each migration was independently **verified** against the deleted original for behavior parity. That adversarial pass caught real regressions before they shipped (a cross-org auth bypass, a missing audit trail, a lost idempotency key) — which is exactly why it exists.

---

## How to add or migrate a domain

1. **Scaffold** `src/modules/<domain>/{domain,application,infrastructure}/`.
2. **Domain first (test-first):** extract pure rules from the existing fat action; reuse existing pure code (projections, lifecycles).
3. **Repository:** wrap the Drizzle queries, transaction-threaded, returning domain types. Integration-test against Postgres.
4. **Use-cases:** one per operation; inject the repository + authorized context; orchestrate the transaction; collect post-tx notifications.
5. **Thin actions:** parse → auth at the edge (scope correctly!) → call use-case → flush → redirect.
6. **Strangler cut:** repoint consumers (or leave a re-export shim for widely-imported kernels). Delete the old fat action **only after parity tests are green**.
7. **Verify** against the original for parity, then ship.

---

## Module map

| Module | Replaces (old fat actions) | Notes |
|---|---|---|
| `adoption` | `adoption*.ts` | reference slice |
| `pets` | `pets.ts` | |
| `foster` | `foster*.ts` | |
| `transfers` | `pet-transfer.ts`, `cross-org-transfer.ts`, `transfer.ts` | 3 sub-flows |
| `cases` | `lib/case-*` | **shared kernel** (shims) |
| `welfare` | `welfare*.ts` | rate-limit, moderation, escalation |
| `surveillance` | `bite.ts`, `outbreak-investigation.ts`, ENO | bite / rabies / ENO / outbreak |
| `organizations` | `org*.ts`, `lib/capabilities.ts` | **auth kernel** (shims) |
| `events` | `events.ts` (2,919 → 142-line shim) | the event spine |

---

## Known follow-ups (tracked, non-blocking)

- Remove the `lib/*` re-export shims once every importer is repointed (capabilities, case-helpers, eno-*, rabies-*, event-schemas, welfare-moderation).
- `cases`: extract the read-model query repository (deferred WU).
- A small number of pre-existing **flaky tests** (DB-state isolation under the full serial suite) predate this work and should be addressed separately.
