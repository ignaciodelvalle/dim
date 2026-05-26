# Transferir mascota — implementation plan

**Date:** 2026-05-26
**Status:** Plan only — **deferred** until there is a user pulling on the surface.
**Source:** Mockup `_ Transferir _paso 1 de 3_.html` (`Transferir mascota · paso 1 de 3 · tipo de transferencia`).

## What this is

A 3-step wizard that lets an owner hand over their pet — and the entire libreta — to another party:

1. **Tipo** — A otra persona / A una organización / Devolver a un refugio donde estuvo
2. **Destinatario** — pick or invite the recipient
3. **Confirmar** — reason text + T&Cs, send

Recipient has **14 days to accept** (otherwise the proposal auto-expires). On accept, ownership flips and the libreta (events, vacunas, microchip) travels with the pet.

## Why deferred

- **No user has asked for it.** Today most "transfer" cases are handled by re-registering the pet under the new owner — clumsy but functional.
- **High blast radius.** Custody change has legal implications: disputes, edge cases (recipient never accepts, recipient accepts and original owner reclaims, intermediate death), notification reliability.
- **Spec needed first.** Before any code, write a spec covering acceptance, rejection, expiration, dispute, and notification delivery.

This doc captures the plan now so when demand surfaces, the work is one decision away from starting.

## Reusable infra (this is the good news)

**Most of the 2-phase handshake model already exists.** The mockup proposes a flow that overlaps heavily with three pre-shipped specs:

| Existing flow | What it covers | Why it helps |
|---|---|---|
| `app/actions/return-to-owner.ts` (Lost & Found Fase 5) | Vecino/refugio finds a lost pet → proposes return to owner → owner accepts/rejects → actor can cancel | Same 4-action two-phase handshake the mockup needs, just inverted direction |
| `app/actions/cross-org-transfer.ts` (spec 2026-05-19) | Org→Org handshake with auto-expiration at 30 days, wrapped in a `custody_transfer_handshake` case | Same case-wrapped model + expiration cron — perfect template |
| `app/actions/transfer.ts` (legacy single-phase) | Direct handoff without acceptance step (e.g. org closing) | Documents the "instant transfer" escape hatch we keep around |

Event types already exist:
- `custody_transfer_proposed`  — Phase 1 (sender opens proposal)
- `custody_transferred`        — Phase 2 (recipient accepts, ownership flips)

Case kind already exists:
- `custody_transfer_handshake` — groups proposed + transferred + cancellation notes

So **the data layer is built**. What's missing is two new direction pairs (Person→Person, Person→Org-voluntary) and the owner-facing UI.

## Surfaces to build

### Sender (owner who initiates)

- **Sheet `?sheet=transferir-mascota`** in pet detail. 3-step wizard:
  - **Step 1 — Tipo**: 3 radio cards:
    - `A otra persona`            — opens person picker (email/phone lookup or invite)
    - `A una organización`        — opens org picker (verified shelters/rescues from `organizations`)
    - `Devolver a un refugio donde estuvo` — pre-fills with the refugio from the pet's most recent `shelter_custody` ownership row
  - **Step 2 — Destinatario**: by-kind picker. Persons resolve to a `users` row or fire an invite; orgs resolve to a verified `organizations` row.
  - **Step 3 — Confirmar**: free-text *Motivo de la transferencia* (optional) + T&Cs checkbox + Send.

### Recipient (accepting party)

- **Notification** delivered via the existing `notifications` table (`notification_type: 'pet_transfer_proposed_owner'` or `_org`).
- **Acceptance page**: `/mis-mascotas/aceptar-transferencia/[proposalToken]` (mirror of the existing `/mis-mascotas/[publicToken]/devolucion` page). Shows pet identity card, sender info, motivo, and Accept / Reject buttons.

### Background

- **Cron daily**: walks pending `custody_transfer_handshake` cases older than 14 days and auto-cancels them (event: `custody_transfer_auto_cancelled` note). Same shape as the cross-org cron in `cross-org-transfer.ts`.

## Phased plan

Ordered by ascending risk.

### Phase 1 — Spec

`docs/superpowers/specs/202X-XX-XX-pet-transfer-owner-side-design.md`. Covers:

- Direction matrix: Person→Person, Person→Org-voluntary (NOT return-to-owner; that's already shipped).
- Acceptance preconditions (same shape as `ownerAcceptReturnAction` in `return-to-owner.ts:43`).
- Rejection / sender-cancel / auto-expire flows.
- Dispute resolution: what happens if a `custody_dispute_raised` event lands during the 14-day window? Default: pending proposal voids.
- Privacy: what does the recipient see in the proposal — full pet identity or summary?
- Notification delivery: email + in-app? SMS opt-in? Owner sees a tracker for sent proposals?

### Phase 2 — Server actions

Reuse cross-org-transfer's shape. New module `app/actions/owner-transfer.ts`:

- `proposeOwnerTransferAction(petToken, {to_kind, to_user_id|to_org_id, motivo})`
- `recipientAcceptTransferAction(proposalToken)`
- `recipientRejectTransferAction(proposalToken, reason?)`
- `senderCancelTransferAction(proposalToken)`

Each follows the existing writer-pattern (public wrapper + inner writer). Reuses `custody_transfer_proposed` + `custody_transferred` event types and the `custody_transfer_handshake` case kind.

Tests: writer-level unit tests + action-level integration tests + auth-coverage entry (the `__tests__/server-actions-auth-coverage.test.ts` test guards every action).

### Phase 3 — UI (sender side)

Sheet wizard 3 pasos. If `feat/sheets-architecture` has shipped, build on it. Otherwise, route page (`/mis-mascotas/[token]/transferir`) — same pattern as `/perdida`, `/editar`, etc.

### Phase 4 — UI (recipient side)

Acceptance page mirror of `/mis-mascotas/[token]/devolucion`. Card showing pet identity + sender + motivo + Accept / Reject buttons calling the Phase 2 actions.

### Phase 5 — Cron + notifications

Daily expirer job: copy the cross-org expirer cron, replace the case-kind filter, write the auto-cancel note event. Notification templates added to `lib/notification-templates.ts`.

## Open decisions (block Phase 1 spec)

1. **Person→Person without an existing MiMAR account**: do we send an invite that creates a stub profile, or require the recipient to register first?
2. **What happens to medication reminders / open cases on transfer?** Default: ownership flips but the cases (rabies observation, lost case, etc.) stay open under the new owner.
3. **Dispute window after accept**: is there a cooling-off period the original owner can use to revert?
4. **Can a pet in `status='lost'` be transferred?** Probably yes for `Devolver a refugio` (the refugio finds the pet), but probably no for `A otra persona` (you can't transfer a pet you don't currently have).
5. **Liability**: who is responsible for the pet during the 14-day pending window?

## Estimated effort (once unblocked)

| Phase | LOC est. | Time |
|---|---|---|
| 1 — Spec | ~400 (doc) | 1 day |
| 2 — Server actions + tests | ~800 | 2 days |
| 3 — Sender UI | ~400 | 1 day |
| 4 — Recipient UI | ~250 | 0.5 day |
| 5 — Cron + notifications | ~200 | 0.5 day |
| **Total** | **~2050 LOC** | **~5 days** |

Substantially less than the original ~1 week estimate because the cross-org-transfer handshake provides a working template.

## Why this is in `docs/` and not behind a feature flag

The mockup is a future surface. Shipping inert plumbing now would add maintenance burden without a single user invocation. The plan stays as a doc until product demand surfaces; then it becomes 5 PRs against the spec, not greenfield design.
