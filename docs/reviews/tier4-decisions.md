# Tier 4 critique — decisions report (complex features)

## Scheduling — booking core SOLID; transition writers missed the guard

Verified clean: booking concurrency (advisory lock + in-tx re-read + DB CHECK
`slot_bookings_within_capacity`), AR-timezone slot compute AND render, rule→slot
correctness (DB CHECKs for all edge cases), cancel/check-in authorization fenced.
Auto-fixed in-loop: SC1/SC2 (transition-writer concurrency), SC3 (server-side
offering-status gate on booking).

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| SC1 | MED (auto) | Concurrent double-cancel double-frees capacity → `bookings_count` under-counts → overbooking (4 in a cap-3 slot). Cancel writers do unconditional UPDATE + decrement, no lock/predicate (unlike book/block). | `cancel-appointment-by-owner.ts:53`, `cancel-appointment-by-org.ts:26` | ✅ auto (lock + `WHERE status='confirmed'` + rowCount guard). |
| SC2 | MED (auto) | mark-attended/no-show same TOCTOU: attend-after-cancel writes an IMMUTABLE medical `pet_event` against a cancelled appointment. | `mark-appointment-attended.ts:57`, `mark-appointment-no-show.ts:22` | ✅ auto (re-read status in lock). |
| SC3 | — | Booking not gated on offering status server-side; a paused/archived offering's pre-existing slot is bookable via direct `bookSlotAction` (UI gates it). Server guard auto-added. | `book-slot.ts:66` | ✅ auto (reject non-approved). Broader Q → below. |
| SC3b | JUDGMENT | Should PAUSING an offering also cancel already-materialized future slots (vs. only halt new materialization + block booking)? | `lifecycle-offering.ts:35` | Product decision. |
| SC4 | LOW | Materialization honors per-rule `timezone` but render hard-pins AR; DST anchor off-by-one at a boundary. Dormant (AR no DST, no UI sets non-AR tz). | `slot-materialization.ts:148` | Latent — guard only if multi-tz offerings ship. |

## Transfers / custody — a CRITICAL custody-theft path (SECURITY-fixed in-loop + surfaced)

Verified clean: claim-by-token not brute-forceable (recipient-fenced to session
identity; no guessable `TRF-` code path exists), free-claim evidence gate sound
(resolves from private identifier + FOR UPDATE + re-checks custody), owner→owner
double-accept/replay guarded, sender can't force-accept, DB backstops
(one-pending-per-pet, one-active-owner-per-pet). **The security half of CRITICAL-1/
HIGH-1 is auto-fixed** (accept re-validates under lock); the UX + policy halves are
below.

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| **TR-C1** | **CRITICAL** | owner→owner `acceptPetTransfer` re-validates the TRANSFER row but never re-validates the PET: `closeOwnerOwnerships` ends whoever the CURRENT active owner is (not `transfer.fromOwnerId`). Exploits: (1) B accepts a stale A→B AFTER a govt dispute moved custody to C → C loses the pet, event says "A→B"; (2) accept during an open dispute; (3) accept of a now-lost/deceased pet. Trusts initiate-time state. | `accept-pet-transfer.ts:56-118` | ✅ SECURITY auto-fixed (abort if `fromOwnerId` ≠ current active owner OR pet not transferable). **UX decision:** hard error vs auto-cancel the stale transfer? |
| **TR-H1** | HIGH | cross-org accept re-checks the CASE is open but not that the source org still HOLDS custody → phantom custodian. `endShelterCustody` no-ops if source no longer holds; `insertShelterCustody(Y)` lands anyway (no unique-active-shelter index). Reachable via a concurrent return-to-owner. | `accept-cross-org-transfer.ts:168-263` | ✅ SECURITY auto-fixed (re-verify source ownership row under lock). |
| TR-M1 | MED (auto) | `resolveDisputeUseCase` reads the dispute with no FOR UPDATE / advisory lock → two concurrent resolves both pass; the one-active-owner index backstops (fails closed) but surfaces a raw PG error + accidental serialization. | `resolve-dispute.ts:77-88` | ✅ auto (FOR UPDATE, mirror siblings). |
| TR-M2 | MED | No separation of duties: a govt user who is a PARTY to a dispute (added via `add-dispute-party`) and whose jurisdiction contains the pet can resolve `ownership_transferred` to THEMSELVES. | `resolve-dispute.ts:72-88` | Conflict-of-interest rule — should a resolver-who-is-a-party be blocked? Policy decision. |

## Adoption / foster — a CRITICAL double-custody bug (data-fixed in-loop + surfaced)

Verified clean: foster-proposal authority (volunteer can't self-assign; accept
re-validates org custody), adoption finalization atomic + org-fenced + DNI hashed,
IDOR fences org-scoped, adoption-resume not replayable, bulk actions per-item authz.

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| **AF-C1** | **CRITICAL** | `convertFosterToOwner` closes only `role='owner'` rows, NOT the org's `shelter_custody` → the org row stays ACTIVE = permanent double custody. The org can then still re-foster / list / finalize the pet to a DIFFERENT adopter; metrics double-count. The doc comment claims it closes shelter_custody; the code contradicts it (the adoption path does it right). | `foster-repository.ts:1455-1547` | ✅ data auto-fixed (close shelter_custody in the same tx). **Authority Q:** should a foster self-convert with only a confirm dialog and NO shelter sign-off? |
| AF-H2 | HIGH (auto) | "En tránsito" badge is a DEAD check: `isTransit = ownershipRole === "shelter_custody"` but the list joins on `ownerUserId=user.id` where role is never shelter_custody (it's org-level) → the badge NEVER fires → fostered pets render as OWNED in the grid (profile page correctly shows "En tránsito" via `role==='foster'`). | `PetCard.tsx:89`, `mis-mascotas/page.tsx:166` | ✅ auto (predicate → `=== "foster"`). |
| AF-L3 | LOW | `foster_assigned` hardcodes `authorVerified: true` on the accept path even when the proposing org is unverified (`assignFoster` correctly uses `organization.verified`). Event-log honesty inconsistency. | `foster-repository.ts:1060` | Use `organization.verified`? Low. |
