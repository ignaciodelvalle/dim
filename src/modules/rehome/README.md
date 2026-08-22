# `rehome` — acompañamiento de adopción (rehome-by-titular)

A titular who can no longer keep their pet asks a **verified org** to publish it
for adoption and vet applicants **while the animal keeps living at home**. The
titular keeps their `ownerships(role='owner')` row for the whole arrangement;
the org gets a `shelter_custody` row **beside** it, never instead of it. The
titular can end the arrangement unilaterally at any moment, and that always
wins over anything the org does. When an adoption finalizes, both rows close in
the transaction that opens the adopter's.

Vocabulary (es-AR UI): **"acompañamiento de adopción"** for the arrangement,
**"solicitud de nuevo hogar"** for the request case. Never "tránsito" (that is
the foster role, a different feature with its own "buscar hogar" flow for
fosters — `src/modules/foster/application/find-rehome-orgs.ts`, untouched).

Design artifacts live in Engram: `sdd/rehome-by-titular/{proposal,spec,design,tasks,apply-progress}`.
The ADR numbers below are the design's.

---

## Layout

```
domain/rehome-rules.ts           pure gates: who may ask / answer / withdraw, REQ-16
application/ports.ts             the PORT the use-cases talk to (request / answer / withdraw / state)
application/request-rehome-sponsorship.ts   the titular asks  → a real `rehome_request` case
application/respond-to-rehome-request.ts    the org accepts or declines → ADR-1 transaction
application/withdraw-rehome-request.ts      the titular cancels a still-pending request (REQ-3)
application/withdraw-rehome-sponsorship.ts  the titular ends a running sponsorship (REQ-8, REQ-10)
application/get-rehome-state-for-pet.ts     none / pending / active, for the titular's page
infrastructure/rehome-repository.ts         the only file here that knows Drizzle
actions.ts                       "use server" controllers: guard → parse → use-case → map
```

`application/**` runs in the fast `unit` vitest project against fakes of the
port; the transaction-level proofs are in `__tests__/rehome-*.test.ts` (serial
`db` project), because the claims are about what one transaction leaves behind
across `ownerships`, `pets`, `pet_events` and `cases`.

---

## Two cases, not one (ADR-1)

`rehome_request` is the titular's **consent record** and the org's **inbox
item**: opened atomically by the request action (no `pet_events` opener, the
`welfare_denuncia` shape), closed the moment it is answered. `adoption_listing`
is the **sponsorship itself**: the accept transaction opens it through the
existing `adoption_eligibility_set(eligible=true)` attachment rule, so every
downstream machine (applications, finalize, the org's existing `canReadCase`
branch) keeps running unmodified. The two never coexist while open.

The accept transaction's order is load-bearing (ADR-1, steps 1–9): pet
advisory lock → case `FOR UPDATE` → org `FOR SHARE` → titular's owner row
`FOR UPDATE` → zero live custody → eligibility → custody insert → listing →
`rehome_sponsorship_started` (attached to the still-open request) → close the
request. Decline and the titular's cancel write **nothing on the spine**: the
spine records arrangements that happened.

How accept / decline / cancel are told apart with a closed four-value
`closed_reason`: see the header of `src/modules/cases/domain/lifecycles/rehome-request.ts`.

---

## The rules that are not style

### 1. The module depends on `adoption`; `adoption` never depends on it

`ALLOWED_EDGES` (scripts/check-dependency-direction.ts) has `rehome:adoption`
and `rehome:organizations`, and **nothing points back**. The accept transaction
reuses `AdoptionRepository`'s eligibility and listing writers inside its own
transaction (ADR-1 steps 6–7); the REQ-16 gate and the withdraw key on
`findOpenSponsorship`, adoption's predicate.

This is WHY the writer of `rehome_sponsorship_ended` lives in
`src/modules/adoption/infrastructure/rehome-sponsorship-writer.ts` and not
here: its callers reach it from adoption's side of the graph — the finalize
cascade, every hand-off through `lib/infra/end-pet-ownerships.ts` (decomiso, a
resolved dispute), the death cascade in `lib/infra/rehome-death-cascade.ts`,
and the rollback script — and housing it in `rehome` would add the return edge
`adoption -> rehome` and close a **cycle**. The titular's withdraw calls it
through the repository (`rehome -> adoption`, the allowed direction). It also
has to sit under `src/modules/**/infrastructure/**` so
`scripts/check-titular-gate.ts` sees a writer of a titular-only event type.

### 2. "Custodia" now means two things, and every surface says which

An org's `shelter_custody` row used to mean *the org has the animal*. For a
sponsored pet it means *registry custody* only — the animal lives with its
family. The PO accepted this overload (it is what keeps the catalog predicate
untouched) on one condition: **every org-facing screen says the animal is not
in the org's possession** (spec REQ-11), and the public ficha conditions its
copy on where the animal actually lives (REQ-12). The sentence lives in one
place, `components/adoption/SponsorshipPossessionNotice.tsx`, and
`__tests__/rehome-possession-disclosure.test.tsx` pins every screen that must
render it.

The two meanings are documented at the three places a reader meets the role:
the `ownerships` header in `db/schema.ts`, Path 2 of `requirePetAccess` in
`lib/infra/pet-access.ts` (an org member gets full pet access to an animal in
a private home — the privacy face of the overload, design R4), and
`queryAdoptionListing` in `src/modules/adoption/infrastructure/adoption-listing-read.ts`.

"Sponsored" is always decided **on the spine** — an unmatched
`rehome_sponsorship_started` naming the live custody row (`payload.ownership_id`)
— never on the owner+shelter_custody shape, which also describes a decomiso or
an intake.

### 3. Every custody writer takes the pet advisory lock first

Finalize locks the custody row then closes the owner row; the withdraw locked
the owner row then closed the custody row — the same two row locks in opposite
orders, a deadlock Postgres breaks with `40P01`. Accept, withdraw and finalize
now all take `pg_advisory_xact_lock(hashtext(petId))` **before any row lock**
(`acquirePetAdvisoryLock` on both repositories), the repo's precedent for
serialising custody writers (chip-match, return-to-owner, cross-org transfer).
Pinned by `src/modules/rehome/__tests__/owner-row-lock.test.ts` and
`src/modules/adoption/__tests__/finalize-custody-lock.test.ts`; proven real by
`__tests__/rehome-withdraw-flow.test.ts`.

---

## The spine (ADR-2)

Two titular-only event types (migration 0194), payloads in
`lib/events/rehome-event-schemas.ts`:

- `rehome_sponsorship_started { ownership_id, sponsoring_organization_id, consented_by_user_id, request_case_public_code, listing_case_id, note }` — written in the accept, attached to the request case (`requires-open`).
- `rehome_sponsorship_ended { ownership_id, outcome, ended_at }` — `outcome ∈ adopted | withdrawn_by_titular | ended_by_org | pet_deceased | withdrawn_by_platform`; attaches to the listing case while open. The key is `outcome`, **never** `reason` (the erasure RPC redacts `reason` on every type).

`ownership_id` is what lets rollback, drift detection (`lint:spine`'s
orphaned-sponsorship arm) and audit say WHICH custody row belongs to a
sponsorship instead of guessing from timestamps.

Migration 0195: at most one live **organisation** `shelter_custody` per pet
(scoped to org custody after the WU3 review — neighbour-held rows stay
unconstrained). 0196 drops a never-shipped draft index name.

---

## How a sponsorship ends

| Who | Path | Outcome written |
|---|---|---|
| The titular | `withdrawRehomeSponsorship` (REQ-8/10) — closes the custody row by id, clears the listing, closes the listing case and every open application case, tells the org and the applicants | `withdrawn_by_titular` |
| An adoption | `finalizeAdoption` → `endAllLiveOwnerships` | `adopted` |
| The animal's death | `createDeathRecord` CASCADE D → `lib/infra/rehome-death-cascade.ts` — same closes as the withdraw, signed by whoever recorded the death; a still-pending request is closed too | `pet_deceased` |
| An authority's hand-off (decomiso, a resolved dispute) | `endAllLiveOwnerships` | `withdrawn_by_platform` |
| The platform, rolling the feature back | `scripts/rollback-rehome-sponsorships.ts` | `withdrawn_by_platform` |

Nothing auto-expires (design R3, accepted): the titular was never blocked from
leaving, so nothing needs a deadline. A cross-org transfer of a sponsored
custody row is **refused** (REQ-15), not ended.

---

## Rollback (ADR-7) — the order IS the rollback

The data step runs BEFORE the app commit is reverted.

1. **Run `scripts/rollback-rehome-sponsorships.ts` FIRST, through the
   still-deployed app** (`pnpm rollback:rehome`, then `pnpm rollback:rehome -- --apply`).
   Dry-run by default; `--apply` writes; a remote `DATABASE_URL` needs
   `--allow-remote`. Per live sponsorship, one
   transaction: pet lock → re-read on the spine → close the custody row by id
   → clear the listing → `rehome_sponsorship_ended{withdrawn_by_platform}`
   through the single writer → close the listing case and its application
   cases as cancelled with a note. Every still-open `rehome_request` is closed
   as cancelled. **Orphans** (a started event whose row already closed without
   its event) are listed through `lint:spine`'s query and **skipped** — they
   are drift to heal by hand, and ending them here would stamp a platform
   withdrawal onto an arrangement that ended months ago.
2. Then revert the app commit. Case kind and event types are TEXT; historical
   rows survive.
3. Then a forward-only migration removing both types from
   `titular_only_event_types()`. 0195's index can stay.

Skipping step 1 leaves pets satisfying `queryAdoptionListing` with the UI to
unpublish them gone, and a payload validator that can no longer write the
closing fact.

Tests: `__tests__/rollback-rehome-sponsorships.test.ts` (rows),
`__tests__/rehome-rollback-contract.test.ts` (the CLI contract).

---

## Known follow-ups (not bugs of this module)

- `resolveApplication` never closes the `adoption_application` case on
  approve/reject/finalize (pre-existing); the withdraw and death cascades close
  theirs explicitly.
- No `audit_log` action for a rehome answer (closed catalog + DB CHECK).
- An org's queue lists every case on a pet it holds a live custody row on — a
  `welfare_denuncia` about a sponsored household appears as a row whose detail
  is denied (`__tests__/rehome-inbox-visibility.test.ts`, "OBSERVATION"). Open
  product question.
- `adoptionEligible` is not flipped by the withdraw (decision #2265).
