# Vet process-clarity plan

> Standalone deliverable. Grounded against branch `integration/all-20260703`.
> Sibling to `org-process-clarity.md`, `owner-process-clarity.md`, and the govt+admin
> inspector campaign. **Run this FIRST** — the vet identity is the murkiest and highest-value.
> Line numbers are anchors from a 2026-07 exploration; **spot-check them at execution time**,
> the codebase moves.

## Context

The veterinarian is the DIM role with the weakest sense of "where am I, what's my status, what
do I do next." Three things compound:

1. A vet who just got approved has **no clear path to a work surface** — the landing logic drops
   them on a meta-list, not a place to work.
2. The upgrade→approval→consultorio pipeline **lies about timing** and leaves the in-flight
   request invisible once you leave two buried account subpages.
3. The **single most common vet path** — a solo professional creating their own clinic — hits an
   early-return that *bypasses the onboarding checklist that was built for exactly this account*,
   landing them in a dead empty agenda with no next step.

This plan closes those gaps under the three lenses (onboarding · "what am I seeing" ·
open-cycle/next-step) without changing the vet's authorization model — it's wayfinding, copy,
and first-run surfacing, reusing structures that already exist.

Seed account for QA: a vet account (`alejo@dim.test` per session notes — confirm at execution).
Landing resolution lives in `lib/infra/role-landing.ts`.

## Gaps & fixes

### Lens 1 — Onboarding / first-run

- **Solo-clinic first-run is the sharpest gap.** A solo professional who creates their own clinic
  becomes its sole admin, but `app/org/[orgToken]/page.tsx` returns early into
  `SoloVetAgendaLanding` (`SoloVetAgendaLanding.tsx`, imported at `page.tsx:59`, rendered ~`:246`)
  **before** the `OrgSetupChecklist` branch (rendered ~`page.tsx:425`). Result: the solo vet
  **never sees "Primeros pasos"** and lands in an empty agenda ("No hay turnos") with no CTA to
  publish services / declare coverage / start verification. The onboarding checklist that exists
  for this account is skipped for the exact account it was built for.
  - **Fix:** show the checklist (or a solo-tailored first-run variant) on the solo path too —
    either fold the `OrgSetupChecklist` gate ahead of the early return, or render a compact
    first-run band inside `SoloVetAgendaLanding` until setup completes.
  - **Reuse:** `components/OrgSetupChecklist.tsx` + `lib/infra/org-setup-checklist.ts` (the step
    model + auto-hide-on-complete are already there).

### Lens 2 — "What am I seeing" / contextual info

- **Landing drops the vet on a meta-list, not work.** `resolveVetLanding` (`role-landing.ts:~102`)
  has **no single-membership shortcut**: a sole `vet_individual` of one clinic always lands on
  `/cuenta/memberships` (a list of memberships), whereas the owner rule right beside it shortcuts
  a single membership straight to the work surface. The vet gets a worse landing than the owner.
  - **Fix:** add the same single-membership shortcut for non-admin vets → land them directly in
    their one clinic's work surface. Keep the list only when there are 2+ memberships.
- **Portal switcher gives no "where am I" signal.** The context switcher shows a bare "Portales"
  with no current-org name/badge (`ContextSwitcher.tsx` — confirm component + line at execution).
  - **Fix:** show the active org's name/chip in the switcher trigger.

### Lens 3 — Open cycles / next step

- **The upgrade→approval→consultorio pipeline misleads and hides state:**
  - **Misleading approved-state copy.** The approved card says the role "reflejará el rol en tu
    próxima sesión" (`app/(app)/cuenta/upgrade/page.tsx` — approved branch), but approval sets
    `profiles.role='vet'` in the DB **immediately** and every consumer reads it fresh (no JWT role
    cache). The copy invents a delay that doesn't exist.
    - **Fix:** correct the copy to reflect immediate effect, and add a direct CTA to
      `/cuenta/crear-consultorio` from the approved card (right now the vet is approved and left
      with no obvious next action).
  - **In-flight request is invisible.** A vet who submitted the upgrade request and lands on
    `/inicio` sees **zero** indication it's pending; the status lives only in two buried `/cuenta`
    subpages (`/cuenta/upgrade`, `/cuenta/solicitudes`).
    - **Fix:** surface a pending-request indicator on `/inicio` (small status band / card) with a
      link to the request detail.
  - **Silent hard-redirect.** `/cuenta/crear-consultorio` hard-redirects if `role!=='vet'`
    (early guard) with no explanation.
    - **Fix:** replace the silent redirect with a toast/inline reason ("necesitás el rol de
      veterinario para crear un consultorio") + a path to request it.

## Prior-art to build on (don't re-derive; some findings already fixed)

- `docs/design/handoffs/critiques-smoke-2026-07-03/critique-vet-2026-07-03.md`
- `docs/design/handoffs/critiques-smoke-2026-07-03/critique-round2-2026-07-03.md`
- `docs/design/handoffs/2026-07-04-navigation-qol-audit.md` (cross-cutting nav / switcher)

## QA contract (shared across all role plans)

1. **Updated tests** for every changed surface — landing resolution (single vs multi membership),
   solo-clinic first-run branch, approved-state copy/CTA, pending-request indicator, redirect guard.
2. **Playwright visual** at desktop, logged in as the vet seed account, across: fresh approval →
   create consultorio → solo agenda first-run → checklist.
3. **Clickthrough**: walk the primary vet journey end-to-end; assert **no dead-ends**, a next-step
   is always present, no console errors.
4. **Fix-gate:** auto-fix mechanical wayfinding/copy defects; **surface design decisions**
   (e.g. exact solo first-run layout) for PO ratification before building.
5. `pnpm verify` + `pnpm test` green (paste actual output as evidence). ⚠️ QA needs a build +
   `:3000` — **schedule around Cowork** (do not rebuild while Cowork tests on `:3000`).

## Execution notes

- This is a **review→fix loop**: implement a fix, re-run the relevant QA slice, iterate until the
  vet journey has no dead-ends.
- No authorization/tenancy changes — this is wayfinding, copy, and first-run surfacing only. If a
  fix seems to require an authz change, STOP and raise it (it's out of scope here).
