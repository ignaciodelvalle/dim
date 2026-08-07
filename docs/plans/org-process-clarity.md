# Org-admin process-clarity plan

> Standalone deliverable. Grounded against branch `integration/all-20260703`.
> Sibling to `vet-process-clarity.md`, `owner-process-clarity.md`, and the govt+admin inspector
> campaign. **Run this SECOND** (after vet). Line numbers are anchors from a 2026-07 exploration;
> **spot-check them at execution time**.

## Context

The org portal (`/org/[orgToken]`) is the operational home for shelters, clinics, sanitary
authorities and rescue networks. Its onboarding was built (the `OrgSetupChecklist`), but the
"steady state" after onboarding is fragmented and **not gated by org type**:

1. Once setup completes, **nothing replaces the checklist** — there's no "you're set up, here's
   your daily loop" transition, and non-shelter org types land on a sparse panel.
2. The single "Pendientes" surface covers **only a fraction of the actionable queues**, shows
   rows that are always-zero for the current org type, and **omits maltrato entirely**.
3. Specialized org types (`sanitary_authority`, rescue networks) get materially thinner surfaces
   with no sense of "what's my open work."

The deep audit `2026-07-04-org-dashboards-audit.md` is the authoritative prior source for this
role — this plan sequences and extends it under the three clarity lenses.

Seed account for QA: `orgadmin@dim.test`. Portal: `/org/[orgToken]`.

## Gaps & fixes

### Lens 1 — Onboarding / first-run → steady state

- **No post-onboarding transition.** `OrgSetupChecklist` auto-hides when complete
  (`lib/infra/org-setup-checklist.ts:~136`), but nothing takes its place — the operator goes from
  a guided first-run straight to a panel with no "here's your daily loop" orientation.
  - **Fix:** on first completion, render a short "you're set up" transition / daily-loop summary
    (what to check each day, where the queues are), org-type-aware.
- **Non-shelter org types get a sparse panel.** The KPI row is `isShelter`-gated
  (`app/org/[orgToken]/page.tsx:~429`), so a clinic / authority sees far less structure.
  - **Fix:** give each org type a meaningful KPI/summary row (not the shelter one) — see Lens 2.

### Lens 2 — "What am I seeing" / org-type-aware surfaces

- **Unify the "Pendientes" surface — the core gap.** The Pendientes card
  (`app/org/[orgToken]/page.tsx:~561-601`) covers only **3 of ~8** actionable queues AND is **not
  org-type-gated**: a clinic sees an always-0 "Propuestas de tránsito" clutter row while the KPIs
  above it *are* gated. Worse, **maltrato has zero dashboard representation** — no card, no count,
  no KPI — the operator has to hunt the sidebar to find welfare cases assigned to their org.
  Check-ins / Ingresos also have no actionable count.
  - **Fix:** rebuild Pendientes as an **org-type-gated, complete** surface — every actionable queue
    the org type actually has, each with a live count, nothing that's structurally always-zero for
    that type. Include maltrato where the org receives welfare cases.
  - **Fix:** add **pending-count badges on nav items** (`nav-presets.ts` currently gives one only
    to the admin outbox) so counts are visible without opening each queue.
- **Thin specialized surfaces.** `sanitary_authority` gets just 2 link-cards, no KPI/pending/
  checklist (`app/org/[orgToken]/page.tsx:~753-777`). Rescue networks are similarly thin.
  - **Fix:** give each specialized type a real "what's my open work" surface (its own KPI +
    pendientes subset), not a pair of navigation links.

### Lens 3 — Open cycles / next step

- Every count in the unified Pendientes surface is itself a **next-step shortcut** — clicking a
  count lands on the filtered queue for that work, not a generic list. (Same principle the govt
  inspector campaign applies to KPIs → filtered queues.)
- **Contextual info / open items from the audit** (`2026-07-04-org-dashboards-audit.md`): execute
  its still-open findings — censo→mascotas filter break, Censo missing from `SEGMENT_LABELS`, the
  permisos 3-way label conflict, the species-enum leak. Spot-check line numbers first: the panel
  grew a "Requieren acción" card + a `primaryJob` lead since that audit was written.

## Prior-art to build on

- `docs/design/handoffs/2026-07-04-org-dashboards-audit.md` — **authoritative deep audit for org**
- `docs/design/handoffs/critiques-smoke-2026-07-03/critique-org-admin-2026-07-03.md`
- `docs/design/handoffs/2026-07-04-navigation-qol-audit.md` (nav badges / cross-cutting)

## QA contract (shared across all role plans)

1. **Updated tests** — org-type gating of the Pendientes surface (each org type sees exactly its
   queues, no always-zero rows), count correctness, nav-badge counts, specialized-type surfaces.
2. **Playwright visual** at desktop, logged in as `orgadmin@dim.test`, across each org type
   (shelter / clinic / sanitary_authority / rescue) — confirm each gets a complete, non-cluttered
   panel.
3. **Clickthrough**: from the panel, every pendiente count opens the correct filtered queue; no
   dead-ends; no console errors.
4. **Fix-gate:** auto-fix mechanical gating/count/label defects; **surface design decisions**
   (which queues belong to which org type, the post-onboarding transition layout) for PO
   ratification.
5. `pnpm verify` + `pnpm test` green (paste actual output). ⚠️ QA needs build + `:3000` —
   **schedule around Cowork**.

## Execution notes

- **Review→fix loop.** The org-type gating is the load-bearing design decision — get the
  type→queues matrix ratified by the PO before wiring counts.
- Reuse the audit's inventory instead of re-enumerating queues from scratch.
- No authorization/tenancy changes — surfacing and gating only.
