# Owner process-clarity plan

> Standalone deliverable. Grounded against branch `integration/all-20260703`.
> Sibling to `vet-process-clarity.md`, `org-process-clarity.md`.
> **⚠️ SEQUENCED LAST — run this AFTER the owner-screen redesign (tasks #9/#10).** The redesign
> (screens 1b/5b/2b + the 3b pet-profile) lands the visual structure of `/inicio` and
> `/mis-mascotas`; this plan adds the process/clarity layer on top of that structure. Do not
> execute before the redesign or you'll build against soon-to-change layout.
> Line numbers are anchors from a 2026-07 exploration; **spot-check them at execution time**.

## Context

The pet owner is the widest audience and the one most likely to arrive cold. Today `/inicio`
(the default landing) has three clarity holes:

1. A brand-new owner with **zero pets** sees a reassuring "Todo en orden" — a "you're caught up"
   message when they've actually set up *nothing yet* — sitting above a **dead disabled capture
   card**. The first-run experience reassures instead of directing.
2. `/inicio` **omits the owner's open cycles**: pending adoption applications and incoming
   transfers exist with badge counts, but only on the secondary `/mis-mascotas` page — the
   default landing is silent about them.
3. A **lost pet** raises an alarming "PERDIDO" flag with **no next-step shortcut** on the
   dashboard — the one moment the owner most needs guidance, and there's no nudge.

Because the owner-screen redesign reshapes `/inicio`, this plan is intentionally deferred so its
fixes land on the redesigned structure, not the current one.

Seed account for QA: `owner@dim.test`. Home: `/inicio`.

## Gaps & fixes

### Lens 1 — Onboarding / first-run (pre-first-pet)

- **"Todo en orden" for a 0-pets owner is misleading reassurance.** `/inicio`
  (`app/(app)/inicio/page.tsx:~167-224`) shows the "caught up" branch when the owner has nothing
  set up. And the "Asentar un hecho" card renders a **dead disabled textarea**
  (`components/EventCatcher.tsx:~178-236`, disabled with no explanation) **above** the "Cargar
  mascota" CTA (`inicio/page.tsx:~238-296`) — so the first thing a new owner sees is a broken-looking
  input, then a reassurance, then the actual action.
  - **Fix:** a genuine **first-run empty state** that leads with "Cargá tu primera mascota", and
    either hides the disabled capture pre-first-pet or explains why it's disabled. Distinguish
    **fresh** (never had a pet) from **returning-0-pets** (had pets, none active now) — they need
    different copy.
  - **Align with the redesign:** build this on top of the redesigned `/inicio` carousel/pendientes
    structure from `docs/design_handoff_owner_screens` (screens 1b/5b).

### Lens 2 — "What am I seeing" / contextual info

- **Compliance-vs-vaccination double-standard** — re-verify the `critique-round2` finding A
  (the owner al-día definition vs what's shown). Confirm current behavior before acting; it may
  already be resolved. (Note: the govt/owner compliance definitions differ *by design* per the
  Tier-3 decisions — this is the **owner-internal** consistency check, not the govt one.)
- **Reuse the SharesManager pattern** (`components/**/SharesManager.tsx:~246-299`) — it's the
  solid reference for a clear owner-facing state+action surface; mirror its clarity in the new
  first-run and nudge surfaces.

### Lens 3 — Open cycles / next step

- **`/inicio` never surfaces pending adoption applications or incoming transfers.** Both carry
  badge counts but only on `/mis-mascotas` (`page.tsx:~230-244`), the secondary page.
  - **Fix:** surface both open cycles on `/inicio` with a direct next-step link.
- **Lost pet has NO dashboard nudge.** `lib/infra/owner-nudges.ts:~58-67` only knows vaccine /
  chip / scan nudges — there's no "lost" kind, so a PERDIDO pet shows the alarming flag with no
  shortcut to act.
  - **Fix:** add a **lost nudge** with actions (compartir cartel / ver caso / marcar encontrada).
- **Submitted-application status changes** live only at `/mis-mascotas/postulaciones`.
  - **Fix:** surface status changes on `/inicio` so the owner sees movement without hunting.

## Prior-art to build on

- `docs/design/handoffs/critiques-smoke-2026-07-03/critique-owner-2026-07-03.md`
- `docs/design/handoffs/critiques-smoke-2026-07-03/critique-round2-2026-07-03.md`
- `docs/design_handoff_owner_screens` (the #9/#10 redesign source — this plan builds on it)

## QA contract (shared across all role plans)

1. **Updated tests** — first-run empty state (fresh vs returning-0-pets), pending-cycle surfacing
   on `/inicio`, lost-nudge generation, application-status surfacing.
2. **Playwright visual** at desktop **and 390px mobile** (owner is the mobile-heavy role), logged
   in as `owner@dim.test`: 0-pets first run → add pet → lost flow → pending adoption/transfer.
3. **Clickthrough**: from `/inicio`, every open cycle and nudge has a working next step; no
   dead-ends; no console errors.
4. **Fix-gate:** auto-fix mechanical copy/wayfinding defects; **surface design decisions**
   (first-run layout, nudge placement) for PO ratification.
5. `pnpm verify` + `pnpm test` green (paste actual output). ⚠️ QA needs build + `:3000` —
   **schedule around Cowork**.

## Execution notes

- **Hard dependency:** do not start until the owner-screen redesign (#9/#10) has landed — this
  plan's fixes assume the redesigned `/inicio` structure.
- **Review→fix loop.** Owner is mobile-heavy — verify every fix at 390px, not just desktop.
- No authorization/tenancy changes — first-run surfacing, nudges, and copy only.
